import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { BSLang } from '../types';
import {
  computeDisplayStatus, getDaysOverdue, getDaysUntilDue,
  computeReminderTrigger, REMINDER_LABEL, STATUS_DISPLAY,
  type DisplayStatus, type ReminderTrigger,
} from '../lib/overdueUtils';

// NOTE: urgentAlerts is computed purely from receivables at render time.
// No reminder records are persisted to the database in this module.

const GOLD = '#C9A84C';
const NAVY = '#0c1b3a';

interface FinReceivable {
  id: string;
  quote_id: string;
  customer_name: string;
  quote_no: string;
  currency: string;
  fee_type: 'ONE_TIME' | 'MONTHLY' | 'ANNUAL';
  service_summary: string;
  total_receivable: number;
  received_amount: number;
  outstanding_amount: number;
  payment_status: string;
  due_date?: string | null;
  source_module?: string;
}

interface FinReceivableRow extends FinReceivable {
  _row_id: string;
  _created_at: string;
  displayStatus: DisplayStatus;
  daysOverdue: number;
  daysUntilDue: number;
}

interface FinPayment {
  id: string;
  receivable_id: string;
  payment_date: string;
  amount: number;
  currency: string;
  account?: string;
  payment_method?: string;
}

interface Filters {
  dateFrom: string;
  dateTo: string;
  customer: string;
  currency: string;
  status: string;
  feeType: string;
  quoteNo: string;
}

const FEE_LABEL: Record<string, string> = { ONE_TIME: '一次性', MONTHLY: '月费', ANNUAL: '年费' };
const METHOD_LABEL: Record<string, string> = { BANK: '银行转账', CASH: '现金', CHEQUE: '支票', OTHER: '其他' };

