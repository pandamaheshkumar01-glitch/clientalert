import crypto from 'crypto';
import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { and, desc, eq } from 'drizzle-orm';
import { db } from './src/db/index.ts';
import {
  clients,
  InvoiceLineItem,
  invoices,
  messageLogs,
  notifications,
  payments,
  reminders,
  settings,
  templates,
} from './src/db/schema.ts';
import { AuthRequest, requireAuth } from './src/middleware/auth.ts';
import { dispatchClientMessage } from './src/server/messaging.ts';
import { generateDailySummaryForOwner, runReminderScheduler } from './src/server/scheduler.ts';
import { formatINRServer, getTemplateKeyForOffset } from './src/server/templates.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 3000);

// Capture rawBody for webhook HMAC signature verification
app.use(
  express.json({
    limit: '5mb',
    verify: (req: Request & { rawBody?: Buffer }, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

function getRequestBaseUrl(req: Request): string {
  if (process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL') {
    return process.env.APP_URL.replace(/\/$/, '');
  }
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
  const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || 'localhost:3000';
  return `${proto}://${host}`;
}

function verifyTimingSafeHmac(
  rawBody: Buffer | undefined,
  secret: string,
  receivedHexOrBase64: string,
  encoding: 'hex' | 'base64' = 'hex',
  prefix = ''
): boolean {
  if (!rawBody || !secret || !receivedHexOrBase64) return false;
  const expected =
    prefix + crypto.createHmac('sha256', secret).update(rawBody).digest(encoding);
  const a = Buffer.from(expected);
  const b = Buffer.from(receivedHexOrBase64);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function scheduleInvoiceReminders(
  ownerId: string,
  invoiceId: number,
  dueDateStr: string,
  offsets: number[],
  channel: string
) {
  await db
    .update(reminders)
    .set({ status: 'cancelled' })
    .where(and(eq(reminders.invoiceId, invoiceId), eq(reminders.status, 'scheduled')));

  const dueBase = new Date(`${dueDateStr}T04:30:00Z`); // 10:00 AM IST
  const rows = offsets.map((offset) => ({
    ownerId,
    invoiceId,
    scheduledAt: new Date(dueBase.getTime() + offset * 24 * 60 * 60 * 1000),
    offsetDays: offset,
    channel: channel || 'whatsapp',
    templateKey: getTemplateKeyForOffset(offset),
    status: 'scheduled',
  }));

  if (rows.length > 0) {
    await db.insert(reminders).values(rows);
  }
}

async function recordInvoicePayment(params: {
  ownerId: string;
  invoiceId: number;
  amount: number;
  method: string;
  referenceNo: string;
  note: string;
  baseUrl?: string;
}) {
  const [inv] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, params.invoiceId), eq(invoices.ownerId, params.ownerId)));

  if (!inv) {
    throw new Error('Invoice not found');
  }

  const payAmount = Math.max(0.01, Math.min(params.amount, Math.max(inv.balance, params.amount)));

  const [payment] = await db
    .insert(payments)
    .values({
      ownerId: params.ownerId,
      invoiceId: inv.id,
      amount: payAmount,
      method: params.method || 'UPI',
      referenceNo: params.referenceNo || '',
      note: params.note || '',
      paidAt: new Date(),
    })
    .returning();

  const newAmountPaid = Number((inv.amountPaid + payAmount).toFixed(2));
  const newBalance = Math.max(0, Number((inv.total - newAmountPaid).toFixed(2)));
  const newStatus = newBalance <= 0.01 ? 'paid' : 'partially_paid';

  const [updatedInvoice] = await db
    .update(invoices)
    .set({
      amountPaid: newAmountPaid,
      balance: newBalance,
      status: newStatus,
    })
    .where(eq(invoices.id, inv.id))
    .returning();

  // Stop all scheduled reminders the moment invoice is fully paid
  if (newStatus === 'paid') {
    await db
      .update(reminders)
      .set({ status: 'cancelled' })
      .where(and(eq(reminders.invoiceId, inv.id), eq(reminders.status, 'scheduled')));
  }

  const [client] = await db.select().from(clients).where(eq(clients.id, inv.clientId));

  // Send thank-you message to client
  if (client) {
    try {
      await dispatchClientMessage({
        ownerId: params.ownerId,
        invoiceId: inv.id,
        clientId: client.id,
        templateKey: 'payment_received',
        baseUrl: params.baseUrl,
      });
    } catch (msgErr) {
      console.error('Thank-you message dispatch warning:', msgErr);
    }
  }

  // Create owner notification
  await db.insert(notifications).values({
    ownerId: params.ownerId,
    type: 'payment_received',
    title: `Payment received: ₹${formatINRServer(payAmount)} from ${client?.name || 'Client'}`,
    body: `${inv.invoiceNo} is now ${newStatus === 'paid' ? 'Paid in full (reminders stopped)' : `Partially Paid (₹${formatINRServer(newBalance)} left)`}. Method: ${params.method}`,
    link: `/invoices/${inv.id}`,
    isRead: false,
  });

  return { payment, invoice: updatedInvoice };
}

// ============================================================================
// AUTHENTICATED OWNER API (/api/app/*)
// ============================================================================

app.get('/api/app/bootstrap', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const ownerId = req.user!.uid;
    const [ownerSettingsRows, clientRows, invoiceRows, paymentRows, logRows, reminderRows, notifRows, templateRows] =
      await Promise.all([
        db.select().from(settings).where(eq(settings.ownerId, ownerId)),
        db.select().from(clients).where(eq(clients.ownerId, ownerId)).orderBy(desc(clients.createdAt)),
        db.select().from(invoices).where(eq(invoices.ownerId, ownerId)).orderBy(desc(invoices.createdAt)),
        db.select().from(payments).where(eq(payments.ownerId, ownerId)).orderBy(desc(payments.paidAt)),
        db.select().from(messageLogs).where(eq(messageLogs.ownerId, ownerId)).orderBy(desc(messageLogs.sentAt)),
        db.select().from(reminders).where(eq(reminders.ownerId, ownerId)).orderBy(reminders.scheduledAt),
        db.select().from(notifications).where(eq(notifications.ownerId, ownerId)).orderBy(desc(notifications.createdAt)),
        db.select().from(templates).where(eq(templates.ownerId, ownerId)),
      ]);

    res.json({
      user: {
        uid: ownerId,
        email: req.user!.email || '',
        name: req.user!.name || '',
      },
      settings: ownerSettingsRows[0] || null,
      clients: clientRows,
      invoices: invoiceRows,
      payments: paymentRows,
      messageLogs: logRows,
      reminders: reminderRows,
      notifications: notifRows,
      templates: templateRows,
    });
  } catch (err) {
    console.error('Bootstrap failed:', err);
    res.status(500).json({ error: 'Failed to load workspace data' });
  }
});

