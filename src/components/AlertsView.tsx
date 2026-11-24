import React, { useState } from 'react';
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  CheckCheck,
  CheckCircle2,
  Eye,
  MessageSquare,
  Play,
  Sparkles,
} from 'lucide-react';
import { NotificationItem } from '../types';
import { formatDateTimeIN } from '../lib/format';

interface AlertsViewProps {
  notifications: NotificationItem[];
  onMarkRead: (id: number) => Promise<void>;
  onMarkAllRead: () => Promise<void>;
  onRunScheduler: () => Promise<{
    overdueMarked: number;
    remindersSent: number;
    remindersDeferred: number;
    remindersSkipped: number;
    quietHoursActive: boolean;
  }>;
  onGenerateDailySummary: () => Promise<void>;
  onNavigateFromLink: (link: string) => void;
}

export const AlertsView: React.FC<AlertsViewProps> = ({
  notifications,
  onMarkRead,
  onMarkAllRead,
  onRunScheduler,
  onGenerateDailySummary,
  onNavigateFromLink,
}) => {
  const [filterUnread, setFilterUnread] = useState(false);
  const [schedulerMsg, setSchedulerMsg] = useState('');
  const [running, setRunning] = useState(false);

  const visible = filterUnread ? notifications.filter((n) => !n.isRead) : notifications;
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const getIcon = (type: string) => {
    if (type === 'payment_received') return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
    if (type === 'invoice_overdue') return <AlertTriangle className="w-4 h-4 text-rose-400" />;
    if (type === 'invoice_viewed') return <Eye className="w-4 h-4 text-sky-400" />;
    if (type === 'daily_summary') return <CalendarClock className="w-4 h-4 text-amber-400" />;
    return <MessageSquare className="w-4 h-4 text-slate-300" />;
  };

  const handleRunScheduler = async () => {
    setRunning(true);
    try {
      const res = await onRunScheduler();
      setSchedulerMsg(
        `Scheduler ran: ${res.overdueMarked} marked overdue, ${res.remindersSent} reminders sent, ${res.remindersDeferred} deferred (IST quiet hours ${res.quietHoursActive ? 'active' : 'off'}).`
      );
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Alerts & Activity</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Real-time owner alerts for invoice opens, delivery receipts, overdue bills, and 9 AM IST summaries.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={running}
            onClick={handleRunScheduler}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-[#121826] px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 min-h-[38px]"
          >
            <Play className="w-3.5 h-3.5 text-amber-400" />
            {running ? 'Running…' : 'Run Scheduler Now'}
          </button>
          <button
            type="button"
            onClick={onGenerateDailySummary}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-[#121826] px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 min-h-[38px]"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            9 AM Daily Summary
          </button>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={onMarkAllRead}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3.5 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 min-h-[38px]"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Mark All Read ({unreadCount})
            </button>
          )}
        </div>
      </div>

      {schedulerMsg && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
          {schedulerMsg}
        </div>
      )}

      <div className="flex items-center gap-1 p-1 rounded-lg bg-[#121826] border border-slate-800 w-fit">
        <button
          type="button"
          onClick={() => setFilterUnread(false)}
          className={`px-3 py-1.5 text-xs font-medium rounded-md ${
            !filterUnread ? 'bg-amber-500 text-slate-950 font-semibold' : 'text-slate-400'
          }`}
        >
          All ({notifications.length})
        </button>
        <button
          type="button"
          onClick={() => setFilterUnread(true)}
          className={`px-3 py-1.5 text-xs font-medium rounded-md ${
            filterUnread ? 'bg-amber-500 text-slate-950 font-semibold' : 'text-slate-400'
          }`}
        >
          Unread ({unreadCount})
        </button>
      </div>

      <div className="rounded-xl border border-slate-800/80 bg-[#121826] divide-y divide-slate-800/70">
        {visible.length === 0 ? (
          <div className="p-10 text-center">
            <Bell className="w-7 h-7 text-slate-600 mx-auto mb-2" />
            <p className="text-sm text-slate-400">You are all caught up.</p>
          </div>
        ) : (
          visible.map((n) => (
            <div
              key={n.id}
              onClick={async () => {
                if (!n.isRead) await onMarkRead(n.id);
                if (n.link) onNavigateFromLink(n.link);
              }}
              className={`p-4 flex items-start justify-between gap-4 cursor-pointer transition-colors ${
                n.isRead ? 'hover:bg-slate-800/30' : 'bg-amber-500/5 hover:bg-amber-500/10'
              }`}
            >
              <div className="flex items-start gap-3 min-w-0">
                <div className="mt-0.5 p-2 rounded-lg border border-slate-800 bg-[#0B0F17] shrink-0">
                  {getIcon(n.type)}
                </div>
                <div className="min-w-0">
                  <p
                    className={`text-sm ${
                      n.isRead ? 'font-medium text-slate-200' : 'font-semibold text-white'
                    }`}
                  >
                    {n.title}
                  </p>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">{n.body}</p>
                  <p className="text-[11px] text-slate-500 mt-1 font-mono-num">
                    {formatDateTimeIN(n.createdAt)}
                  </p>
                </div>
              </div>
              {!n.isRead && (
                <span className="text-[11px] font-semibold text-amber-400 shrink-0">New</span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
