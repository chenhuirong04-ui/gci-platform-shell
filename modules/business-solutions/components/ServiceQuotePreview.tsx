import React, { useRef, useState } from 'react';
import type { ServiceQuote, ServiceQuoteLineItem, BSLang } from '../types';
import { useT } from '../translations';
import { calcQuoteTotals, fmt } from '../lib/bsCalculations';
import { ReceivablesPanel } from './ReceivablesPanel';

interface Props {
  lang: BSLang;
  quote: ServiceQuote;
  items: ServiceQuoteLineItem[];
  onClose: () => void;
  onEdit?: () => void;
  onMarkSent?: () => void;
  onMarkAccepted?: () => void;
  onCopyAsNew?: () => void;
  onToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

const GOLD = '#C9A84C';
const NAVY = '#0c1b3a';

export function ServiceQuotePreview({ lang, quote, items, onClose, onEdit, onMarkSent, onMarkAccepted, onCopyAsNew, onToast }: Props) {
  const t = useT(lang);
  const isZh = lang === 'zh';
  const totals = calcQuoteTotals(items, quote.discount_type, quote.discount_value || 0);
  const cur = quote.currency;
  const printRef = useRef<HTMLDivElement>(null);
  const [showReceivables, setShowReceivables] = useState(false);

  // ── PDF download via html2canvas ─────────────────────────────────────────
  const handlePdf = async () => {
    const el = printRef.current;
    if (!el) return;

    const html2canvas = (await import('html2canvas')).default;
    const { jsPDF } = await import('jspdf');

    const canvas = await html2canvas(el, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
    });

    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const pdfW = pdf.internal.pageSize.getWidth();
    const pdfH = pdf.internal.pageSize.getHeight();
    const pageHeightPx = Math.floor((pdfH * canvas.width) / pdfW);

    let yPx = 0;
    while (yPx < canvas.height) {
      if (yPx > 0) pdf.addPage();
      const sliceH = Math.min(pageHeightPx, canvas.height - yPx);
      const sliceCanvas = document.createElement('canvas');
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = sliceH;
      const ctx = sliceCanvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
      ctx.drawImage(canvas, 0, yPx, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
      const sliceHeightMm = (sliceH * pdfW) / canvas.width;
      pdf.addImage(sliceCanvas.toDataURL('image/png'), 'PNG', 0, 0, pdfW, sliceHeightMm);
      yPx += pageHeightPx;
    }

    const safeName = (quote.customer_name || 'Client')
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\s+/g, '-')
      .slice(0, 30);
    const suffix = isZh ? 'Service-Quotation' : 'Service-Quotation';
    pdf.save(`${quote.quote_no}-${safeName}-${suffix}.pdf`);
  };