app.put('/api/app/settings', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const ownerId = req.user!.uid;
    const b = req.body || {};
    const [updated] = await db
      .update(settings)
      .set({
        businessName: String(b.businessName ?? 'My Business'),
        ownerName: String(b.ownerName ?? 'Owner'),
        upiId: String(b.upiId ?? ''),
        bankName: String(b.bankName ?? ''),
        bankAccountNo: String(b.bankAccountNo ?? ''),
        bankIfsc: String(b.bankIfsc ?? ''),
        gstin: String(b.gstin ?? ''),
        defaultLanguage: b.defaultLanguage === 'hi' ? 'hi' : 'en',
        defaultReminderOffsets: Array.isArray(b.defaultReminderOffsets)
          ? b.defaultReminderOffsets.map(Number)
          : [-3, 0, 3, 7, 15, 30],
        quietHoursStart: Number.isFinite(Number(b.quietHoursStart)) ? Number(b.quietHoursStart) : 21,
        quietHoursEnd: Number.isFinite(Number(b.quietHoursEnd)) ? Number(b.quietHoursEnd) : 9,
        signatureText: String(b.signatureText ?? ''),
        notifyEmail: Boolean(b.notifyEmail ?? true),
        notifyWhatsapp: Boolean(b.notifyWhatsapp ?? true),
        updatedAt: new Date(),
      })
      .where(eq(settings.ownerId, ownerId))
      .returning();

    res.json(updated);
  } catch (err) {
    console.error('Update settings failed:', err);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Clients CRUD + Bulk CSV Import
app.post('/api/app/clients', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const ownerId = req.user!.uid;
    const b = req.body || {};
    if (!b.name || !b.phone) {
      return res.status(400).json({ error: 'Client name and phone number are required' });
    }
    const rawPhone = String(b.phone).trim();
    const formattedPhone = rawPhone.startsWith('+') ? rawPhone : `+91${rawPhone.replace(/^0+/, '')}`;
    const [created] = await db
      .insert(clients)
      .values({
        ownerId,
        name: String(b.name).trim(),
        businessName: String(b.businessName || '').trim(),
        phone: formattedPhone,
        whatsappNumber: String(b.whatsappNumber || formattedPhone).trim(),
        email: String(b.email || '').trim(),
        address: String(b.address || '').trim(),
        gstin: String(b.gstin || '').trim(),
        preferredChannel: ['whatsapp', 'email', 'sms'].includes(b.preferredChannel)
          ? b.preferredChannel
          : 'whatsapp',
        preferredLanguage: b.preferredLanguage === 'hi' ? 'hi' : 'en',
        notes: String(b.notes || ''),
        tags: Array.isArray(b.tags) ? b.tags.map(String) : [],
      })
      .returning();

    res.status(201).json(created);
  } catch (err) {
    console.error('Create client failed:', err);
    res.status(500).json({ error: 'Failed to create client' });
  }
});

