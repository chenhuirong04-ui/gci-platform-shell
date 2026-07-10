import React, { useState, useMemo } from 'react';
import type { ServiceQuote, BSLang } from '../types';
import { useT } from '../translations';
import { fmt } from '../lib/bsCalculations';

interface Props {
  lang: BSLang;
  quotes: ServiceQuote[];
  loading: boolean;
  onView: (q: ServiceQuote) => void;
  onEdit: (q: ServiceQuote) => void;
  onDelete: (id: string) => Promise<void>;
}

const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-500',
  FINAL: 'bg-blue-100 text-blue-700',
  SENT: 'bg-indigo-100 text-indigo-700',
  REVISION_REQUESTED: 'bg-yellow-100 text-yellow-700',
  ACCEPTED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-400',
  EXPIRED: 'bg-gray-200 text-gray-400',
  CANCELLED: 'bg-gray-100 text-gray-400',
};

export function ServiceQuoteHistory({ lang, quotes, loading, onView, onEdit, onDelete }: Props) {
  const t = useT(lang);
  const [search, setSearch] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!search) return quotes;
    const q = search.toLowerCase();
    return quotes.filter(x =>
      x.quote_no.toLowerCase().includes(q) ||
      x.customer_name.toLowerCase().includes(q) ||
      (x.quotation_title || '').toLowerCase().includes(q)
    );
  }, [quotes, search]);

  if (loading) {
    return <div className="flex items-center justify-center h-40 text-gray-400 text-sm">{t.labels.loading}</div>;
  }

  return (
    <div className="flex flex-col h-full text-sm">
      <div className="p-3 border-b border-gray-100 flex-shrink-0">
        <input
          className="border border-gray-200 rounded px-3 py-1.5 text-sm w-full max-w-xs focus:outline-none"
          placeholder={t.buttons.search + '…'}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="flex items-center justify-center h-32 text-gray-400">{t.empty.quotes}</div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left">
                <th className="px-3 py-2 text-xs text-gray-500 font-medium">{t.fields.quoteNo}</th>
                <th className="px-3 py-2 text-xs text-gray-500 font-medium">{t.fields.customerName}</th>
                <th className="px-3 py-2 text-xs text-gray-500 font-medium">{t.fields.quoteTitle}</th>
                <th className="px-3 py-2 text-xs text-gray-500 font-medium">{t.fields.quoteDate}</th>
                <th className="px-3 py-2 text-xs text-gray-500 font-medium">{t.fields.grandTotal}</th>
                <th className="px-3 py-2 text-xs text-gray-500 font-medium">{t.fields.status}</th>
                <th className="px-3 py-2 text-xs text-gray-500 font-medium w-28"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(q => (
                <tr key={q.id} className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer" onClick={() => onView(q)}>
                  <td className="px-3 py-2 font-mono text-xs text-gray-500">{q.quote_no}</td>
                  <td className="px-3 py-2 text-gray-800">{q.customer_name}</td>
                  <td className="px-3 py-2 text-gray-600 max-w-[180px] truncate">{q.quotation_title || '—'}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{q.quote_date}</td>
                  <td className="px-3 py-2 font-medium text-[#0c1b3a]">{fmt(q.grand_total || q.total_amount || 0, q.currency)}</td>
                  <td className="px-3 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLOR[q.status] || 'bg-gray-100 text-gray-500'}`}>
                      {t.quoteStatus[q.status] || q.status}
                    </span>
                  </td>
                  <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                    <div className="flex gap-1">
                      <button onClick={() => onEdit(q)} className="text-xs text-blue-600 hover:underline px-1">{t.buttons.editQuote}</button>
                      {confirmId === q.id ? (
                        <>
                          <button onClick={async () => { await onDelete(q.id!); setConfirmId(null); }} className="text-xs text-red-600 font-medium">{t.buttons.confirmDelete}</button>
                          <button onClick={() => setConfirmId(null)} className="text-xs text-gray-400">{t.buttons.cancel}</button>
                        </>
                      ) : (
                        <button onClick={() => setConfirmId(q.id!)} className="text-xs text-red-400 hover:underline px-1">{t.buttons.delete}</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
