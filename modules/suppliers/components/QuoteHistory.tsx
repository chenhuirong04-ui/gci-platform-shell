import React, { useEffect, useState } from 'react';
import { supabase } from '../../../apps/shell/src/lib/supabase';

const NAVY = '#0B1F44';
const GOLD = '#C9A84C';
const BORDER = '#e2e8f0';
const T2 = '#374151';
const T3 = '#6b7280';

interface QuoteRow {
  id: string;
  quote_number?: string;
  subject?: string;
  status?: string;
  total_amount?: number;
  currency?: string;
  created_at?: string;
  valid_until?: string;
  supplier_match_status?: string;
}

interface Props { supplierId: string; }

export default function QuoteHistory({ supplierId }: Props) {
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('supplier_quotes')
        .select('id, quote_number, subject, status, total_amount, currency, created_at, valid_until, supplier_match_status')
        .eq('supplier_id', supplierId)
        .order('created_at', { ascending: false })
        .limit(50);
      setQuotes(data ?? []);
      setLoading(false);
    })();
  }, [supplierId]);

  const matchBadge = (s?: string) => {
    if (s === 'matched') return { bg: '#dcfce7', text: '#166534', label: '已匹配' };
    if (s === 'manually_skipped') return { bg: '#f1f5f9', text: '#64748b', label: '已跳过' };
    return { bg: '#fef9ec', text: '#92400e', label: '待确认' };
  };

  const handleUploadQuote = () => {
    // Navigate to trade module supplier-quote tab with supplier pre-selected
    window.location.href = `/trade?tab=quote&supplier_id=${supplierId}`;
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: 13, color: T2 }}>来自 Trade 模块与该供应商关联的报价记录</span>
        <button
          onClick={handleUploadQuote}
          style={{ padding: '7px 16px', background: NAVY, color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
        >
          + 上传供应商报价
        </button>
      </div>

      {loading ? (
        <div style={{ color: T3, textAlign: 'center', padding: 40 }}>加载中…</div>
      ) : quotes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <div style={{ color: T3, fontSize: 14, marginBottom: 12 }}>暂无关联报价记录</div>
          <button
            onClick={handleUploadQuote}
            style={{ padding: '9px 20px', background: GOLD, color: NAVY, border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
          >
            前往上传供应商报价
          </button>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${BORDER}` }}>
                {['报价单号', '主题', '状态', '金额', '有效期', '匹配状态', '日期'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontSize: 11, fontWeight: 700, color: T2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {quotes.map(q => {
                const mb = matchBadge(q.supplier_match_status);
                return (
                  <tr key={q.id} style={{ borderBottom: `1px solid ${BORDER}` }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}
                  >
                    <td style={{ padding: '10px', color: NAVY, fontWeight: 600 }}>{q.quote_number ?? '—'}</td>
                    <td style={{ padding: '10px', color: T2 }}>{q.subject ?? '—'}</td>
                    <td style={{ padding: '10px' }}>
                      <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 999, background: '#f1f5f9', color: T2, fontWeight: 600 }}>{q.status ?? '—'}</span>
                    </td>
                    <td style={{ padding: '10px', color: T2, fontWeight: 600 }}>
                      {q.total_amount != null ? `${q.total_amount.toLocaleString()} ${q.currency ?? 'USD'}` : '—'}
                    </td>
                    <td style={{ padding: '10px', color: T3 }}>{q.valid_until?.slice(0, 10) ?? '—'}</td>
                    <td style={{ padding: '10px' }}>
                      <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 999, background: mb.bg, color: mb.text, fontWeight: 700 }}>{mb.label}</span>
                    </td>
                    <td style={{ padding: '10px', color: T3 }}>{q.created_at ? q.created_at.slice(0, 10) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