app.put('/api/app/clients/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const ownerId = req.user!.uid;
    const clientId = Number(req.params.id);
    const b = req.body || {};

    const [updated] = await db
      .update(clients)
      .set({
        name: String(b.name || '').trim(),
        businessName: String(b.businessName || '').trim(),
        phone: String(b.phone || '').trim(),
        whatsappNumber: String(b.whatsappNumber || b.phone || '').trim(),
        email: String(b.email || '').trim(),
        address: String(b.address || '').trim(),
        gstin: String(b.gstin || '').trim(),
        preferredChannel: ['whatsapp', 'email', 'sms'].includes(b.preferredChannel)
          ? b.preferredChannel
          : 'whatsapp',
        preferredLanguage: b.preferredLanguage === 'hi' ? 'hi' : 'en',
        notes: String(b.notes || ''),
        tags: Array.isArray(b.tags) ? b.tags.map(String) : [],
        optedOut: Boolean(b.optedOut ?? false),
      })
      .where(and(eq(clients.id, clientId), eq(clients.ownerId, ownerId)))
      .returning();

    if (!updated) return res.status(404).json({ error: 'Client not found' });
    res.json(updated);
  } catch (err) {
    console.error('Update client failed:', err);
    res.status(500).json({ error: 'Failed to update client' });
  }
});

app.delete('/api/app/clients/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const ownerId = req.user!.uid;
    const clientId = Number(req.params.id);
    const [deleted] = await db
      .delete(clients)
      .where(and(eq(clients.id, clientId), eq(clients.ownerId, ownerId)))
      .returning();

    if (!deleted) return res.status(404).json({ error: 'Client not found' });
    res.json({ deletedId: clientId });
  } catch (err) {
    console.error('Delete client failed:', err);
    res.status(500).json({ error: 'Failed to delete client' });
  }
});

app.post('/api/app/clients/import', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const ownerId = req.user!.uid;
    const rows = Array.isArray(req.body?.clients) ? req.body.clients : [];
    if (rows.length === 0) {
      return res.status(400).json({ error: 'No client rows provided' });
    }

    const prepared = rows
      .filter((r: Record<string, unknown>) => r.name && r.phone)
      .slice(0, 200)
      .map((r: Record<string, unknown>) => {
        const rawPhone = String(r.phone).trim();
        const phone = rawPhone.startsWith('+') ? rawPhone : `+91${rawPhone.replace(/^0+/, '')}`;
        return {
          ownerId,
          name: String(r.name).trim(),
          businessName: String(r.businessName || '').trim(),
          phone,
          whatsappNumber: String(r.whatsappNumber || phone).trim(),
          email: String(r.email || '').trim(),
          address: String(r.address || '').trim(),
          gstin: String(r.gstin || '').trim(),
          preferredChannel: ['whatsapp', 'email', 'sms'].includes(String(r.preferredChannel))
            ? String(r.preferredChannel)
            : 'whatsapp',
          preferredLanguage: r.preferredLanguage === 'hi' ? 'hi' : 'en',
          notes: String(r.notes || ''),
          tags: Array.isArray(r.tags)
            ? r.tags.map(String)
            : typeof r.tags === 'string' && r.tags.trim()
              ? r.tags.split(';').map((s: string) => s.trim()).filter(Boolean)
              : [],
        };
      });

    if (prepared.length === 0) {
      return res.status(400).json({ error: 'No valid rows with name and phone found' });
    }

    const inserted = await db.insert(clients).values(prepared).returning();
    res.status(201).json({ importedCount: inserted.length, clients: inserted });
  } catch (err) {
    console.error('Bulk import failed:', err);
    res.status(500).json({ error: 'Failed to import clients' });
  }
});

