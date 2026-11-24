import React from 'react';
import { AlertCircle, CheckCircle2, Clock, Eye, FileEdit, Send, XCircle } from 'lucide-react';
import { InvoiceStatus } from '../types';

const STATUS_META: Record<
  InvoiceStatus,
  { label: string; colorClass: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  paid: {
    label: 'Paid',
    colorClass: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25',
    Icon: CheckCircle2,
  },
  partially_paid: {
    label: 'Partially Paid',
    colorClass: 'text-sky-400 bg-sky-500/10 border-sky-500/25',
    Icon: Clock,
  },
  overdue: {
    label: 'Overdue',
    colorClass: 'text-rose-400 bg-rose-500/10 border-rose-500/25',
    Icon: AlertCircle,
  },
  sent: {
    label: 'Pending',
    colorClass: 'text-amber-400 bg-amber-500/10 border-amber-500/25',
    Icon: Send,
  },
  viewed: {
    label: 'Viewed',
    colorClass: 'text-amber-300 bg-amber-500/10 border-amber-400/30',
    Icon: Eye,
  },
  draft: {
    label: 'Draft',
    colorClass: 'text-slate-400 bg-slate-500/10 border-slate-500/25',
    Icon: FileEdit,
  },
  cancelled: {
    label: 'Cancelled',
    colorClass: 'text-slate-500 bg-slate-700/20 border-slate-700',
    Icon: XCircle,
  },
};

export const StatusBadge: React.FC<{ status: InvoiceStatus }> = ({ status }) => {
  const cfg = STATUS_META[status] || STATUS_META.sent;
  const Icon = cfg.Icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap shrink-0 ${cfg.colorClass}`}
    >
      <Icon className="w-3.5 h-3.5" />
      {cfg.label}
    </span>
  );
};
