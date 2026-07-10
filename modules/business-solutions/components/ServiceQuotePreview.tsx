import React from 'react';
import type { ServiceQuote, ServiceQuoteLineItem, BSLang } from '../types';
import { useT } from '../translations';
import { calcQuoteTotals, fmt } from '../lib/bsCalculations';
import { generateServiceQuotePdf } from '../lib/bsQuotePdf';

interface Props {
  lang: BSLang;
  quote: ServiceQuote;
  items: ServiceQuoteLineItem[];
  onClose: () => void;
  onMarkSent?: () => void;
  onMarkAccepted?: () => void;
  onCopyAsNew?: () => void;
}

export function ServiceQuotePreview({ lang, quote, items, onClose, onMarkSent, onMarkAccepted, onCopyAsNew }: Props) {
  const t = useT(lang);
  const totals = calcQuoteTotals(items, quote.discount_type, quote.discount_value || 0);
  const cur = quote.currency;

  const handlePdf = async () => {
    await generateServiceQuotePdf(quote, items, lang);
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-gray-100 flex-shrink-0">
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-sm">← {t.buttons.back}</button>
        <div className="flex-1">
          <div className="font-semibold text-[#0c1b3a]">{quote.quote_no} {quote.quotation_title ? `· ${quote.quotation_title}` : ''}</div>
          <div className="text-xs text-gray-400">{quote.customer_name}</div>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full ${
          quote.status === 'ACCEPTED' ? 'bg-green-100 text-green-700' :
          quote.status === 'SENT' ? 'bg-blue-100 text-blue-700' :
          quote.status === 'DRAFT' ? 'bg-gray-100 text-gray-500' :
          'bg-yellow-100 text-yellow-700'
        }`}>{t.quoteStatus[quote.status] || quote.status}</span>
        <button onClick={handlePdf} className="bg-[#c9a84c] text-white rounded px-3 py-1.5 text-sm font-medium hover:bg-[#b8963e]">
          ↓ {t.buttons.downloadPdf}
        </button>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 px-4 py-2 border-b border-gray-100 flex-shrink-0 flex-wrap">
        {onMarkSent && quote.status !== 'SENT' && quote.status !== 'ACCEPTED' && (
          <button onClick={onMarkSent} className="text-xs border border-gray-200 rounded px-3 py-1.5 hover:bg-gray-50">{t.buttons.markSent}</button>
        )}
        {onMarkAccepted && quote.status !== 'ACCEPTED' && (
          <button onClick={onMarkAccepted} className="text-xs bg-green-600 text-white rounded px-3 py-1.5 hover:bg-green-700">{t.buttons.markAccepted}</button>
        )}
        {onCopyAsNew && (
          <button onClick={onCopyAsNew} className="text-xs border border-gray-200 rounded px-3 py-1.5 hover:bg-gray-50">{t.buttons.copyAsNewVersion}</button>
        )}
      </div>

      {/* Content — A4-style preview */}
      <div className="flex-1 overflow-auto p-4 bg-gray-100">
        <div className="max-w-3xl mx-auto bg-white shadow-sm rounded">
          {/* PDF-style header */}
          <div className="bg-[#0c1b3a] p-5 rounded-t">
            <div className="text-white font-bold text-base">{t.labels.companyHeader}</div>
            <div className="text-[#c9a84c] text-xs mt-1 uppercase tracking-widest">{t.labels.serviceQuotation}</div>
          </div>

          {/* Meta grid */}
          <div className="grid grid-cols-2 gap-6 p-5 border-b border-gray-100">
            <div className="space-y-2 text-sm">
              {[
                [t.fields.quoteNo, quote.quote_no],
                [t.fields.quoteDate, quote.quote_date],
                [t.fields.validUntil, quote.valid_until || '—'],
                [t.fields.currency, quote.currency],
              ].map(([k, v]) => (
                <div key={k} className="flex gap-3">
                  <span className="text-gray-400 text-xs w-24 flex-shrink-0 pt-0.5">{k}</span>
                  <span className="text-gray-800 font-medium">{v}</span>
                </div>
              ))}
            </div>
            <div className="space-y-2 text-sm">
              {[
                [t.fields.customerName, quote.customer_name],
                [t.fields.contactName, quote.contact_person || '—'],
                [t.fields.paymentTerms, quote.payment_terms || '—'],
                [t.fields.owner, quote.owner || '—'],
              ].map(([k, v]) => (
                <div key={k} className="flex gap-3">
                  <span className="text-gray-400 text-xs w-24 flex-shrink-0 pt-0.5">{k}</span>
                  <span className="text-gray-800 font-medium">{v}</span>
                </div>
              ))}
            </div>
          </div>

          {quote.quotation_title && (
            <div className="px-5 pt-4 text-base font-semibold text-[#0c1b3a]">{quote.quotation_title}</div>
          )}

          {/* Items table */}
          <div className="p-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#0c1b3a] text-white text-xs">
                  <th className="p-2 text-left w-6">#</th>
                  <th className="p-2 text-left">{t.fields.serviceName}</th>
                  <th className="p-2 text-left">{t.fields.description}</th>
                  <th className="p-2 text-right">{t.fields.oneTimeFee}</th>
                  <th className="p-2 text-right">{t.fields.monthlyFee}</th>
                  <th className="p-2 text-right">{t.fields.lineTotal}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={it.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="p-2 text-xs text-gray-400">{i + 1}</td>
                    <td className="p-2 font-medium text-gray-800">{it.service_name}</td>
                    <td className="p-2 text-xs text-gray-500 max-w-[200px]">
                      {[it.description, it.scope].filter(Boolean).join(' · ')}
                    </td>
                    <td className="p-2 text-right text-xs">{it.one_time_fee > 0 ? fmt(it.one_time_fee, '') : '—'}</td>
                    <td className="p-2 text-right text-xs">{it.monthly_fee > 0 ? fmt(it.monthly_fee, '') + '/mo' : '—'}</td>
                    <td className="p-2 text-right font-medium">{fmt(it.line_total, cur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="px-5 pb-4 flex justify-end">
            <div className="w-64 space-y-1 text-sm">
              {totals.subtotalOneTime > 0 && (
                <div className="flex justify-between text-gray-500">
                  <span>{t.fields.subtotalOneTime}</span>
                  <span>{fmt(totals.subtotalOneTime, cur)}</span>
                </div>
              )}
              {totals.subtotalMonthly > 0 && (
                <div className="flex justify-between text-gray-500">
                  <span>{t.fields.subtotalMonthly}</span>
                  <span>{fmt(totals.subtotalMonthly, cur)}</span>
                </div>
              )}
              {totals.subtotalAnnual > 0 && (
                <div className="flex justify-between text-gray-500">
                  <span>{t.fields.subtotalAnnual}</span>
                  <span>{fmt(totals.subtotalAnnual, cur)}</span>
                </div>
              )}
              {totals.discountAmount > 0 && (
                <div className="flex justify-between text-gray-500">
                  <span>{t.fields.discount}</span>
                  <span>-{fmt(totals.discountAmount, cur)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-gray-200 pt-2 font-bold text-base text-[#0c1b3a]">
                <span>{t.fields.grandTotal}</span>
                <span>{fmt(totals.grandTotal, cur)}</span>
              </div>
            </div>
          </div>

          {/* Notes / Terms */}
          {(quote.payment_terms || quote.delivery_period || quote.exclusions || quote.notes) && (
            <div className="px-5 pb-5 space-y-3 text-xs border-t border-gray-100 pt-4">
              {quote.payment_terms && (
                <div><span className="font-semibold text-[#0c1b3a] uppercase tracking-wide text-xs">{t.fields.paymentTerms}</span><p className="text-gray-600 mt-1">{quote.payment_terms}</p></div>
              )}
              {quote.delivery_period && (
                <div><span className="font-semibold text-[#0c1b3a] uppercase tracking-wide text-xs">{t.fields.deliveryPeriod}</span><p className="text-gray-600 mt-1">{quote.delivery_period}</p></div>
              )}
              {quote.exclusions && (
                <div><span className="font-semibold text-[#0c1b3a] uppercase tracking-wide text-xs">{t.fields.quoteExclusions}</span><p className="text-gray-600 mt-1">{quote.exclusions}</p></div>
              )}
              {quote.notes && (
                <div><span className="font-semibold text-[#0c1b3a] uppercase tracking-wide text-xs">{lang === 'zh' ? '备注' : 'Notes'}</span><p className="text-gray-600 mt-1">{quote.notes}</p></div>
              )}
            </div>
          )}

          {/* Footer bar */}
          <div className="bg-[#0c1b3a] p-3 rounded-b text-center">
            <span className="text-[#c9a84c] text-xs">globalcareinfo.com · chris@globalcareinfo.com · Dubai, UAE</span>
          </div>
        </div>
      </div>
    </div>
  );
}