// Invoices CRUD & Actions
app.post('/api/app/invoices', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const ownerId = req.user!.uid;
    const b = req.body || {};
    const clientId = Number(b.clientId);
    if (!clientId) return res.status(400).json({ error: 'Valid clientId is required' });

    const [client] = await db
      .select()
      .from(clients)
      .where(and(eq(clients.id, clientId), eq(clients.ownerId, ownerId)));
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const items: InvoiceLineItem[] = Array.isArray(b.items)
      ? b.items.map((it: Record<string, unknown>) => ({
          description: String(it.description || 'Service'),
          qty: Math.max(0, Number(it.qty || 1)),
          rate: Math.max(0, Number(it.rate || 0)),
        }))
      : [];

    const subtotal = Number(items.reduce((sum, it) => sum + it.qty * it.rate, 0).toFixed(2));
    const taxRate = Math.max(0, Number(b.taxRate ?? 18));
    const discount = Math.max(0, Number(b.discount ?? 0));
    const taxable = Math.max(0, subtotal - discount);
    const taxAmount = Number(((taxable * taxRate) / 100).toFixed(2));
    const total = Number((taxable + taxAmount).toFixed(2));
    const publicToken = crypto.randomBytes(10).toString('hex');
    const reminderOffsets: number[] = Array.isArray(b.reminderOffsets)
      ? b.reminderOffsets.map(Number)
      : [-3, 0, 3, 7, 15, 30];

    const existingInvoices = await db.select().from(invoices).where(eq(invoices.ownerId, ownerId));
    const nextNum = existingInvoices.length + 1;
    const invoiceNo =
      String(b.invoiceNo || '').trim() || `INV-2026-${String(nextNum).padStart(3, '0')}`;

    const [created] = await db
      .insert(invoices)
      .values({
        ownerId,
        clientId,
        invoiceNo,
        issueDate: String(b.issueDate || new Date().toISOString().slice(0, 10)),
        dueDate: String(b.dueDate || new Date().toISOString().slice(0, 10)),
        items,
        subtotal,
        taxRate,
        taxAmount,
        discount,
        total,
        amountPaid: 0,
        balance: total,
        status: b.sendImmediately ? 'sent' : 'draft',
        publicToken,
        paymentLinkUrl: `/i/${publicToken}`,
        reminderOffsets,
        notes: String(b.notes || ''),
      })
      .returning();

    await scheduleInvoiceReminders(
      ownerId,
      created.id,
      created.dueDate,
      reminderOffsets,
      client.preferredChannel
    );

    if (b.sendImmediately) {
      await dispatchClientMessage({
        ownerId,
        invoiceId: created.id,
        clientId: client.id,
        templateKey: 'bill_sent',
        baseUrl: getRequestBaseUrl(req),
      });
    }

    res.status(201).json(created);
  } catch (err) {
    console.error('Create invoice failed:', err);
    res.status(500).json({ error: 'Failed to create invoice' });
  }
});

app.put('/api/app/invoices/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const ownerId = req.user!.uid;
    const invoiceId = Number(req.params.id);
    const b = req.body || {};

    const [existing] = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, invoiceId), eq(invoices.ownerId, ownerId)));
    if (!existing) return res.status(404).json({ error: 'Invoice not found' });

    const items: InvoiceLineItem[] = Array.isArray(b.items) ? b.items : existing.items;
    const subtotal = Number(items.reduce((sum, it) => sum + it.qty * it.rate, 0).toFixed(2));
    const taxRate = Number(b.taxRate ?? existing.taxRate);
    const discount = Number(b.discount ?? existing.discount);
    const taxable = Math.max(0, subtotal - discount);
    const taxAmount = Number(((taxable * taxRate) / 100).toFixed(2));
    const total = Number((taxable + taxAmount).toFixed(2));
    const balance = Math.max(0, Number((total - existing.amountPaid).toFixed(2)));
    const reminderOffsets: number[] = Array.isArray(b.reminderOffsets)
      ? b.reminderOffsets.map(Number)
      : existing.reminderOffsets;

    const [updated] = await db
      .update(invoices)
      .set({
        dueDate: String(b.dueDate || existing.dueDate),
        items,
        subtotal,
        taxRate,
        taxAmount,
        discount,
        total,
        balance,
        reminderOffsets,
        notes: String(b.notes ?? existing.notes),
      })
      .where(and(eq(invoices.id, invoiceId), eq(invoices.ownerId, ownerId)))
      .returning();

    if (updated.status !== 'paid' && updated.status !== 'cancelled') {
      const [client] = await db.select().from(clients).where(eq(clients.id, updated.clientId));
      await scheduleInvoiceReminders(
        ownerId,
        updated.id,
        updated.dueDate,
        reminderOffsets,
        client?.preferredChannel || 'whatsapp'
      );
    }

    res.json(updated);
  } catch (err) {
    console.error('Update invoice failed:', err);
    res.status(500).json({ error: 'Failed to update invoice' });
  }
});

app.delete('/api/app/invoices/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const ownerId = req.user!.uid;
    const invoiceId = Number(req.params.id);
    const [deleted] = await db
      .delete(invoices)
      .where(and(eq(invoices.id, invoiceId), eq(invoices.ownerId, ownerId)))
      .returning();
    if (!deleted) return res.status(404).json({ error: 'Invoice not found' });
    res.json({ deletedId: invoiceId });
  } catch (err) {
    console.error('Delete invoice failed:', err);
    res.status(500).json({ error: 'Failed to delete invoice' });
  }
});

