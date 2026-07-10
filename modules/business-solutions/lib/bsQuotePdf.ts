import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { ServiceQuote, ServiceQuoteLineItem, BSLang } from '../types';
import { bsT } from '../translations';
import { fmt, calcQuoteTotals } from './bsCalculations';

export async function generateServiceQuotePdf(
  quote: ServiceQuote,
  items: ServiceQuoteLineItem[],
  lang: BSLang,
): Promise<void> {
  const t = bsT[lang];
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const NAVY = [12, 27, 58] as [number, number, number];
  const GOLD = [201, 168, 76] as [number, number, number];
  const W = 210;

  // Header
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, W, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(t.labels.companyHeader, 14, 12);
  doc.setTextColor(...GOLD);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(t.labels.serviceQuotation, 14, 20);

  // Quote meta info
  doc.setTextColor(40, 40, 40);
  doc.setFontSize(9);
  const metaY = 36;
  const col1 = 14, col2 = 110;

  const metaLeft = [
    [t.fields.quoteNo, quote.quote_no],
    [t.fields.quoteDate, quote.quote_date],
    [t.fields.validUntil, quote.valid_until || '—'],
    [t.fields.currency, quote.currency],
  ];
  const metaRight = [
    [t.fields.customerName, quote.customer_name],
    [t.fields.contactName, quote.contact_person || '—'],
    [t.fields.paymentTerms, quote.payment_terms || '—'],
    [t.fields.owner, quote.owner || '—'],
  ];

  metaLeft.forEach(([label, val], i) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text(label.toUpperCase(), col1, metaY + i * 7);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(30, 30, 30);
    doc.text(String(val), col1, metaY + i * 7 + 4);
  });
  metaRight.forEach(([label, val], i) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text(label.toUpperCase(), col2, metaY + i * 7);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(30, 30, 30);
    doc.text(String(val), col2, metaY + i * 7 + 4);
  });

  if (quote.quotation_title) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...NAVY);
    doc.text(quote.quotation_title, col1, metaY + 4 * 7 + 4);
  }

  // Items table
  const tableStartY = metaY + 4 * 7 + (quote.quotation_title ? 16 : 8);

  const isZh = lang === 'zh';
  const head = [[
    '#',
    t.fields.serviceName,
    isZh ? '说明/范围' : 'Description / Scope',
    t.fields.billing_type ?? t.billingType.fixed,
    t.fields.quantity,
    isZh ? '单价/月费' : 'Price',
    t.fields.lineTotal,
  ]];

  const body = items.map((it, i) => {
    const desc = [it.description, it.scope].filter(Boolean).join('\n');
    const priceStr = it.monthly_fee > 0 ? fmt(it.monthly_fee, '') + '/mo' : fmt(it.one_time_fee, '');
    return [
      String(i + 1),
      it.service_name,
      desc || '—',
      t.billingType[it.billing_type] || it.billing_type,
      `${it.quantity} ${it.unit}`,
      priceStr,
      fmt(it.line_total, quote.currency),
    ];
  });

  autoTable(doc, {
    startY: tableStartY,
    head,
    body,
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8, cellPadding: 3 },
    alternateRowStyles: { fillColor: [248, 249, 252] },
    columnStyles: {
      0: { cellWidth: 8 },
      1: { cellWidth: 35 },
      2: { cellWidth: 60 },
      3: { cellWidth: 22 },
      4: { cellWidth: 16 },
      5: { cellWidth: 24 },
      6: { cellWidth: 25 },
    },
    margin: { left: 14, right: 14 },
  });

  const afterTable = (doc as any).lastAutoTable.finalY + 6;

  // Totals
  const totals = calcQuoteTotals(
    items,
    quote.discount_type as any,
    quote.discount_value || 0,
  );
  const cur = quote.currency;

  const totalsData: [string, string][] = [];
  if (totals.subtotalOneTime > 0) totalsData.push([t.fields.subtotalOneTime, fmt(totals.subtotalOneTime, cur)]);
  if (totals.subtotalMonthly > 0) totalsData.push([t.fields.subtotalMonthly, fmt(totals.subtotalMonthly, cur)]);
  if (totals.subtotalAnnual > 0) totalsData.push([t.fields.subtotalAnnual, fmt(totals.subtotalAnnual, cur)]);
  if (totals.discountAmount > 0) totalsData.push([t.fields.discount, `-${fmt(totals.discountAmount, cur)}`]);
  totalsData.push([t.fields.grandTotal, fmt(totals.grandTotal, cur)]);

  autoTable(doc, {
    startY: afterTable,
    body: totalsData,
    showHead: false,
    bodyStyles: { fontSize: 9 },
    columnStyles: {
      0: { fontStyle: 'bold', halign: 'right', cellWidth: 160 },
      1: { halign: 'right', cellWidth: 26 },
    },
    didParseCell(data) {
      if (data.row.index === totalsData.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.textColor = NAVY;
        data.cell.styles.fontSize = 11;
      }
    },
    margin: { left: 14, right: 14 },
  });

  const afterTotals = (doc as any).lastAutoTable.finalY + 8;

  // Notes / Payment Terms / Exclusions
  let noteY = afterTotals;
  const addSection = (label: string, text: string) => {
    if (!text) return;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...NAVY);
    doc.text(label, 14, noteY);
    noteY += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(60, 60, 60);
    const lines = doc.splitTextToSize(text, W - 28);
    doc.text(lines, 14, noteY);
    noteY += lines.length * 5 + 4;
  };

  addSection(t.fields.paymentTerms, quote.payment_terms || '');
  addSection(t.fields.deliveryPeriod, quote.delivery_period || '');
  addSection(t.fields.quoteExclusions, quote.exclusions || '');
  addSection(isZh ? '备注' : 'Notes', quote.notes || '');

  // Footer
  const pageH = doc.internal.pageSize.getHeight();
  doc.setFillColor(...NAVY);
  doc.rect(0, pageH - 12, W, 12, 'F');
  doc.setTextColor(...GOLD);
  doc.setFontSize(7);
  doc.text('globalcareinfo.com  ·  chris@globalcareinfo.com  ·  Dubai, UAE', W / 2, pageH - 5, { align: 'center' });

  doc.save(`${quote.quote_no}_v${quote.version || 1}.pdf`);
}
