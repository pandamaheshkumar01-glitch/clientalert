export interface InvoiceItem {
  description: string;
  qty: number;
  rate: number;
}

export interface Client {
  id: number;
  ownerId: string;
  name: string;
  businessName: string;
  phone: string;
  whatsappNumber: string;
  email: string;
  address: string;
  gstin: string;
  preferredChannel: 'whatsapp' | 'email' | 'sms';
  preferredLanguage: 'en' | 'hi';
  notes: string;
  tags: string[];
  optedOut: boolean;
  createdAt: string;
}

export type InvoiceStatus =
  | 'draft'
  | 'sent'
  | 'viewed'
  | 'partially_paid'
  | 'paid'
  | 'overdue'
  | 'cancelled';

export interface Invoice {
  id: number;
  ownerId: string;
  clientId: number;
  invoiceNo: string;
  issueDate: string;
  dueDate: string;
  items: InvoiceItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  discount: number;
  total: number;
  amountPaid: number;
  balance: number;
  status: InvoiceStatus;
  paymentLinkUrl: string;
  publicToken: string;
  reminderOffsets: number[];
  notes: string;
  viewedAt: string | null;
  createdAt: string;
}

export interface Payment {
  id: number;
  ownerId: string;
  invoiceId: number;
  amount: number;
  method: 'UPI' | 'cash' | 'bank' | 'Razorpay' | 'cheque';
  referenceNo: string;
  paidAt: string;
  note: string;
}

export interface Reminder {
  id: number;
  ownerId: string;
  invoiceId: number;
  scheduledAt: string;
  offsetDays: number;
  channel: 'whatsapp' | 'email' | 'sms';
  templateKey: string;
  status: 'scheduled' | 'sent' | 'skipped' | 'cancelled';
  sentAt: string | null;
}

export interface MessageLog {
  id: number;
  ownerId: string;
  invoiceId: number | null;
  clientId: number;
  channel: 'whatsapp' | 'email' | 'sms';
  templateKey: string;
  messageBody: string;
  providerMessageId: string;
  status: 'queued' | 'sent' | 'delivered' | 'read' | 'failed';
  error: string;
  sentAt: string;
  deliveredAt: string | null;
  readAt: string | null;
}

export interface NotificationItem {
  id: number;
  ownerId: string;
  type: string;
  title: string;
  body: string;
  link: string;
  isRead: boolean;
  createdAt: string;
}

export interface OwnerSettings {
  id: number;
  ownerId: string;
  businessName: string;
  ownerName: string;
  logoUrl: string;
  upiId: string;
  bankName: string;
  bankAccountNo: string;
  bankIfsc: string;
  gstin: string;
  defaultLanguage: 'en' | 'hi';
  defaultReminderOffsets: number[];
  quietHoursStart: number;
  quietHoursEnd: number;
  signatureText: string;
  notifyEmail: boolean;
  notifyWhatsapp: boolean;
}

export interface MessageTemplate {
  id: number;
  ownerId: string;
  templateKey: string;
  language: 'en' | 'hi';
  label: string;
  body: string;
  updatedAt: string;
}

export interface BootstrapPayload {
  user: {
    uid: string;
    email: string;
    name: string;
  };
  settings: OwnerSettings;
  clients: Client[];
  invoices: Invoice[];
  payments: Payment[];
  messageLogs: MessageLog[];
  reminders: Reminder[];
  notifications: NotificationItem[];
  templates: MessageTemplate[];
}

export interface PublicInvoicePayload {
  invoice: {
    id: number;
    invoiceNo: string;
    issueDate: string;
    dueDate: string;
    items: InvoiceItem[];
    subtotal: number;
    taxRate: number;
    taxAmount: number;
    discount: number;
    total: number;
    amountPaid: number;
    balance: number;
    status: InvoiceStatus;
    notes: string;
    viewedAt: string | null;
  };
  client: {
    name: string;
    businessName: string;
    address: string;
    gstin: string;
  } | null;
  seller: {
    businessName: string;
    ownerName: string;
    upiId: string;
    bankName: string;
    bankAccountNo: string;
    bankIfsc: string;
    gstin: string;
    signatureText: string;
  } | null;
  payments: Array<{
    id: number;
    amount: number;
    method: string;
    referenceNo: string;
    paidAt: string;
  }>;
}