app.post('/api/app/invoices/:id/send', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const ownerId = req.user!.uid;
    const invoiceId = Number(req.params.id);
    const [inv] = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, invoiceId), eq(invoices.ownerId, ownerId)));
    if (!inv) return res.status(404).json({ error: 'Invoice not found' });

    const channel = req.body?.channel as 'whatsapp' | 'email' | 'sms' | undefined;
    const result = await dispatchClientMessage({
      ownerId,
      invoiceId: inv.id,
      clientId: inv.clientId,
      templateKey: 'bill_sent',
      channelOverride: channel,
      baseUrl: getRequestBaseUrl(req),
    });

    let updatedInvoice = inv;
    if (inv.status === 'draft') {
      const [up] = await db
        .update(invoices)
        .set({ status: 'sent' })
        .where(eq(invoices.id, inv.id))
        .returning();
      updatedInvoice = up;
    }

    res.json({ invoice: updatedInvoice, ...result });
  } catch (err: unknown) {
    console.error('Send bill failed:', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to send bill' });
  }
});

app.post('/api/app/invoices/:id/remind', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const ownerId = req.user!.uid;
    const invoiceId = Number(req.params.id);
    const [inv] = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, invoiceId), eq(invoices.ownerId, ownerId)));
    if (!inv) return res.status(404).json({ error: 'Invoice not found' });

    const templateKey = String(
      req.body?.templateKey || (inv.status === 'overdue' ? 'reminder_firm' : 'reminder_friendly')
    );
    const channel = req.body?.channel as 'whatsapp' | 'email' | 'sms' | undefined;

    const result = await dispatchClientMessage({
      ownerId,
      invoiceId: inv.id,
      clientId: inv.clientId,
      templateKey,
      channelOverride: channel,
      customBody: req.body?.customBody ? String(req.body.customBody) : undefined,
      baseUrl: getRequestBaseUrl(req),
      ignoreQuietHours: true,
    });

    if (inv.status === 'draft') {
      await db.update(invoices).set({ status: 'sent' }).where(eq(invoices.id, inv.id));
    }

    res.json(result);
  } catch (err: unknown) {
    console.error('Send reminder failed:', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to send reminder' });
  }
});

app.post('/api/app/invoices/:id/payments', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const ownerId = req.user!.uid;
    const invoiceId = Number(req.params.id);
    const amount = Number(req.body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Payment amount must be greater than zero' });
    }

    const result = await recordInvoicePayment({
      ownerId,
      invoiceId,
      amount,
      method: String(req.body?.method || 'UPI'),
      referenceNo: String(req.body?.referenceNo || ''),
      note: String(req.body?.note || ''),
      baseUrl: getRequestBaseUrl(req),
    });

    res.status(201).json(result);
  } catch (err: unknown) {
    console.error('Record payment failed:', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to record payment' });
  }
});

// Authenticated owner test helper for simulating Meta/Resend/Razorpay webhook events in preview
app.post('/api/app/webhooks/simulate', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const ownerId = req.user!.uid;
    const { messageLogId, event, invoiceId } = req.body || {};

    if (messageLogId && ['delivered', 'read', 'failed'].includes(event)) {
      const [log] = await db
        .select()
        .from(messageLogs)
        .where(and(eq(messageLogs.id, Number(messageLogId)), eq(messageLogs.ownerId, ownerId)));
      if (!log) return res.status(404).json({ error: 'Message log not found' });

      const updates: Record<string, unknown> = { status: event };
      if (event === 'delivered') updates.deliveredAt = new Date();
      if (event === 'read') {
        updates.deliveredAt = log.deliveredAt || new Date();
        updates.readAt = new Date();
      }
      if (event === 'failed') updates.error = 'Simulated carrier/recipient failure';

      const [updated] = await db
        .update(messageLogs)
        .set(updates)
        .where(eq(messageLogs.id, log.id))
        .returning();

      const [client] = await db.select().from(clients).where(eq(clients.id, log.clientId));
      await db.insert(notifications).values({
        ownerId,
        type: 'message_status',
        title: `${log.channel.toUpperCase()} message ${event} (${client?.name || 'Client'})`,
        body: `Message status updated to ${event}.`,
        link: log.invoiceId ? `/invoices/${log.invoiceId}` : `/clients/${log.clientId}`,
      });

      return res.json({ log: updated });
    }

    if (invoiceId && event === 'razorpay_paid') {
      const [inv] = await db
        .select()
        .from(invoices)
        .where(and(eq(invoices.id, Number(invoiceId)), eq(invoices.ownerId, ownerId)));
      if (!inv) return res.status(404).json({ error: 'Invoice not found' });
      const result = await recordInvoicePayment({
        ownerId,
        invoiceId: inv.id,
        amount: inv.balance || inv.total,
        method: 'Razorpay',
        referenceNo: `pay_${crypto.randomBytes(6).toString('hex')}`,
        note: 'Simulated Razorpay Payment Link webhook capture',
        baseUrl: getRequestBaseUrl(req),
      });
      return res.json(result);
    }

    return res.status(400).json({ error: 'Unsupported simulation event' });
  } catch (err) {
    console.error('Webhook simulation failed:', err);
    res.status(500).json({ error: 'Simulation failed' });
  }
});

