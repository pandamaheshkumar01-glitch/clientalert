-- ClientAlert PostgreSQL Migration (Supabase / Postgres compatible)
-- Includes full schema, Row Level Security (RLS) policies, indexes, and 5 sample Indian SME clients + invoices.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Settings (per owner)
CREATE TABLE IF NOT EXISTS public.settings (
  id BIGSERIAL PRIMARY KEY,
  owner_id TEXT NOT NULL UNIQUE,
  business_name TEXT NOT NULL DEFAULT 'My Business',
  owner_name TEXT NOT NULL DEFAULT 'Owner',
  logo_url TEXT NOT NULL DEFAULT '',
  upi_id TEXT NOT NULL DEFAULT '',
  bank_name TEXT NOT NULL DEFAULT '',
  bank_account_no TEXT NOT NULL DEFAULT '',
  bank_ifsc TEXT NOT NULL DEFAULT '',
  gstin TEXT NOT NULL DEFAULT '',
  default_language TEXT NOT NULL DEFAULT 'en' CHECK (default_language IN ('en', 'hi')),
  default_reminder_offsets JSONB NOT NULL DEFAULT '[-3, 0, 3, 7, 15, 30]'::jsonb,
  quiet_hours_start INTEGER NOT NULL DEFAULT 21,
  quiet_hours_end INTEGER NOT NULL DEFAULT 9,
  signature_text TEXT NOT NULL DEFAULT 'Thank you for your business!',
  notify_email BOOLEAN NOT NULL DEFAULT true,
  notify_whatsapp BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Clients
CREATE TABLE IF NOT EXISTS public.clients (
  id BIGSERIAL PRIMARY KEY,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  business_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL,
  whatsapp_number TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  gstin TEXT NOT NULL DEFAULT '',
  preferred_channel TEXT NOT NULL DEFAULT 'whatsapp' CHECK (preferred_channel IN ('whatsapp', 'email', 'sms')),
  preferred_language TEXT NOT NULL DEFAULT 'en' CHECK (preferred_language IN ('hi', 'en')),
  notes TEXT NOT NULL DEFAULT '',
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  opted_out BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clients_owner ON public.clients(owner_id);

-- 3. Invoices
CREATE TABLE IF NOT EXISTS public.invoices (
  id BIGSERIAL PRIMARY KEY,
  owner_id TEXT NOT NULL,
  client_id BIGINT NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  invoice_no TEXT NOT NULL,
  issue_date DATE NOT NULL,
  due_date DATE NOT NULL,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal DOUBLE PRECISION NOT NULL DEFAULT 0,
  tax_rate DOUBLE PRECISION NOT NULL DEFAULT 18,
  tax_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  discount DOUBLE PRECISION NOT NULL DEFAULT 0,
  total DOUBLE PRECISION NOT NULL DEFAULT 0,
  amount_paid DOUBLE PRECISION NOT NULL DEFAULT 0,
  balance DOUBLE PRECISION NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'viewed', 'partially_paid', 'paid', 'overdue', 'cancelled')),
  payment_link_url TEXT NOT NULL DEFAULT '',
  public_token TEXT NOT NULL UNIQUE,
  reminder_offsets JSONB NOT NULL DEFAULT '[-3, 0, 3, 7, 15, 30]'::jsonb,
  notes TEXT NOT NULL DEFAULT '',
  viewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_owner ON public.invoices(owner_id);
CREATE INDEX IF NOT EXISTS idx_invoices_token ON public.invoices(public_token);

-- 4. Payments
CREATE TABLE IF NOT EXISTS public.payments (
  id BIGSERIAL PRIMARY KEY,
  owner_id TEXT NOT NULL,
  invoice_id BIGINT NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  amount DOUBLE PRECISION NOT NULL CHECK (amount > 0),
  method TEXT NOT NULL DEFAULT 'UPI' CHECK (method IN ('UPI', 'cash', 'bank', 'Razorpay', 'cheque')),
  reference_no TEXT NOT NULL DEFAULT '',
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  note TEXT NOT NULL DEFAULT ''
);

-- 5. Scheduled Reminders
CREATE TABLE IF NOT EXISTS public.reminders (
  id BIGSERIAL PRIMARY KEY,
  owner_id TEXT NOT NULL,
  invoice_id BIGINT NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  offset_days INTEGER NOT NULL DEFAULT 0,
  channel TEXT NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp', 'email', 'sms')),
  template_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'sent', 'skipped', 'cancelled')),
  sent_at TIMESTAMPTZ
);

-- 6. Message Logs (WhatsApp / Email / SMS delivery & read tracking)
CREATE TABLE IF NOT EXISTS public.message_logs (
  id BIGSERIAL PRIMARY KEY,
  owner_id TEXT NOT NULL,
  invoice_id BIGINT REFERENCES public.invoices(id) ON DELETE SET NULL,
  client_id BIGINT NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'email', 'sms')),
  template_key TEXT NOT NULL,
  message_body TEXT NOT NULL,
  provider_message_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'delivered', 'read', 'failed')),
  error TEXT NOT NULL DEFAULT '',
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ
);

-- 7. Owner Notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id BIGSERIAL PRIMARY KEY,
  owner_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  link TEXT NOT NULL DEFAULT '',
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. Bilingual Message Templates
CREATE TABLE IF NOT EXISTS public.templates (
  id BIGSERIAL PRIMARY KEY,
  owner_id TEXT NOT NULL,
  template_key TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'hi')),
  label TEXT NOT NULL,
  body TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Row Level Security (RLS)
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