function fmt(n: number, cur: string) {
  return `${cur} ${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="rounded-2xl p-4 border" style={{ borderColor: '#e8e0d0', background: '#fff' }}>
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div className="font-bold text-lg leading-tight" style={{ color: color || NAVY }}>{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

interface Props {
  lang: BSLang;
}

export function BSFinancialDashboard({ lang }: Props) {
  const isZh = lang === 'zh';

  const SUPA_URL = (import.meta as any).env.VITE_SUPABASE_URL as string;
  const SUPA_KEY = (import.meta as any).env.VITE_SUPABASE_ANON_KEY as string;
  const sbH = {
    apikey: SUPA_KEY,
    Authorization: `Bearer ${SUPA_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };

  const [subView, setSubView] = useState<'dashboard' | 'summary'>('dashboard');
  const [loading, setLoading] = useState(true);
  const [receivables, setReceivables] = useState<FinReceivableRow[]>([]);
  const [payments, setPayments] = useState<FinPayment[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Filters>({
    dateFrom: '', dateTo: '', customer: '', currency: '', status: '', feeType: '', quoteNo: '',
  });

  const sbFetch = useCallback(async (path: string) => {
    try {
      const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, { headers: sbH });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [rRows, pRows] = await Promise.all([
        sbFetch('service_receivables?select=id,created_at,payload&state=eq.active&payload->>source_module=eq.BUSINESS_SOLUTIONS&order=created_at.desc&limit=500'),
        sbFetch('service_payments?select=id,payload&state=eq.active&order=created_at.desc&limit=1000'),
      ]);

      if (rRows) {
        const mapped: FinReceivableRow[] = (rRows as { id: string; created_at: string; payload: FinReceivable }[]).map(r => {
          const p = r.payload;
          return {
            ...p,
            _row_id: r.id,
            _created_at: r.created_at,
            displayStatus: computeDisplayStatus(p.outstanding_amount, p.received_amount, p.due_date, p.payment_status),
            daysOverdue: getDaysOverdue(p.due_date),
            daysUntilDue: getDaysUntilDue(p.due_date),
          };
        });
        setReceivables(mapped);
      }

      if (pRows) {
        const mapped: FinPayment[] = (pRows as { id: string; payload: FinPayment }[]).map(r => r.payload);
        setPayments(mapped);
      }

    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Alerts: receivables that have an urgent reminder trigger right now
  const urgentAlerts = useMemo(() => {
    return receivables
      .filter(r => r.displayStatus !== 'PAID' && r.displayStatus !== 'CANCELLED')
      .map(r => {
        const trigger = computeReminderTrigger(r.outstanding_amount, r.due_date) as ReminderTrigger | null;
        if (!trigger) return null;
        const info = REMINDER_LABEL[trigger];
        if (!info.urgent) return null;
        return { receivable: r, trigger, info };
      })
      .filter(Boolean) as { receivable: FinReceivableRow; trigger: ReminderTrigger; info: typeof REMINDER_LABEL[ReminderTrigger] }[];
  }, [receivables]);

  // Filtered receivables for summary view
  const filtered = useMemo(() => {
    return receivables.filter(r => {
      if (filters.dateFrom && r.due_date && r.due_date < filters.dateFrom) return false;
      if (filters.dateTo && r.due_date && r.due_date > filters.dateTo) return false;
      if (filters.customer && !r.customer_name.toLowerCase().includes(filters.customer.toLowerCase())) return false;
      if (filters.currency && r.currency !== filters.currency) return false;
      if (filters.status && r.displayStatus !== filters.status) return false;
      if (filters.feeType && r.fee_type !== filters.feeType) return false;
      if (filters.quoteNo && !r.quote_no.toLowerCase().includes(filters.quoteNo.toLowerCase())) return false;
      return true;
    });
  }, [receivables, filters]);

  // Currency summary for dashboard
  const currencyGroups = useMemo(() => {
    const acc: Record<string, { total: number; received: number; outstanding: number; overdue: number; count: number }> = {};
    for (const r of receivables) {
      const c = r.currency || 'AED';
      if (!acc[c]) acc[c] = { total: 0, received: 0, outstanding: 0, overdue: 0, count: 0 };
      acc[c].total += r.total_receivable || 0;
      acc[c].received += r.received_amount || 0;
      acc[c].outstanding += r.outstanding_amount || 0;
      if (r.displayStatus === 'OVERDUE') acc[c].overdue += r.outstanding_amount || 0;
      acc[c].count++;
    }
    return acc;
  }, [receivables]);

  // Customer ranking by outstanding
  const customerRanking = useMemo(() => {
    const acc: Record<string, { name: string; outstanding: number; currency: string }> = {};
    for (const r of receivables) {
      if ((r.outstanding_amount || 0) <= 0.005) continue;
      const key = r.customer_name;
      if (!acc[key]) acc[key] = { name: key, outstanding: 0, currency: r.currency };
      acc[key].outstanding += r.outstanding_amount || 0;
    }
    return Object.values(acc).sort((a, b) => b.outstanding - a.outstanding).slice(0, 8);
  }, [receivables]);

  // Recent payments
  const recentPayments = useMemo(() => {
    return [...payments].sort((a, b) => b.payment_date.localeCompare(a.payment_date)).slice(0, 10);
  }, [payments]);

  // Upcoming dues (next 14 days, not paid/cancelled)
  const upcoming = useMemo(() => {
    return receivables
      .filter(r => {
        if (r.displayStatus === 'PAID' || r.displayStatus === 'CANCELLED') return false;
        const d = getDaysUntilDue(r.due_date);
        return d >= 0 && d <= 14;
      })
      .sort((a, b) => a.daysUntilDue - b.daysUntilDue)
      .slice(0, 10);
  }, [receivables]);

  const availableCurrencies = useMemo(() => [...new Set(receivables.map(r => r.currency).filter(Boolean))], [receivables]);
  const overdueList = useMemo(() => receivables.filter(r => r.displayStatus === 'OVERDUE').sort((a, b) => b.daysOverdue - a.daysOverdue), [receivables]);

  const clearFilters = () => setFilters({ dateFrom: '', dateTo: '', customer: '', currency: '', status: '', feeType: '', quoteNo: '' });
  const hasFilters = Object.values(filters).some(Boolean);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-gray-400">
        {isZh ? '加载财务数据…' : 'Loading financial data…'}
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: '#faf8f5' }}>
      {/* Sub-tabs */}
      <div className="flex items-center border-b bg-white px-5" style={{ borderColor: '#e8e0d0' }}>
        {(['dashboard', 'summary'] as const).map(v => (
          <button
            key={v}
            onClick={() => setSubView(v)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors mr-2 ${
              subView === v ? 'border-[#0c1b3a] text-[#0c1b3a]' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {v === 'dashboard' ? (isZh ? '经营看板' : 'Dashboard') : (isZh ? '财务汇总' : 'Summary')}
          </button>
        ))}
        <div className="flex-1" />
        <button onClick={loadData} className="text-xs text-gray-400 hover:text-gray-700 px-3 py-2">↺</button>
      </div>

      {/* Urgent alerts banner */}
      {urgentAlerts.length > 0 && (
        <div className="mx-5 mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <div className="text-xs font-bold text-red-700 mb-2">
            ⚠ {isZh ? `${urgentAlerts.length} 条逾期/即将到期提醒` : `${urgentAlerts.length} urgent alert(s)`}
          </div>
          <div className="space-y-1">
            {urgentAlerts.slice(0, 5).map(a => (
              <div key={`${a.receivable.id}-${a.trigger}`} className="text-xs text-red-600 flex gap-2">
                <span className="font-semibold">{a.receivable.customer_name}</span>
                <span>{a.receivable.quote_no}</span>
                <span>·</span>
                <span>{isZh ? a.info.zh : a.info.en}</span>
                <span>·</span>
                <span>{fmt(a.receivable.outstanding_amount, a.receivable.currency)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── DASHBOARD VIEW ────────────────────────────────────────────────── */}
      {subView === 'dashboard' && (
        <div className="p-5 space-y-5">
          {/* Currency stat cards */}
          {Object.entries(currencyGroups).map(([cur, g]) => (
            <div key={cur}>
              <div className="text-xs font-bold mb-3" style={{ color: GOLD, letterSpacing: '0.08em' }}>{cur}</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label={isZh ? '应收笔数' : 'Receivables'} value={g.count} />
                <StatCard label={isZh ? '总应收' : 'Total'} value={g.total.toLocaleString('en-US', { maximumFractionDigits: 0 })} color={NAVY} />
                <StatCard label={isZh ? '待收款' : 'Outstanding'} value={g.outstanding.toLocaleString('en-US', { maximumFractionDigits: 0 })} color={g.outstanding > 0 ? '#d97706' : '#16a34a'} />
                <StatCard label={isZh ? '已逾期' : 'Overdue'} value={g.overdue.toLocaleString('en-US', { maximumFractionDigits: 0 })} color={g.overdue > 0 ? '#dc2626' : '#16a34a'} />
              </div>
              {/* Collection ratio bar */}
              {g.total > 0 && (
                <div className="mt-2">
                  <div className="flex justify-between text-xs text-gray-400 mb-1">
                    <span>{isZh ? '收款进度' : 'Collection Rate'}</span>
                    <span>{((g.received / g.total) * 100).toFixed(1)}%</span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: '#e8e0d0' }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, (g.received / g.total) * 100)}%`, background: g.received >= g.total ? '#16a34a' : GOLD }} />
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Overdue list */}
          {overdueList.length > 0 && (
            <div>
              <div className="text-sm font-bold mb-3" style={{ color: NAVY }}>{isZh ? '逾期应收' : 'Overdue'} <span className="ml-1 text-xs font-normal text-red-500">({overdueList.length})</span></div>
              <div className="rounded-2xl overflow-hidden border" style={{ borderColor: '#e8e0d0', background: '#fff' }}>
                {overdueList.slice(0, 8).map((r, i) => (
                  <div key={r.id} className={`px-4 py-3 flex items-center gap-3 ${i > 0 ? 'border-t' : ''}`} style={{ borderColor: '#f0ede8' }}>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold truncate" style={{ color: NAVY }}>{r.customer_name}</div>
                      <div className="text-xs text-gray-400">{r.quote_no} · {r.due_date}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-bold" style={{ color: '#dc2626' }}>{fmt(r.outstanding_amount, r.currency)}</div>
                      <div className="text-xs text-red-400">{isZh ? `逾期${r.daysOverdue}天` : `${r.daysOverdue}d overdue`}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Upcoming dues */}
          {upcoming.length > 0 && (
            <div>
              <div className="text-sm font-bold mb-3" style={{ color: NAVY }}>{isZh ? '即将到期（14天内）' : 'Due in 14 Days'}</div>
              <div className="rounded-2xl overflow-hidden border" style={{ borderColor: '#e8e0d0', background: '#fff' }}>
                {upcoming.map((r, i) => (
                  <div key={r.id} className={`px-4 py-3 flex items-center gap-3 ${i > 0 ? 'border-t' : ''}`} style={{ borderColor: '#f0ede8' }}>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold truncate" style={{ color: NAVY }}>{r.customer_name}</div>
                      <div className="text-xs text-gray-400">{r.quote_no} · {r.due_date}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-bold" style={{ color: NAVY }}>{fmt(r.outstanding_amount, r.currency)}</div>
                      <div className="text-xs" style={{ color: r.daysUntilDue <= 3 ? '#dc2626' : '#d97706' }}>
                        {r.daysUntilDue === 0 ? (isZh ? '今日到期' : 'Due today') : (isZh ? `还有${r.daysUntilDue}天` : `In ${r.daysUntilDue}d`)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Customer ranking */}
          {customerRanking.length > 0 && (
            <div>
              <div className="text-sm font-bold mb-3" style={{ color: NAVY }}>{isZh ? '客户未收款排行' : 'Outstanding by Client'}</div>
              <div className="rounded-2xl overflow-hidden border" style={{ borderColor: '#e8e0d0', background: '#fff' }}>
                {customerRanking.map((c, i) => {
                  const maxOutstanding = customerRanking[0].outstanding;
                  const pct = maxOutstanding > 0 ? (c.outstanding / maxOutstanding) * 100 : 0;
                  return (
                    <div key={c.name} className={`px-4 py-3 ${i > 0 ? 'border-t' : ''}`} style={{ borderColor: '#f0ede8' }}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-medium truncate" style={{ color: NAVY }}>{c.name}</span>
                        <span className="text-xs font-bold ml-3 flex-shrink-0" style={{ color: '#d97706' }}>{fmt(c.outstanding, c.currency)}</span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#f0ede8' }}>
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: GOLD }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Recent payments */}
          {recentPayments.length > 0 && (
            <div>
              <div className="text-sm font-bold mb-3" style={{ color: NAVY }}>{isZh ? '最近收款记录' : 'Recent Payments'}</div>
              <div className="rounded-2xl overflow-hidden border" style={{ borderColor: '#e8e0d0', background: '#fff' }}>
                {recentPayments.map((p, i) => (
                  <div key={p.id} className={`px-4 py-3 flex items-center justify-between ${i > 0 ? 'border-t' : ''}`} style={{ borderColor: '#f0ede8' }}>
                    <div className="text-xs text-gray-500">{p.payment_date}</div>
                    <div className="text-xs text-gray-400">{METHOD_LABEL[p.payment_method || ''] || p.payment_method || '—'}</div>
                    <div className="text-xs font-bold" style={{ color: '#16a34a' }}>+{fmt(p.amount, p.currency)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {receivables.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-2">
              <div className="text-4xl">📊</div>
              <div className="text-sm text-gray-500">{isZh ? '暂无财务数据。请先在报价详情页生成应收记录。' : 'No financial data yet. Generate receivables from a quote detail page.'}</div>
            </div>
          )}
        </div>
      )}

      {/* ── SUMMARY VIEW ──────────────────────────────────────────────────── */}
      {subView === 'summary' && (
        <div className="p-5">
          {/* Filter bar */}
          <div className="mb-4">
            <div className="flex items-center gap-3 mb-3">
              <button
                onClick={() => setShowFilters(f => !f)}
                className="text-xs px-3 py-1.5 rounded-lg border font-medium"
                style={{ borderColor: GOLD, color: NAVY, background: hasFilters ? GOLD + '22' : '#fff' }}
              >
                {isZh ? `${hasFilters ? '✓ ' : ''}筛选` : `${hasFilters ? '✓ ' : ''}Filter`}
              </button>
              {hasFilters && (
                <button onClick={clearFilters} className="text-xs text-gray-400 hover:text-gray-600">
                  {isZh ? '清除筛选' : 'Clear'}
                </button>
              )}
              <span className="text-xs text-gray-400 ml-auto">
                {isZh ? `${filtered.length} 条记录` : `${filtered.length} records`}
              </span>
            </div>

            {showFilters && (
              <div className="rounded-xl border p-4 bg-white space-y-3" style={{ borderColor: '#e8e0d0' }}>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">{isZh ? '到期从' : 'Due From'}</label>
                    <input type="date" value={filters.dateFrom} onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))} className="w-full border rounded-lg px-2 py-1.5 text-xs" style={{ borderColor: '#d1c9b8' }} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">{isZh ? '到期至' : 'Due To'}</label>
                    <input type="date" value={filters.dateTo} onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))} className="w-full border rounded-lg px-2 py-1.5 text-xs" style={{ borderColor: '#d1c9b8' }} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">{isZh ? '客户' : 'Client'}</label>
                    <input value={filters.customer} onChange={e => setFilters(f => ({ ...f, customer: e.target.value }))} className="w-full border rounded-lg px-2 py-1.5 text-xs" style={{ borderColor: '#d1c9b8' }} placeholder={isZh ? '搜索客户名' : 'Search client'} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">{isZh ? '币种' : 'Currency'}</label>
                    <select value={filters.currency} onChange={e => setFilters(f => ({ ...f, currency: e.target.value }))} className="w-full border rounded-lg px-2 py-1.5 text-xs" style={{ borderColor: '#d1c9b8' }}>
                      <option value="">{isZh ? '全部' : 'All'}</option>
                      {availableCurrencies.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">{isZh ? '状态' : 'Status'}</label>
                    <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))} className="w-full border rounded-lg px-2 py-1.5 text-xs" style={{ borderColor: '#d1c9b8' }}>
                      <option value="">{isZh ? '全部' : 'All'}</option>
                      {Object.entries(STATUS_DISPLAY).map(([k, v]) => <option key={k} value={k}>{isZh ? v.zh : v.en}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">{isZh ? '费用类型' : 'Fee Type'}</label>
                    <select value={filters.feeType} onChange={e => setFilters(f => ({ ...f, feeType: e.target.value }))} className="w-full border rounded-lg px-2 py-1.5 text-xs" style={{ borderColor: '#d1c9b8' }}>
                      <option value="">{isZh ? '全部' : 'All'}</option>
                      <option value="ONE_TIME">{isZh ? '一次性' : 'One-time'}</option>
                      <option value="MONTHLY">{isZh ? '月费' : 'Monthly'}</option>
                      <option value="ANNUAL">{isZh ? '年费' : 'Annual'}</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">{isZh ? '报价单号' : 'Quote No.'}</label>
                  <input value={filters.quoteNo} onChange={e => setFilters(f => ({ ...f, quoteNo: e.target.value }))} className="w-full border rounded-lg px-2 py-1.5 text-xs" style={{ borderColor: '#d1c9b8' }} placeholder="FW-..." />
                </div>
              </div>
            )}
          </div>

          {/* Table */}
          <div className="rounded-2xl border overflow-hidden" style={{ borderColor: '#e8e0d0' }}>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: NAVY }}>
                    {[
                      isZh ? '客户' : 'Client',
                      isZh ? '报价单' : 'Quote',
                      isZh ? '类型' : 'Type',
                      isZh ? '服务' : 'Service',
                      isZh ? '应收' : 'Total',
                      isZh ? '已收' : 'Received',
                      isZh ? '未收' : 'Outstanding',
                      isZh ? '状态' : 'Status',
                      isZh ? '到期日' : 'Due',
                    ].map(h => (
                      <th key={h} className="text-left px-3 py-2.5 font-medium whitespace-nowrap" style={{ color: 'rgba(255,255,255,0.7)', borderBottom: `1px solid ${GOLD}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={9} className="text-center py-8 text-gray-400">{isZh ? '暂无记录' : 'No records'}</td></tr>
                  ) : filtered.map((r, i) => {
                    const sd = STATUS_DISPLAY[r.displayStatus];
                    return (
                      <tr key={r.id} className={i % 2 === 0 ? '' : ''} style={{ background: i % 2 === 0 ? '#fff' : '#faf8f5', borderBottom: '1px solid #f0ede8' }}>
                        <td className="px-3 py-2.5 font-medium truncate max-w-[120px]" style={{ color: NAVY }}>{r.customer_name}</td>
                        <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{r.quote_no}</td>
                        <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{FEE_LABEL[r.fee_type] || r.fee_type}</td>
                        <td className="px-3 py-2.5 text-gray-500 max-w-[150px] truncate">{r.service_summary}</td>
                        <td className="px-3 py-2.5 font-medium whitespace-nowrap" style={{ color: NAVY }}>{fmt(r.total_receivable, r.currency)}</td>
                        <td className="px-3 py-2.5 font-medium text-green-600 whitespace-nowrap">{fmt(r.received_amount, r.currency)}</td>
                        <td className="px-3 py-2.5 font-medium whitespace-nowrap" style={{ color: r.outstanding_amount > 0 ? '#d97706' : '#16a34a' }}>{fmt(r.outstanding_amount, r.currency)}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: sd.color + '18', color: sd.color }}>
                            {isZh ? sd.zh : sd.en}
                          </span>
                          {r.displayStatus === 'OVERDUE' && r.daysOverdue > 0 && (
                            <span className="ml-1 text-xs text-red-400">({r.daysOverdue}d)</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-gray-400">{r.due_date || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