// Templates & Notifications & Manual Scheduler
app.put('/api/app/templates/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const ownerId = req.user!.uid;
    const id = Number(req.params.id);
    const body = String(req.body?.body || '').trim();
    if (!body) return res.status(400).json({ error: 'Template body cannot be empty' });

    const [updated] = await db
      .update(templates)
      .set({ body, updatedAt: new Date() })
      .where(and(eq(templates.id, id), eq(templates.ownerId, ownerId)))
      .returning();

    if (!updated) return res.status(404).json({ error: 'Template not found' });
    res.json(updated);
  } catch (err) {
    console.error('Update template failed:', err);
    res.status(500).json({ error: 'Failed to update template' });
  }
});

app.post('/api/app/notifications/read-all', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.ownerId, req.user!.uid));
    res.json({ ok: true });
  } catch (err) {
    console.error('Read all notifications failed:', err);
    res.status(500).json({ error: 'Failed to update notifications' });
  }
});

app.post('/api/app/notifications/:id/read', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.id, id), eq(notifications.ownerId, req.user!.uid)));
    res.json({ ok: true });
  } catch (err) {
    console.error('Read notification failed:', err);
    res.status(500).json({ error: 'Failed to mark notification read' });
  }
});

app.post('/api/app/scheduler/run', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const summary = await runReminderScheduler(req.user!.uid, getRequestBaseUrl(req));
    res.json(summary);
  } catch (err) {
    console.error('Manual scheduler failed:', err);
    res.status(500).json({ error: 'Failed to run scheduler' });
  }
});

app.post('/api/app/daily-summary', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const notif = await generateDailySummaryForOwner(req.user!.uid);
    res.json(notif);
  } catch (err) {
    console.error('Daily summary failed:', err);
    res.status(500).json({ error: 'Failed to generate daily summary' });
  }
});

// ============================================================================
// PUBLIC INVOICE PORTAL (/api/public/invoices/:token) - NO AUTH REQUIRED
// ============================================================================

app.get('/api/public/invoices/:token', async (req: Request, res: Response) => {
  try {
    const publicToken = String(req.params.token || '').trim();
    const [inv] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.publicToken, publicToken));

    if (!inv) {
      return res.status(404).json({ error: 'Invoice not found or link expired' });
    }

    const [[client], [ownerSettings], invoicePayments] = await Promise.all([
      db.select().from(clients).where(eq(clients.id, inv.clientId)),
      db.select().from(settings).where(eq(settings.ownerId, inv.ownerId)),
      db.select().from(payments).where(eq(payments.invoiceId, inv.id)).orderBy(desc(payments.paidAt)),
    ]);

    // First view or sent -> viewed transition & owner notification
    let currentInv = inv;
    if (!inv.viewedAt) {
      const nextStatus = inv.status === 'sent' || inv.status === 'draft' ? 'viewed' : inv.status;
      const [updated] = await db
        .update(invoices)
        .set({ viewedAt: new Date(), status: nextStatus })
        .where(eq(invoices.id, inv.id))
        .returning();
      currentInv = updated;

      await db.insert(notifications).values({
        ownerId: inv.ownerId,
        type: 'invoice_viewed',
        title: `${client?.name || 'Client'} opened ${inv.invoiceNo}`,
        body: `Public invoice link for ₹${formatINRServer(inv.balance || inv.total)} was viewed.`,
        link: `/invoices/${inv.id}`,
        isRead: false,
      });
    }

    res.json({
      invoice: {
        id: currentInv.id,
        invoiceNo: currentInv.invoiceNo,
        issueDate: currentInv.issueDate,
        dueDate: currentInv.dueDate,
        items: currentInv.items,
        subtotal: currentInv.subtotal,
        taxRate: currentInv.taxRate,
        taxAmount: currentInv.taxAmount,
        discount: currentInv.discount,
        total: currentInv.total,
        amountPaid: currentInv.amountPaid,
        balance: currentInv.balance,
        status: currentInv.status,
        notes: currentInv.notes,
        viewedAt: currentInv.viewedAt,
      },
      client: client
        ? {
            name: client.name,
            businessName: client.businessName,
            address: client.address,
            gstin: client.gstin,
          }
        : null,
      seller: ownerSettings
        ? {
            businessName: ownerSettings.businessName,
            ownerName: ownerSettings.ownerName,
            upiId: ownerSettings.upiId,
            bankName: ownerSettings.bankName,
            bankAccountNo: ownerSettings.bankAccountNo,
            bankIfsc: ownerSettings.bankIfsc,
            gstin: ownerSettings.gstin,
            signatureText: ownerSettings.signatureText,
          }
        : null,
      payments: invoicePayments.map((p) => ({
        id: p.id,
        amount: p.amount,
        method: p.method,
        referenceNo: p.referenceNo,
        paidAt: p.paidAt,
      })),
    });
  } catch (err) {
    console.error('Public invoice fetch failed:', err);
    res.status(500).json({ error: 'Unable to load invoice' });
  }
});

