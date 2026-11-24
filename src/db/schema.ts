import { relations } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export interface InvoiceLineItem {
  description: string;
  qty: number;
  rate: number;
}

// Owners / authenticated users synced from Firebase Auth
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  name: text('name').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Owner business settings & preferences
export const settings = pgTable('settings', {
  id: serial('id').primaryKey(),
  ownerId: text('owner_id').notNull().unique(),
  businessName: text('business_name').notNull().default('My Business'),
  ownerName: text('owner_name').notNull().default('Owner'),
  logoUrl: text('logo_url').notNull().default(''),
  upiId: text('upi_id').notNull().default(''),
  bankName: text('bank_name').notNull().default(''),
  bankAccountNo: text('bank_account_no').notNull().default(''),
  bankIfsc: text('bank_ifsc').notNull().default(''),
  gstin: text('gstin').notNull().default(''),
  defaultLanguage: text('default_language').notNull().default('en'),
  defaultReminderOffsets: jsonb('default_reminder_offsets')
    .$type<number[]>()
    .notNull()
    .default([-3, 0, 3, 7, 15, 30]),
  quietHoursStart: integer('quiet_hours_start').notNull().default(21),
  quietHoursEnd: integer('quiet_hours_end').notNull().default(9),
  signatureText: text('signature_text').notNull().default('Thank you for your business!'),
  notifyEmail: boolean('notify_email').notNull().default(true),
  notifyWhatsapp: boolean('notify_whatsapp').notNull().default(true),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Clients belonging to an owner
export const clients = pgTable('clients', {
  id: serial('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  name: text('name').notNull(),
  businessName: text('business_name').notNull().default(''),
  phone: text('phone').notNull(),
  whatsappNumber: text('whatsapp_number').notNull().default(''),
  email: text('email').notNull().default(''),
  address: text('address').notNull().default(''),
  gstin: text('gstin').notNull().default(''),
  preferredChannel: text('preferred_channel').notNull().default('whatsapp'),
  preferredLanguage: text('preferred_language').notNull().default('en'),
  notes: text('notes').notNull().default(''),
  tags: jsonb('tags').$type<string[]>().notNull().default([]),
  optedOut: boolean('opted_out').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Invoices / bills
export const invoices = pgTable('invoices', {
  id: serial('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  clientId: integer('client_id')
    .references(() => clients.id, { onDelete: 'cascade' })
    .notNull(),
  invoiceNo: text('invoice_no').notNull(),
  issueDate: text('issue_date').notNull(),
  dueDate: text('due_date').notNull(),
  items: jsonb('items').$type<InvoiceLineItem[]>().notNull().default([]),
  subtotal: doublePrecision('subtotal').notNull().default(0),
  taxRate: doublePrecision('tax_rate').notNull().default(18),
  taxAmount: doublePrecision('tax_amount').notNull().default(0),
  discount: doublePrecision('discount').notNull().default(0),
  total: doublePrecision('total').notNull().default(0),
  amountPaid: doublePrecision('amount_paid').notNull().default(0),
  balance: doublePrecision('balance').notNull().default(0),
  status: text('status').notNull().default('draft'),
  paymentLinkUrl: text('payment_link_url').notNull().default(''),
  publicToken: text('public_token').notNull().unique(),
  reminderOffsets: jsonb('reminder_offsets')
    .$type<number[]>()
    .notNull()
    .default([-3, 0, 3, 7, 15, 30]),
  notes: text('notes').notNull().default(''),
  viewedAt: timestamp('viewed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Recorded payments (UPI, Razorpay, cash, bank, cheque)
export const payments = pgTable('payments', {
  id: serial('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  invoiceId: integer('invoice_id')
    .references(() => invoices.id, { onDelete: 'cascade' })
    .notNull(),
  amount: doublePrecision('amount').notNull(),
  method: text('method').notNull().default('UPI'),
  referenceNo: text('reference_no').notNull().default(''),
  paidAt: timestamp('paid_at').defaultNow().notNull(),
  note: text('note').notNull().default(''),
});

// Scheduled automatic reminders per invoice
export const reminders = pgTable('reminders', {
  id: serial('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  invoiceId: integer('invoice_id')
    .references(() => invoices.id, { onDelete: 'cascade' })
    .notNull(),
  scheduledAt: timestamp('scheduled_at').notNull(),
  offsetDays: integer('offset_days').notNull().default(0),
  channel: text('channel').notNull().default('whatsapp'),
  templateKey: text('template_key').notNull(),
  status: text('status').notNull().default('scheduled'),
  sentAt: timestamp('sent_at'),
});

// Outbound message logs with real-time delivery & read tracking
export const messageLogs = pgTable('message_logs', {
  id: serial('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  invoiceId: integer('invoice_id').references(() => invoices.id, { onDelete: 'set null' }),
  clientId: integer('client_id')
    .references(() => clients.id, { onDelete: 'cascade' })
    .notNull(),
  channel: text('channel').notNull(),
  templateKey: text('template_key').notNull(),
  messageBody: text('message_body').notNull(),
  providerMessageId: text('provider_message_id').notNull().default(''),
  status: text('status').notNull().default('queued'),
  error: text('error').notNull().default(''),
  sentAt: timestamp('sent_at').defaultNow().notNull(),
  deliveredAt: timestamp('delivered_at'),
  readAt: timestamp('read_at'),
});

// In-app notifications for the owner
export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  type: text('type').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  link: text('link').notNull().default(''),
  isRead: boolean('is_read').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Editable Hindi & English message templates
export const templates = pgTable('templates', {
  id: serial('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  templateKey: text('template_key').notNull(),
  language: text('language').notNull().default('en'),
  label: text('label').notNull(),
  body: text('body').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Relations
export const clientsRelations = relations(clients, ({ many }) => ({
  invoices: many(invoices),
  messageLogs: many(messageLogs),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  client: one(clients, {
    fields: [invoices.clientId],
    references: [clients.id],
  }),
  payments: many(payments),
  reminders: many(reminders),
  messageLogs: many(messageLogs),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  invoice: one(invoices, {
    fields: [payments.invoiceId],
    references: [invoices.id],
  }),
}));

export const remindersRelations = relations(reminders, ({ one }) => ({
  invoice: one(invoices, {
    fields: [reminders.invoiceId],
    references: [invoices.id],
  }),
}));

export const messageLogsRelations = relations(messageLogs, ({ one }) => ({
  invoice: one(invoices, {
    fields: [messageLogs.invoiceId],
    references: [invoices.id],
  }),
  client: one(clients, {
    fields: [messageLogs.clientId],
    references: [clients.id],
  }),
}));
