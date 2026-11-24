import React, { useMemo, useState } from 'react';
import {
  BellRing,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Plus,
  Search,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import {
  Client,
  Invoice,
  InvoiceItem,
  InvoiceStatus,
  MessageLog,
  OwnerSettings,
  Payment,
  Reminder,
} from '../types';
import {
  formatDateIN,
  formatDateTimeIN,
  formatINR,
  generateInvoicePdf,
  getTodayISTStr,
} from '../lib/format';
import { DeliveryTick } from './DeliveryTick';
import { StatusBadge } from './StatusBadge';

interface InvoicesViewProps {
  clients: Client[];
  invoices: Invoice[];
  payments: Payment[];
  reminders: Reminder[];
  messageLogs: MessageLog[];
  settings: OwnerSettings;
  selectedInvoiceId: number | null;
  onSelectInvoice: (id: number | null) => void;
  showCreateModal: boolean;
  initialClientId?: number | null;
  onCloseCreateModal: () => void;
  onOpenCreateModal: () => void;
  onCreateInvoice: (payload: {
    clientId: number;
    issueDate: string;
    dueDate: string;
    items: InvoiceItem[];
    taxRate: number;
    discount: number;
    reminderOffsets: number[];
    notes: string;
    sendImmediately: boolean;
  }) => Promise<void>;
  onDeleteInvoice: (id: number) => Promise<void>;
  onSendBill: (invoiceId: number, channel?: 'whatsapp' | 'email' | 'sms') => Promise<void>;
  onSendReminder: (
    invoiceId: number,
    templateKey: string,
    channel?: 'whatsapp' | 'email' | 'sms'
  ) => Promise<void>;
  onRecordPayment: (
    invoiceId: number,
    payload: { amount: number; method: string; referenceNo: string; note: string }
  ) => Promise<void>;
  onSimulateWebhook: (payload: {
    messageLogId?: number;
    invoiceId?: number;
    event: 'delivered' | 'read' | 'failed' | 'razorpay_paid';
  }) => Promise<void>;
}

export const InvoicesView: React.FC<InvoicesViewProps> = ({
  clients,
  invoices,
  payments,
  reminders,
  messageLogs,
  settings,
  selectedInvoiceId,
  onSelectInvoice,
  showCreateModal,
  initialClientId,
  onCloseCreateModal,
  onOpenCreateModal,
  onCreateInvoice,
  onDeleteInvoice,
  onSendBill,
  onSendReminder,
  onRecordPayment,
  onSimulateWebhook,
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | InvoiceStatus>('all');
  const [copiedToken, setCopiedToken] = useState(false);

  // Create form state
  const todayStr = getTodayISTStr();
  const in14Days = new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10);
  const [newClientId, setNewClientId] = useState<number>(initialClientId || clients[0]?.id || 0);

  React.useEffect(() => {
    if (showCreateModal) {
      setNewClientId(initialClientId || clients[0]?.id || 0);
    }
  }, [showCreateModal, initialClientId, clients]);
  const [issueDate, setIssueDate] = useState(todayStr);
  const [dueDate, setDueDate] = useState(in14Days);
  const [items, setItems] = useState<InvoiceItem[]>([
    { description: 'Consulting / Project Deliverable', qty: 1, rate: 15000 },
  ]);
  const [taxRate, setTaxRate] = useState(18);
  const [discount, setDiscount] = useState(0);
  const [offsetsText, setOffsetsText] = useState(
    (settings?.defaultReminderOffsets || [-3, 0, 3, 7, 15, 30]).join(', ')
  );
  const [notes, setNotes] = useState('');
  const [creating, setCreating] = useState(false);

  // Payment & Reminder inline actions
  const [showPayBox, setShowPayBox] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('UPI');
  const [payRef, setPayRef] = useState('');
  const [payNote, setPayNote] = useState('');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [remindTemplate, setRemindTemplate] = useState('reminder_friendly');

  const clientMap = useMemo(() => {
    const m = new Map<number, Client>();
    clients.forEach((c) => m.set(c.id, c));
    return m;
  }, [clients]);

  const filteredInvoices = useMemo(() => {
    const q = search.trim().toLowerCase();
    return invoices.filter((inv) => {
      if (statusFilter !== 'all' && inv.status !== statusFilter) return false;
      if (!q) return true;
      const c = clientMap.get(inv.clientId);
      return (
        inv.invoiceNo.toLowerCase().includes(q) ||
        (c?.name || '').toLowerCase().includes(q) ||
        (c?.businessName || '').toLowerCase().includes(q)
      );
    });
  }, [invoices, statusFilter, search, clientMap]);

  const activeInvoice = useMemo(
    () => invoices.find((i) => i.id === selectedInvoiceId) || null,
    [invoices, selectedInvoiceId]
  );

  const activeClient = activeInvoice ? clientMap.get(activeInvoice.clientId) || null : null;
  const activePayments = useMemo(
    () => (activeInvoice ? payments.filter((p) => p.invoiceId === activeInvoice.id) : []),
    [activeInvoice, payments]
  );
  const activeReminders = useMemo(
    () => (activeInvoice ? reminders.filter((r) => r.invoiceId === activeInvoice.id) : []),
    [activeInvoice, reminders]
  );
  const activeLogs = useMemo(
    () => (activeInvoice ? messageLogs.filter((l) => l.invoiceId === activeInvoice.id) : []),
    [activeInvoice, messageLogs]
  );

  const calcSubtotal = items.reduce((s, it) => s + it.qty * it.rate, 0);
  const calcTaxable = Math.max(0, calcSubtotal - discount);
  const calcTax = (calcTaxable * taxRate) / 100;
  const calcTotal = calcTaxable + calcTax;

  const handleCreateSubmit = async (sendImmediately: boolean) => {
    const targetClientId = newClientId || initialClientId || clients[0]?.id;
    if (!targetClientId) return;
    setCreating(true);
    try {
      const parsedOffsets = offsetsText
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n));
      await onCreateInvoice({
        clientId: targetClientId,
        issueDate,
        dueDate,
        items,
        taxRate,
        discount,
        reminderOffsets: parsedOffsets.length > 0 ? parsedOffsets : [-3, 0, 3, 7, 15, 30],
        notes,
        sendImmediately,
      });
      onCloseCreateModal();
    } finally {
      setCreating(false);
    }
  };

  const handleCopyPublicLink = (token: string) => {
    const url = `${window.location.origin}/i/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  };

  const handleRecordPaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeInvoice) return;
    setBusyAction('pay');
    try {
      await onRecordPayment(activeInvoice.id, {
        amount: Number(payAmount || activeInvoice.balance),
        method: payMethod,
        referenceNo: payRef,
        note: payNote,
      });
      setShowPayBox(false);
      setPayAmount('');
      setPayRef('');
      setPayNote('');
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Invoices & Bills</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Create GST bills, generate UPI QR PDFs, and track automated payment reminders.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setNewClientId(initialClientId || clients[0]?.id || 0);
            onOpenCreateModal();
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 transition-colors min-h-[40px] whitespace-nowrap self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Create Invoice
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search invoice # or client..."
            className="w-full rounded-lg border border-slate-800 bg-[#121826] pl-9 pr-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500/60 min-h-[42px]"
          />
        </div>
        <div className="flex items-center gap-1 p-1 rounded-lg bg-[#121826] border border-slate-800 overflow-x-auto">
          {(['all', 'overdue', 'sent', 'viewed', 'partially_paid', 'paid', 'draft'] as const).map(
            (st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md capitalize whitespace-nowrap transition-colors ${
                  statusFilter === st
                    ? 'bg-amber-500 text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {st === 'sent' ? 'Pending' : st.replace('_', ' ')}
              </button>
            )
          )}
        </div>
      </div>

      {/* List + Detail Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div
          className={`${
            activeInvoice ? 'hidden lg:block lg:col-span-5' : 'lg:col-span-12'
          } rounded-xl border border-slate-800/80 bg-[#121826] divide-y divide-slate-800/70`}
        >
          {filteredInvoices.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-400">
              No invoices found matching this filter.
            </div>
          ) : (
            filteredInvoices.map((inv) => {
              const client = clientMap.get(inv.clientId);
              const isSelected = activeInvoice?.id === inv.id;
              return (
                <div
                  key={inv.id}
                  onClick={() => {
                    onSelectInvoice(inv.id);
                    setShowPayBox(false);
                    setPayAmount(String(inv.balance));
                  }}
                  className={`p-4 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                    isSelected ? 'bg-amber-500/10' : 'hover:bg-slate-800/40'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-white font-mono-num">
                        {inv.invoiceNo}
                      </span>
                      <StatusBadge status={inv.status} />
                    </div>
                    <p className="text-xs text-slate-300 mt-1 truncate">
                      {client?.name || 'Client'}
                      {client?.businessName ? ` · ${client.businessName}` : ''}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5 font-mono-num">
                      Issued {formatDateIN(inv.issueDate)} · Due {formatDateIN(inv.dueDate)}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-white font-mono-num">
                      {formatINR(inv.total)}
                    </p>
                    <p
                      className={`text-xs font-mono-num mt-0.5 ${
                        inv.balance > 0 ? 'text-amber-400' : 'text-emerald-400'
                      }`}
                    >
                      {inv.balance > 0 ? `Bal: ${formatINR(inv.balance)}` : 'Paid'}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Invoice Detail Pane */}
        {activeInvoice && (
          <div className="lg:col-span-7 rounded-xl border border-slate-800/80 bg-[#121826] p-5 space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-slate-800/80">
              <div>
                <button
                  type="button"
                  onClick={() => onSelectInvoice(null)}
                  className="lg:hidden text-xs text-amber-400 mb-2 inline-flex items-center gap-1"
                >
                  ← Back to Invoices
                </button>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h2 className="text-xl font-bold text-white font-mono-num">
                    {activeInvoice.invoiceNo}
                  </h2>
                  <StatusBadge status={activeInvoice.status} />
                </div>
                <p className="text-sm text-slate-300 mt-1">
                  {activeClient?.name}
                  {activeClient?.businessName ? ` (${activeClient.businessName})` : ''}
                </p>
                <p className="text-xs text-slate-400 mt-0.5 font-mono-num">
                  Issued {formatDateIN(activeInvoice.issueDate)} · Due{' '}
                  {formatDateIN(activeInvoice.dueDate)}
                  {activeInvoice.viewedAt
                    ? ` · Viewed ${formatDateTimeIN(activeInvoice.viewedAt)}`
                    : ''}
                </p>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    generateInvoicePdf({
                      invoice: activeInvoice,
                      client: activeClient,
                      seller: settings,
                      publicLink: `${window.location.origin}/i/${activeInvoice.publicToken}`,
                    })
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700 min-h-[38px]"
                >
                  <Download className="w-3.5 h-3.5" />
                  PDF
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteInvoice(activeInvoice.id)}
                  title="Delete Invoice"
                  className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center rounded-lg border border-slate-700 text-rose-400 hover:bg-rose-500/10"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onSelectInvoice(null)}
                  className="hidden lg:inline-flex min-h-[38px] min-w-[38px] items-center justify-center rounded-lg text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Action Toolbar */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busyAction === 'send'}
                onClick={async () => {
                  setBusyAction('send');
                  try {
                    await onSendBill(activeInvoice.id);
                  } finally {
                    setBusyAction(null);
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3.5 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 min-h-[38px]"
              >
                <Send className="w-3.5 h-3.5" />
                {busyAction === 'send' ? 'Sending…' : 'Send Bill'}
              </button>

              {activeInvoice.balance > 0 && (
                <>
                  <div className="inline-flex items-center rounded-lg border border-slate-700 bg-[#0B0F17] overflow-hidden">
                    <select
                      value={remindTemplate}
                      onChange={(e) => setRemindTemplate(e.target.value)}
                      className="bg-transparent px-2.5 py-2 text-xs text-slate-300 focus:outline-none"
                    >
                      <option value="reminder_friendly">Friendly</option>
                      <option value="reminder_due_today">Due Today</option>
                      <option value="reminder_firm">Firm Overdue</option>
                      <option value="reminder_final">Final Notice</option>
                    </select>
                    <button
                      type="button"
                      disabled={busyAction === 'remind'}
                      onClick={async () => {
                        setBusyAction('remind');
                        try {
                          await onSendReminder(activeInvoice.id, remindTemplate);
                        } finally {
                          setBusyAction(null);
                        }
                      }}
                      className="inline-flex items-center gap-1.5 bg-slate-800 px-3 py-2 text-xs font-medium text-amber-300 hover:bg-slate-700 min-h-[38px] border-l border-slate-700"
                    >
                      <BellRing className="w-3.5 h-3.5" />
                      {busyAction === 'remind' ? 'Sending…' : 'Send Reminder Now'}
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setPayAmount(String(activeInvoice.balance));
                      setShowPayBox(!showPayBox);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-3.5 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 min-h-[38px]"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Mark Paid
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => handleCopyPublicLink(activeInvoice.publicToken)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 min-h-[38px]"
              >
                <Copy className="w-3.5 h-3.5" />
                {copiedToken ? 'Copied Link!' : 'Copy Pay Link'}
              </button>

              <a
                href={`/i/${activeInvoice.publicToken}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-sky-400 hover:bg-slate-800 min-h-[38px]"
              >
                Open Client View
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            {/* Inline Mark as Paid Form */}
            {showPayBox && activeInvoice.balance > 0 && (
              <form
                onSubmit={handleRecordPaySubmit}
                className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3"
              >
                <h4 className="text-xs font-semibold text-emerald-300">
                  Record Manual / UPI / Razorpay Payment
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Amount (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 text-sm text-white font-mono-num"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Method</label>
                    <select
                      value={payMethod}
                      onChange={(e) => setPayMethod(e.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 text-sm text-white"
                    >
                      <option value="UPI">UPI</option>
                      <option value="Razorpay">Razorpay</option>
                      <option value="bank">Bank Transfer (NEFT/IMPS)</option>
                      <option value="cash">Cash</option>
                      <option value="cheque">Cheque</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Reference No.</label>
                    <input
                      value={payRef}
                      onChange={(e) => setPayRef(e.target.value)}
                      placeholder="UTR / Txn ID"
                      className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 text-sm text-white font-mono-num"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <input
                    value={payNote}
                    onChange={(e) => setPayNote(e.target.value)}
                    placeholder="Optional note (e.g. Received on GPay)"
                    className="flex-1 rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 text-xs text-white"
                  />
                  <button
                    type="submit"
                    disabled={busyAction === 'pay'}
                    className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
                  >
                    {busyAction === 'pay' ? 'Saving…' : 'Save Payment'}
                  </button>
                </div>
              </form>
            )}

            {/* Line Items Breakdown */}
            <div className="rounded-lg border border-slate-800 bg-[#0E1420] overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-slate-800/50 text-slate-400">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Item</th>
                    <th className="text-right px-3 py-2 font-medium">Qty</th>
                    <th className="text-right px-3 py-2 font-medium">Rate</th>
                    <th className="text-right px-3 py-2 font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {activeInvoice.items.map((it, idx) => (
                    <tr key={idx}>
                      <td className="px-3 py-2.5 text-slate-200">{it.description}</td>
                      <td className="px-3 py-2.5 text-right font-mono-num text-slate-300">
                        {it.qty}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono-num text-slate-300">
                        {formatINR(it.rate)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono-num text-white font-medium">
                        {formatINR(it.qty * it.rate)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="border-t border-slate-800 p-3 space-y-1 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Subtotal</span>
                  <span className="font-mono-num">{formatINR(activeInvoice.subtotal)}</span>
                </div>
                {activeInvoice.discount > 0 && (
                  <div className="flex justify-between text-slate-400">
                    <span>Discount</span>
                    <span className="font-mono-num">-{formatINR(activeInvoice.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-400">
                  <span>GST ({activeInvoice.taxRate}%)</span>
                  <span className="font-mono-num">{formatINR(activeInvoice.taxAmount)}</span>
                </div>
                <div className="flex justify-between text-sm font-bold text-white pt-1 border-t border-slate-800/70">
                  <span>Total</span>
                  <span className="font-mono-num">{formatINR(activeInvoice.total)}</span>
                </div>
                <div className="flex justify-between text-emerald-400">
                  <span>Amount Paid</span>
                  <span className="font-mono-num">{formatINR(activeInvoice.amountPaid)}</span>
                </div>
                <div className="flex justify-between text-sm font-bold text-amber-400">
                  <span>Balance Due</span>
                  <span className="font-mono-num">{formatINR(activeInvoice.balance)}</span>
                </div>
              </div>
            </div>

            {/* Payments Recorded */}
            {activePayments.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-slate-300 mb-2">Payments Received</h3>
                <div className="space-y-1.5">
                  {activePayments.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between rounded-lg border border-slate-800 bg-[#0E1420] px-3 py-2 text-xs"
                    >
                      <span className="text-slate-300">
                        {p.method} {p.referenceNo ? `· ${p.referenceNo}` : ''} ·{' '}
                        {formatDateTimeIN(p.paidAt)}
                      </span>
                      <span className="font-semibold text-emerald-400 font-mono-num">
                        {formatINR(p.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Scheduled Auto-Reminders */}
            <div>
              <h3 className="text-xs font-semibold text-slate-300 mb-2">
                Automated Reminder Schedule ({activeReminders.length})
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {activeReminders.map((r) => (
                  <div
                    key={r.id}
                    className="rounded-lg border border-slate-800 bg-[#0E1420] px-2.5 py-2 text-[11px]"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono-num text-slate-200">
                        {r.offsetDays === 0
                          ? 'On Due Date'
                          : r.offsetDays < 0
                            ? `${Math.abs(r.offsetDays)}d before`
                            : `+${r.offsetDays}d overdue`}
                      </span>
                      <span
                        className={`capitalize font-medium ${
                          r.status === 'sent'
                            ? 'text-emerald-400'
                            : r.status === 'cancelled'
                              ? 'text-slate-500'
                              : r.status === 'skipped'
                                ? 'text-rose-400'
                                : 'text-amber-400'
                        }`}
                      >
                        {r.status}
                      </span>
                    </div>
                    <p className="text-slate-500 mt-0.5 truncate">
                      {r.templateKey.replace('reminder_', '')} · {formatDateIN(r.scheduledAt)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Delivery Logs & Interactive Webhook Test */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-slate-300">
                  Delivery & Read Tracking ({activeLogs.length})
                </h3>
                {activeInvoice.balance > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      onSimulateWebhook({ invoiceId: activeInvoice.id, event: 'razorpay_paid' })
                    }
                    className="text-[11px] text-sky-400 hover:underline"
                  >
                    Simulate Razorpay Paid Webhook
                  </button>
                )}
              </div>
              {activeLogs.length === 0 ? (
                <p className="text-xs text-slate-500">
                  Click "Send Bill" to dispatch this invoice and track delivery receipts.
                </p>
              ) : (
                <div className="space-y-2">
                  {activeLogs.map((log) => (
                    <div
                      key={log.id}
                      className="rounded-lg border border-slate-800 bg-[#0E1420] p-3 text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-300 font-medium">
                          {log.channel.toUpperCase()} · {log.templateKey.replaceAll('_', ' ')}
                        </span>
                        <DeliveryTick status={log.status} />
                      </div>
                      <p className="text-slate-300">{log.messageBody}</p>
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <span className="text-[11px] text-slate-500 font-mono-num">
                          Sent {formatDateTimeIN(log.sentAt)}
                        </span>
                        <div className="flex items-center gap-2">
                          {log.status === 'sent' && (
                            <button
                              type="button"
                              onClick={() =>
                                onSimulateWebhook({ messageLogId: log.id, event: 'delivered' })
                              }
                              className="text-[11px] text-slate-300 hover:text-white underline"
                            >
                              Mark Delivered ✓✓
                            </button>
                          )}
                          {(log.status === 'sent' || log.status === 'delivered') && (
                            <button
                              type="button"
                              onClick={() =>
                                onSimulateWebhook({ messageLogId: log.id, event: 'read' })
                              }
                              className="text-[11px] text-sky-400 hover:text-sky-300 underline"
                            >
                              Mark Read ✓✓
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Create Invoice Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl border border-slate-800 bg-[#121826] p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Create New Bill / Invoice</h3>
              <button
                type="button"
                onClick={onCloseCreateModal}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-1">
                <label className="block text-xs text-slate-400 mb-1">Client *</label>
                <select
                  value={newClientId || clients[0]?.id || ''}
                  onChange={(e) => setNewClientId(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 text-sm text-white"
                >
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.businessName ? `(${c.businessName})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Issue Date</label>
                <input
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 text-sm text-white font-mono-num"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Due Date</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 text-sm text-white font-mono-num"
                />
              </div>
            </div>

            {/* Line Items */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-300">Line Items</label>
                <button
                  type="button"
                  onClick={() => setItems([...items, { description: '', qty: 1, rate: 0 }])}
                  className="text-xs text-amber-400 hover:underline"
                >
                  + Add Line Item
                </button>
              </div>
              {items.map((it, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <input
                    placeholder="Service / Product description"
                    value={it.description}
                    onChange={(e) => {
                      const next = [...items];
                      next[idx].description = e.target.value;
                      setItems(next);
                    }}
                    className="col-span-6 rounded-lg border border-slate-700 bg-[#0B0F17] px-2.5 py-2 text-xs text-white"
                  />
                  <input
                    type="number"
                    min="1"
                    value={it.qty}
                    onChange={(e) => {
                      const next = [...items];
                      next[idx].qty = Number(e.target.value);
                      setItems(next);
                    }}
                    className="col-span-2 rounded-lg border border-slate-700 bg-[#0B0F17] px-2.5 py-2 text-xs text-white font-mono-num"
                  />
                  <input
                    type="number"
                    min="0"
                    value={it.rate}
                    onChange={(e) => {
                      const next = [...items];
                      next[idx].rate = Number(e.target.value);
                      setItems(next);
                    }}
                    className="col-span-3 rounded-lg border border-slate-700 bg-[#0B0F17] px-2.5 py-2 text-xs text-white font-mono-num"
                  />
                  <button
                    type="button"
                    disabled={items.length === 1}
                    onClick={() => setItems(items.filter((_, i) => i !== idx))}
                    className="col-span-1 text-slate-500 hover:text-rose-400 disabled:opacity-30 flex justify-center"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">GST (%)</label>
                <select
                  value={taxRate}
                  onChange={(e) => setTaxRate(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 text-sm text-white font-mono-num"
                >
                  <option value={0}>0% (Exempt)</option>
                  <option value={5}>5% GST</option>
                  <option value={12}>12% GST</option>
                  <option value={18}>18% GST</option>
                  <option value={28}>28% GST</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Discount (₹)</label>
                <input
                  type="number"
                  min="0"
                  value={discount}
                  onChange={(e) => setDiscount(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 text-sm text-white font-mono-num"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Reminder Offsets (days)
                </label>
                <input
                  value={offsetsText}
                  onChange={(e) => setOffsetsText(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 text-xs text-white font-mono-num"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Notes</label>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Payment terms or bank notes..."
                className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 text-sm text-white"
              />
            </div>

            <div className="rounded-lg border border-slate-800 bg-[#0B0F17] p-3 flex items-center justify-between">
              <span className="text-xs text-slate-400">
                Subtotal {formatINR(calcSubtotal)} + GST {formatINR(calcTax)}
              </span>
              <span className="text-base font-bold text-amber-400 font-mono-num">
                Total: {formatINR(calcTotal)}
              </span>
            </div>

            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onCloseCreateModal}
                className="rounded-lg border border-slate-700 px-4 py-2 text-xs text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={creating || clients.length === 0}
                onClick={() => handleCreateSubmit(false)}
                className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-medium text-white hover:bg-slate-700"
              >
                Save as Draft
              </button>
              <button
                type="button"
                disabled={creating || clients.length === 0}
                onClick={() => handleCreateSubmit(true)}
                className="rounded-lg bg-amber-500 px-5 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400"
              >
                {creating ? 'Creating…' : 'Create & Send Bill'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
