import { and, eq, inArray, lte } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { clients, invoices, notifications, payments, reminders, settings } from '../db/schema.ts';
import {
  dispatchClientMessage,
  getNextAllowedISTSendTime,
  isQuietHoursIST,
} from './messaging.ts';
import { formatINRServer } from './templates.ts';

function getTodayIST(): string {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

export async function runReminderScheduler(ownerIdFilter?: string, baseUrl?: string) {
  const todayIST = getTodayIST();
  let overdueMarked = 0;
  let remindersSent = 0;
  let remindersDeferred = 0;
  let remindersSkipped = 0;

  // 1. Mark overdue invoices whose dueDate < todayIST and balance > 0
  const candidateInvoices = await db
    .select()
    .from(invoices)
    .where(
      ownerIdFilter
        ? and(
            eq(invoices.ownerId, ownerIdFilter),
            inArray(invoices.status, ['sent', 'viewed', 'partially_paid'])
          )
        : inArray(invoices.status, ['sent', 'viewed', 'partially_paid'])
    );

  for (const inv of candidateInvoices) {
    if (inv.balance > 0 && inv.dueDate < todayIST) {
      await db.update(invoices).set({ status: 'overdue' }).where(eq(invoices.id, inv.id));
      overdueMarked += 1;

      const [client] = await db.select().from(clients).where(eq(clients.id, inv.clientId));
      await db.insert(notifications).values({
        ownerId: inv.ownerId,
        type: 'invoice_overdue',
        title: `${inv.invoiceNo} is now overdue`,
        body: `${client?.name || 'Client'} has ₹${formatINRServer(inv.balance)} pending past ${inv.dueDate}.`,
        link: `/invoices/${inv.id}`,
      });
    }
  }

  // 2. Process scheduled reminders due now
  const dueReminders = await db
    .select()
    .from(reminders)
    .where(
      ownerIdFilter
        ? and(
            eq(reminders.ownerId, ownerIdFilter),
            eq(reminders.status, 'scheduled'),
            lte(reminders.scheduledAt, new Date())
          )
        : and(eq(reminders.status, 'scheduled'), lte(reminders.scheduledAt, new Date()))
    );

  for (const rem of dueReminders) {
    const [inv] = await db.select().from(invoices).where(eq(invoices.id, rem.invoiceId));
    if (!inv || inv.status === 'paid' || inv.status === 'cancelled' || inv.balance <= 0) {
      await db
        .update(reminders)
        .set({ status: 'cancelled' })
        .where(eq(reminders.id, rem.id));
      remindersSkipped += 1;
      continue;
    }

    const [client] = await db.select().from(clients).where(eq(clients.id, inv.clientId));
    if (!client || client.optedOut) {
      await db.update(reminders).set({ status: 'skipped' }).where(eq(reminders.id, rem.id));
      remindersSkipped += 1;
      continue;
    }

    const [ownerCfg] = await db
      .select()
      .from(settings)
      .where(eq(settings.ownerId, rem.ownerId));
    const qStart = ownerCfg?.quietHoursStart ?? 21;
    const qEnd = ownerCfg?.quietHoursEnd ?? 9;

    if (isQuietHoursIST(qStart, qEnd)) {
      // Defer to 9:05 AM IST instead of disturbing client at night
      await db
        .update(reminders)
        .set({ scheduledAt: getNextAllowedISTSendTime(qEnd) })
        .where(eq(reminders.id, rem.id));
      remindersDeferred += 1;
      continue;
    }

    await dispatchClientMessage({
      ownerId: rem.ownerId,
      invoiceId: inv.id,
      clientId: client.id,
      templateKey: rem.templateKey,
      channelOverride: rem.channel as 'whatsapp' | 'email' | 'sms',
      baseUrl,
    });

    await db
      .update(reminders)
      .set({ status: 'sent', sentAt: new Date() })
      .where(eq(reminders.id, rem.id));
    remindersSent += 1;
  }

  return {
    overdueMarked,
    remindersSent,
    remindersDeferred,
    remindersSkipped,
    quietHoursActive: isQuietHoursIST(),
  };
}

export async function generateDailySummaryForOwner(ownerId: string) {
  const ownerInvoices = await db.select().from(invoices).where(eq(invoices.ownerId, ownerId));
  const ownerPayments = await db.select().from(payments).where(eq(payments.ownerId, ownerId));

  const pendingTotal = ownerInvoices
    .filter((i) => i.status !== 'paid' && i.status !== 'cancelled' && i.status !== 'draft')
    .reduce((acc, i) => acc + i.balance, 0);

  const overdueClientIds = new Set(
    ownerInvoices.filter((i) => i.status === 'overdue').map((i) => i.clientId)
  );

  const sinceYesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentPaymentsCount = ownerPayments.filter(
    (p) => new Date(p.paidAt).getTime() >= sinceYesterday.getTime()
  ).length;

  const summaryBody = `Aaj ₹${formatINRServer(pendingTotal)} pending, ${overdueClientIds.size} clients overdue, ${recentPaymentsCount} payments received kal.`;

  const [created] = await db
    .insert(notifications)
    .values({
      ownerId,
      type: 'daily_summary',
      title: '9:00 AM IST Daily Summary',
      body: summaryBody,
      link: '/dashboard',
      isRead: false,
    })
    .returning();

  return created;
}