  // ── Print ────────────────────────────────────────────────────────────────
  const handlePrint = () => {
    const el = printRef.current;
    if (!el) return;
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) return;
    win.document.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>${quote.quote_no} — ${quote.customer_name}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, 'Microsoft YaHei', 'PingFang SC', sans-serif; background: #fff; }
  table { border-collapse: collapse; width: 100%; }
  th, td { padding: 6px 8px; }
  @media print {
    @page { size: A4; margin: 10mm; }
    body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  }
</style>
</head>
<body>${el.innerHTML}</body>
</html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 400);
  };

  // ── Edit logic ───────────────────────────────────────────────────────────
  const handleEdit = () => {
    if (!onEdit) return;
    if (quote.status === 'SENT' || quote.status === 'ACCEPTED') {
      const msg = isZh
        ? '该报价已发送/接受，直接修改会覆盖记录。\n建议点击「复制新版本」创建新版本。\n\n确定仍要进入编辑模式？'
        : 'This quote has been sent/accepted. Editing will overwrite the record.\nConsider "Copy as New Version" instead.\n\nProceed to edit anyway?';
      if (!window.confirm(msg)) return;
    }
    onEdit();
  };

  const statusBadge = {
    ACCEPTED: 'bg-green-100 text-green-700',
    SENT:     'bg-blue-100 text-blue-700',
    DRAFT:    'bg-gray-100 text-gray-500',
    FINAL:    'bg-indigo-100 text-indigo-700',
  }[quote.status] || 'bg-yellow-100 text-yellow-700';

  return (
    <div className="flex flex-col h-full" style={{ background: '#f5f3ef' }}>

      {/* ── Top action bar ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-5 py-3 flex-shrink-0 flex-wrap" style={{ background: NAVY, borderBottom: `2px solid ${GOLD}` }}>
        {/* Back */}
        <button
          onClick={onClose}
          className="text-white/70 hover:text-white text-sm font-medium flex items-center gap-1 mr-2"
        >
          ← {t.buttons.back}
        </button>

        {/* Quote identity */}
        <div className="flex-1 min-w-0">
          <span className="text-white font-bold text-sm truncate block">
            {quote.quote_no}{quote.quotation_title ? ` · ${quote.quotation_title}` : ''}
          </span>
          <span className="text-white/50 text-xs">{quote.customer_name}</span>
        </div>

        {/* Status badge */}
        <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${statusBadge}`}>
          {t.quoteStatus[quote.status] || quote.status}
        </span>

        {/* ── Action buttons ── */}
        {onEdit && (
          <button
            onClick={handleEdit}
            className="text-sm px-3 py-1.5 rounded-lg font-semibold transition-all flex-shrink-0"
            style={{ background: 'rgba(255,255,255,0.12)', color: 'white', border: '1px solid rgba(255,255,255,0.25)' }}
          >
            {t.buttons.editQuote}
          </button>
        )}

        <button
          onClick={handlePrint}
          className="text-sm px-3 py-1.5 rounded-lg font-semibold transition-all flex-shrink-0"
          style={{ background: 'rgba(255,255,255,0.12)', color: 'white', border: '1px solid rgba(255,255,255,0.25)' }}
        >
          {t.buttons.print}
        </button>

        {/* Download PDF — primary CTA */}
        <button
          onClick={handlePdf}
          className="text-sm px-4 py-1.5 rounded-lg font-bold transition-all flex-shrink-0"
          style={{ background: GOLD, color: NAVY }}
        >
          ↓ {t.buttons.downloadPdf}
        </button>
      </div>

      {/* ── Secondary action bar ───────────────────────────────────────── */}
      <div className="flex gap-2 px-5 py-2.5 flex-shrink-0 flex-wrap" style={{ background: '#fff', borderBottom: '1px solid #e8e0d0' }}>
        {onMarkSent && quote.status !== 'SENT' && quote.status !== 'ACCEPTED' && (
          <button
            onClick={onMarkSent}
            className="text-xs border rounded-lg px-3 py-1.5 font-semibold hover:bg-gray-50 transition-all"
            style={{ borderColor: '#cbd5e1', color: '#334155' }}
          >
            ✓ {t.buttons.markSent}
          </button>
        )}
        {onMarkAccepted && quote.status !== 'ACCEPTED' && (
          <button
            onClick={onMarkAccepted}
            className="text-xs rounded-lg px-3 py-1.5 font-semibold transition-all"
            style={{ background: '#16a34a', color: 'white' }}
          >
            ✓ {t.buttons.markAccepted}
          </button>
        )}
        {onCopyAsNew && (
          <button
            onClick={onCopyAsNew}
            className="text-xs border rounded-lg px-3 py-1.5 font-semibold hover:bg-gray-50 transition-all"
            style={{ borderColor: '#cbd5e1', color: '#334155' }}
          >
            ⊕ {t.buttons.copyAsNewVersion}
          </button>
        )}
        {/* Receivables toggle */}
        <button
          onClick={() => setShowReceivables(v => !v)}
          className="text-xs rounded-lg px-3 py-1.5 font-semibold transition-all"
          style={showReceivables
            ? { background: NAVY, color: 'white' }
            : { background: '#f8fafc', color: NAVY, border: `1px solid ${NAVY}` }
          }
        >
          💰 {isZh ? '应收与收款' : 'Receivables'}
        </button>
        <div className="flex-1" />
        <span className="text-xs text-gray-400 self-center">
          {isZh ? 'v' : 'v'}{quote.version || 1}
          {quote.quote_date ? ` · ${quote.quote_date}` : ''}
        </span>
      </div>

      {/* ── Scrollable preview area ────────────────────────────────────── */}
      <div className="flex-1 overflow-auto py-6 px-4" style={{ background: '#f0ede8' }}>
        {/* Printable content — captured by html2canvas & print window */}
        <div
          ref={printRef}
          style={{
            maxWidth: 860,
            margin: '0 auto',
            background: '#fff',
            borderRadius: 12,
            boxShadow: '0 4px 32px rgba(12,27,58,0.13)',
            fontFamily: "Arial, 'Microsoft YaHei', 'PingFang SC', sans-serif",
            overflow: 'hidden',
          }}
        >
          {/* ── Top accent bar ── */}
          <div style={{ height: 6, background: `linear-gradient(90deg, ${NAVY} 0%, ${GOLD} 100%)` }} />

          {/* ── Letterhead ── */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '28px 36px 22px', borderBottom: '1px solid #e8e0d0' }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.22em', color: GOLD, textTransform: 'uppercase', marginBottom: 4 }}>GCI</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: NAVY, letterSpacing: '0.04em', textTransform: 'uppercase', lineHeight: 1.3 }}>
                GLOBALCARE INFO<br />GENERAL TRADING FZCO
              </div>
              <div style={{ marginTop: 8, fontSize: 12, color: '#8a7f72', lineHeight: 1.7 }}>
                Dubai, UAE<br />TEL: +971 58 556 6809<br />chris@globalcareinfo.com
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: NAVY, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 14 }}>
                {isZh ? '服务报价单' : 'SERVICE QUOTATION'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', columnGap: 16, rowGap: 6, fontSize: 13 }}>
                <span style={{ color: '#8a7f72', textAlign: 'right' }}>{isZh ? '报价编号' : 'Quote No.'}</span>
                <span style={{ fontWeight: 700, color: NAVY, fontFamily: 'monospace' }}>{quote.quote_no}</span>
                <span style={{ color: '#8a7f72', textAlign: 'right' }}>{isZh ? '版本' : 'Version'}</span>
                <span style={{ fontWeight: 700, color: NAVY }}>v{quote.version || 1}</span>
                <span style={{ color: '#8a7f72', textAlign: 'right' }}>{isZh ? '报价日期' : 'Date'}</span>
                <span style={{ fontWeight: 700, color: NAVY }}>{quote.quote_date}</span>
                {quote.valid_until && <>
                  <span style={{ color: '#8a7f72', textAlign: 'right' }}>{isZh ? '有效期至' : 'Valid Until'}</span>
                  <span style={{ fontWeight: 700, color: NAVY }}>{quote.valid_until}</span>
                </>}
                <span style={{ color: '#8a7f72', textAlign: 'right' }}>{isZh ? '币种' : 'Currency'}</span>
                <span style={{ fontWeight: 700, color: GOLD }}>{quote.currency}</span>
              </div>
            </div>
          </div>

          {/* ── Client info ── */}
          <div style={{ background: '#faf8f5', padding: '18px 36px', borderBottom: '1px solid #e8e0d0' }}>
            <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.18em', color: GOLD, textTransform: 'uppercase', marginBottom: 10 }}>
              {isZh ? '客户信息' : 'CLIENT INFORMATION'}
            </div>
            <div style={{ fontSize: 18, fontWeight: 900, color: NAVY, marginBottom: 4 }}>{quote.customer_name}</div>
            {quote.contact_person && (
              <div style={{ fontSize: 14, color: '#4a5568', marginBottom: 4 }}>👤 {quote.contact_person}</div>
            )}
            {quote.owner && (
              <div style={{ fontSize: 13, color: '#8a7f72' }}>{isZh ? '负责人：' : 'Owner: '}{quote.owner}</div>
            )}
          </div>

          {/* ── Subject line ── */}
          {quote.quotation_title && (
            <div style={{ padding: '12px 36px', borderBottom: '1px solid #e8e0d0', display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: '#8a7f72', textTransform: 'uppercase', letterSpacing: '0.12em', flexShrink: 0 }}>
                {isZh ? '主题' : 'SUBJECT'}
              </span>
              <span style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>{quote.quotation_title}</span>
            </div>
          )}

          {/* ── Service items table ── */}
          <div style={{ padding: '22px 36px 8px' }}>
            <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.18em', color: GOLD, textTransform: 'uppercase', marginBottom: 14 }}>
              {isZh ? '服务项目明细' : 'SERVICE ITEMS'}
            </div>
            {items.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', fontSize: 14, color: '#ccc', fontStyle: 'italic' }}>
                {isZh ? '暂无服务项目' : 'No service items'}
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${NAVY}` }}>
                    <th style={{ textAlign: 'center', paddingBottom: 10, paddingRight: 6, fontSize: 10, fontWeight: 800, color: NAVY, textTransform: 'uppercase', width: 28 }}>#</th>
                    <th style={{ textAlign: 'left', paddingBottom: 10, paddingRight: 8, fontSize: 10, fontWeight: 800, color: NAVY, textTransform: 'uppercase' }}>
                      {isZh ? '服务内容' : 'Service'}
                    </th>
                    <th style={{ textAlign: 'left', paddingBottom: 10, paddingRight: 8, fontSize: 10, fontWeight: 800, color: NAVY, textTransform: 'uppercase' }}>
                      {isZh ? '说明' : 'Description'}
                    </th>
                    <th style={{ textAlign: 'right', paddingBottom: 10, paddingRight: 6, fontSize: 10, fontWeight: 800, color: NAVY, textTransform: 'uppercase', width: 88 }}>
                      {isZh ? '一次性' : 'One-time'}
                    </th>
                    <th style={{ textAlign: 'right', paddingBottom: 10, paddingRight: 6, fontSize: 10, fontWeight: 800, color: NAVY, textTransform: 'uppercase', width: 80 }}>
                      {isZh ? '月费' : 'Monthly'}
                    </th>
                    <th style={{ textAlign: 'right', paddingBottom: 10, paddingRight: 6, fontSize: 10, fontWeight: 800, color: GOLD, textTransform: 'uppercase', width: 80 }}>
                      {isZh ? '年服务费' : 'Annual'}
                    </th>
                    <th style={{ textAlign: 'right', paddingBottom: 10, fontSize: 10, fontWeight: 800, color: NAVY, textTransform: 'uppercase', width: 90 }}>
                      {isZh ? '小计' : 'Subtotal'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => (
                    <tr key={it.id} style={{ background: i % 2 === 1 ? '#faf8f5' : 'transparent', borderBottom: '1px solid #e8e0d0' }}>
                      <td style={{ padding: '12px 6px 12px 2px', textAlign: 'center', fontSize: 12, color: '#8a7f72', fontWeight: 700 }}>{i + 1}</td>
                      <td style={{ padding: '12px 8px 12px 0', verticalAlign: 'top' }}>
                        <div style={{ fontWeight: 700, color: NAVY, fontSize: 14 }}>{it.service_name}</div>
                        {it.category_name && <div style={{ fontSize: 11, color: GOLD, fontWeight: 600, marginTop: 2 }}>{it.category_name}</div>}
                        {it.timeline && <div style={{ fontSize: 11, color: '#8a7f72', marginTop: 2 }}>{isZh ? '周期: ' : 'Timeline: '}{it.timeline}</div>}
                        {it.is_optional && <div style={{ fontSize: 11, color: '#9f7aea', fontWeight: 700, marginTop: 2 }}>{isZh ? '（可选）' : '(Optional)'}</div>}
                      </td>
                      <td style={{ padding: '12px 8px 12px 0', verticalAlign: 'top', fontSize: 12, color: '#4a5568', maxWidth: 180 }}>
                        {[it.description, it.scope].filter(Boolean).join('\n') || '—'}
                      </td>
                      <td style={{ padding: '12px 6px', textAlign: 'right', color: '#4a5568', fontFamily: 'monospace', fontSize: 13 }}>
                        {it.one_time_fee > 0 ? fmt(it.one_time_fee, '') : '—'}
                      </td>
                      <td style={{ padding: '12px 6px', textAlign: 'right', color: '#4a5568', fontFamily: 'monospace', fontSize: 13 }}>
                        {it.monthly_fee > 0 ? fmt(it.monthly_fee, '') : '—'}
                      </td>
                      <td style={{ padding: '12px 6px', textAlign: 'right', color: GOLD, fontFamily: 'monospace', fontSize: 13, fontWeight: 700 }}>
                        {it.annual_fee > 0 ? fmt(it.annual_fee, '') : '—'}
                      </td>
                      <td style={{ padding: '12px 0 12px 6px', textAlign: 'right', fontWeight: 800, color: NAVY, fontFamily: 'monospace', fontSize: 14 }}>
                        {it.line_total > 0 ? fmt(it.line_total, cur) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* ── Totals ── */}
          {items.length > 0 && (
            <div style={{ padding: '16px 36px 24px', borderTop: '1px solid #e8e0d0' }}>
              <div style={{ marginLeft: 'auto', maxWidth: 360, borderRadius: 12, border: '1px solid #e8e0d0', background: '#faf8f5', padding: '20px 24px' }}>
                {totals.subtotalOneTime > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '5px 0', color: '#4a5568' }}>
                    <span>{isZh ? '一次性费用小计' : 'One-time Subtotal'}</span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{fmt(totals.subtotalOneTime, cur)}</span>
                  </div>
                )}
                {totals.subtotalMonthly > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '5px 0', color: '#4a5568' }}>
                    <span>{isZh ? '月服务费（周期）' : 'Monthly Period Cost'}</span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{fmt(totals.subtotalMonthly, cur)}</span>
                  </div>
                )}
                {totals.subtotalAnnual > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '5px 0', color: GOLD }}>
                    <span style={{ fontWeight: 700 }}>{isZh ? '年服务费小计' : 'Annual Fee Subtotal'}</span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{fmt(totals.subtotalAnnual, cur)}</span>
                  </div>
                )}
                {totals.discountAmount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '5px 0', color: '#e53e3e' }}>
                    <span>{isZh ? '折扣' : 'Discount'}{quote.discount_type === 'percent' ? ` (${quote.discount_value}%)` : ''}</span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>-{fmt(totals.discountAmount, cur)}</span>
                  </div>
                )}
                {totals.vatAmount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '5px 0', color: '#4a5568' }}>
                    <span>VAT</span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>+{fmt(totals.vatAmount, cur)}</span>
                  </div>
                )}
                <div style={{ marginTop: 12, paddingTop: 14, borderTop: `2px solid ${NAVY}`, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {isZh ? '首年合同价值' : 'FIRST YEAR VALUE'}
                  </span>
                  <span style={{ fontSize: 26, fontWeight: 900, color: NAVY, fontFamily: 'monospace' }}>
                    {fmt(totals.firstYearValue, cur)}
                  </span>
                </div>
                {totals.monthlyRate > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 6, color: '#8a7f72' }}>
                    <span>{isZh ? '每月持续费用' : 'Monthly Recurring'}</span>
                    <span style={{ fontFamily: 'monospace' }}>{fmt(totals.monthlyRate, cur)}/{isZh ? '月' : 'mo'}</span>
                  </div>
                )}
                {totals.annualRate > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 4, color: GOLD }}>
                    <span>{isZh ? '每年续费' : 'Annual Recurring'}</span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{fmt(totals.annualRate, cur)}/{isZh ? '年' : 'yr'}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Commercial terms ── */}
          {(quote.payment_terms || quote.delivery_period || quote.exclusions || quote.notes) && (
            <div style={{ padding: '20px 36px 24px', borderTop: '1px solid #e8e0d0', background: '#faf8f5' }}>
              <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.18em', color: GOLD, textTransform: 'uppercase', marginBottom: 14 }}>
                {isZh ? '商务条款' : 'COMMERCIAL TERMS'}
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                {quote.payment_terms && (
                  <div style={{ display: 'flex', gap: 12, fontSize: 14 }}>
                    <span style={{ fontWeight: 800, color: NAVY, minWidth: 90, flexShrink: 0 }}>{isZh ? '付款方式' : 'Payment'}</span>
                    <span style={{ color: '#4a5568' }}>{quote.payment_terms}</span>
                  </div>
                )}
                {quote.delivery_period && (
                  <div style={{ display: 'flex', gap: 12, fontSize: 14 }}>
                    <span style={{ fontWeight: 800, color: NAVY, minWidth: 90, flexShrink: 0 }}>{isZh ? '项目周期' : 'Timeline'}</span>
                    <span style={{ color: '#4a5568' }}>{quote.delivery_period}</span>
                  </div>
                )}
                {quote.exclusions && (
                  <div style={{ display: 'flex', gap: 12, fontSize: 14 }}>
                    <span style={{ fontWeight: 800, color: NAVY, minWidth: 90, flexShrink: 0 }}>{isZh ? '不包含' : 'Exclusions'}</span>
                    <span style={{ color: '#4a5568' }}>{quote.exclusions}</span>
                  </div>
                )}
                {quote.notes && (
                  <div style={{ display: 'flex', gap: 12, fontSize: 14 }}>
                    <span style={{ fontWeight: 800, color: NAVY, minWidth: 90, flexShrink: 0 }}>{isZh ? '备注' : 'Notes'}</span>
                    <span style={{ color: '#4a5568' }}>{quote.notes}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Footer ── */}
          <div style={{ padding: '14px 36px', borderTop: '1px solid #e8e0d0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: NAVY }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              GLOBALCARE INFO GENERAL TRADING FZCO · DUBAI · UAE
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: GOLD, letterSpacing: '0.1em' }}>globalcareinfo.com</div>
          </div>
        </div>

        {/* ── Bottom duplicate action bar ──────────────────────────────── */}
        <div className="flex gap-3 justify-center mt-6 pb-4">
          <button
            onClick={handlePrint}
            className="text-sm px-5 py-2.5 rounded-xl font-semibold transition-all"
            style={{ background: '#fff', color: NAVY, border: `1px solid #cbd5e1`, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}
          >
            {t.buttons.print}
          </button>
          <button
            onClick={handlePdf}
            className="text-sm px-6 py-2.5 rounded-xl font-bold transition-all"
            style={{ background: GOLD, color: NAVY, boxShadow: '0 2px 8px rgba(201,168,76,0.3)' }}
          >
            ↓ {t.buttons.downloadPdf}
          </button>
        </div>

        {/* ── Receivables & Payments panel ─────────────────────────── */}
        {showReceivables && (
          <ReceivablesPanel
            lang={lang}
            quote={quote}
            onToast={onToast ?? (() => {})}
          />
        )}
      </div>
    </div>
  );
}
