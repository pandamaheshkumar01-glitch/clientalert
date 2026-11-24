# ClientAlert — Billing, Payment Reminder & Tracking Web App

Mobile-first billing, automated payment reminders, and real-time delivery tracking built for Indian freelancers and small business owners.

## Features Implemented
- **Dashboard**: Indian ₹ (`en-IN`) KPI cards (Total Billed, Total Received, Total Pending, Overdue Amount, Clients Unpaid), 6-month Billed vs Received chart, and 1-tap action lists (`Due This Week`, `Overdue`, `Recently Paid`).
- **Clients**: Full CRUD, search & status/tag filters, Bulk CSV Import, Client Detail drawer with invoice ledger, payment history, WhatsApp/Email/SMS delivery ticks (`✓` sent, `✓✓` delivered, blue `✓✓` read, `❌` failed), and `STOP` opt-out status.
- **Invoices & PDF Generation**: GST & discount calculator, auto-numbered invoices (`INV-2026-XXX`), instant downloadable A4 PDF with embedded UPI QR code (`jsPDF` + `qrcode`), Send Bill, Send Reminder Now, and Mark as Paid (full or partial).
- **Public Invoice Portal (`/i/:publicToken`)**: Unauthenticated client bill view with itemized GST breakdown, scannable UPI QR code, UPI app deep-link, Razorpay checkout flow, and automatic `viewed` status tracking + owner notification.
- **Automated Reminders & Quiet Hours**: Escalating reminder schedule (`-3, 0, +3, +7, +15, +30` days), 9 PM – 9 AM IST quiet hours enforcement, automatic stop on full payment, and editable bilingual Hindi/English templates.
- **Reports**: Client-wise outstanding report and Ageing report (`0–30`, `31–60`, `60+` days) with CSV, Excel (`.xls`), and PDF export.
- **PWA**: Installable on Android, iOS, and Desktop with offline connectivity indicator and service worker caching.

---

## Folder Structure
- `server.ts` — Express API server, webhook signature verification, hourly scheduler, and Vite integration
- `src/db/schema.ts` — PostgreSQL Drizzle ORM schema (`users`, `settings`, `clients`, `invoices`, `payments`, `reminders`, `message_logs`, `notifications`, `templates`)
- `src/server/` — Bilingual template interpolation, WhatsApp/Resend/SMS senders with rate limiting, and IST quiet-hours reminder scheduler
- `src/components/` — Dashboard, Clients, Invoices, PublicInvoicePage, Alerts, Reports, Settings, PWA install prompt
- `supabase/migrations/001_clientalert_schema.sql` — Standalone SQL schema + RLS policies + seed data

---

## Setup Guide (External Providers & Webhooks)

### 1. Database & Authentication
- The active runtime uses **Cloud SQL (PostgreSQL)** via Drizzle ORM and **Firebase Authentication (Google Sign-In)** with strict server-side token verification and `owner_id` isolation.
- If deploying separately on Supabase, apply `supabase/migrations/001_clientalert_schema.sql` in the Supabase SQL Editor.

### 2. Resend (Email + Open/Delivery Webhooks)
1. Create an API key in [Resend](https://resend.com) and verify your sending domain.
2. Add `RESEND_API_KEY` and `RESEND_FROM_EMAIL` to your environment secrets.
3. Configure Resend Webhook URL:
   - Endpoint: `https://<YOUR_APP_URL>/api/webhooks/resend`
   - Events: `email.sent`, `email.delivered`, `email.opened`, `email.bounced`
   - Copy the signing secret into `RESEND_WEBHOOK_SECRET`.

### 3. Meta WhatsApp Cloud API
1. Create a Meta Business App with the **WhatsApp** product enabled.
2. Submit and approve your utility templates (`bill_sent`, `reminder_friendly`, `reminder_due_today`, `reminder_firm`, `reminder_final`, `payment_received`) in English and Hindi.
3. Set `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, and `WHATSAPP_APP_SECRET`.
4. Configure Meta Webhook URL:
   - Callback URL: `https://<YOUR_APP_URL>/api/webhooks/whatsapp`
   - Verify Token: value of `WHATSAPP_VERIFY_TOKEN`
   - Subscribe to `messages` field (receives delivery/read status updates and client `"STOP"` opt-out replies).

### 4. Razorpay Payment Links (INR)
1. Generate API keys in the Razorpay Dashboard (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`).
2. Add Webhook in Razorpay Settings:
   - URL: `https://<YOUR_APP_URL>/api/webhooks/razorpay`
   - Events: `payment_link.paid`, `payment.captured`
   - Set `RAZORPAY_WEBHOOK_SECRET`.

### 5. SMS in India (Optional — DLT Compliance)
1. Register your Sender ID and templates on a DLT portal (Jio/Airtel/Vodafone).
2. Configure `MSG91_AUTH_KEY`, `MSG91_SENDER_ID`, and `DLT_TEMPLATE_ID` (or `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`).

### 6. Hourly Scheduler / Cron
- Set `CRON_SECRET` in environment secrets.
- Configure an hourly cron job (Cloud Scheduler, Vercel Cron, or GitHub Actions) to call:
  ```bash
  curl -X POST https://<YOUR_APP_URL>/api/cron/run-reminders \
    -H "Authorization: Bearer $CRON_SECRET"
  ```

---

## End-to-End Test Checklist
1. **Send Bill**: Open any draft/sent invoice → click **Send Bill** → verify a `sent` message (`✓`) appears in the timeline.
2. **Delivered & Read Ticks**: Trigger delivery/read via Meta webhook (or use the built-in **Simulate Webhook** controls in Invoice Detail) → verify ticks update to `✓✓` (Delivered) and blue `✓✓` (Read).
3. **Client Opens Public Link**: Copy/open the `/i/:publicToken` link in an incognito/new tab → verify invoice status updates to **Viewed** and an owner notification appears in **Alerts**.
4. **Client Pays**: Click **Pay Now** on the public invoice page (or record via Razorpay webhook) → verify payment is logged, invoice status becomes **Paid**, client receives the thank-you confirmation, and all remaining scheduled reminders are automatically **Cancelled**.
5. **Owner Notification & Quiet Hours**: Check **Alerts** for the real-time payment alert and test **Preview 9 AM Daily Summary**.
