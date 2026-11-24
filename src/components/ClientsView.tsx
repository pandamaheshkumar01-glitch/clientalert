import React, { useMemo, useState } from 'react';
import {
  Ban,
  ChevronRight,
  Edit3,
  FilePlus2,
  Mail,
  MessageSquare,
  Phone,
  Plus,
  Search,
  Send,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { Client, Invoice, MessageLog, Payment } from '../types';
import { exportToCsv, formatDateIN, formatDateTimeIN, formatINR } from '../lib/format';
import { DeliveryTick } from './DeliveryTick';
import { StatusBadge } from './StatusBadge';

interface ClientsViewProps {
  clients: Client[];
  invoices: Invoice[];
  payments: Payment[];
  messageLogs: MessageLog[];
  selectedClientId: number | null;
  onSelectClient: (id: number | null) => void;
  onSaveClient: (payload: Partial<Client>, id?: number) => Promise<void>;
  onDeleteClient: (id: number) => Promise<void>;
  onBulkImport: (rows: Record<string, string>[]) => Promise<number>;
  onCreateInvoiceForClient: (clientId: number) => void;
  onOpenInvoice: (invoiceId: number) => void;
  onSendReminder: (invoiceId: number) => Promise<void>;
}

type ClientFilter = 'all' | 'unpaid' | 'overdue' | 'paid';

export const ClientsView: React.FC<ClientsViewProps> = ({
  clients,
  invoices,
  payments,
  messageLogs,
  selectedClientId,
  onSelectClient,
  onSaveClient,
  onDeleteClient,
  onBulkImport,
  onCreateInvoiceForClient,
  onOpenInvoice,
  onSendReminder,
}) => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ClientFilter>('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState(false);

  const [formState, setFormState] = useState({
    name: '',
    businessName: '',
    phone: '+91',
    whatsappNumber: '+91',
    email: '',
    address: '',
    gstin: '',
    preferredChannel: 'whatsapp' as 'whatsapp' | 'email' | 'sms',
    preferredLanguage: 'en' as 'en' | 'hi',
    notes: '',
    tags: '',
    optedOut: false,
  });

  const allTags = useMemo(() => {
    const set = new Set<string>();
    clients.forEach((c) => c.tags.forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [clients]);

  const clientStats = useMemo(() => {
    const map = new Map<
      number,
      { billed: number; pending: number; overdue: number; unpaidCount: number }
    >();
    clients.forEach((c) => map.set(c.id, { billed: 0, pending: 0, overdue: 0, unpaidCount: 0 }));
    invoices.forEach((inv) => {
      if (inv.status === 'cancelled') return;
      const st = map.get(inv.clientId);
      if (!st) return;
      st.billed += inv.total;
      st.pending += inv.balance;
      if (inv.balance > 0) st.unpaidCount += 1;
      if (inv.status === 'overdue') st.overdue += inv.balance;
    });
    return map;
  }, [clients, invoices]);

  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clients.filter((c) => {
      const st = clientStats.get(c.id) || { billed: 0, pending: 0, overdue: 0, unpaidCount: 0 };
      if (filter === 'unpaid' && st.pending <= 0) return false;
      if (filter === 'overdue' && st.overdue <= 0) return false;
      if (filter === 'paid' && (st.pending > 0 || st.billed === 0)) return false;
      if (tagFilter !== 'all' && !c.tags.includes(tagFilter)) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.businessName.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q)
      );
    });
  }, [clients, clientStats, filter, tagFilter, search]);

  const activeClient = useMemo(
    () => clients.find((c) => c.id === selectedClientId) || null,
    [clients, selectedClientId]
  );

  const activeClientInvoices = useMemo(
    () => (activeClient ? invoices.filter((i) => i.clientId === activeClient.id) : []),
    [activeClient, invoices]
  );

  const activeClientPayments = useMemo(() => {
    const invIds = new Set(activeClientInvoices.map((i) => i.id));
    return payments.filter((p) => invIds.has(p.invoiceId));
  }, [activeClientInvoices, payments]);

  const activeClientLogs = useMemo(
    () => (activeClient ? messageLogs.filter((l) => l.clientId === activeClient.id) : []),
    [activeClient, messageLogs]
  );

  const openAdd = () => {
    setEditingClient(null);
    setFormState({
      name: '',
      businessName: '',
      phone: '+91',
      whatsappNumber: '+91',
      email: '',
      address: '',
      gstin: '',
      preferredChannel: 'whatsapp',
      preferredLanguage: 'en',
      notes: '',
      tags: '',
      optedOut: false,
    });
    setShowForm(true);
  };

  const openEdit = (c: Client) => {
    setEditingClient(c);
    setFormState({
      name: c.name,
      businessName: c.businessName,
      phone: c.phone,
      whatsappNumber: c.whatsappNumber || c.phone,
      email: c.email,
      address: c.address,
      gstin: c.gstin,
      preferredChannel: c.preferredChannel,
      preferredLanguage: c.preferredLanguage,
      notes: c.notes,
      tags: c.tags.join(', '),
      optedOut: c.optedOut,
    });
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSaveClient(
        {
          name: formState.name,
          businessName: formState.businessName,
          phone: formState.phone,
          whatsappNumber: formState.whatsappNumber || formState.phone,
          email: formState.email,
          address: formState.address,
          gstin: formState.gstin,
          preferredChannel: formState.preferredChannel,
          preferredLanguage: formState.preferredLanguage,
          notes: formState.notes,
          tags: formState.tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
          optedOut: formState.optedOut,
        },
        editingClient?.id
      );
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  };

  const handleCsvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCsvText(String(reader.result || ''));
    };
    reader.readAsText(file);
  };

  const handleImportSubmit = async () => {
    const lines = csvText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 2) return;
    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const rows = lines.slice(1).map((line) => {
      const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => {
        if (h === 'name') obj.name = cols[i] || '';
        if (h === 'business' || h === 'business_name' || h === 'businessname')
          obj.businessName = cols[i] || '';
        if (h === 'phone' || h === 'mobile') obj.phone = cols[i] || '';
        if (h === 'whatsapp' || h === 'whatsapp_number') obj.whatsappNumber = cols[i] || '';
        if (h === 'email') obj.email = cols[i] || '';
        if (h === 'gstin') obj.gstin = cols[i] || '';
        if (h === 'channel' || h === 'preferred_channel') obj.preferredChannel = cols[i] || 'whatsapp';
        if (h === 'language' || h === 'preferred_language') obj.preferredLanguage = cols[i] || 'en';
        if (h === 'tags') obj.tags = cols[i] || '';
      });
      return obj;
    });

    setImporting(true);
    try {
      await onBulkImport(rows);
      setShowImport(false);
      setCsvText('');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Clients</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Manage contacts, WhatsApp/Email preferences, and message delivery history.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowImport(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-[#121826] px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 transition-colors min-h-[40px] whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5" />
            Import CSV
          </button>
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 transition-colors min-h-[40px] whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Add Client
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search client, business, phone, email..."
            className="w-full rounded-lg border border-slate-800 bg-[#121826] pl-9 pr-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500/60 min-h-[42px]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-[#121826] border border-slate-800">
            {(['all', 'unpaid', 'overdue', 'paid'] as ClientFilter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-colors whitespace-nowrap ${
                  filter === f
                    ? 'bg-amber-500 text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          {allTags.length > 0 && (
            <select
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              className="rounded-lg border border-slate-800 bg-[#121826] px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500/60 min-h-[38px]"
            >
              <option value="all">All Tags</option>
              {allTags.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Main Split: Client List + Client Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div
          className={`${
            activeClient ? 'hidden lg:block lg:col-span-5' : 'lg:col-span-12'
          } rounded-xl border border-slate-800/80 bg-[#121826] divide-y divide-slate-800/70`}
        >
          {filteredClients.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm text-slate-400">No clients match your search or filter.</p>
              <button
                type="button"
                onClick={openAdd}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950"
              >
                <Plus className="w-4 h-4" /> Add First Client
              </button>
            </div>
          ) : (
            filteredClients.map((c) => {
              const st = clientStats.get(c.id) || { billed: 0, pending: 0, overdue: 0, unpaidCount: 0 };
              const isSelected = activeClient?.id === c.id;
              return (
                <div
                  key={c.id}
                  onClick={() => onSelectClient(c.id)}
                  className={`p-4 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                    isSelected ? 'bg-amber-500/10' : 'hover:bg-slate-800/40'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-white truncate">{c.name}</p>
                      {c.optedOut && (
                        <span className="text-[11px] font-medium text-rose-400">STOP</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 truncate mt-0.5">
                      {c.businessName ? `${c.businessName} · ` : ''}
                      <span className="font-mono-num">{c.phone}</span> ·{' '}
                      {c.preferredChannel.toUpperCase()} ({c.preferredLanguage.toUpperCase()})
                    </p>
                    {c.tags.length > 0 && (
                      <p className="text-xs text-slate-500 mt-1 truncate">
                        {c.tags.join(' · ')}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <p
                        className={`text-sm font-semibold font-mono-num ${
                          st.overdue > 0
                            ? 'text-rose-400'
                            : st.pending > 0
                              ? 'text-amber-400'
                              : 'text-emerald-400'
                        }`}
                      >
                        {st.pending > 0 ? formatINR(st.pending) : 'Settled'}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {st.pending > 0 ? `${st.unpaidCount} pending` : `${formatINR(st.billed)} billed`}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-600" />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Client Detail Drawer / Pane */}
        {activeClient && (
          <div className="lg:col-span-7 rounded-xl border border-slate-800/80 bg-[#121826] p-5 space-y-6">
            <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-800/80">
              <div>
                <button
                  type="button"
                  onClick={() => onSelectClient(null)}
                  className="lg:hidden text-xs text-amber-400 mb-2 inline-flex items-center gap-1"
                >
                  ← Back to Clients
                </button>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h2 className="text-xl font-bold text-white">{activeClient.name}</h2>
                  {activeClient.optedOut && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-400">
                      <Ban className="w-3.5 h-3.5" /> Opted Out (STOP)
                    </span>
                  )}
                </div>
                {activeClient.businessName && (
                  <p className="text-sm text-slate-300 mt-0.5">{activeClient.businessName}</p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                  <span className="inline-flex items-center gap-1 font-mono-num">
                    <Phone className="w-3.5 h-3.5 text-slate-500" />
                    {activeClient.phone}
                  </span>
                  {activeClient.email && (
                    <span className="inline-flex items-center gap-1">
                      <Mail className="w-3.5 h-3.5 text-slate-500" />
                      {activeClient.email}
                    </span>
                  )}
                  {activeClient.gstin && (
                    <span className="font-mono-num">GSTIN: {activeClient.gstin}</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => onCreateInvoiceForClient(activeClient.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 transition-colors min-h-[38px]"
                >
                  <FilePlus2 className="w-3.5 h-3.5" />
                  New Bill
                </button>
                <button
                  type="button"
                  onClick={() => openEdit(activeClient)}
                  title="Edit Client"
                  className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onDeleteClient(activeClient.id);
                  }}
                  title="Delete Client"
                  className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center rounded-lg border border-slate-700 text-rose-400 hover:bg-rose-500/10"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onSelectClient(null)}
                  title="Close"
                  className="hidden lg:inline-flex min-h-[38px] min-w-[38px] items-center justify-center rounded-lg text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Invoices for Client */}
            <div>
              <h3 className="text-sm font-semibold text-white mb-2.5">
                Invoices ({activeClientInvoices.length})
              </h3>
              {activeClientInvoices.length === 0 ? (
                <p className="text-xs text-slate-500 py-3">No invoices created for this client yet.</p>
              ) : (
                <div className="divide-y divide-slate-800/70 border border-slate-800/70 rounded-lg">
                  {activeClientInvoices.map((inv) => (
                    <div
                      key={inv.id}
                      onClick={() => onOpenInvoice(inv.id)}
                      className="p-3 flex items-center justify-between gap-3 cursor-pointer hover:bg-slate-800/30"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-white font-mono-num">
                            {inv.invoiceNo}
                          </span>
                          <StatusBadge status={inv.status} />
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Due {formatDateIN(inv.dueDate)} · Total {formatINR(inv.total)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold font-mono-num text-white">
                          {inv.balance > 0 ? formatINR(inv.balance) : '₹0'}
                        </span>
                        {inv.balance > 0 && !activeClient.optedOut && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSendReminder(inv.id);
                            }}
                            title="1-Tap Send Reminder"
                            className="min-h-[34px] px-2.5 rounded-md border border-amber-500/30 bg-amber-500/10 text-xs font-medium text-amber-300 hover:bg-amber-500/20 inline-flex items-center gap-1"
                          >
                            <Send className="w-3 h-3" /> Remind
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Payment History */}
            <div>
              <h3 className="text-sm font-semibold text-white mb-2.5">
                Payment History ({activeClientPayments.length})
              </h3>
              {activeClientPayments.length === 0 ? (
                <p className="text-xs text-slate-500">No payments recorded yet.</p>
              ) : (
                <div className="divide-y divide-slate-800/70 border border-slate-800/70 rounded-lg">
                  {activeClientPayments.map((p) => (
                    <div key={p.id} className="p-3 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-medium text-white">{p.method}</span>
                        {p.referenceNo && (
                          <span className="text-slate-400 font-mono-num ml-2">
                            {p.referenceNo}
                          </span>
                        )}
                        <p className="text-slate-500 mt-0.5">{formatDateTimeIN(p.paidAt)}</p>
                      </div>
                      <span className="text-sm font-semibold text-emerald-400 font-mono-num">
                        +{formatINR(p.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Full Message Timeline with Delivery Ticks */}
            <div>
              <h3 className="text-sm font-semibold text-white mb-2.5 flex items-center gap-1.5">
                <MessageSquare className="w-4 h-4 text-amber-400" />
                Message & Delivery Timeline ({activeClientLogs.length})
              </h3>
              {activeClientLogs.length === 0 ? (
                <p className="text-xs text-slate-500">No messages sent to this client yet.</p>
              ) : (
                <div className="space-y-2.5">
                  {activeClientLogs.map((log) => (
                    <div
                      key={log.id}
                      className="rounded-lg border border-slate-800 bg-[#0E1420] p-3 text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-slate-300">
                          {log.channel.toUpperCase()} · {log.templateKey.replaceAll('_', ' ')}
                        </span>
                        <DeliveryTick status={log.status} />
                      </div>
                      <p className="text-slate-300 leading-relaxed">{log.messageBody}</p>
                      <div className="flex flex-wrap items-center gap-x-3 text-[11px] text-slate-500 font-mono-num">
                        <span>Sent: {formatDateTimeIN(log.sentAt)}</span>
                        {log.deliveredAt && <span>Delivered: {formatDateTimeIN(log.deliveredAt)}</span>}
                        {log.readAt && <span className="text-sky-400">Read: {formatDateTimeIN(log.readAt)}</span>}
                      </div>
                      {log.error && <p className="text-rose-400 text-[11px]">{log.error}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Add / Edit Client Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <form
            onSubmit={handleSave}
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-800 bg-[#121826] p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">
                {editingClient ? 'Edit Client' : 'Add New Client'}
              </h3>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Contact Name *
                </label>
                <input
                  required
                  value={formState.name}
                  onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Business Name
                </label>
                <input
                  value={formState.businessName}
                  onChange={(e) => setFormState({ ...formState, businessName: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Phone (E.164) *
                </label>
                <input
                  required
                  value={formState.phone}
                  onChange={(e) => setFormState({ ...formState, phone: e.target.value })}
                  placeholder="+919820112233"
                  className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 text-sm text-white font-mono-num focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  WhatsApp Number
                </label>
                <input
                  value={formState.whatsappNumber}
                  onChange={(e) => setFormState({ ...formState, whatsappNumber: e.target.value })}
                  placeholder="+919820112233"
                  className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 text-sm text-white font-mono-num focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Email</label>
                <input
                  type="email"
                  value={formState.email}
                  onChange={(e) => setFormState({ ...formState, email: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">GSTIN</label>
                <input
                  value={formState.gstin}
                  onChange={(e) => setFormState({ ...formState, gstin: e.target.value.toUpperCase() })}
                  className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 text-sm text-white font-mono-num focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Preferred Channel
                </label>
                <select
                  value={formState.preferredChannel}
                  onChange={(e) =>
                    setFormState({
                      ...formState,
                      preferredChannel: e.target.value as 'whatsapp' | 'email' | 'sms',
                    })
                  }
                  className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                >
                  <option value="whatsapp">WhatsApp</option>
                  <option value="email">Email (Resend)</option>
                  <option value="sms">SMS (DLT)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Message Language
                </label>
                <select
                  value={formState.preferredLanguage}
                  onChange={(e) =>
                    setFormState({
                      ...formState,
                      preferredLanguage: e.target.value as 'en' | 'hi',
                    })
                  }
                  className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                >
                  <option value="en">English</option>
                  <option value="hi">Hindi (हिन्दी)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Address</label>
              <input
                value={formState.address}
                onChange={(e) => setFormState({ ...formState, address: e.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Tags (comma separated)
              </label>
              <input
                value={formState.tags}
                onChange={(e) => setFormState({ ...formState, tags: e.target.value })}
                placeholder="Retainer, Mumbai, VIP"
                className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
              />
            </div>

            {editingClient && (
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={formState.optedOut}
                  onChange={(e) => setFormState({ ...formState, optedOut: e.target.checked })}
                  className="rounded border-slate-600"
                />
                Client opted out of reminders (STOP)
              </label>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-amber-500 px-5 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
              >
                {saving ? 'Saving…' : editingClient ? 'Save Changes' : 'Add Client'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Bulk CSV Import Modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-[#121826] p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Bulk Import Clients (CSV)</h3>
              <button
                type="button"
                onClick={() => setShowImport(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-400">
              Upload a CSV file or paste rows with headers:{' '}
              <span className="font-mono-num text-slate-300">
                name,business_name,phone,email,gstin,preferred_channel,preferred_language,tags
              </span>
            </p>
            <div className="flex items-center gap-3">
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleCsvFile}
                className="text-xs text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-slate-700"
              />
              <button
                type="button"
                onClick={() =>
                  exportToCsv(
                    'clientalert-sample-import.csv',
                    ['name', 'business_name', 'phone', 'email', 'gstin', 'preferred_channel', 'preferred_language', 'tags'],
                    [
                      ['Suresh Verma', 'Verma Traders', '+919876543210', 'suresh@verma.in', '27AABCV1234F1Z5', 'whatsapp', 'hi', 'Wholesale;Pune'],
                      ['Meera Krishnan', 'Krishnan Associates', '+919845612345', 'meera@krishnan.co.in', '', 'email', 'en', 'Consulting'],
                    ]
                  )
                }
                className="text-xs text-amber-400 hover:underline whitespace-nowrap"
              >
                Download Sample CSV
              </button>
            </div>
            <textarea
              rows={6}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder={'name,business_name,phone,email,preferred_channel,preferred_language\nAmit Joshi,Joshi Hardware,+919822011223,amit@joshi.in,whatsapp,hi'}
              className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] p-3 text-xs font-mono-num text-slate-200 focus:border-amber-500 focus:outline-none"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowImport(false)}
                className="rounded-lg border border-slate-700 px-4 py-2 text-xs text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={importing || !csvText.trim()}
                onClick={handleImportSubmit}
                className="rounded-lg bg-amber-500 px-5 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
              >
                {importing ? 'Importing…' : 'Import Clients'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