-- Owner Isolation Policies (for Supabase auth.uid()::text)
CREATE POLICY "Owner access settings" ON public.settings FOR ALL USING (owner_id = auth.uid()::text) WITH CHECK (owner_id = auth.uid()::text);
CREATE POLICY "Owner access clients" ON public.clients FOR ALL USING (owner_id = auth.uid()::text) WITH CHECK (owner_id = auth.uid()::text);
CREATE POLICY "Owner access invoices" ON public.invoices FOR ALL USING (owner_id = auth.uid()::text) WITH CHECK (owner_id = auth.uid()::text);
CREATE POLICY "Owner access payments" ON public.payments FOR ALL USING (owner_id = auth.uid()::text) WITH CHECK (owner_id = auth.uid()::text);
CREATE POLICY "Owner access reminders" ON public.reminders FOR ALL USING (owner_id = auth.uid()::text) WITH CHECK (owner_id = auth.uid()::text);
CREATE POLICY "Owner access message_logs" ON public.message_logs FOR ALL USING (owner_id = auth.uid()::text) WITH CHECK (owner_id = auth.uid()::text);
CREATE POLICY "Owner access notifications" ON public.notifications FOR ALL USING (owner_id = auth.uid()::text) WITH CHECK (owner_id = auth.uid()::text);
CREATE POLICY "Owner access templates" ON public.templates FOR ALL USING (owner_id = auth.uid()::text) WITH CHECK (owner_id = auth.uid()::text);

-- Sample Seed Data (replace 'demo-owner-uid' with your owner UID when seeding manually)
INSERT INTO public.clients (owner_id, name, business_name, phone, whatsapp_number, email, address, gstin, preferred_channel, preferred_language, tags)
VALUES
  ('demo-owner-uid', 'Rajesh Sharma', 'Sharma Electronics Pvt Ltd', '+919820112233', '+919820112233', 'rajesh@sharmaelectronics.in', 'Andheri West, Mumbai 400053', '27AABCS1429B1ZS', 'whatsapp', 'hi', '["Retainer", "Mumbai"]'::jsonb),
  ('demo-owner-uid', 'Priya Nair', 'Nair Design Studio', '+919845022334', '+919845022334', 'priya@nairdesign.co.in', 'Indiranagar, Bengaluru 560038', '29AADCN9812K1Z5', 'email', 'en', '["Design", "VIP"]'::jsonb),
  ('demo-owner-uid', 'Vikram Patel', 'Patel Agro Exports', '+919825033445', '+919825033445', 'accounts@patelagro.in', 'Navrangpura, Ahmedabad 380009', '24AABCP7765M1Z1', 'whatsapp', 'en', '["Wholesale"]'::jsonb),
  ('demo-owner-uid', 'Ananya Gupta', 'Gupta Wellness Clinic', '+919811044556', '+919811044556', 'ananya@guptawellness.in', 'Saket, New Delhi 110017', '', 'whatsapp', 'hi', '["Healthcare"]'::jsonb),
  ('demo-owner-uid', 'Karthik Subramanian', 'Kaveri Logistics', '+919840055667', '+919840055667', 'finance@kaverilogistics.in', 'T. Nagar, Chennai 600017', '33AAACK4512D1Z9', 'email', 'en', '["Logistics"]'::jsonb);

INSERT INTO public.invoices (owner_id, client_id, invoice_no, issue_date, due_date, items, subtotal, tax_rate, tax_amount, discount, total, amount_paid, balance, status, public_token)
SELECT
  'demo-owner-uid',
  c.id,
  v.invoice_no,
  v.issue_date::date,
  v.due_date::date,
  v.items::jsonb,
  v.subtotal,
  18,
  v.subtotal * 0.18,
  0,
  v.subtotal * 1.18,
  v.amount_paid,
  (v.subtotal * 1.18) - v.amount_paid,
  v.status,
  encode(gen_random_bytes(12), 'hex')
FROM public.clients c
JOIN (VALUES
  ('Rajesh Sharma', 'INV-2026-001', '2026-10-15', '2026-10-30', '[{"description":"E-commerce Website Redesign","qty":1,"rate":45000}]', 45000, 0, 'overdue'),
  ('Priya Nair', 'INV-2026-002', '2026-11-01', '2026-11-15', '[{"description":"Brand UI Kit & Component System","qty":1,"rate":30000}]', 30000, 35400, 'paid'),
  ('Vikram Patel', 'INV-2026-003', '2026-11-10', '2026-11-25', '[{"description":"GST Billing Automation Setup","qty":1,"rate":25000}]', 25000, 15000, 'partially_paid'),
  ('Ananya Gupta', 'INV-2026-004', '2026-11-18', '2026-11-27', '[{"description":"Clinic Booking Portal & WhatsApp Bot","qty":1,"rate":20000}]', 20000, 0, 'viewed'),
  ('Karthik Subramanian', 'INV-2026-005', '2026-11-20', '2026-12-05', '[{"description":"Fleet Dashboard Monthly Retainer","qty":1,"rate":18000}]', 18000, 0, 'sent')
) AS v(client_name, invoice_no, issue_date, due_date, items, subtotal, amount_paid, status)
ON c.name = v.client_name AND c.owner_id = 'demo-owner-uid';
