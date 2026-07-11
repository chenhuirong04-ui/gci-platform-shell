import React, { useState, useEffect, useCallback } from 'react';
import type { BSLang, ServiceQuote } from '../types';
import { PaymentModal } from './PaymentModal';
import type { ReceivableRecord } from './PaymentModal';
import { BSReceivableRefPanel } from './BSReceivableRefPanel';
import { computeDisplayStatus, getDaysOverdue, STATUS_DISPLAY } from '../lib/overdueUtils';

interface PaymentRecord {
  id: string;
  receivable_id: string;
  payment_date: string;
  amount: number;
  currency: string;
  account: string;
  payment_method: string;
  bank_reference: string;
  notes: string;
  created_at: string;
}

interface Props {
  lang: BSLang;
  quote: ServiceQuote;
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

const GOLD = '#C9A84C';
const NAVY = '#0c1b3a';
const ALLOWED_STATUSES = new Set(['ACCEPTED', 'IN_PROGRESS', 'CONTRACT_SIGNED', 'CONTRACT_PENDING', 'MONTHLY_SERVICE']);

function fmt(n: number, cur: string) {
  return `${cur} ${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}


const FEE_TYPE_LABEL: Record<string, { zh: string; en: string }> = {
  ONE_TIME: { zh: '一次性费用', en: 'One-time Fee' },
  MONTHLY:  { zh: '月费',       en: 'Monthly Fee'  },
  ANNUAL:   { zh: '年费',       en: 'Annual Fee'   },
};

const METHOD_LABEL: Record<string, string> = {
  BANK: '银行转账', CASH: '现金', CHEQUE: '支票', OTHER: '其他',
};

export function ReceivablesPanel({ lang, quote, onToast }: Props) {
  const isZh = lang === 'zh';
  const [receivables, setReceivables] = useState<ReceivableRecord[]>([]);
  const [payments, setPayments] = useState<Record<string, PaymentRecord[]>>({});
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [loadingRecv, setLoadingRecv] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [payingRecv, setPayingRecv] = useState<ReceivableRecord | null>(null);

  const SUPA_URL = (import.meta as any).env.VITE_SUPABASE_URL as string;
  const SUPA_KEY = (import.meta as any).env.VITE_SUPABASE_ANON_KEY as string;
  const sbHeaders = { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' };

  const fetchReceivables = useCallback(async () => {
    if (!quote.id) return;
    setLoadingRecv(true);
    try {
      const res = await fetch(
        `${SUPA_URL}/rest/v1/service_receivables?select=id,payload&state=eq.active&payload->>quote_id=eq.${encodeURIComponent(quote.id)}&order=created_at.asc`,
        { headers: sbHeaders }
      );
      if (!res.ok) return;
      const rows: { id: string; payload: ReceivableRecord }[] = await res.json();
      setReceivables(rows.map(r => r.payload));
    } finally {
      setLoadingRecv(false);
    }
  }, [quote.id]);

  const fetchPaymentsForReceivable = useCallback(async (receivableId: string) => {
    const res = await fetch(
      `${SUPA_URL}/rest/v1/service_payments?select=id,payload&state=eq.active&payload->>receivable_id=eq.${encodeURIComponent(receivableId)}&order=created_at.asc`,
      { headers: sbHeaders }
    );
    if (!res.ok) return;
    const rows: { id: string; payload: PaymentRecord }[] = await res.json();
    setPayments(prev => ({ ...prev, [receivableId]: rows.map(r => r.payload) }));
  }, []);

  useEffect(() => { fetchReceivables(); }, [fetchReceivables]);

  const handleToggleExpand = async (id: string) => {
    const next = new Set(expandedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
      if (!payments[id]) await fetchPaymentsForReceivable(id);
    }
    setExpandedIds(next);
  };

  const handleGenerate = async () => {
    if (!quote.id || !quote.customer_id) return;
    setGenerating(true);
    try {
      const res = await fetch('/api/bs/service-receivable-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quote_id: quote.id, customer_id: quote.customer_id }),
      });
      const data = await res.json();
      if (!data.ok) {
        onToast(isZh ? '生成失败，请检查报价状态' : 'Failed to generate receivables', 'error');
        return;
      }
      const created: number = data.created_receivables?.length ?? 0;
      const skipped: number = data.skipped_duplicates?.length ?? 0;
      if (created === 0 && skipped > 0) {
        onToast(isZh ? `所有应收已存在，跳过 ${skipped} 项` : `All receivables already exist (${skipped} skipped)`, 'info');
      } else {
        onToast(
          isZh
            ? `成功生成 ${created} 条应收${skipped > 0 ? `，跳过 ${skipped} 条已有记录` : ''}`
            : `Created ${created} receivable(s)${skipped > 0 ? `, skipped ${skipped}` : ''}`,
          'success'
        );
      }
      await fetchReceivables();
    } catch {
      onToast(isZh ? '网络错误' : 'Network error', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handlePaymentSuccess = async (receivableId: string) => {
    setPayingRecv(null);
    onToast(isZh ? '收款已登记' : 'Payment registered', 'success');
    await fetchReceivables();
    await fetchPaymentsForReceivable(receivableId);
  };

  // ── Determine generate-button state ────────────────────────────────────────
  const canGenerate = ALLOWED_STATUSES.has(quote.status as string);
  const allPaid = receivables.length > 0 && receivables.every(r =>
    computeDisplayStatus(r.outstanding_amount, r.received_amount, r.due_date, r.payment_status) === 'PAID'
  );

  // ── Multi-currency summary ──────────────────────────────────────────────────
  const summary = receivables.reduce<Record<string, { total: number; received: number; outstanding: number; pending: number; partial: number; paid: number }>>((acc, r) => {
    const cur = r.currency || 'AED';
    if (!acc[cur]) acc[cur] = { total: 0, received: 0, outstanding: 0, pending: 0, partial: 0, paid: 0 };
    acc[cur].total += Number(r.total_receivable) || 0;
    acc[cur].received += Number(r.received_amount) || 0;
    acc[cur].outstanding += Number(r.outstanding_amount) || 0;
    if (r.payment_status === 'PENDING')  acc[cur].pending++;
    if (r.payment_status === 'PARTIAL')  acc[cur].partial++;
    if (r.payment_status === 'PAID')     acc[cur].paid++;
    return acc;
  }, {});

  const currencies = Object.keys(summary);

  return (
    <div className="mt-6 mx-4 mb-6 rounded-2xl overflow-hidden border" style={{ borderColor: '#e8e0d0' }}>
      {/* Panel header */}
      <div className="flex items-center justify-between px-5 py-3.5" style={{ background: NAVY, borderBottom: `2px solid ${GOLD}` }}>
        <div>
          <div className="text-white font-bold text-sm">{isZh ? '应收与收款' : 'Receivables & Payments'}</div>
          {receivables.length > 0 && (
            <div className="text-white/50 text-xs mt-0.5">{receivables.length} {isZh ? '条应收记录' : 'receivable(s)'}</div>
          )}
        </div>

        {/* Generate button */}
        {allPaid ? (
          <span className="text-xs px-3 py-1.5 rounded-full font-semibold" style={{ background: '#dcfce7', color: '#16a34a' }}>
            ✓ {isZh ? '应收已全部收清' : 'All Received'}
          </span>
        ) : !canGenerate ? (
          <span
            className="text-xs px-3 py-1.5 rounded-full font-medium cursor-not-allowed"
            style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)' }}
            title={isZh ? '报价尚未确认，不能生成应收' : 'Quote not yet accepted'}
          >
            {isZh ? '生成应收（不可用）' : 'Generate (Unavailable)'}
          </span>
        ) : (
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="text-sm px-4 py-1.5 rounded-lg font-bold transition-all"
            style={{ background: generating ? 'rgba(255,255,255,0.1)' : GOLD, color: generating ? 'rgba(255,255,255,0.4)' : NAVY }}
          >
            {generating ? (isZh ? '生成中…' : 'Generating…') : (isZh ? '＋ 生成应收' : '＋ Generate')}
          </button>
        )}
      </div>

      {/* Multi-currency summary cards */}
      {currencies.length > 0 && (
        <div className="px-5 py-4 border-b" style={{ background: '#faf8f5', borderColor: '#e8e0d0' }}>
          <div className={`grid gap-4 ${currencies.length > 1 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
            {currencies.map(cur => {
              const s = summary[cur];
              return (
                <div key={cur} className="rounded-xl border p-4" style={{ borderColor: '#e8e0d0', background: '#fff' }}>
                  <div className="text-xs font-bold mb-3" style={{ color: GOLD, letterSpacing: '0.08em' }}>{cur}</div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <div className="text-xs text-gray-400 mb-0.5">{isZh ? '总应收' : 'Total'}</div>
                      <div className="font-bold text-sm" style={{ color: NAVY }}>{s.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400 mb-0.5">{isZh ? '已收款' : 'Received'}</div>
                      <div className="font-bold text-sm text-green-600">{s.received.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400 mb-0.5">{isZh ? '未收款' : 'Outstanding'}</div>
                      <div className="font-bold text-sm" style={{ color: s.outstanding > 0 ? '#d97706' : '#16a34a' }}>
                        {s.outstanding.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-3 mt-3 text-xs text-gray-500">
                    {s.pending > 0  && <span>{isZh ? `待收 ${s.pending}` : `${s.pending} pending`}</span>}
                    {s.partial > 0  && <span style={{ color: '#d97706' }}>{isZh ? `部分 ${s.partial}` : `${s.partial} partial`}</span>}
                    {s.paid > 0     && <span style={{ color: '#16a34a' }}>{isZh ? `已清 ${s.paid}` : `${s.paid} paid`}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Receivables list */}
      <div style={{ background: '#fff' }}>
        {loadingRecv ? (
          <div className="flex items-center justify-center py-10 text-sm text-gray-400">
            {isZh ? '加载中…' : 'Loading…'}
          </div>
        ) : receivables.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
            <div className="text-3xl">💰</div>
            <div className="text-sm text-gray-500">
              {canGenerate
                ? (isZh ? '点击「生成应收」按钮创建应收记录' : 'Click "Generate" to create receivable records')
                : (isZh ? '报价确认后可生成应收记录' : 'Receivables can be generated after the quote is accepted')}
            </div>
          </div>
        ) : (
          receivables.map((recv, idx) => {
            const displayStatus = computeDisplayStatus(recv.outstanding_amount, recv.received_amount, recv.due_date, recv.payment_status);
            const statusInfo = STATUS_DISPLAY[displayStatus];
            const daysOverdue = getDaysOverdue(recv.due_date);
            const feeLabel = FEE_TYPE_LABEL[recv.fee_type] || { zh: recv.fee_type, en: recv.fee_type };
            const expanded = expandedIds.has(recv.id);
            const recvPayments = payments[recv.id] || [];

            return (
              <div key={recv.id} className={idx > 0 ? 'border-t' : ''} style={{ borderColor: '#f0ede8' }}>
                {/* Receivable row */}
                <div className="px-5 py-4">
                  <div className="flex items-start gap-3 flex-wrap">
                    {/* Left: fee type + summary */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: '#f0ede8', color: NAVY }}>
                          {isZh ? feeLabel.zh : feeLabel.en}
                        </span>
                        <span
                          className="text-xs font-semibold px-2 py-0.5 rounded-full"
                          style={{ background: statusInfo.color + '18', color: statusInfo.color }}
                        >
                          {isZh ? statusInfo.zh : statusInfo.en}
                        </span>
                        {displayStatus === 'OVERDUE' && daysOverdue > 0 && (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: '#fef2f2', color: '#dc2626' }}>
                            {isZh ? `逾期${daysOverdue}天` : `${daysOverdue}d overdue`}
                          </span>
                        )}
                        {recv.due_date && (
                          <span className="text-xs text-gray-400">
                            {isZh ? '到期：' : 'Due: '}{recv.due_date}
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-700 mt-1.5 font-medium">{recv.service_summary}</div>
                    </div>

                    {/* Right: amounts */}
                    <div className="text-right flex-shrink-0">
                      <div className="text-xs text-gray-400">{isZh ? '应收' : 'Receivable'}</div>
                      <div className="font-bold text-base" style={{ color: NAVY }}>{fmt(recv.total_receivable, recv.currency)}</div>
                      {recv.received_amount > 0 && (
                        <div className="text-xs text-green-600 mt-0.5">
                          {isZh ? '已收 ' : 'Paid '}{fmt(recv.received_amount, recv.currency)}
                        </div>
                      )}
                      {recv.outstanding_amount > 0 && (
                        <div className="text-xs mt-0.5" style={{ color: '#d97706' }}>
                          {isZh ? '未收 ' : 'Outstanding '}{fmt(recv.outstanding_amount, recv.currency)}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Progress bar */}
                  {recv.total_receivable > 0 && (
                    <div className="mt-3 h-1.5 rounded-full overflow-hidden" style={{ background: '#f0ede8' }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(100, (recv.received_amount / recv.total_receivable) * 100)}%`,
                          background: recv.payment_status === 'PAID' ? '#16a34a' : GOLD,
                        }}
                      />
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-3 mt-3">
                    {displayStatus !== 'PAID' && displayStatus !== 'CANCELLED' && (
                      <button
                        onClick={() => setPayingRecv(recv)}
                        className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-all"
                        style={{ background: NAVY, color: 'white' }}
                      >
                        {isZh ? '登记收款' : 'Register Payment'}
                      </button>
                    )}
                    <button
                      onClick={() => handleToggleExpand(recv.id)}
                      className="text-xs text-gray-400 hover:text-gray-600"
                    >
                      {expanded
                        ? (isZh ? '▲ 收起付款记录' : '▲ Hide payments')
                        : (isZh ? `▼ 查看付款记录${recvPayments.length > 0 ? `（${recvPayments.length}）` : ''}` : `▼ Show payments${recvPayments.length > 0 ? ` (${recvPayments.length})` : ''}`)}
                    </button>
                  </div>
                </div>

                {/* Payment records + Invoice panel */}
                {expanded && (
                  <div className="px-5 pb-4">
                    <div className="rounded-xl overflow-hidden border" style={{ borderColor: '#e8e0d0' }}>
                      {recvPayments.length === 0 ? (
                        <div className="text-xs text-gray-400 text-center py-4">{isZh ? '暂无付款记录' : 'No payments yet'}</div>
                      ) : (
                        <table className="w-full text-xs">
                          <thead>
                            <tr style={{ background: '#faf8f5', borderBottom: '1px solid #e8e0d0' }}>
                              <th className="text-left px-3 py-2 text-gray-500 font-medium">{isZh ? '日期' : 'Date'}</th>
                              <th className="text-right px-3 py-2 text-gray-500 font-medium">{isZh ? '金额' : 'Amount'}</th>
                              <th className="text-left px-3 py-2 text-gray-500 font-medium hidden sm:table-cell">{isZh ? '方式' : 'Method'}</th>
                              <th className="text-left px-3 py-2 text-gray-500 font-medium hidden sm:table-cell">{isZh ? '账户' : 'Account'}</th>
                              <th className="text-left px-3 py-2 text-gray-500 font-medium">{isZh ? '备注' : 'Notes'}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {recvPayments.map(p => (
                              <tr key={p.id} className="border-t" style={{ borderColor: '#f0ede8' }}>
                                <td className="px-3 py-2 text-gray-700">{p.payment_date}</td>
                                <td className="px-3 py-2 text-right font-semibold" style={{ color: '#16a34a' }}>
                                  +{fmt(p.amount, p.currency)}
                                </td>
                                <td className="px-3 py-2 text-gray-500 hidden sm:table-cell">
                                  {METHOD_LABEL[p.payment_method] || p.payment_method}
                                </td>
                                <td className="px-3 py-2 text-gray-500 hidden sm:table-cell">{p.account}</td>
                                <td className="px-3 py-2 text-gray-400">{p.notes || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                    <BSReceivableRefPanel
                      lang={lang}
                      receivableId={recv.id}
                      quoteId={recv.quote_id}
                      customerId={recv.customer_id}
                      customerName={recv.customer_name}
                      onToast={onToast}
                    />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Payment modal */}
      {payingRecv && (
        <PaymentModal
          lang={lang}
          receivable={payingRecv}
          onClose={() => setPayingRecv(null)}
          onSuccess={() => handlePaymentSuccess(payingRecv.id)}
        />
      )}
    </div>
  );
}