app.post('/api/public/invoices/:token/pay', async (req: Request, res: Response) => {
  try {
    const publicToken = String(req.params.token || '').trim();
    const [inv] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.publicToken, publicToken));

    if (!inv) return res.status(404).json({ error: 'Invoice not found' });
    if (inv.balance <= 0 || inv.status === 'paid') {
      return res.status(400).json({ error: 'Invoice is already fully paid' });
    }

    const amount = Math.min(inv.balance, Number(req.body?.amount || inv.balance));
    const method = String(req.body?.method || 'Razorpay');
    const referenceNo =
      String(req.body?.referenceNo || '').trim() || `pay_${crypto.randomBytes(6).toString('hex')}`;

    const result = await recordInvoicePayment({
      ownerId: inv.ownerId,
      invoiceId: inv.id,
      amount,
      method,
      referenceNo,
      note: 'Paid via Public Invoice Portal',
      baseUrl: getRequestBaseUrl(req),
    });

    res.json(result);
  } catch (err) {
    console.error('Public invoice payment failed:', err);
    res.status(500).json({ error: 'Payment processing failed' });
  }
});

// ============================================================================
// REAL PROVIDER WEBHOOKS (WhatsApp Cloud API, Resend, Razorpay)
// ============================================================================

app.get('/api/webhooks/whatsapp', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.status(403).json({ error: 'Invalid Meta verify token' });
});

