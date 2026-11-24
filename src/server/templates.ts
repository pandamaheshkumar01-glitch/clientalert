export interface DefaultTemplateDef {
  templateKey: string;
  language: 'en' | 'hi';
  label: string;
  body: string;
}

export const DEFAULT_TEMPLATES: DefaultTemplateDef[] = [
  {
    templateKey: 'bill_sent',
    language: 'en',
    label: 'Bill Sent (English)',
    body: 'Hi {client_name}, your invoice {invoice_no} of ₹{amount} is ready. Due date: {due_date}. Pay here: {pay_link}. Thank you! – {owner_name}',
  },
  {
    templateKey: 'bill_sent',
    language: 'hi',
    label: 'Bill Sent (Hindi)',
    body: 'नमस्ते {client_name} जी, आपका बिल {invoice_no} ₹{amount} का तैयार है। भुगतान की अंतिम तिथि: {due_date}। यहाँ भुगतान करें: {pay_link}। धन्यवाद! – {owner_name}',
  },
  {
    templateKey: 'reminder_friendly',
    language: 'en',
    label: 'Friendly Reminder (Before Due - EN)',
    body: 'Hi {client_name}, gentle reminder that invoice {invoice_no} for ₹{balance} from {business_name} is due on {due_date}. Pay easily via UPI/Card: {pay_link}. – {owner_name}',
  },
  {
    templateKey: 'reminder_friendly',
    language: 'hi',
    label: 'Friendly Reminder (Before Due - HI)',
    body: 'नमस्ते {client_name} जी, विनम्र याद दिलाना है कि {business_name} का बिल {invoice_no} (₹{balance}) {due_date} को देय है। कृपया यहाँ भुगतान करें: {pay_link}। धन्यवाद! – {owner_name}',
  },
  {
    templateKey: 'reminder_due_today',
    language: 'en',
    label: 'Due Today (EN)',
    body: 'Hi {client_name}, your invoice {invoice_no} of ₹{balance} is due today ({due_date}). Kindly clear the payment at your earliest: {pay_link}. – {owner_name}',
  },
  {
    templateKey: 'reminder_due_today',
    language: 'hi',
    label: 'Due Today (HI)',
    body: 'नमस्ते {client_name} जी, आपका बिल {invoice_no} ₹{balance} आज ({due_date}) देय है। कृपया शीघ्र भुगतान करें: {pay_link}। – {owner_name}',
  },
  {
    templateKey: 'reminder_firm',
    language: 'en',
    label: 'Overdue Firm Reminder (EN)',
    body: 'Hello {client_name}, invoice {invoice_no} for ₹{balance} is now {days_overdue} days overdue (due {due_date}). Please process the payment immediately via {pay_link}. – {owner_name}',
  },
  {
    templateKey: 'reminder_firm',
    language: 'hi',
    label: 'Overdue Firm Reminder (HI)',
    body: 'नमस्ते {client_name} जी, आपका बिल {invoice_no} (₹{balance}) {days_overdue} दिनों से बकाया है। कृपया तुरंत भुगतान करें: {pay_link}। – {owner_name}',
  },
  {
    templateKey: 'reminder_final',
    language: 'en',
    label: 'Final Notice (EN)',
    body: 'FINAL NOTICE: Dear {client_name}, invoice {invoice_no} (balance ₹{balance}) from {business_name} is {days_overdue} days past due. Kindly settle today to avoid service pause: {pay_link}. – {owner_name}',
  },
  {
    templateKey: 'reminder_final',
    language: 'hi',
    label: 'Final Notice (HI)',
    body: 'अंतिम सूचना: {client_name} जी, {business_name} का बिल {invoice_no} (₹{balance}) {days_overdue} दिनों से लंबित है। सेवा निरंतर रखने हेतु कृपया आज ही भुगतान करें: {pay_link}। – {owner_name}',
  },
  {
    templateKey: 'payment_received',
    language: 'en',
    label: 'Payment Received Thank You (EN)',
    body: 'Thank you {client_name}! We received your payment for invoice {invoice_no}. Remaining balance: ₹{balance}. View receipt: {pay_link}. – {owner_name}',
  },
  {
    templateKey: 'payment_received',
    language: 'hi',
    label: 'Payment Received Thank You (HI)',
    body: 'धन्यवाद {client_name} जी! बिल {invoice_no} का भुगतान प्राप्त हो गया है। शेष राशि: ₹{balance}। रसीद देखें: {pay_link}। – {owner_name}',
  },
];

export interface TemplateContext {
  client_name: string;
  business_name: string;
  invoice_no: string;
  amount: string;
  balance: string;
  due_date: string;
  days_overdue: string;
  pay_link: string;
  owner_name: string;
}

export function renderTemplate(body: string, ctx: TemplateContext): string {
  return body
    .replaceAll('{client_name}', ctx.client_name)
    .replaceAll('{business_name}', ctx.business_name)
    .replaceAll('{invoice_no}', ctx.invoice_no)
    .replaceAll('{amount}', ctx.amount)
    .replaceAll('{balance}', ctx.balance)
    .replaceAll('{due_date}', ctx.due_date)
    .replaceAll('{days_overdue}', ctx.days_overdue)
    .replaceAll('{pay_link}', ctx.pay_link)
    .replaceAll('{owner_name}', ctx.owner_name);
}

export function formatINRServer(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}

export function getTemplateKeyForOffset(offsetDays: number): string {
  if (offsetDays < 0) return 'reminder_friendly';
  if (offsetDays === 0) return 'reminder_due_today';
  if (offsetDays <= 7) return 'reminder_firm';
  return 'reminder_final';
}
