import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  BellRing,
  CheckCircle2,
  Clock,
  IndianRupee,
  Plus,
  Send,
  Users,
} from 'lucide-react';
import { Client, Invoice, Payment } from '../types';
import { formatDateIN, formatINR, getDaysOverdue, getDaysUntilDue } from '../lib/format';
import { StatusBadge } from './StatusBadge';

interface DashboardViewProps {
  clients: Client[];
  invoices: Invoice[];
  payments: Payment[];
  onCreateInvoice: () => void;
  onOpenInvoice: (invoiceId: number) => void;
  onQuickRemind: (invoiceId: number) => Promise<void>;
  onQuickMarkPaid: (invoice: Invoice) => void;
  onNavigateReports: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  clients,
  invoices,
  payments,
  onCreateInvoice,
  onOpenInvoice,
  onQuickRemind,
  onQuickMarkPaid,
  onNavigateReports,
}) => {
  const [remindingId, setRemindingId] = useState<number | null>(null);
  const [hoveredMonth, setHoveredMonth] = useState<string | null>(null);

  const clientMap = useMemo(() => {
    const map = new Map<number, Client>();
    clients.forEach((c) => map.set(c.id, c));
    return map;
  }, [clients]);

  const kpis = useMemo(() => {
    const active = invoices.filter((i) => i.status !== 'cancelled');
    const totalBilled = active.reduce((s, i) => s + i.total, 0);
    const totalReceived = active.reduce((s, i) => s + i.amountPaid, 0);
    const totalPending = active.reduce((s, i) => s + i.balance, 0);
    const overdueAmount = active
      .filter((i) => i.status === 'overdue')
      .reduce((s, i) => s + i.balance, 0);
    const unpaidClientIds = new Set(active.filter((i) => i.balance > 0).map((i) => i.clientId));
    return {
      totalBilled,
      totalReceived,
      totalPending,
      overdueAmount,
      unpaidClientsCount: unpaidClientIds.size,
    };
  }, [invoices]);

  // Build last 6 months chart data
  const chartData = useMemo(() => {
    const months: Array<{ key: string; label: string; billed: number; received: number }> = [];
    const now = new Date();
    for (let offset = 5; offset >= 0; offset--) {
      const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-IN', { month: 'short' });
      months.push({ key, label, billed: 0, received: 0 });
    }
    invoices.forEach((inv) => {
      if (inv.status === 'cancelled') return;
      const mKey = inv.issueDate.slice(0, 7);
      const bucket = months.find((m) => m.key === mKey);
      if (bucket) bucket.billed += inv.total;
    });
    payments.forEach((p) => {
      const mKey = new Date(p.paidAt).toISOString().slice(0, 7);
      const bucket = months.find((m) => m.key === mKey);
      if (bucket) bucket.received += p.amount;
    });
    const maxVal = Math.max(10000, ...months.flatMap((m) => [m.billed, m.received]));
    return { months, maxVal };
  }, [invoices, payments]);

  const dueThisWeek = useMemo(() => {
    return invoices
      .filter((i) => {
        if (i.balance <= 0 || i.status === 'paid' || i.status === 'cancelled') return false;
        const diff = getDaysUntilDue(i.dueDate);
        return diff >= 0 && diff <= 7;
      })
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [invoices]);

  const overdueList = useMemo(() => {
    return invoices
      .filter((i) => i.status === 'overdue' && i.balance > 0)
      .sort((a, b) => getDaysOverdue(b.dueDate) - getDaysOverdue(a.dueDate));
  }, [invoices]);

  const recentlyPaid = useMemo(() => {
    return payments.slice(0, 5).map((p) => {
      const inv = invoices.find((i) => i.id === p.invoiceId);
      const client = inv ? clientMap.get(inv.clientId) : undefined;
      return { payment: p, invoice: inv, client };
    });
  }, [payments, invoices, clientMap]);

  const handleRemind = async (e: React.MouseEvent, invoiceId: number) => {
    e.stopPropagation();
    setRemindingId(invoiceId);
    try {
      await onQuickRemind(invoiceId);
    } finally {
      setRemindingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Title & Quick CTA */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Billing Overview</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Track receivables, upcoming due dates, and WhatsApp/Email collection status.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onNavigateReports}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-[#121826] px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 transition-colors min-h-[40px] whitespace-nowrap"
          >
            Ageing Report
            <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
          </button>
          <button
            type="button"
            onClick={onCreateInvoice}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 transition-colors min-h-[40px] whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            New Bill
          </button>
        </div>
      </div>

      {/* 5 KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="rounded-xl border border-slate-800/80 bg-[#121826] p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Total Billed</span>
            <IndianRupee className="w-3.5 h-3.5 text-slate-500" />
          </div>
          <div className="mt-2 text-xl sm:text-2xl font-bold text-white font-mono-num">
            {formatINR(kpis.totalBilled)}
          </div>
          <p className="mt-1 text-xs text-slate-500">All active invoices</p>
        </div>

        <div className="rounded-xl border border-slate-800/80 bg-[#121826] p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Total Received</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="mt-2 text-xl sm:text-2xl font-bold text-emerald-400 font-mono-num">
            {formatINR(kpis.totalReceived)}
          </div>
          <p className="mt-1 text-xs text-slate-500">Collected payments</p>
        </div>

        <div className="rounded-xl border border-slate-800/80 bg-[#121826] p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Total Pending</span>
            <Clock className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="mt-2 text-xl sm:text-2xl font-bold text-amber-400 font-mono-num">
            {formatINR(kpis.totalPending)}
          </div>
          <p className="mt-1 text-xs text-slate-500">Open receivables</p>
        </div>

        <div className="rounded-xl border border-slate-800/80 bg-[#121826] p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Overdue Amount</span>
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
          </div>
          <div className="mt-2 text-xl sm:text-2xl font-bold text-rose-400 font-mono-num">
            {formatINR(kpis.overdueAmount)}
          </div>
          <p className="mt-1 text-xs text-slate-500">{overdueList.length} overdue bills</p>
        </div>

        <div className="col-span-2 lg:col-span-1 rounded-xl border border-slate-800/80 bg-[#121826] p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Clients Unpaid</span>
            <Users className="w-3.5 h-3.5 text-sky-400" />
          </div>
          <div className="mt-2 text-xl sm:text-2xl font-bold text-white font-mono-num">
            {kpis.unpaidClientsCount}
          </div>
          <p className="mt-1 text-xs text-slate-500">Out of {clients.length} total clients</p>
        </div>
      </div>

      {/* Monthly Billed vs Received Chart + Due This Week */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Chart */}
        <div className="lg:col-span-7 rounded-xl border border-slate-800/80 bg-[#121826] p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-5">
            <div>
              <h2 className="text-base font-semibold text-white">Monthly Billed vs Received</h2>
              <p className="text-xs text-slate-400">6-month INR cashflow comparison</p>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-300">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-amber-500/85" />
                Billed
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
                Received
              </span>
            </div>
          </div>

          <div className="grid grid-cols-6 gap-2 sm:gap-4 items-end h-48 pt-6 border-b border-slate-800/80 pb-3">
            {chartData.months.map((m) => {
              const billedPct = Math.max(4, Math.round((m.billed / chartData.maxVal) * 100));
              const recPct = Math.max(4, Math.round((m.received / chartData.maxVal) * 100));
              const isHovered = hoveredMonth === m.key;
              return (
                <div
                  key={m.key}
                  onMouseEnter={() => setHoveredMonth(m.key)}
                  onMouseLeave={() => setHoveredMonth(null)}
                  onClick={() => setHoveredMonth(isHovered ? null : m.key)}
                  className="relative flex flex-col items-center h-full justify-end cursor-pointer group"
                >
                  {isHovered && (
                    <div className="absolute -top-9 z-10 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] text-slate-200 shadow-xl whitespace-nowrap font-mono-num">
                      B: {formatINR(m.billed)} · R: {formatINR(m.received)}
                    </div>
                  )}
                  <div className="flex items-end gap-1 sm:gap-1.5 w-full justify-center h-36">
                    <div
                      style={{ height: `${m.billed > 0 ? billedPct : 2}%` }}
                      className="w-3.5 sm:w-5 rounded-t bg-amber-500/80 group-hover:bg-amber-400 transition-all"
                      title={`Billed: ${formatINR(m.billed)}`}
                    />
                    <div
                      style={{ height: `${m.received > 0 ? recPct : 2}%` }}
                      className="w-3.5 sm:w-5 rounded-t bg-emerald-500/90 group-hover:bg-emerald-400 transition-all"
                      title={`Received: ${formatINR(m.received)}`}
                    />
                  </div>
                  <span className="mt-2 text-xs text-slate-400 font-medium">{m.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Due This Week */}
        <div className="lg:col-span-5 rounded-xl border border-slate-800/80 bg-[#121826] p-5 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-base font-semibold text-white">Due This Week</h2>
              <p className="text-xs text-slate-400">Next 7 days</p>
            </div>
            <span className="text-xs font-mono-num text-amber-400">
              {dueThisWeek.length} bills
            </span>
          </div>

          {dueThisWeek.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-8 text-center text-sm text-slate-500">
              No invoices due in the next 7 days.
            </div>
          ) : (
            <div className="divide-y divide-slate-800/70">
              {dueThisWeek.map((inv) => {
                const client = clientMap.get(inv.clientId);
                const daysLeft = getDaysUntilDue(inv.dueDate);
                return (
                  <div
                    key={inv.id}
                    onClick={() => onOpenInvoice(inv.id)}
                    className="py-3 flex items-center justify-between gap-3 cursor-pointer hover:bg-slate-800/30 -mx-2 px-2 rounded-lg transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">
                        {client?.name || 'Client'}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5 truncate">
                        <span className="font-mono-num">{inv.invoiceNo}</span> ·{' '}
                        {daysLeft === 0 ? 'Due today' : `In ${daysLeft}d`} ·{' '}
                        {formatDateIN(inv.dueDate)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-semibold text-amber-300 font-mono-num">
                        {formatINR(inv.balance)}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => handleRemind(e, inv.id)}
                        disabled={remindingId === inv.id}
                        title="Send Reminder Now"
                        className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg border border-slate-700 bg-slate-800/80 text-amber-400 hover:bg-slate-700 transition-colors"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Overdue & Recently Paid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Overdue List */}
        <div className="rounded-xl border border-slate-800/80 bg-[#121826] p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-base font-semibold text-white">Overdue Bills</h2>
              <p className="text-xs text-slate-400">1-tap reminder or mark paid</p>
            </div>
            <span className="text-xs font-mono-num text-rose-400">
              {formatINR(kpis.overdueAmount)}
            </span>
          </div>

          {overdueList.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-500">
              Zero overdue invoices. Great collection discipline!
            </div>
          ) : (
            <div className="divide-y divide-slate-800/70">
              {overdueList.map((inv) => {
                const client = clientMap.get(inv.clientId);
                const overdueDays = getDaysOverdue(inv.dueDate);
                return (
                  <div
                    key={inv.id}
                    onClick={() => onOpenInvoice(inv.id)}
                    className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer hover:bg-slate-800/30 -mx-2 px-2 rounded-lg transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-white truncate">
                          {client?.name || 'Client'}
                        </p>
                        <StatusBadge status={inv.status} />
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        <span className="font-mono-num">{inv.invoiceNo}</span> · {overdueDays} days
                        overdue · Due {formatDateIN(inv.dueDate)}
                      </p>
                    </div>
                    <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
                      <span className="text-sm font-bold text-rose-400 font-mono-num mr-1">
                        {formatINR(inv.balance)}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => handleRemind(e, inv.id)}
                        disabled={remindingId === inv.id}
                        className="inline-flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-500/20 transition-colors min-h-[36px] whitespace-nowrap"
                      >
                        <BellRing className="w-3.5 h-3.5" />
                        {remindingId === inv.id ? 'Sending…' : 'Remind'}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onQuickMarkPaid(inv);
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20 transition-colors min-h-[36px] whitespace-nowrap"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Mark Paid
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recently Paid */}
        <div className="rounded-xl border border-slate-800/80 bg-[#121826] p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-base font-semibold text-white">Recently Paid</h2>
              <p className="text-xs text-slate-400">Latest UPI, Razorpay & bank settlements</p>
            </div>
            <span className="text-xs font-mono-num text-emerald-400">
              {payments.length} recorded
            </span>
          </div>

          {recentlyPaid.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-500">
              No payments recorded yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-800/70">
              {recentlyPaid.map(({ payment, invoice, client }) => (
                <div
                  key={payment.id}
                  onClick={() => invoice && onOpenInvoice(invoice.id)}
                  className="py-3.5 flex items-center justify-between gap-3 cursor-pointer hover:bg-slate-800/30 -mx-2 px-2 rounded-lg transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {client?.name || 'Client'}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5 truncate">
                      <span className="font-mono-num">{invoice?.invoiceNo || 'Invoice'}</span> ·{' '}
                      {payment.method}
                      {payment.referenceNo ? ` (${payment.referenceNo})` : ''} ·{' '}
                      {formatDateIN(payment.paidAt)}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-emerald-400 font-mono-num shrink-0">
                    +{formatINR(payment.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
