import React, { useState } from 'react';
import { Check, Copy, Save } from 'lucide-react';
import { MessageTemplate, OwnerSettings } from '../types';
import { PWAInstallButton } from './PWAInstallButton';

interface SettingsViewProps {
  settings: OwnerSettings;
  templates: MessageTemplate[];
  onSaveSettings: (payload: Partial<OwnerSettings>) => Promise<void>;
  onSaveTemplate: (id: number, body: string) => Promise<void>;
}

const TEMPLATE_VARS = [
  '{client_name}',
  '{business_name}',
  '{invoice_no}',
  '{amount}',
  '{balance}',
  '{due_date}',
  '{days_overdue}',
  '{pay_link}',
  '{owner_name}',
];

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  templates,
  onSaveSettings,
  onSaveTemplate,
}) => {
  const [tab, setTab] = useState<'profile' | 'templates' | 'webhooks'>('profile');
  const [form, setForm] = useState({
    businessName: settings.businessName,
    ownerName: settings.ownerName,
    upiId: settings.upiId,
    bankName: settings.bankName,
    bankAccountNo: settings.bankAccountNo,
    bankIfsc: settings.bankIfsc,
    gstin: settings.gstin,
    defaultLanguage: settings.defaultLanguage,
    offsetsText: settings.defaultReminderOffsets.join(', '),
    quietHoursStart: settings.quietHoursStart,
    quietHoursEnd: settings.quietHoursEnd,
    signatureText: settings.signatureText,
    notifyEmail: settings.notifyEmail,
    notifyWhatsapp: settings.notifyWhatsapp,
  });
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  const [tplLang, setTplLang] = useState<'en' | 'hi'>('en');
  const [editingDrafts, setEditingDrafts] = useState<Record<number, string>>({});
  const [savingTplId, setSavingTplId] = useState<number | null>(null);
  const [copiedUrl, setCopiedUrl] = useState('');

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const parsedOffsets = form.offsetsText
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n));
      await onSaveSettings({
        businessName: form.businessName,
        ownerName: form.ownerName,
        upiId: form.upiId,
        bankName: form.bankName,
        bankAccountNo: form.bankAccountNo,
        bankIfsc: form.bankIfsc,
        gstin: form.gstin,
        defaultLanguage: form.defaultLanguage,
        defaultReminderOffsets: parsedOffsets.length ? parsedOffsets : [-3, 0, 3, 7, 15, 30],
        quietHoursStart: Number(form.quietHoursStart),
        quietHoursEnd: Number(form.quietHoursEnd),
        signatureText: form.signatureText,
        notifyEmail: form.notifyEmail,
        notifyWhatsapp: form.notifyWhatsapp,
      });
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  const filteredTemplates = templates.filter((t) => t.language === tplLang);

  const renderPreview = (raw: string) =>
    raw
      .replaceAll('{client_name}', 'Rajesh Sharma')
      .replaceAll('{business_name}', form.businessName || 'Aarav Studio')
      .replaceAll('{invoice_no}', 'INV-2026-001')
      .replaceAll('{amount}', '59,000')
      .replaceAll('{balance}', '59,000')
      .replaceAll('{due_date}', '30 Oct 2026')
      .replaceAll('{days_overdue}', '9')
      .replaceAll('{pay_link}', `${window.location.origin}/i/sample`)
      .replaceAll('{owner_name}', form.ownerName || 'Aarav');

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const webhooks = [
    { label: 'Meta WhatsApp Cloud API Webhook', url: `${origin}/api/webhooks/whatsapp` },
    { label: 'Resend Email Delivery/Open Webhook', url: `${origin}/api/webhooks/resend` },
    { label: 'Razorpay Payment Webhook', url: `${origin}/api/webhooks/razorpay` },
    { label: 'Hourly Reminder Scheduler Cron (POST)', url: `${origin}/api/cron/run-reminders` },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Settings & Templates</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Configure business UPI/bank details, quiet hours (IST), bilingual Hindi/English templates, and webhooks.
          </p>
        </div>
        <PWAInstallButton />
      </div>

      <div className="flex items-center gap-1 p-1 rounded-lg bg-[#121826] border border-slate-800 w-fit">
        {(
          [
            { id: 'profile', label: 'Business & Schedule' },
            { id: 'templates', label: 'Message Templates' },
            { id: 'webhooks', label: 'Webhooks & Cron' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              tab === t.id
                ? 'bg-amber-500 text-slate-950 font-semibold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'profile' && (
        <form
          onSubmit={handleSaveProfile}
          className="rounded-xl border border-slate-800 bg-[#121826] p-6 space-y-5 max-w-3xl"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Business Name
              </label>
              <input
                value={form.businessName}
                onChange={(e) => setForm({ ...form, businessName: e.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Owner Name</label>
              <input
                value={form.ownerName}
                onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                UPI ID (for QR Code)
              </label>
              <input
                value={form.upiId}
                onChange={(e) => setForm({ ...form, upiId: e.target.value })}
                placeholder="yourname@okicici"
                className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 text-sm text-white font-mono-num"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">GSTIN</label>
              <input
                value={form.gstin}
                onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })}
                className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 text-sm text-white font-mono-num"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Bank Name</label>
              <input
                value={form.bankName}
                onChange={(e) => setForm({ ...form, bankName: e.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Bank Account Number
              </label>
              <input
                value={form.bankAccountNo}
                onChange={(e) => setForm({ ...form, bankAccountNo: e.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 text-sm text-white font-mono-num"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Bank IFSC</label>
              <input
                value={form.bankIfsc}
                onChange={(e) => setForm({ ...form, bankIfsc: e.target.value.toUpperCase() })}
                className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 text-sm text-white font-mono-num"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Default Language
              </label>
              <select
                value={form.defaultLanguage}
                onChange={(e) =>
                  setForm({ ...form, defaultLanguage: e.target.value as 'en' | 'hi' })
                }
                className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 text-sm text-white"
              >
                <option value="en">English</option>
                <option value="hi">Hindi (हिन्दी)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-800">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Default Reminder Offsets (days)
              </label>
              <input
                value={form.offsetsText}
                onChange={(e) => setForm({ ...form, offsetsText: e.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 text-xs text-white font-mono-num"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Quiet Hours Start (IST Hour)
              </label>
              <input
                type="number"
                min="0"
                max="23"
                value={form.quietHoursStart}
                onChange={(e) => setForm({ ...form, quietHoursStart: Number(e.target.value) })}
                className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 text-sm text-white font-mono-num"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Quiet Hours End (IST Hour)
              </label>
              <input
                type="number"
                min="0"
                max="23"
                value={form.quietHoursEnd}
                onChange={(e) => setForm({ ...form, quietHoursEnd: Number(e.target.value) })}
                className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 text-sm text-white font-mono-num"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Invoice Footer Signature
            </label>
            <input
              value={form.signatureText}
              onChange={(e) => setForm({ ...form, signatureText: e.target.value })}
              className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 text-sm text-white"
            />
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={form.notifyWhatsapp}
                onChange={(e) => setForm({ ...form, notifyWhatsapp: e.target.checked })}
              />
              Send owner alerts via WhatsApp
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={form.notifyEmail}
                onChange={(e) => setForm({ ...form, notifyEmail: e.target.checked })}
              />
              Send owner alerts via Email
            </label>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-5 py-2.5 text-xs font-semibold text-slate-950 hover:bg-amber-400"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Saving…' : 'Save Settings'}
            </button>
            {savedNotice && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                <Check className="w-3.5 h-3.5" /> Settings updated
              </span>
            )}
          </div>
        </form>
      )}

      {tab === 'templates' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1 p-1 rounded-lg bg-[#121826] border border-slate-800">
              <button
                type="button"
                onClick={() => setTplLang('en')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md ${
                  tplLang === 'en' ? 'bg-amber-500 text-slate-950 font-semibold' : 'text-slate-400'
                }`}
              >
                English Templates
              </button>
              <button
                type="button"
                onClick={() => setTplLang('hi')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md ${
                  tplLang === 'hi' ? 'bg-amber-500 text-slate-950 font-semibold' : 'text-slate-400'
                }`}
              >
                Hindi (हिन्दी) Templates
              </button>
            </div>
            <p className="text-xs text-slate-400 font-mono-num">
              Variables: {TEMPLATE_VARS.join(' ')}
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filteredTemplates.map((tpl) => {
              const currentText = editingDrafts[tpl.id] ?? tpl.body;
              const isDirty = currentText !== tpl.body;
              return (
                <div
                  key={tpl.id}
                  className="rounded-xl border border-slate-800 bg-[#121826] p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-white">{tpl.label}</h3>
                    <span className="text-[11px] font-mono-num text-slate-500">
                      {tpl.templateKey}
                    </span>
                  </div>
                  <textarea
                    rows={3}
                    value={currentText}
                    onChange={(e) =>
                      setEditingDrafts({ ...editingDrafts, [tpl.id]: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] p-3 text-xs text-slate-200 leading-relaxed focus:border-amber-500 focus:outline-none"
                  />
                  <div className="rounded-lg border border-slate-800/80 bg-[#0E1420] p-2.5 text-xs text-slate-400">
                    <span className="text-slate-500">Preview: </span>
                    {renderPreview(currentText)}
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      disabled={!isDirty || savingTplId === tpl.id}
                      onClick={async () => {
                        setSavingTplId(tpl.id);
                        try {
                          await onSaveTemplate(tpl.id, currentText);
                        } finally {
                          setSavingTplId(null);
                        }
                      }}
                      className="rounded-lg bg-amber-500 px-3.5 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-40"
                    >
                      {savingTplId === tpl.id ? 'Saving…' : 'Save Template'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'webhooks' && (
        <div className="rounded-xl border border-slate-800 bg-[#121826] p-6 space-y-4 max-w-3xl">
          <h3 className="text-base font-semibold text-white">Webhook & Cron Endpoints</h3>
          <p className="text-xs text-slate-400">
            Configure these signed endpoints in Meta WhatsApp Cloud API, Resend, Razorpay, and your hourly cron runner.
          </p>
          <div className="space-y-3">
            {webhooks.map((w) => (
              <div
                key={w.url}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border border-slate-800 bg-[#0B0F17] p-3"
              >
                <div className="min-w-0">
                  <p className="text-xs font-medium text-white">{w.label}</p>
                  <p className="text-xs font-mono-num text-amber-400 truncate mt-0.5">{w.url}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(w.url);
                    setCopiedUrl(w.url);
                    setTimeout(() => setCopiedUrl(''), 1800);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 shrink-0"
                >
                  <Copy className="w-3.5 h-3.5" />
                  {copiedUrl === w.url ? 'Copied!' : 'Copy'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