app.post('/api/webhooks/whatsapp', async (req: Request & { rawBody?: Buffer }, res: Response) => {
  try {
    const appSecret = process.env.WHATSAPP_APP_SECRET;
    if (appSecret) {
      const sig = String(req.headers['x-hub-signature-256'] || '');
      if (!verifyTimingSafeHmac(req.rawBody, appSecret, sig, 'hex', 'sha256=')) {
        return res.status(401).json({ error: 'Invalid WhatsApp webhook signature' });
      }
    }

    const entries = req.body?.entry || [];
    for (const entry of entries) {
      for (const change of entry?.changes || []) {
        const value = change?.value || {};
        // Delivery / Read status updates
        for (const st of value.statuses || []) {
          const wamid = String(st.id || '');
          const statusVal = String(st.status || '');
          if (!wamid || !['sent', 'delivered', 'read', 'failed'].includes(statusVal)) continue;

          const [log] = await db
            .select()
            .from(messageLogs)
            .where(eq(messageLogs.providerMessageId, wamid));

          if (log) {
            const updates: Record<string, unknown> = { status: statusVal };
            if (statusVal === 'delivered') updates.deliveredAt = new Date();
            if (statusVal === 'read') updates.readAt = new Date();
            if (statusVal === 'failed') {
              updates.error = st.errors?.[0]?.title || 'WhatsApp delivery failed';
            }
            await db.update(messageLogs).set(updates).where(eq(messageLogs.id, log.id));
          }
        }

        // Incoming "STOP" opt-out handler
        for (const msg of value.messages || []) {
          const textBody = String(msg.text?.body || '').trim().toUpperCase();
          const fromDigits = String(msg.from || '');
          if (textBody === 'STOP' && fromDigits) {
            const matchingClients = await db.select().from(clients);
            for (const c of matchingClients) {
              const cleanPhone = (c.whatsappNumber || c.phone).replace(/[^\d]/g, '');
              if (cleanPhone.endsWith(fromDigits.slice(-10))) {
                await db.update(clients).set({ optedOut: true }).where(eq(clients.id, c.id));
                const clientInvs = await db
                  .select()
                  .from(invoices)
                  .where(eq(invoices.clientId, c.id));
                for (const ci of clientInvs) {
                  await db
                    .update(reminders)
                    .set({ status: 'skipped' })
                    .where(and(eq(reminders.invoiceId, ci.id), eq(reminders.status, 'scheduled')));
                }
                await db.insert(notifications).values({
                  ownerId: c.ownerId,
                  type: 'message_status',
                  title: `${c.name} replied STOP (opted out)`,
                  body: 'Automated WhatsApp reminders paused for this client.',
                  link: `/clients/${c.id}`,
                });
              }
            }
          }
        }
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error('WhatsApp webhook failed:', err);
    res.status(500).json({ error: 'Webhook processing error' });
  }
});

app.post('/api/webhooks/resend', async (req: Request & { rawBody?: Buffer }, res: Response) => {
  try {
    const resendSecret = process.env.RESEND_WEBHOOK_SECRET;
    if (resendSecret) {
      const svixId = String(req.headers['svix-id'] || '');
      const svixTimestamp = String(req.headers['svix-timestamp'] || '');
      const svixSignature = String(req.headers['svix-signature'] || '');
      if (!svixId || !svixTimestamp || !svixSignature || !req.rawBody) {
        return res.status(401).json({ error: 'Missing Resend signature headers' });
      }
      const signedContent = Buffer.from(`${svixId}.${svixTimestamp}.${req.rawBody.toString('utf8')}`);
      const secretBytes = Buffer.from(resendSecret.replace(/^whsec_/, ''), 'base64');
      const expected = crypto.createHmac('sha256', secretBytes).update(signedContent).digest('base64');
      const valid = svixSignature.split(' ').some((part) => {
        const [, sig] = part.split(',');
        return sig && sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
      });
      if (!valid) {
        return res.status(401).json({ error: 'Invalid Resend webhook signature' });
      }
    }

    const eventType = String(req.body?.type || '');
    const emailId = String(req.body?.data?.email_id || '');
    if (emailId) {
      const [log] = await db
        .select()
        .from(messageLogs)
        .where(eq(messageLogs.providerMessageId, emailId));
      if (log) {
        if (eventType === 'email.delivered') {
          await db
            .update(messageLogs)
            .set({ status: 'delivered', deliveredAt: new Date() })
            .where(eq(messageLogs.id, log.id));
        } else if (eventType === 'email.opened') {
          await db
            .update(messageLogs)
            .set({ status: 'read', readAt: new Date() })
            .where(eq(messageLogs.id, log.id));
        } else if (eventType === 'email.bounced' || eventType === 'email.delivery_delayed') {
          await db
            .update(messageLogs)
            .set({ status: 'failed', error: eventType })
            .where(eq(messageLogs.id, log.id));
        }
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Resend webhook failed:', err);
    res.status(500).json({ error: 'Webhook processing error' });
  }
});

app.post('/api/webhooks/razorpay', async (req: Request & { rawBody?: Buffer }, res: Response) => {
  try {
    const rzpSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (rzpSecret) {
      const sig = String(req.headers['x-razorpay-signature'] || '');
      if (!verifyTimingSafeHmac(req.rawBody, rzpSecret, sig, 'hex')) {
        return res.status(401).json({ error: 'Invalid Razorpay signature' });
      }
    }

    const event = String(req.body?.event || '');
    const paymentEntity = req.body?.payload?.payment?.entity;
    const linkEntity = req.body?.payload?.payment_link?.entity;
    const notes = paymentEntity?.notes || linkEntity?.notes || {};
    const publicToken = String(notes.public_token || '');

    if ((event === 'payment.captured' || event === 'payment_link.paid') && publicToken) {
      const [inv] = await db
        .select()
        .from(invoices)
        .where(eq(invoices.publicToken, publicToken));
      if (inv && inv.balance > 0) {
        const amountRupees = Number(paymentEntity?.amount || linkEntity?.amount_paid || inv.balance * 100) / 100;
        await recordInvoicePayment({
          ownerId: inv.ownerId,
          invoiceId: inv.id,
          amount: amountRupees,
          method: 'Razorpay',
          referenceNo: String(paymentEntity?.id || linkEntity?.id || ''),
          note: 'Auto-captured via Razorpay webhook',
          baseUrl: getRequestBaseUrl(req),
        });
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Razorpay webhook failed:', err);
    res.status(500).json({ error: 'Webhook processing error' });
  }
});

// ============================================================================
// SCHEDULED CRON ENDPOINT (/api/cron/run-reminders)
// ============================================================================

app.post('/api/cron/run-reminders', async (req: Request, res: Response) => {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = String(req.headers.authorization || '');
    if (auth !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized cron request' });
    }
  }
  try {
    const result = await runReminderScheduler(undefined, getRequestBaseUrl(req));
    res.json(result);
  } catch (err) {
    console.error('Cron scheduler failed:', err);
    res.status(500).json({ error: 'Cron run failed' });
  }
});

// ============================================================================
// VITE DEV MIDDLEWARE / PRODUCTION STATIC + START SERVER
// ============================================================================

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build output not found');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ClientAlert server running on http://0.0.0.0:${PORT}`);
  });

  // Hourly background reminder scheduler (lazy; runs after startup without eager DB probes)
  setInterval(() => {
    runReminderScheduler().catch((err) => {
      console.error('Background scheduler interval error:', err);
    });
  }, 60 * 60 * 1000);
}

startServer().catch((err) => {
  console.error('Failed to start ClientAlert server:', err);
  process.exit(1);
});
