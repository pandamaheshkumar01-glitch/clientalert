import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  CheckCircle2,
  CreditCard,
  Download,
  ExternalLink,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { PublicInvoicePayload } from '../types';
import {
  buildUpiUrl,
  formatDateIN,
  formatDateTimeIN,
  formatINR,
  generateInvoicePdf,
} from '../lib/format';
import { StatusBadge } from './StatusBadge';

export const PublicInvoicePage: React.FC<{ publicToken: string }> = ({ publicToken }) => {
  const [data, setData] = useState<PublicInvoicePayload | null>(null);
  const [qrUrl, setQrUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [paying, setPaying] = useState(false);
  const [paidMessage, setPaidMessage] = useState('');

  const loadInvoice = async () => {
    setLoading(true);
    setError('');
    try {
      const resp = await fetch(`/api/public/invoices/${encodeURIComponent(publicToken)}`);
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error || 'Invoice not found');
      }
      const payload = (await resp.json()) as PublicInvoicePayload;
      setData(payload);

      if (payload.seller?.upiId && payload.invoice.balance > 0) {
        const upi = buildUpiUrl({
          upiId: payload.seller.upiId,
          payeeName: payload.seller.businessName,
          amount: payload.invoice.balance,
          invoiceNo: payload.invoice.invoiceNo,
        });
        const url = await QRCode.toDataURL(upi, { width: 220, margin: 1 });
        setQrUrl(url);
      } else {
        setQrUrl('');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to load invoice');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInvoice();
  }, [publicToken]);

  const handlePayNow = async (method: 'Razorpay' | 'UPI') => {
    if (!data || data.invoice.balance <= 0) return;
    setPaying(true);
    try {
      const resp = await fetch(`/api/public/invoices/${encodeURIComponent(publicToken)}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: data.invoice.balance,
          method,
        }),
      });
      if (!resp.ok) {
        const errBody = await resp.json().catch(() => ({}));
        throw new Error(errBody.error || 'Payment failed');
      }
      setPaidMessage('Payment confirmed! Receipt has been sent and reminders stopped.');
      await loadInvoice();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Payment error');
    } finally {
      setPaying(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0B0F17] flex items-center justify-center p-6">
        <div className="text-sm text-slate-400">Loading invoice details…</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#0B0F17] flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl border border-slate-800 bg-[#121826] p-8 text-center">
          <h1 className="text-lg font-bold text-white">Invoice Unavailable</h1>
          <p className="mt-2 text-sm text-slate-400">{error || 'Invalid invoice link.'}</p>
        </div>
      </div>
    );
  }

  const { invoice, client, seller, payments } = data;
  const upiDeepLink = seller?.upiId
    ? buildUpiUrl({
        upiId: seller.upiId,
        payeeName: seller.businessName,
        amount: invoice.balance,
        invoiceNo: invoice.invoiceNo,
      })
    : '';

  return (
    <div className="min-h-screen bg-[#0B0F17] text-slate-100 py-8 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto space-y-5">
        {paidMessage && (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 flex items-center gap-3 text-sm text-emerald-200">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>{paidMessage}</span>
          </div>
        )}

        <div className="rounded-2xl border border-slate-800 bg-[#121826] overflow-hidden shadow-2xl">
          {/* Header */}
          <div className="p-6 sm:p-8 border-b border-slate-800 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-amber-400">
                {seller?.businessName || 'ClientAlert'}
              </p>
              <h1 className="text-2xl font-bold text-white font-mono-num mt-1">
                {invoice.invoiceNo}
              </h1>
              {seller?.gstin && (
                <p className="text-xs text-slate-400 font-mono-num mt-1">GSTIN: {seller.gstin}</p>
              )}
            </div>
            <div className="sm:text-right space-y-1.5">
              <StatusBadge status={invoice.status} />
              <p className="text-xs text-slate-400 font-mono-num">
                Issued: {formatDateIN(invoice.issueDate)} · Due: {formatDateIN(invoice.dueDate)}
              </p>
              <button
                type="button"
                onClick={() =>
                  generateInvoicePdf({
                    invoice,
                    client: client
                      ? {
                          name: client.name,
                          businessName: client.businessName,
                          address: client.address,
                          gstin: client.gstin,
                        }
                      : null,
                    seller: seller
                      ? {
                          businessName: seller.businessName,
                          ownerName: seller.ownerName,
                          upiId: seller.upiId,
                          bankName: seller.bankName,
                          bankAccountNo: seller.bankAccountNo,
                          bankIfsc: seller.bankIfsc,
                          gstin: seller.gstin,
                          signatureText: seller.signatureText,
                        }
                      : null,
                    publicLink: window.location.href,
                  })
                }
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
              >
                <Download className="w-3.5 h-3.5" />
                Download PDF
              </button>
            </div>
          </div>

          {/* Client & Amount Summary */}
          <div className="p-6 sm:p-8 grid grid-cols-1 sm:grid-cols-2 gap-6 border-b border-slate-800">
            <div>
              <p className="text-xs text-slate-400">Billed To</p>
              <p className="text-base font-semibold text-white mt-1">
                {client?.businessName || client?.name}
              </p>
              {client?.businessName && (
                <p className="text-sm text-slate-300">Attn: {client.name}</p>
              )}
              {client?.address && <p className="text-xs text-slate-400 mt-1">{client.address}</p>}
              {client?.gstin && (
                <p className="text-xs text-slate-400 font-mono-num mt-1">
                  Client GSTIN: {client.gstin}
                </p>
              )}
            </div>

            <div className="sm:text-right">
              <p className="text-xs text-slate-400">
                {invoice.balance > 0 ? 'Balance Due' : 'Amount Settled'}
              </p>
              <p
                className={`text-3xl font-bold font-mono-num mt-1 ${
                  invoice.balance > 0 ? 'text-amber-400' : 'text-emerald-400'
                }`}
              >
                {invoice.balance > 0 ? formatINR(invoice.balance) : formatINR(invoice.total)}
              </p>
              {invoice.amountPaid > 0 && invoice.balance > 0 && (
                <p className="text-xs text-emerald-400 mt-1 font-mono-num">
                  Already paid: {formatINR(invoice.amountPaid)}
                </p>
              )}
            </div>
          </div>

          {/* Line Items */}
          <div className="p-6 sm:p-8 border-b border-slate-800 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="text-left pb-3 font-medium">Description</th>
                  <th className="text-right pb-3 font-medium">Qty</th>
                  <th className="text-right pb-3 font-medium">Rate</th>
                  <th className="text-right pb-3 font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {invoice.items.map((it, idx) => (
                  <tr key={idx}>
                    <td className="py-3 text-slate-200">{it.description}</td>
                    <td className="py-3 text-right font-mono-num text-slate-300">{it.qty}</td>
                    <td className="py-3 text-right font-mono-num text-slate-300">
                      {formatINR(it.rate)}
                    </td>
                    <td className="py-3 text-right font-mono-num font-semibold text-white">
                      {formatINR(it.qty * it.rate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-4 pt-4 border-t border-slate-800 space-y-1.5 text-sm max-w-xs ml-auto">
              <div className="flex justify-between text-slate-400">
                <span>Subtotal</span>
                <span className="font-mono-num">{formatINR(invoice.subtotal)}</span>
              </div>
              {invoice.discount > 0 && (
                <div className="flex justify-between text-slate-400">
                  <span>Discount</span>
                  <span className="font-mono-num">-{formatINR(invoice.discount)}</span>
                </div>
              )}
              <div className="flex justify-between text-slate-400">
                <span>GST ({invoice.taxRate}%)</span>
                <span className="font-mono-num">{formatINR(invoice.taxAmount)}</span>
              </div>
              <div className="flex justify-between font-bold text-white pt-1.5 border-t border-slate-800">
                <span>Total</span>
                <span className="font-mono-num">{formatINR(invoice.total)}</span>
              </div>
            </div>
          </div>

          {/* Payment Options */}
          {invoice.balance > 0 ? (
            <div className="p-6 sm:p-8 bg-[#0E1420] grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
              <div className="md:col-span-7 space-y-4">
                <h2 className="text-base font-semibold text-white">Pay Online or via UPI</h2>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={paying}
                    onClick={() => handlePayNow('Razorpay')}
                    className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-3 text-sm font-bold text-slate-950 hover:bg-amber-400 transition-colors min-h-[46px]"
                  >
                    <CreditCard className="w-4 h-4" />
                    {paying ? 'Processing…' : `Pay Now ${formatINR(invoice.balance)}`}
                  </button>
                  {upiDeepLink && (
                    <a
                      href={upiDeepLink}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm font-medium text-white hover:bg-slate-700 min-h-[46px]"
                    >
                      <Smartphone className="w-4 h-4 text-emerald-400" />
                      Open UPI App
                      <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                    </a>
                  )}
                </div>

                {seller && (
                  <div className="text-xs text-slate-400 space-y-1 pt-2">
                    {seller.upiId && (
                      <p>
                        UPI ID: <span className="text-slate-200 font-mono-num">{seller.upiId}</span>
                      </p>
                    )}
                    {seller.bankName && (
                      <p className="font-mono-num">
                        Bank: {seller.bankName} · A/C: {seller.bankAccountNo} · IFSC:{' '}
                        {seller.bankIfsc}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {qrUrl && (
                <div className="md:col-span-5 flex flex-col items-center justify-center rounded-xl border border-slate-800 bg-white p-4">
                  <img
                    src={qrUrl}
                    alt="UPI Payment QR Code"
                    referrerPolicy="no-referrer"
                    className="w-40 h-40"
                  />
                  <p className="mt-2 text-[11px] font-medium text-slate-700 text-center">
                    Scan with GPay, PhonePe, Paytm or BHIM
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="p-6 sm:p-8 bg-emerald-500/5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                <div>
                  <p className="text-sm font-semibold text-emerald-300">Invoice Paid in Full</p>
                  {payments[0] && (
                    <p className="text-xs text-slate-400">
                      Settled via {payments[0].method} on {formatDateTimeIN(payments[0].paidAt)}
                    </p>
                  )}
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                Verified Receipt
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
