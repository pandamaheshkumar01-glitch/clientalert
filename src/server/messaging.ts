import crypto from 'crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { clients, invoices, messageLogs, notifications, settings, templates } from '../db/schema.ts';
import { formatINRServer, renderTemplate } from './templates.ts';

// Simple per-owner sliding-window rate limiter (60 outbound messages/minute)
const rateBuckets = new Map<string, number[]>();

export function checkRateLimit(ownerId: string, limit = 60): boolean {
  const now = Date.now();
  const windowStart = now - 60_000;
  const timestamps = (rateBuckets.get(ownerId) || []).filter((ts) => ts > windowStart);
  if (timestamps.length >= limit) {
    rateBuckets.set(ownerId, timestamps);
    return false;
  }
  timestamps.push(now);
  rateBuckets.set(ownerId, timestamps);
  return true;
}

// Check India Standard Time (Asia/Kolkata, UTC+5:30) quiet hours
export function getCurrentISTHour(): number {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.getUTCHours();
}

export function isQuietHoursIST(quietStart = 21, quietEnd = 9): boolean {
  const hour = getCurrentISTHour();
  if (quietStart > quietEnd) {
    // e.g. 21:00 to 09:00
    return hour >= quietStart || hour < quietEnd;
  }
  return hour >= quietStart && hour < quietEnd;
}

export function getNextAllowedISTSendTime(quietEnd = 9): Date {
  const now = new Date();
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const ist = new Date(now.getTime() + istOffsetMs);
  const hour = ist.getUTCHours();
  if (hour >= quietEnd) {
    ist.setUTCDate(ist.getUTCDate() + 1);
  }
  ist.setUTCHours(quietEnd, 5, 0, 0);
  return new Date(ist.getTime() - istOffsetMs);
}

export function getDaysOverdueIST(dueDateStr: string): number {
  const istNow = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const todayStr = istNow.toISOString().slice(0, 10);
  const todayMs = Date.parse(`${todayStr}T00:00:00Z`);
  const dueMs = Date.parse(`${dueDateStr}T00:00:00Z`);
  if (Number.isNaN(dueMs)) return 0;
  return Math.max(0, Math.floor((todayMs - dueMs) / (24 * 60 * 60 * 1000)));
}

export interface SendMessageOptions {
  ownerId: string;
  invoiceId?: number | null;
  clientId: number;
  templateKey: string;
  channelOverride?: 'whatsapp' | 'email' | 'sms';
  customBody?: string;
  baseUrl?: string;
  ignoreQuietHours?: boolean;
}

