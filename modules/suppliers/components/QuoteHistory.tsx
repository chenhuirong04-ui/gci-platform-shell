import React, { useEffect, useState } from 'react';
import { supabase } from '../../../apps/shell/src/lib/supabase';

const NAVY = '#0B1F44';
const BORDER = '#CBD5E1';
const T2 = '#475569';
const T3 = '#94a3b8';

interface QuoteRow {
  id: string;
  quote_number?: string;
  subject?: string;
  status?: string;
  total_amount?: number;
  currency?: string;
  created_at?: string;
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
        .select('id, quote_number, subject, status, total_amount, currency, created_at, supplier_match_status')
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

  return (
    <div>
      <div style={{ fontSize: 13, color: T2, marginBottom: 16 }}>来自 Trade 模块与该供应商关联的报价记录</div>

      {loading ? <div style={{ color: T3, textAlign: 'center', padding: 40 }}>加载中…</div>
       : quotes.length === 0 ? <div style={{ color: T3, textAlign: 'center', padding: 40 }}>暂无关联报价记录</div>
       : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${BORDER}` }}>
              {['报价单号', '主题', '状态', '金额', '匹配状态', '日期'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontSize: 11, fontWeight: 700, color: T2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {quotes.map(q => {
              const mb = matchBadge(q.supplier_match_status);
              return (
                <tr key={q.id} style={{ borderBottom: `1px solid ${BORDER}` }}>
                  <td style={{ padding: '10px', color: NAVY, fontWeight: 600 }}>{q.quote_number ?? '—'}</td>
                  <td style={{ padding: '10px', color: T2 }}>{q.subject ?? '—'}</td>
                  <td style={{ padding: '10px' }}>
                    <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 999, background: '#f1f5f9', color: T2, fontWeight: 600 }}>{q.status ?? '—'}</span>
                  </td>
                  <td style={{ padding: '10px', color: T2 }}>
                    {q.total_amount != null ? `${q.total_amount} ${q.currency ?? 'USD'}` : '—'}
                  </td>
                  <td style={{ padding: '10px' }}>
                    <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 999, background: mb.bg, color: mb.text, fontWeight: 700 }}>{mb.label}</span>
                  </td>
                  <td style={{ padding: '10px', color: T3 }}>{q.created_at ? q.created_at.slice(0, 10) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
