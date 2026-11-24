import React, { useMemo } from 'react';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { Client, Invoice, OwnerSettings } from '../types';
import {
  exportAgeingReportPdf,
  exportToCsv,
  exportToExcelHtml,
  formatINR,
  formatNumberIN,
  getDaysOverdue,
} from '../lib/format';

interface ReportsViewProps {
  clients: Client[];
  invoices: Invoice[];
  settings: OwnerSettings;
  onOpenClient: (clientId: number) => void;
}

export const ReportsView: React.FC<ReportsViewProps> = ({
  clients,
  invoices,
  settings,
  onOpenClient,
}) => {
  const reportRows = useMemo(() => {
    return clients
      .map((client) => {
        const clientInvoices = invoices.filter(
          (i) => i.clientId === client.id && i.status !== 'cancelled'
        );
        const totalBilled = clientInvoices.reduce((s, i) => s + i.total, 0);
        const totalPaid = clientInvoices.reduce((s, i) => s + i.amountPaid, 0);
        const totalOutstanding = clientInvoices.reduce((s, i) => s + i.balance, 0);

        let bucket0to30 = 0;
        let bucket31to60 = 0;
        let bucket60Plus = 0;

        clientInvoices.forEach((inv) => {
          if (inv.balance <= 0) return;
          const days = getDaysOverdue(inv.dueDate);
          if (days <= 30) bucket0to30 += inv.balance;
          else if (days <= 60) bucket31to60 += inv.balance;
          else bucket60Plus += inv.balance;
        });

        return {
          client,
          invoiceCount: clientInvoices.length,
          totalBilled,
          totalPaid,
          totalOutstanding,
          bucket0to30,
          bucket31to60,
          bucket60Plus,
        };
      })
      .sort((a, b) => b.totalOutstanding - a.totalOutstanding);
  }, [clients, invoices]);

  const totals = useMemo(() => {
    return reportRows.reduce(
      (acc, r) => ({
        billed: acc.billed + r.totalBilled,
        paid: acc.paid + r.totalPaid,
        outstanding: acc.outstanding + r.totalOutstanding,
        b0: acc.b0 + r.bucket0to30,
        b31: acc.b31 + r.bucket31to60,
        b60: acc.b60 + r.bucket60Plus,
      }),
      { billed: 0, paid: 0, outstanding: 0, b0: 0, b31: 0, b60: 0 }
    );
  }, [reportRows]);

  const headers = [
    'Client',
    'Business',
    'Total Billed (INR)',
    'Received (INR)',
    'Outstanding (INR)',
    '0-30 Days',
    '31-60 Days',
    '60+ Days',
  ];

  const exportRows = reportRows.map((r) => [
    r.client.name,
    r.client.businessName || '-',
    formatNumberIN(r.totalBilled),
    formatNumberIN(r.totalPaid),
    formatNumberIN(r.totalOutstanding),
    formatNumberIN(r.bucket0to30),
    formatNumberIN(r.bucket31to60),
    formatNumberIN(r.bucket60Plus),
  ]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Outstanding & Ageing Reports
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Client-wise receivables segmented by 0–30, 31–60, and 60+ day overdue buckets.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => exportToCsv('ClientAlert-Ageing-Report.csv', headers, exportRows)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-[#121826] px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 min-h-[38px]"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={() =>
              exportToExcelHtml(
                'ClientAlert-Ageing-Report.xls',
                `${settings.businessName} - Ageing Report`,
                headers,
                exportRows
              )
            }
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-[#121826] px-3 py-2 text-xs font-medium text-emerald-300 hover:bg-slate-800 min-h-[38px]"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Export Excel
          </button>
          <button
            type="button"
            onClick={() => exportAgeingReportPdf(settings.businessName, headers, exportRows)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3.5 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 min-h-[38px]"
          >
            <FileText className="w-3.5 h-3.5" />
            Export PDF
          </button>
        </div>
      </div>

      {/* Ageing Buckets Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border border-slate-800 bg-[#121826] p-4">
          <p className="text-xs text-slate-400">Total Outstanding</p>
          <p className="mt-1.5 text-xl font-bold text-white font-mono-num">
            {formatINR(totals.outstanding)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-[#121826] p-4">
          <p className="text-xs text-slate-400">0–30 Days</p>
          <p className="mt-1.5 text-xl font-bold text-amber-400 font-mono-num">
            {formatINR(totals.b0)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-[#121826] p-4">
          <p className="text-xs text-slate-400">31–60 Days</p>
          <p className="mt-1.5 text-xl font-bold text-orange-400 font-mono-num">
            {formatINR(totals.b31)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-[#121826] p-4">
          <p className="text-xs text-slate-400">60+ Days Critical</p>
          <p className="mt-1.5 text-xl font-bold text-rose-400 font-mono-num">
            {formatINR(totals.b60)}
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-800 bg-[#121826] overflow-x-auto">
        <table className="w-full text-xs sm:text-sm">
          <thead className="bg-slate-900/60 text-xs text-slate-400 border-b border-slate-800">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Client</th>
              <th className="text-right px-4 py-3 font-medium">Billed</th>
              <th className="text-right px-4 py-3 font-medium">Received</th>
              <th className="text-right px-4 py-3 font-medium">Outstanding</th>
              <th className="text-right px-4 py-3 font-medium">0–30d</th>
              <th className="text-right px-4 py-3 font-medium">31–60d</th>
              <th className="text-right px-4 py-3 font-medium">60+d</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70">
            {reportRows.map((r) => (
              <tr
                key={r.client.id}
                onClick={() => onOpenClient(r.client.id)}
                className="cursor-pointer hover:bg-slate-800/30 transition-colors"
              >
                <td className="px-4 py-3">
                  <p className="font-semibold text-white">{r.client.name}</p>
                  {r.client.businessName && (
                    <p className="text-xs text-slate-400">{r.client.businessName}</p>
                  )}
                </td>
                <td className="px-4 py-3 text-right font-mono-num text-slate-300">
                  {formatINR(r.totalBilled)}
                </td>
                <td className="px-4 py-3 text-right font-mono-num text-emerald-400">
                  {formatINR(r.totalPaid)}
                </td>
                <td className="px-4 py-3 text-right font-mono-num font-bold text-white">
                  {formatINR(r.totalOutstanding)}
                </td>
                <td className="px-4 py-3 text-right font-mono-num text-amber-300">
                  {formatINR(r.bucket0to30)}
                </td>
                <td className="px-4 py-3 text-right font-mono-num text-orange-300">
                  {formatINR(r.bucket31to60)}
                </td>
                <td className="px-4 py-3 text-right font-mono-num text-rose-400">
                  {formatINR(r.bucket60Plus)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