export async function dispatchClientMessage(opts: SendMessageOptions) {
  const [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, opts.clientId), eq(clients.ownerId, opts.ownerId)));

  if (!client) {
    throw new Error('Client not found');
  }

  if (client.optedOut) {
    const [failedLog] = await db
      .insert(messageLogs)
      .values({
        ownerId: opts.ownerId,
        invoiceId: opts.invoiceId ?? null,
        clientId: client.id,
        channel: opts.channelOverride || client.preferredChannel || 'whatsapp',
        templateKey: opts.templateKey,
        messageBody: '[Skipped: Client opted out via STOP]',
        providerMessageId: '',
        status: 'failed',
        error: 'Client has opted out of automated messages (STOP)',
      })
      .returning();
    return { skipped: true, reason: 'opted_out', log: failedLog };
  }

  if (!checkRateLimit(opts.ownerId)) {
    throw new Error('Rate limit exceeded: max 60 messages per minute');
  }

  const [ownerSettings] = await db
    .select()
    .from(settings)
    .where(eq(settings.ownerId, opts.ownerId));

  let invoiceRow = null;
  if (opts.invoiceId) {
    const [found] = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, opts.invoiceId), eq(invoices.ownerId, opts.ownerId)));
    invoiceRow = found || null;
  }

  const channel = (opts.channelOverride || client.preferredChannel || 'whatsapp') as
    | 'whatsapp'
    | 'email'
    | 'sms';
  const lang = (client.preferredLanguage || ownerSettings?.defaultLanguage || 'en') as 'en' | 'hi';

  const appOrigin = (opts.baseUrl || process.env.APP_URL || '').replace(/\/$/, '');
  const payLink = invoiceRow
    ? `${appOrigin}/i/${invoiceRow.publicToken}`
    : appOrigin || 'https://clientalert.app';

  let bodyText = opts.customBody || '';
  if (!bodyText) {
    const ownerTemplates = await db
      .select()
      .from(templates)
      .where(and(eq(templates.ownerId, opts.ownerId), eq(templates.templateKey, opts.templateKey)));

    const matched =
      ownerTemplates.find((t) => t.language === lang) ||
      ownerTemplates.find((t) => t.language === 'en') ||
      ownerTemplates[0];

    const rawTemplate =
      matched?.body ||
      'Hi {client_name}, invoice {invoice_no} of ₹{amount} is due on {due_date}. Pay: {pay_link} – {owner_name}';

    bodyText = renderTemplate(rawTemplate, {
      client_name: client.name,
      business_name: ownerSettings?.businessName || 'ClientAlert',
      invoice_no: invoiceRow?.invoiceNo || 'Invoice',
      amount: formatINRServer(invoiceRow?.total || 0),
      balance: formatINRServer(invoiceRow?.balance ?? invoiceRow?.total ?? 0),
      due_date: invoiceRow?.dueDate || '',
      days_overdue: String(invoiceRow ? getDaysOverdueIST(invoiceRow.dueDate) : 0),
      pay_link: payLink,
      owner_name: ownerSettings?.ownerName || 'Owner',
    });
  }

  // Attempt live external provider send if credentials are configured
  let providerMessageId = `sim_${crypto.randomBytes(6).toString('hex')}`;
  let status: 'sent' | 'failed' = 'sent';
  let errorText = '';

  try {
    if (channel === 'whatsapp' && process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID) {
      const targetPhone = (client.whatsappNumber || client.phone).replace(/[^\d]/g, '');
      const waResp = await fetch(
        `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: targetPhone,
            type: 'text',
            text: { body: bodyText },
          }),
        }
      );
      const waJson = (await waResp.json()) as { messages?: Array<{ id: string }>; error?: { message: string } };
      if (!waResp.ok) {
        status = 'failed';
        errorText = waJson.error?.message || `WhatsApp API error (${waResp.status})`;
      } else if (waJson.messages?.[0]?.id) {
        providerMessageId = waJson.messages[0].id;
      }
    } else if (channel === 'email' && process.env.RESEND_API_KEY && client.email) {
      const emailResp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.RESEND_FROM_EMAIL || 'ClientAlert <billing@resend.dev>',
          to: [client.email],
          subject: invoiceRow
            ? `Invoice ${invoiceRow.invoiceNo} from ${ownerSettings?.businessName || 'ClientAlert'}`
            : `Payment Update from ${ownerSettings?.businessName || 'ClientAlert'}`,
          text: bodyText,
        }),
      });
      const emailJson = (await emailResp.json()) as { id?: string; message?: string };
      if (!emailResp.ok) {
        status = 'failed';
        errorText = emailJson.message || `Resend error (${emailResp.status})`;
      } else if (emailJson.id) {
        providerMessageId = emailJson.id;
      }
    } else if (channel === 'sms' && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER) {
      const creds = Buffer.from(
        `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`
      ).toString('base64');
      const form = new URLSearchParams({
        To: client.phone,
        From: process.env.TWILIO_FROM_NUMBER,
        Body: bodyText,
      });
      const smsResp = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${creds}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: form.toString(),
        }
      );
      const smsJson = (await smsResp.json()) as { sid?: string; message?: string };
      if (!smsResp.ok) {
        status = 'failed';
        errorText = smsJson.message || `Twilio error (${smsResp.status})`;
      } else if (smsJson.sid) {
        providerMessageId = smsJson.sid;
      }
    }
  } catch (err: unknown) {
    status = 'failed';
    errorText = err instanceof Error ? err.message : 'Outbound provider request failed';
  }

  const [log] = await db
    .insert(messageLogs)
    .values({
      ownerId: opts.ownerId,
      invoiceId: opts.invoiceId ?? null,
      clientId: client.id,
      channel,
      templateKey: opts.templateKey,
      messageBody: bodyText,
      providerMessageId,
      status,
      error: errorText,
      sentAt: new Date(),
    })
    .returning();

  if (status === 'failed') {
    await db.insert(notifications).values({
      ownerId: opts.ownerId,
      type: 'message_status',
      title: `Message failed to ${client.name}`,
      body: errorText || `Could not deliver ${channel} message.`,
      link: opts.invoiceId ? `/invoices/${opts.invoiceId}` : `/clients/${client.id}`,
    });
  }

  return { skipped: false, log };
}
