import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  clients,
  invoices,
  messageLogs,
  notifications,
  payments,
  reminders,
  settings,
  templates,
  users,
} from '../db/schema.ts';
import { DEFAULT_TEMPLATES, getTemplateKeyForOffset } from '../server/templates.ts';

function isoDateDaysFromToday(offsetDays: number): string {
  const now = new Date();
  // Shift to IST for consistent Indian billing dates
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  ist.setUTCDate(ist.getUTCDate() + offsetDays);
  return ist.toISOString().slice(0, 10);
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export async function ensureOwnerProvisioned(uid: string, email: string, name: string) {
  await db
    .insert(users)
    .values({ uid, email, name })
    .onConflictDoUpdate({
      target: users.uid,
      set: { email, name },
    });

  const existingSettings = await db.select().from(settings).where(eq(settings.ownerId, uid));
  if (existingSettings.length === 0) {
    await db.insert(settings).values({
      ownerId: uid,
      businessName: 'Aarav Digital Studio',
      ownerName: name || email.split('@')[0] || 'Business Owner',
      upiId: 'aaravstudio@okicici',
      bankName: 'HDFC Bank',
      bankAccountNo: '50200048192011',
      bankIfsc: 'HDFC0000240',
      gstin: '27AADCA4521M1Z4',
      defaultLanguage: 'en',
      defaultReminderOffsets: [-3, 0, 3, 7, 15, 30],
      quietHoursStart: 21,
      quietHoursEnd: 9,
      signatureText: 'Thank you for partnering with Aarav Digital Studio!',
      notifyEmail: true,
      notifyWhatsapp: true,
    });
  }

  const existingTemplates = await db.select().from(templates).where(eq(templates.ownerId, uid));
  if (existingTemplates.length === 0) {
    await db.insert(templates).values(
      DEFAULT_TEMPLATES.map((t) => ({
        ownerId: uid,
        templateKey: t.templateKey,
        language: t.language,
        label: t.label,
        body: t.body,
      }))
    );
  }

  // Seed 5 realistic Indian SME clients + invoices on first sign-in if owner has no clients
  const existingClients = await db.select().from(clients).where(eq(clients.ownerId, uid));
  if (existingClients.length === 0) {
    await seedSampleOwnerData(uid, name || email.split('@')[0] || 'Owner');
  }
}

export async function seedSampleOwnerData(ownerId: string, ownerName: string) {
  const insertedClients = await db
    .insert(clients)
    .values([
      {
        ownerId,
        name: 'Rajesh Sharma',
        businessName: 'Sharma Electronics Pvt Ltd',
        phone: '+919820112233',
        whatsappNumber: '+919820112233',
        email: 'rajesh@sharmaelectronics.in',
        address: 'Andheri West, Mumbai 400053',
        gstin: '27AABCS1429B1ZS',
        preferredChannel: 'whatsapp',
        preferredLanguage: 'hi',
        notes: 'Prefers WhatsApp reminders in Hindi. Monthly store support.',
        tags: ['Retainer', 'Mumbai'],
      },
      {
        ownerId,
        name: 'Priya Nair',
        businessName: 'Nair Design Studio',
        phone: '+919845022334',
        whatsappNumber: '+919845022334',
        email: 'priya@nairdesign.co.in',
        address: 'Indiranagar, Bengaluru 560038',
        gstin: '29AADCN9812K1Z5',
        preferredChannel: 'email',
        preferredLanguage: 'en',
        notes: 'Prompt payer via NEFT/UPI.',
        tags: ['Design', 'VIP'],
      },
      {
        ownerId,
        name: 'Vikram Patel',
        businessName: 'Patel Agro Exports',
        phone: '+919825033445',
        whatsappNumber: '+919825033445',
        email: 'accounts@patelagro.in',
        address: 'Navrangpura, Ahmedabad 380009',
        gstin: '24AABCP7765M1Z1',
        preferredChannel: 'whatsapp',
        preferredLanguage: 'en',
        notes: 'Paid 50% advance; balance pending before shipment.',
        tags: ['Wholesale', 'Gujarat'],
      },
      {
        ownerId,
        name: 'Ananya Gupta',
        businessName: 'Gupta Wellness Clinic',
        phone: '+919811044556',
        whatsappNumber: '+919811044556',
        email: 'ananya@guptawellness.in',
        address: 'Saket, New Delhi 110017',
        gstin: '',
        preferredChannel: 'whatsapp',
        preferredLanguage: 'hi',
        notes: 'Viewed invoice yesterday; likely paying by UPI this week.',
        tags: ['Healthcare', 'Delhi'],
      },
      {
        ownerId,
        name: 'Karthik Subramanian',
        businessName: 'Kaveri Logistics',
        phone: '+919840055667',
        whatsappNumber: '+919840055667',
        email: 'finance@kaverilogistics.in',
        address: 'T. Nagar, Chennai 600017',
        gstin: '33AAACK4512D1Z9',
        preferredChannel: 'email',
        preferredLanguage: 'en',
        notes: '15-day credit terms.',
        tags: ['Logistics', 'Chennai'],
      },
    ])
    .returning();

  const token = () => crypto.randomBytes(10).toString('hex');

  const invoiceSeeds = [
    {
      client: insertedClients[0],
      invoiceNo: 'INV-2026-001',
      issueDate: isoDateDaysFromToday(-24),
      dueDate: isoDateDaysFromToday(-9),
      items: [
        { description: 'E-commerce Storefront Redesign', qty: 1, rate: 40000 },
        { description: 'Razorpay & WhatsApp Checkout Integration', qty: 1, rate: 10000 },
      ],
      subtotal: 50000,
      taxRate: 18,
      taxAmount: 9000,
      discount: 0,
      total: 59000,
      amountPaid: 0,
      balance: 59000,
      status: 'overdue',
      notes: '15-day credit period. Pay via UPI or Razorpay.',
    },
    {
      client: insertedClients[1],
      invoiceNo: 'INV-2026-002',
      issueDate: isoDateDaysFromToday(-18),
      dueDate: isoDateDaysFromToday(-4),
      items: [{ description: 'Design System & UI Component Audit', qty: 1, rate: 30000 }],
      subtotal: 30000,
      taxRate: 18,
      taxAmount: 5400,
      discount: 0,
      total: 35400,
      amountPaid: 35400,
      balance: 0,
      status: 'paid',
      notes: 'Settled in full via UPI.',
    },
    {
      client: insertedClients[2],
      invoiceNo: 'INV-2026-003',
      issueDate: isoDateDaysFromToday(-12),
      dueDate: isoDateDaysFromToday(2),
      items: [
        { description: 'GST Export Billing Automation', qty: 1, rate: 40000 },
        { description: 'Monthly Cloud Maintenance', qty: 1, rate: 5000 },
      ],
      subtotal: 45000,
      taxRate: 18,
      taxAmount: 8100,
      discount: 3100,
      total: 50000,
      amountPaid: 20000,
      balance: 30000,
      status: 'partially_paid',
      notes: '₹20,000 booking advance received.',
    },
    {
      client: insertedClients[3],
      invoiceNo: 'INV-2026-004',
      issueDate: isoDateDaysFromToday(-5),
      dueDate: isoDateDaysFromToday(4),
      items: [{ description: 'Patient Appointment Portal & Reminders', qty: 1, rate: 20000 }],
      subtotal: 20000,
      taxRate: 18,
      taxAmount: 3600,
      discount: 0,
      total: 23600,
      amountPaid: 0,
      balance: 23600,
      status: 'viewed',
      viewedAt: daysAgo(1),
      notes: 'Due this week.',
    },
    {
      client: insertedClients[4],
      invoiceNo: 'INV-2026-005',
      issueDate: isoDateDaysFromToday(-2),
      dueDate: isoDateDaysFromToday(12),
      items: [{ description: 'Fleet Tracking Dashboard Retainer (Nov)', qty: 1, rate: 25000 }],
      subtotal: 25000,
      taxRate: 18,
      taxAmount: 4500,
      discount: 0,
      total: 29500,
      amountPaid: 0,
      balance: 29500,
      status: 'sent',
      notes: 'Monthly retainer billing.',
    },
  ];

  const createdInvoices = [];
  for (const inv of invoiceSeeds) {
    const pubTok = token();
    const [created] = await db
      .insert(invoices)
      .values({
        ownerId,
        clientId: inv.client.id,
        invoiceNo: inv.invoiceNo,
        issueDate: inv.issueDate,
        dueDate: inv.dueDate,
        items: inv.items,
        subtotal: inv.subtotal,
        taxRate: inv.taxRate,
        taxAmount: inv.taxAmount,
        discount: inv.discount,
        total: inv.total,
        amountPaid: inv.amountPaid,
        balance: inv.balance,
        status: inv.status,
        publicToken: pubTok,
        paymentLinkUrl: `/i/${pubTok}`,
        reminderOffsets: [-3, 0, 3, 7, 15, 30],
        notes: inv.notes,
        viewedAt: inv.viewedAt ?? null,
      })
      .returning();
    createdInvoices.push({ created, client: inv.client });
  }

  // Payments for Paid & Partially Paid invoices
  await db.insert(payments).values([
    {
      ownerId,
      invoiceId: createdInvoices[1].created.id,
      amount: 35400,
      method: 'UPI',
      referenceNo: 'UPI-631849201442',
      paidAt: daysAgo(4),
      note: 'Paid via Google Pay UPI',
    },
    {
      ownerId,
      invoiceId: createdInvoices[2].created.id,
      amount: 20000,
      method: 'Razorpay',
      referenceNo: 'pay_P9xK2L81mNqR',
      paidAt: daysAgo(7),
      note: '50% project advance via Razorpay Link',
    },
  ]);

  // Message Logs demonstrating ✓ sent, ✓✓ delivered, blue ✓✓ read, ❌ failed
  await db.insert(messageLogs).values([
    {
      ownerId,
      invoiceId: createdInvoices[0].created.id,
      clientId: createdInvoices[0].client.id,
      channel: 'whatsapp',
      templateKey: 'bill_sent',
      messageBody: `नमस्ते Rajesh Sharma जी, आपका बिल INV-2026-001 ₹59,000 का तैयार है। धन्यवाद! – ${ownerName}`,
      providerMessageId: 'wamid.HBgMOTE5ODIwMTEyMjMz',
      status: 'read',
      sentAt: daysAgo(24),
      deliveredAt: daysAgo(24),
      readAt: daysAgo(23),
    },
    {
      ownerId,
      invoiceId: createdInvoices[0].created.id,
      clientId: createdInvoices[0].client.id,
      channel: 'whatsapp',
      templateKey: 'reminder_firm',
      messageBody: `नमस्ते Rajesh Sharma जी, आपका बिल INV-2026-001 (₹59,000) 9 दिनों से बकाया है। कृपया तुरंत भुगतान करें। – ${ownerName}`,
      providerMessageId: 'wamid.HBgMOTE5ODIwMTEyMjM0',
      status: 'delivered',
      sentAt: daysAgo(2),
      deliveredAt: daysAgo(2),
    },
    {
      ownerId,
      invoiceId: createdInvoices[1].created.id,
      clientId: createdInvoices[1].client.id,
      channel: 'email',
      templateKey: 'payment_received',
      messageBody: `Thank you Priya Nair! We received your payment for invoice INV-2026-002. Remaining balance: ₹0. – ${ownerName}`,
      providerMessageId: 're_94a8c12e',
      status: 'read',
      sentAt: daysAgo(4),
      deliveredAt: daysAgo(4),
      readAt: daysAgo(4),
    },
    {
      ownerId,
      invoiceId: createdInvoices[3].created.id,
      clientId: createdInvoices[3].client.id,
      channel: 'whatsapp',
      templateKey: 'bill_sent',
      messageBody: `नमस्ते Ananya Gupta जी, आपका बिल INV-2026-004 ₹23,600 का तैयार है। धन्यवाद! – ${ownerName}`,
      providerMessageId: 'wamid.HBgMOTE5ODExMDQ0NTU2',
      status: 'read',
      sentAt: daysAgo(5),
      deliveredAt: daysAgo(5),
      readAt: daysAgo(1),
    },
    {
      ownerId,
      invoiceId: createdInvoices[4].created.id,
      clientId: createdInvoices[4].client.id,
      channel: 'email',
      templateKey: 'bill_sent',
      messageBody: `Hi Karthik Subramanian, your invoice INV-2026-005 of ₹29,500 is ready. – ${ownerName}`,
      providerMessageId: 're_55f1d09b',
      status: 'sent',
      sentAt: daysAgo(2),
    },
  ]);

  // Scheduled reminders for unpaid invoices
  const reminderRows = [];
  for (const { created, client } of createdInvoices) {
    if (created.status === 'paid' || created.status === 'cancelled') continue;
    const due = new Date(`${created.dueDate}T04:30:00Z`); // 10:00 AM IST
    for (const offset of created.reminderOffsets) {
      const sched = new Date(due.getTime() + offset * 24 * 60 * 60 * 1000);
      if (sched.getTime() > Date.now() - 2 * 24 * 60 * 60 * 1000) {
        reminderRows.push({
          ownerId,
          invoiceId: created.id,
          scheduledAt: sched,
          offsetDays: offset,
          channel: client.preferredChannel,
          templateKey: getTemplateKeyForOffset(offset),
          status: 'scheduled',
        });
      }
    }
  }
  if (reminderRows.length > 0) {
    await db.insert(reminders).values(reminderRows);
  }

  // Owner notifications
  await db.insert(notifications).values([
    {
      ownerId,
      type: 'invoice_overdue',
      title: 'INV-2026-001 is overdue by 9 days',
      body: 'Sharma Electronics Pvt Ltd owes ₹59,000. Firm WhatsApp reminder delivered.',
      link: `/invoices/${createdInvoices[0].created.id}`,
      isRead: false,
      createdAt: daysAgo(1),
    },
    {
      ownerId,
      type: 'invoice_viewed',
      title: 'Ananya Gupta viewed INV-2026-004',
      body: 'Client opened the public invoice link for ₹23,600.',
      link: `/invoices/${createdInvoices[3].created.id}`,
      isRead: false,
      createdAt: daysAgo(1),
    },
    {
      ownerId,
      type: 'payment_received',
      title: 'Payment received: ₹35,400 from Priya Nair',
      body: 'INV-2026-002 marked Paid via UPI (Ref: UPI-631849201442).',
      link: `/invoices/${createdInvoices[1].created.id}`,
      isRead: true,
      createdAt: daysAgo(4),
    },
  ]);
}
