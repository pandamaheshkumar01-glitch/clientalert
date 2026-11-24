import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { Client, Invoice, OwnerSettings } from '../types';

export function formatINR(amount: number): string {
  const num = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: num % 1 === 0 ? 0 : 2,
  }).format(num);
}

export function formatNumberIN(amount: number): string {
  const num = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: num % 1 === 0 ? 0 : 2,
  }).format(num);
}

export function formatDateIN(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTimeIN(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getTodayISTStr(): string {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

export function getDaysOverdue(dueDateStr: string): number {
  const todayStr = getTodayISTStr();
  const todayMs = Date.parse(`${todayStr}T00:00:00Z`);
  const dueMs = Date.parse(`${dueDateStr}T00:00:00Z`);
  if (Number.isNaN(dueMs)) return 0;
  return Math.max(0, Math.floor((todayMs - dueMs) / (24 * 60 * 60 * 1000)));
}

export function getDaysUntilDue(dueDateStr: string): number {
  const todayStr = getTodayISTStr();
  const todayMs = Date.parse(`${todayStr}T00:00:00Z`);
  const dueMs = Date.parse(`${dueDateStr}T00:00:00Z`);
  if (Number.isNaN(dueMs)) return 0;
  return Math.floor((dueMs - todayMs) / (24 * 60 * 60 * 1000));
}

export function buildUpiUrl(params: {
  upiId: string;
  payeeName: string;
  amount: number;
  invoiceNo: string;
}): string {
  const pa = encodeURIComponent(params.upiId || 'merchant@upi');
  const pn = encodeURIComponent(params.payeeName || 'ClientAlert');
  const tn = encodeURIComponent(`Payment for ${params.invoiceNo}`);
  const am = Math.max(1, params.amount).toFixed(2);
  return `upi://pay?pa=${pa}&pn=${pn}&am=${am}&cu=INR&tn=${tn}`;
}

export async function generateInvoicePdf(params: {
  invoice: Pick<
    Invoice,
    | 'invoiceNo'
    | 'issueDate'
    | 'dueDate'
    | 'items'
    | 'subtotal'
    | 'taxRate'
    | 'taxAmount'
    | 'discount'
    | 'total'
    | 'amountPaid'
    | 'balance'
    | 'status'
    | 'notes'
  >;
  client: Pick<Client, 'name' | 'businessName' | 'address' | 'gstin'> | null;
  seller: Pick<
    OwnerSettings,
    | 'businessName'
    | 'ownerName'
    | 'upiId'
    | 'bankName'
    | 'bankAccountNo'
    | 'bankIfsc'
    | 'gstin'
    | 'signatureText'
  > | null;
  publicLink?: string;
}) {
  const { invoice, client, seller, publicLink } = params;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header Band
  doc.setFillColor(11, 15, 23);
  doc.rect(0, 0, pageWidth, 110, 'F');

  doc.setTextColor(245, 158, 11);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text(seller?.businessName || 'ClientAlert', 40, 46);

  doc.setTextColor(203, 213, 225);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  if (seller?.gstin) doc.text(`GSTIN: ${seller.gstin}`, 40, 64);
  doc.text(`Issued by: ${seller?.ownerName || 'Owner'}`, 40, 80);

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('TAX INVOICE', pageWidth - 40, 44, { align: 'right' });
  doc.setFontSize(11);
  doc.text(invoice.invoiceNo, pageWidth - 40, 64, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(`Status: ${invoice.status.replace('_', ' ').toUpperCase()}`, pageWidth - 40, 82, {
    align: 'right',
  });

  // Bill To & Dates
  let y = 140;
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('BILL TO', 40, y);
  doc.text('INVOICE DATES', pageWidth - 200, y);

  y += 16;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(client?.businessName || client?.name || 'Client', 40, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Issue Date: ${formatDateIN(invoice.issueDate)}`, pageWidth - 200, y);

  y += 15;
  if (client?.businessName && client?.name) {
    doc.text(`Attn: ${client.name}`, 40, y);
  }
  doc.text(`Due Date: ${formatDateIN(invoice.dueDate)}`, pageWidth - 200, y);

  if (client?.address) {
    y += 15;
    doc.setTextColor(71, 85, 105);
    doc.text(client.address, 40, y);
  }
  if (client?.gstin) {
    y += 15;
    doc.text(`Client GSTIN: ${client.gstin}`, 40, y);
  }

  // Table Header
  y += 32;
  doc.setFillColor(241, 245, 249);
  doc.rect(40, y, pageWidth - 80, 24, 'F');
  doc.setTextColor(51, 65, 85);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('Description', 50, y + 16);
  doc.text('Qty', pageWidth - 220, y + 16, { align: 'right' });
  doc.text('Rate (INR)', pageWidth - 135, y + 16, { align: 'right' });
  doc.text('Amount (INR)', pageWidth - 50, y + 16, { align: 'right' });

  y += 38;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  for (const item of invoice.items) {
    const lineTotal = item.qty * item.rate;
    doc.text(item.description.slice(0, 56), 50, y);
    doc.text(String(item.qty), pageWidth - 220, y, { align: 'right' });
    doc.text(`Rs. ${formatNumberIN(item.rate)}`, pageWidth - 135, y, { align: 'right' });
    doc.text(`Rs. ${formatNumberIN(lineTotal)}`, pageWidth - 50, y, { align: 'right' });
    doc.setDrawColor(226, 232, 240);
    doc.line(40, y + 8, pageWidth - 40, y + 8);
    y += 26;
  }

  // Totals Block
  y += 12;
  const labelX = pageWidth - 190;
  const valX = pageWidth - 50;
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text('Subtotal', labelX, y);
  doc.text(`Rs. ${formatNumberIN(invoice.subtotal)}`, valX, y, { align: 'right' });
  y += 18;
  if (invoice.discount > 0) {
    doc.text('Discount', labelX, y);
    doc.text(`- Rs. ${formatNumberIN(invoice.discount)}`, valX, y, { align: 'right' });
    y += 18;
  }
  doc.text(`GST (${invoice.taxRate}%)`, labelX, y);
  doc.text(`Rs. ${formatNumberIN(invoice.taxAmount)}`, valX, y, { align: 'right' });
  y += 18;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('Total Invoice Amount', labelX, y);
  doc.text(`Rs. ${formatNumberIN(invoice.total)}`, valX, y, { align: 'right' });
  y += 18;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(22, 163, 74);
  doc.text('Amount Paid', labelX, y);
  doc.text(`Rs. ${formatNumberIN(invoice.amountPaid)}`, valX, y, { align: 'right' });
  y += 20;
  doc.setFillColor(254, 243, 199);
  doc.rect(labelX - 10, y - 14, valX - labelX + 20, 24, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(180, 83, 9);
  doc.text('Balance Due', labelX, y + 2);
  doc.text(`Rs. ${formatNumberIN(invoice.balance)}`, valX, y + 2, { align: 'right' });

  // Payment Methods & UPI QR Code
  const payY = Math.max(y + 50, 520);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Payment Details', 40, payY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  let infoY = payY + 18;
  if (seller?.upiId) {
    doc.text(`UPI ID: ${seller.upiId}`, 40, infoY);
    infoY += 15;
  }
  if (seller?.bankName) {
    doc.text(
      `Bank: ${seller.bankName} · A/C: ${seller.bankAccountNo} · IFSC: ${seller.bankIfsc}`,
      40,
      infoY
    );
    infoY += 15;
  }
  if (publicLink) {
    doc.text(`Pay Online: ${publicLink}`, 40, infoY);
    infoY += 15;
  }
  if (invoice.notes) {
    doc.text(`Notes: ${invoice.notes}`, 40, infoY);
  }

  if (seller?.upiId && invoice.balance > 0) {
    const upiStr = buildUpiUrl({
      upiId: seller.upiId,
      payeeName: seller.businessName,
      amount: invoice.balance,
      invoiceNo: invoice.invoiceNo,
    });
    const qrDataUrl = await QRCode.toDataURL(upiStr, { width: 140, margin: 1 });
    doc.addImage(qrDataUrl, 'PNG', pageWidth - 150, payY - 8, 105, 105);
    doc.setFontSize(8.5);
    doc.text('Scan with GPay / PhonePe / Paytm', pageWidth - 98, payY + 110, {
      align: 'center',
    });
  }

  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(seller?.signatureText || 'Thank you for your business!', 40, 790);

  doc.save(`${invoice.invoiceNo}.pdf`);
}

export function exportToCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const escape = (val: string | number) => {
    const str = String(val ?? '');
    if (/[",\n]/.test(str)) {
      return `"${str.replaceAll('"', '""')}"`;
    }
    return str;
  };
  const csv = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join(
    '\n'
  );
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportToExcelHtml(filename: string, title: string, headers: string[], rows: (string | number)[][]) {
  const escHtml = (v: string | number) =>
    String(v ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
      <head><meta charset="UTF-8" /></head>
      <body>
        <table>
          <tr><th colspan="${headers.length}">${escHtml(title)}</th></tr>
          <tr>${headers.map((h) => `<th>${escHtml(h)}</th>`).join('')}</tr>
          ${rows.map((r) => `<tr>${r.map((c) => `<td>${escHtml(c)}</td>`).join('')}</tr>`).join('')}
        </table>
      </body>
    </html>`;
  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportAgeingReportPdf(
  businessName: string,
  headers: string[],
  rows: (string | number)[][]
) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(`${businessName} — Outstanding & Ageing Report`, 40, 44);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(`Generated on ${formatDateIN(getTodayISTStr())} (INR)`, 40, 62);

  let y = 92;
  const colWidth = (doc.internal.pageSize.getWidth() - 80) / headers.length;
  doc.setFillColor(241, 245, 249);
  doc.rect(40, y - 14, doc.internal.pageSize.getWidth() - 80, 22, 'F');
  doc.setFont('helvetica', 'bold');
  headers.forEach((h, i) => {
    doc.text(String(h), 46 + i * colWidth, y);
  });

  y += 24;
  doc.setFont('helvetica', 'normal');
  rows.forEach((row) => {
    if (y > 540) {
      doc.addPage();
      y = 50;
    }
    row.forEach((cell, i) => {
      doc.text(String(cell).slice(0, 24), 46 + i * colWidth, y);
    });
    y += 20;
  });

  doc.save('ClientAlert-Outstanding-Ageing-Report.pdf');
}
