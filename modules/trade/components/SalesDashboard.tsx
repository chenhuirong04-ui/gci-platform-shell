import React, { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp, Users, Package, AlertTriangle,
  RefreshCw, Clock, BarChart3, CheckCircle,
  PieChart, DollarSign, Hash, Layers, CalendarDays, ChevronDown, ChevronRight
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid,
} from 'recharts';
import type { OrderRecord, OrderItemRecord, PaymentRecord } from '../types';
import { roundTo2 } from '../services/currencyUtils';
import { persistence } from '../services/persistenceService';
import { isRevenueOrder, availableYears, buildAnnualView } from '../services/annualDashboard';
import { colors, workspace } from '@gci/design-system';

const GOLD = colors.goldBase;
const NAVY = colors.bgBase;

console.log('[TRADE DASHBOARD BUILD]', 'sales-dashboard-v2');

const fmt = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const readLS = (k: string): any[] => {
  try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch { return []; }
};

// ─── Main Component ────────────────────────────────────────────────────────────

const SalesDashboard: React.FC = () => {
  const [orders,      setOrders]      = useState<OrderRecord[]>([]);
  const [orderItems,  setOrderItems]  = useState<OrderItemRecord[]>([]);
  const [consign,     setConsign]     = useState<any[]>([]);
  const [payments,    setPayments]    = useState<PaymentRecord[]>([]);
  const [year,        setYear]        = useState<number>(new Date().getFullYear());
  const [openMonth,   setOpenMonth]   = useState<number | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const load = async () => {
    setLoading(true);
    try {
      const [o, oi, p] = await Promise.all([
        persistence.getOrders(),
        persistence.getOrderItems(),
        persistence.getPayments().catch(() => [] as PaymentRecord[]),
      ]);
      setOrders(Array.isArray(o) ? o : []);
      setOrderItems(Array.isArray(oi) ? oi : []);
      setPayments(Array.isArray(p) ? p : []);
      setConsign(readLS('icare_consignment'));
      setLastRefresh(new Date());
    } catch {
      setOrders([]);
      setOrderItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Exclude adjustments, voided orders, and consignment from revenue calculations
  // (rule shared with the annual view: services/annualDashboard.ts isRevenueOrder)
  const normalOrders = useMemo(() => orders.filter(isRevenueOrder), [orders]);

  // ── Annual view (year selector, 4 totals, 1–12 trend, month detail) ──────
  const years  = useMemo(() => availableYears(orders, new Date().getFullYear(), payments), [orders, payments]);
  const annual = useMemo(() => buildAnnualView(orders, payments, year), [orders, payments, year]);

  const todayStr     = new Date().toISOString().split('T')[0];
  const thisMonthKey = todayStr.substring(0, 7);

  const thisMonthOrders = useMemo(
    () => normalOrders.filter(o =>
      (o.createdAt || (o as any).created_at || '').substring(0, 7) === thisMonthKey
    ),
    [normalOrders, thisMonthKey]
  );

  // ── KPIs ───────────────────────────────────────────────────────────────────
  const kpi = useMemo(() => ({
    monthRevenue:   roundTo2(thisMonthOrders.reduce((s, o) => s + (Number(o.grandTotal)        || 0), 0)),
    monthPaid:      roundTo2(thisMonthOrders.reduce((s, o) => s + (Number(o.paidAmount)        || 0), 0)),
    allOutstanding: roundTo2(normalOrders.reduce  ((s, o) => s + (Number(o.outstandingAmount) || 0), 0)),
    monthOrders:    thisMonthOrders.length,
  }), [thisMonthOrders, normalOrders]);

  // ── Monthly Breakdown ──────────────────────────────────────────────────────
  const breakdown = useMemo(() => {
    const directAmt  = roundTo2(thisMonthOrders.filter(o => (o as any).transactionMode !== 'Consignment').reduce((s, o) => s + (Number(o.grandTotal) || 0), 0));
    const consignAmt = roundTo2(thisMonthOrders.filter(o => (o as any).transactionMode === 'Consignment').reduce((s, o) => s + (Number(o.grandTotal) || 0), 0));
    const unpaid     = roundTo2(kpi.monthRevenue - kpi.monthPaid);
    const overdueAmt = roundTo2(
      normalOrders
        .filter(o => {
          const due = (o.dueDate || '').replace(/\//g, '-').trim();
          return due && due < todayStr && (Number(o.outstandingAmount) || 0) > 0;
        })
        .reduce((s, o) => s + (Number(o.outstandingAmount) || 0), 0)
    );
    return { directAmt, consignAmt, collected: kpi.monthPaid, unpaid, overdueAmt };
  }, [thisMonthOrders, kpi, normalOrders, todayStr]);

  // ── Sales Channel Mix ──────────────────────────────────────────────────────
  // Only transactionMode is available — Consignment vs Other (channel field not yet recorded)
  const channelMix = useMemo(() => {
    let cTotal = 0, cCount = 0, oTotal = 0, oCount = 0;
    normalOrders.forEach(o => {
      const amt = Number(o.grandTotal) || 0;
      if ((o as any).transactionMode === 'Consignment') { cTotal = roundTo2(cTotal + amt); cCount++; }
      else                                               { oTotal = roundTo2(oTotal + amt); oCount++; }
    });
    const grand = roundTo2(cTotal + oTotal);
    return {
      consign: { total: cTotal, count: cCount, pct: grand > 0 ? Math.round(cTotal / grand * 100) : 0 },
      other:   { total: oTotal, count: oCount, pct: grand > 0 ? Math.round(oTotal / grand * 100) : 0 },
      grand,
    };
  }, [normalOrders]);

  // ── Top 10 Customers ───────────────────────────────────────────────────────
  const topCustomers = useMemo(() => {
    const map = new Map<string, { name: string; total: number; count: number }>();
    normalOrders.forEach(o => {
      const name = (o.customerName || 'Unknown').trim();
      const prev = map.get(name) || { name, total: 0, count: 0 };
      map.set(name, { name, total: roundTo2(prev.total + (Number(o.grandTotal) || 0)), count: prev.count + 1 });
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 10);
  }, [normalOrders]);

  const maxCust = useMemo(() => Math.max(...topCustomers.map(c => c.total), 1), [topCustomers]);

  // ── Top 10 Products ────────────────────────────────────────────────────────
  const topProducts = useMemo(() => {
    const consignOrderIds = new Set(
      orders.filter(o => (o as any).transactionMode === 'Consignment').map(o => o.id)
    );
    const map = new Map<string, { name: string; total: number; qty: number }>();
    orderItems.forEach(item => {
      const key = (item.desc || '').substring(0, 25).trim().toUpperCase();
      if (!key) return;
      const name = (item.desc || 'Unknown').substring(0, 45);
      const prev = map.get(key) || { name, total: 0, qty: 0 };
      const rawLine = Number(item.lineTotal) || 0;
      const vatLine = consignOrderIds.has(item.orderId) ? roundTo2(rawLine * 1.05) : rawLine;
      map.set(key, { name: prev.name, total: roundTo2(prev.total + vatLine), qty: prev.qty + (Number(item.qty) || 0) });
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 10);
  }, [orderItems, orders]);

  const maxProd = useMemo(() => Math.max(...topProducts.map(p => p.total), 1), [topProducts]);

  // ── Overdue AR ─────────────────────────────────────────────────────────────
  const overdueList = useMemo(() => {
    return normalOrders
      .filter(o => {
        const due = (o.dueDate || '').replace(/\//g, '-').trim();
        return due && due < todayStr && (Number(o.outstandingAmount) || 0) > 0;
      })
      .map(o => {
        const due = (o.dueDate || '').replace(/\//g, '-');
        const diffDays = Math.floor((Date.now() - new Date(due).getTime()) / 86_400_000);
        return { ...o, diffDays };
      })
      .sort((a, b) => b.diffDays - a.diffDays);
  }, [normalOrders, todayStr]);

  // ── Customer Outstanding Ranking ───────────────────────────────────────────
  const custOutstanding = useMemo(() => {
    const map = new Map<string, { name: string; outstanding: number; count: number }>();
    normalOrders.forEach(o => {
      const amt = Number(o.outstandingAmount) || 0;
      if (amt <= 0) return;
      const name = (o.customerName || 'Unknown').trim();
      const prev = map.get(name) || { name, outstanding: 0, count: 0 };
      map.set(name, { name, outstanding: roundTo2(prev.outstanding + amt), count: prev.count + 1 });
    });
    return Array.from(map.values()).sort((a, b) => b.outstanding - a.outstanding).slice(0, 10);
  }, [normalOrders]);

  const maxOut = useMemo(() => Math.max(...custOutstanding.map(c => c.outstanding), 1), [custOutstanding]);

  // ── Sales Mode Performance ─────────────────────────────────────────────────
  const modePerf = useMemo(() => {
    let dTotal = 0, dCount = 0, cTotal = 0, cCount = 0;
    normalOrders.forEach(o => {
      const amt = Number(o.grandTotal) || 0;
      if ((o as any).transactionMode === 'Consignment') { cTotal = roundTo2(cTotal + amt); cCount++; }
      else                                               { dTotal = roundTo2(dTotal + amt); dCount++; }
    });
    const grand = roundTo2(dTotal + cTotal);
    // Consignment ledger from localStorage (read-only, existing structure)
    const ledgerTotal    = roundTo2(consign.reduce((s, c) => s + ((Number(c.consignQty) || 0) * (Number(c.unitPrice) || 0)), 0));
    const ledgerSettled  = roundTo2(consign.reduce((s, c) => s + (Number(c.settledAmount) || 0), 0));
    const ledgerUnsettled = roundTo2(ledgerTotal - ledgerSettled);
    return {
      direct:  { total: dTotal, count: dCount, pct: grand > 0 ? Math.round(dTotal / grand * 100) : 0 },
      consign: { total: cTotal, count: cCount, pct: grand > 0 ? Math.round(cTotal / grand * 100) : 0 },
      grand,
      ledger: { total: ledgerTotal, settled: ledgerSettled, unsettled: ledgerUnsettled, count: consign.length },
    };
  }, [normalOrders, consign]);

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center space-y-4">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto" style={{ color: workspace.accentText }} />
          <p className="text-xs font-bold text-slate-600">Loading Dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold " style={{ color: NAVY }}>经营看板</h2>
          <p className="text-xs text-slate-600 font-bold mt-0.5 ">
            Business Analytics · v2 · {lastRefresh.toLocaleTimeString()}
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-md text-xs font-bold text-slate-600 hover:text-slate-700 hover:border-slate-300 transition-all shadow-sm"
        >
          <RefreshCw className="w-3.5 h-3.5" />刷新数据
        </button>
      </div>

      {/* ══ Row 1 — KPI Cards (4) ════════════════════════════════════════ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="本月营业额"   sub="REVENUE THIS MONTH"   value={`AED ${fmt(kpi.monthRevenue)}`}   icon={<TrendingUp  className="w-5 h-5" />} c="indigo"  />
        <KpiCard label="本月已收款"   sub="COLLECTED THIS MONTH" value={`AED ${fmt(kpi.monthPaid)}`}      icon={<CheckCircle className="w-5 h-5" />} c="emerald" />
        <KpiCard label="应收账款总额" sub="TOTAL OUTSTANDING"    value={`AED ${fmt(kpi.allOutstanding)}`} icon={<AlertTriangle className="w-5 h-5" />}
          c={kpi.allOutstanding > 0 ? 'amber' : 'emerald'} />
        <KpiCard label="本月订单数"   sub="ORDERS THIS MONTH"    value={`${kpi.monthOrders} 单`}          icon={<Hash        className="w-5 h-5" />} c="violet"  />
      </div>

      {/* ══ Row 2 — 本月经营拆解 ════════════════════════════════════════ */}
      <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
        <SecHead icon={<Layers className="w-4 h-4" />} title="本月经营拆解" sub="MONTHLY BUSINESS BREAKDOWN" />
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <BreakCard label="Direct Sale"  sub="本月直销"   value={`AED ${fmt(breakdown.directAmt)}`}
            pct={kpi.monthRevenue > 0 ? breakdown.directAmt  / kpi.monthRevenue : 0} barClass="bg-[#080D1E]" />
          <BreakCard label="Consignment"  sub="本月寄售"   value={`AED ${fmt(breakdown.consignAmt)}`}
            pct={kpi.monthRevenue > 0 ? breakdown.consignAmt / kpi.monthRevenue : 0} barClass="bg-slate-400" />
          <BreakCard label="已收款"       sub="COLLECTED"  value={`AED ${fmt(breakdown.collected)}`}
            pct={kpi.monthRevenue > 0 ? breakdown.collected  / kpi.monthRevenue : 0} barClass="bg-[#6FBF8E]" />
          <BreakCard label="未收款"       sub="UNCOLLECTED" value={`AED ${fmt(breakdown.unpaid)}`}
            pct={kpi.monthRevenue > 0 ? breakdown.unpaid     / kpi.monthRevenue : 0} barClass="bg-[#D4A843]" />
          <BreakCard label="逾期应收"     sub="OVERDUE AR"  value={`AED ${fmt(breakdown.overdueAmt)}`}
            pct={kpi.allOutstanding > 0 ? breakdown.overdueAmt / kpi.allOutstanding : 0}
            barClass="bg-[#E0846A]" alert={breakdown.overdueAmt > 0} />
        </div>
      </div>

      {/* ══ Annual — 全年经营 (year selector · 4 totals · 1–12 trend · month detail) ══ */}
      <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
        <div className="bg-gray-50 border-b border-gray-100 px-5 py-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div style={{ color: GOLD }}><CalendarDays className="w-4 h-4" /></div>
            <div>
              <div className="text-base font-bold" style={{ color: '#374151' }}>全年经营 · {year}</div>
              <div className="text-xs font-bold text-slate-600 mt-0.5">ANNUAL OVERVIEW · 1–12 月</div>
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
            年份
            <select
              value={year}
              onChange={e => { setYear(Number(e.target.value)); setOpenMonth(null); }}
              className="px-3 py-1.5 bg-white border border-gray-200 rounded-md text-sm font-bold text-gray-700"
              aria-label="选择年份"
            >
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
        </div>

        <div className="p-5 space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard label="全年营业额"   sub={`REVENUE ${year}`}   value={`AED ${fmt(annual.totals.revenue)}`}   icon={<TrendingUp  className="w-5 h-5" />} c="indigo"  />
            <KpiCard label="全年已收款"   sub={`COLLECTED ${year}`} value={`AED ${fmt(annual.totals.collected)}`} icon={<CheckCircle className="w-5 h-5" />} c="emerald" />
            <KpiCard label="当前应收余额" sub="OUTSTANDING NOW"     value={`AED ${fmt(kpi.allOutstanding)}`}       icon={<AlertTriangle className="w-5 h-5" />}
              c={kpi.allOutstanding > 0 ? 'amber' : 'emerald'} />
            <KpiCard label="全年订单数"   sub={`ORDERS ${year}`}    value={`${annual.totals.orderCount} 单`}      icon={<Hash        className="w-5 h-5" />} c="violet"  />
          </div>

          <div>
            <div className="text-sm font-bold text-gray-700 mb-2">月度趋势 · 营业额 vs 已收款 (AED)</div>
            <div className="h-64" data-testid="annual-trend">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={annual.months.map(m => ({ label: `${m.month}月`, 营业额: m.revenue, 已收款: m.collected }))}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#475569' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#475569' }} axisLine={false} tickLine={false} width={56}
                    tickFormatter={(v: number) => (Math.abs(v) >= 1000 ? `${roundTo2(v / 1000)}k` : String(v))} />
                  <Tooltip formatter={(v: any) => `AED ${fmt(Number(v) || 0)}`} cursor={{ fill: 'rgba(160,127,60,0.08)' }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="营业额" fill={NAVY} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="已收款" fill="#6FBF8E" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="annual-months">
              <thead>
                <tr className="text-xs font-bold text-slate-600 border-b border-gray-100">
                  <th className="text-left py-2 pr-2">月份</th>
                  <th className="text-right py-2 px-2">营业额</th>
                  <th className="text-right py-2 px-2">已收款</th>
                  <th className="text-right py-2 px-2">未收款</th>
                  <th className="text-right py-2 px-2">订单数</th>
                  <th className="text-right py-2 pl-2">明细</th>
                </tr>
              </thead>
              <tbody>
                {annual.months.map(m => (
                  <React.Fragment key={m.key}>
                    <tr className="border-b border-gray-50">
                      <td className="py-2 pr-2 font-bold text-gray-700">{m.month} 月</td>
                      <td className="py-2 px-2 text-right font-mono-label">{fmt(m.revenue)}</td>
                      <td className="py-2 px-2 text-right font-mono-label text-[#2d5c40]">{fmt(m.collected)}</td>
                      <td className="py-2 px-2 text-right font-mono-label text-[#A85D45]">{fmt(m.outstanding)}</td>
                      <td className="py-2 px-2 text-right">{m.orderCount}</td>
                      <td className="py-2 pl-2 text-right">
                        {m.orderCount > 0 || m.payments.length > 0 ? (
                          <button
                            onClick={() => setOpenMonth(openMonth === m.month ? null : m.month)}
                            className="inline-flex items-center gap-1 text-xs font-bold text-[#7A5F2A] hover:underline"
                          >
                            {openMonth === m.month ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                            查看
                          </button>
                        ) : <span className="text-xs text-slate-400">—</span>}
                      </td>
                    </tr>
                    {openMonth === m.month && (
                      <tr>
                        <td colSpan={6} className="bg-gray-50 p-4">
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <div>
                              <div className="text-xs font-bold text-slate-600 mb-2">订单明细（按下单日期）· {m.orderCount} 单</div>
                              {m.orderCount === 0 && (
                                <div className="text-xs text-slate-500 bg-white border border-gray-100 rounded-md px-3 py-2">本月无新订单</div>
                              )}
                              <div className="space-y-1.5">
                                {m.orders.map(o => (
                                  <div key={o.id} className="flex justify-between gap-3 bg-white border border-gray-100 rounded-md px-3 py-2">
                                    <div className="min-w-0">
                                      <div className="text-xs font-bold font-mono-label text-gray-700">{o.id}</div>
                                      <div className="text-xs text-slate-600 truncate">
                                        {(o.createdAt || '').substring(0, 10)} · {o.customerName || '—'} · {o.status}
                                      </div>
                                    </div>
                                    <div className="text-right shrink-0 text-xs font-mono-label">
                                      <div className="font-bold text-[#080D1E]">AED {fmt(Number(o.grandTotal) || 0)}</div>
                                      <div className="text-[#2d5c40]">已收 {fmt(Number(o.paidAmount) || 0)}</div>
                                      {(Number(o.outstandingAmount) || 0) > 0 && (
                                        <div className="text-[#A85D45]">未收 {fmt(Number(o.outstandingAmount) || 0)}</div>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs font-bold text-slate-600 mb-2">收款明细（按付款日期）· {m.payments.length} 笔</div>
                              {m.payments.length === 0 ? (
                                <div className="text-xs text-slate-500 bg-white border border-gray-100 rounded-md px-3 py-2">本月无收款记录</div>
                              ) : (
                                <div className="space-y-1.5">
                                  {m.payments.map(p => (
                                    <div key={p.id} className="flex justify-between gap-3 bg-white border border-gray-100 rounded-md px-3 py-2">
                                      <div className="min-w-0">
                                        <div className="text-xs font-bold text-gray-700">{(p.date || '').substring(0, 10)} · {p.method}</div>
                                        <div className="text-xs text-slate-600 font-mono-label truncate">{p.orderId}</div>
                                      </div>
                                      <div className="text-xs font-bold font-mono-label text-[#2d5c40] shrink-0">AED {fmt(Number(p.amount) || 0)}</div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
                <tr className="font-bold">
                  <td className="py-2 pr-2 text-gray-700">合计</td>
                  <td className="py-2 px-2 text-right font-mono-label">{fmt(annual.totals.revenue)}</td>
                  <td className="py-2 px-2 text-right font-mono-label text-[#2d5c40]">{fmt(annual.totals.collected)}</td>
                  <td className="py-2 px-2 text-right font-mono-label text-[#A85D45]">{fmt(roundTo2(annual.months.reduce((s, m) => s + m.outstanding, 0)))}</td>
                  <td className="py-2 px-2 text-right">{annual.totals.orderCount}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>

          <p className="text-xs text-slate-600 font-semibold leading-relaxed">
            ℹ 营业额 / 未收款 / 订单数：按订单创建月份归集（与本月指标一致）；不含寄售、调整单、已作废订单。
            已收款：按收款记录的实际付款日期归集，只计上述订单的收款，每笔只计一次；全年已收款 = 1–12 月合计。
            当前应收余额 = 全部订单未收款（不限年份）。无业务的月份显示 0。
          </p>
          {annual.excludedPayments.count > 0 && (
            <p className="text-xs text-slate-500 font-semibold" data-testid="annual-excluded-payments">
              另有 {annual.excludedPayments.count} 笔 {year} 年收款记录（AED {fmt(annual.excludedPayments.amount)}）属于已作废 / 寄售 / 调整单或找不到对应订单，未计入已收款。
            </p>
          )}
        </div>
      </div>

      {/* ══ Row 3 — 销售渠道占比 ════════════════════════════════════════ */}
      <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
        <SecHead icon={<PieChart className="w-4 h-4" />} title="销售渠道占比" sub="SALES CHANNEL MIX · BY SALES AMOUNT" />
        <div className="p-6 space-y-5">
          <ChannelBar
            label="Consignment / 寄售" count={channelMix.consign.count}
            total={channelMix.consign.total} pct={channelMix.consign.pct}
            barClass="bg-slate-400" dotClass="bg-slate-400"
          />
          <ChannelBar
            label="Direct / Other" subTag="渠道待录入" count={channelMix.other.count}
            total={channelMix.other.total} pct={channelMix.other.pct}
            barClass="bg-[#080D1E]" dotClass="bg-[#080D1E]"
          />
          <div className="pt-4 border-t border-gray-100 flex justify-between items-center">
            <span className="text-xs font-bold text-slate-600">合计 · All Orders</span>
            <span className="text-xl font-bold font-mono-label text-[#080D1E]">AED {fmt(channelMix.grand)}</span>
          </div>
          <p className="text-xs text-slate-600 font-semibold leading-relaxed">
            ℹ 当前订单未设 salesChannel 字段。Consignment 按 transactionMode 识别，其余统一归为 Other。
            录入渠道字段后（超市 / 批发商 / 电商 / 项目客户等）将自动细分。
          </p>
        </div>
      </div>

      {/* ══ Row 4 — 客户 + 产品排行 ══════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        <div className="bg-white rounded-[10px] shadow-sm border border-gray-100 overflow-hidden">
          <SecHead icon={<Users className="w-4 h-4" />} title="客户销售排行 Top 10" sub="CUSTOMER SALES RANKING · ALL TIME" />
          <div className="p-5 space-y-3">
            {topCustomers.length === 0
              ? <EmptyState text="暂无客户销售数据 · No Data" />
              : topCustomers.map((c, i) => (
                <RankRow key={c.name} rank={i + 1} label={c.name}
                  sub={`${c.count} 单`} value={`AED ${fmt(c.total)}`}
                  pct={c.total / maxCust} barClass="bg-[#080D1E]" />
              ))
            }
          </div>
        </div>

        <div className="bg-white rounded-[10px] shadow-sm border border-gray-100 overflow-hidden">
          <SecHead icon={<Package className="w-4 h-4" />} title="产品销售排行 Top 10" sub="PRODUCT SALES RANKING · ALL TIME" />
          <div className="p-5 space-y-3">
            {topProducts.length === 0
              ? <EmptyState text="暂无产品销售数据 · No Data" />
              : topProducts.map((p, i) => (
                <RankRow key={p.name + i} rank={i + 1} label={p.name}
                  sub={`Qty: ${p.qty}`} value={`AED ${fmt(p.total)}`}
                  pct={p.total / maxProd} barClass="bg-slate-400" />
              ))
            }
          </div>
        </div>

      </div>

      {/* ══ Row 5 — 逾期应收 + 客户应收排行 ══════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* 逾期应收 */}
        <div className="bg-white rounded-[10px] shadow-sm border border-gray-100 overflow-hidden">
          <SecHead icon={<Clock className="w-4 h-4" />}
            title={`逾期应收 (${overdueList.length})`}
            sub="OVERDUE RECEIVABLES · DUE DATE PASSED"
            accentRed={overdueList.length > 0} />
          <div className="p-5 space-y-2 max-h-80 overflow-y-auto">
            {overdueList.length === 0 ? (
              <EmptyState text="暂无逾期应收 · All Clear" icon="✅" green />
            ) : (
              overdueList.map(o => (
                <div key={o.id} className="flex items-center justify-between p-3.5 rounded-[10px] bg-[#FBF1EE] border border-[#E0846A]/20">
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-gray-800 truncate">{o.customerName || '—'}</div>
                    <div className="text-xs font-bold text-slate-600 mt-0.5 font-mono-label">{o.id}</div>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <div className="text-sm font-bold font-mono-label text-[#A85D45]">AED {fmt(Number(o.outstandingAmount) || 0)}</div>
                    <div className="text-xs font-bold text-[#C17F66] mt-0.5">+{o.diffDays}d 逾期</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 客户应收排行 */}
        <div className="bg-white rounded-[10px] shadow-sm border border-gray-100 overflow-hidden">
          <SecHead icon={<DollarSign className="w-4 h-4" />}
            title="客户应收排行"
            sub="CUSTOMER OUTSTANDING RANKING"
            accentRed={custOutstanding.length > 0} />
          <div className="p-5 space-y-3">
            {custOutstanding.length === 0
              ? <EmptyState text="暂无应收账款 · All Settled" icon="✅" green />
              : custOutstanding.map((c, i) => (
                <RankRow key={c.name} rank={i + 1} label={c.name}
                  sub={`${c.count} 单未结`} value={`AED ${fmt(c.outstanding)}`}
                  pct={c.outstanding / maxOut} barClass="bg-[#D4A843]" />
              ))
            }
          </div>
        </div>

      </div>

      {/* ══ Row 6 — 销售模式表现 ═════════════════════════════════════════ */}
      <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
        <SecHead icon={<BarChart3 className="w-4 h-4" />} title="销售模式表现" sub="SALES MODE PERFORMANCE · ALL ORDERS" />
        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-5">

          {/* Direct Sale */}
          <div className="bg-gray-50 rounded-[10px] p-5 border border-gray-100 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-[#080D1E]" />
              <span className="text-sm font-bold text-gray-700">Direct Sale</span>
            </div>
            <div className="text-[28px] font-bold font-mono-label text-[#080D1E] leading-tight">
              AED {fmt(modePerf.direct.total)}
            </div>
            <div className="flex gap-4 text-xs font-bold text-slate-600">
              <span>{modePerf.direct.count} 单</span>
              <span>占比 {modePerf.direct.pct}%</span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-[#080D1E] rounded-full transition-all"
                style={{ width: `${Math.max(modePerf.direct.pct, modePerf.direct.count > 0 ? 2 : 0)}%` }} />
            </div>
          </div>

          {/* Consignment (Orders) */}
          <div className="bg-slate-50 rounded-[10px] p-5 border border-slate-200 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-slate-400" />
              <span className="text-sm font-bold text-slate-700">Consignment</span>
              <span className="text-xs font-bold text-slate-600">SO 记录</span>
            </div>
            <div className="text-[28px] font-bold font-mono-label text-slate-700 leading-tight">
              AED {fmt(modePerf.consign.total)}
            </div>
            <div className="flex gap-4 text-xs font-bold text-slate-600">
              <span>{modePerf.consign.count} 单</span>
              <span>占比 {modePerf.consign.pct}%</span>
            </div>
            <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
              <div className="h-full bg-slate-400 rounded-full transition-all"
                style={{ width: `${Math.max(modePerf.consign.pct, modePerf.consign.count > 0 ? 2 : 0)}%` }} />
            </div>
          </div>

          {/* Consignment Ledger */}
          <div className="bg-[#D4A843]/10 rounded-[10px] p-5 border border-[#D4A843]/20 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="w-2.5 h-2.5 rounded-full bg-[#D4A843]" />
              <span className="text-sm font-bold text-[#8A6B2A]">寄售台账</span>
              <span className="text-xs font-bold text-[#7A5F2A] ">Consignment Ledger</span>
            </div>
            <div className="space-y-2.5">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-[#7A5F2A]">寄售总额</span>
                <span className="text-sm font-bold font-mono-label text-[#8A6B2A]">AED {fmt(modePerf.ledger.total)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-[#3F7D58]">已结算</span>
                <span className="text-sm font-bold font-mono-label text-[#2d5c40]">AED {fmt(modePerf.ledger.settled)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-[#c53030]">未结算</span>
                <span className="text-sm font-bold font-mono-label text-[#A85D45]">AED {fmt(modePerf.ledger.unsettled)}</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-[#D4A843]/20">
                <span className="text-xs font-bold text-slate-600">台账记录</span>
                <span className="text-sm font-bold text-gray-600">{modePerf.ledger.count} 条</span>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <div className="text-center text-xs font-bold text-slate-600 pb-2">
        Refreshed: {lastRefresh.toLocaleTimeString()} &nbsp;·&nbsp; sales-dashboard-v2
      </div>

    </div>
  );
};

// ─── Sub-components ────────────────────────────────────────────────────────────

// KPI Card
// Key names kept as-is (call sites below use c="indigo"/"violet" etc) --
// only the literal colors changed. 'indigo' was already secretly gold,
// 'amber' was already secretly rose/danger; 'violet' was real purple and
// is now neutral gray per the V2 baseline (no purple as a regular status
// color).
const KPI_C = {
  indigo:  { border: 'border-[#E5D5A0]',   iconBg: 'bg-[#FFF5D0]',  icon: 'text-[#7A5F2A]', val: 'text-[#4A3A14]',   bg: 'bg-[#FFFBEF]' },
  emerald: { border: 'border-[#6FBF8E]/20', iconBg: 'bg-[#6FBF8E]/10', icon: 'text-[#3F7D58]', val: 'text-[#2d5c40]', bg: 'bg-[#F1F8F4]' },
  amber:   { border: 'border-[#E0846A]/20', iconBg: 'bg-[#E0846A]/10', icon: 'text-[#c53030]', val: 'text-[#A85D45]', bg: 'bg-[#FFF1EE]' },
  violet:  { border: 'border-slate-200',    iconBg: 'bg-slate-100', icon: 'text-slate-500',   val: 'text-slate-700',   bg: 'bg-slate-50' },
} as const;

const KpiCard: React.FC<{
  label: string; sub: string; value: string; icon: React.ReactNode; c: keyof typeof KPI_C;
}> = ({ label, sub, value, icon, c }) => {
  const s = KPI_C[c];
  return (
    <div className={`${s.bg} rounded-[10px] p-5 shadow-sm border ${s.border}`}>
      <div className={`inline-flex p-2.5 rounded-[10px] ${s.iconBg} ${s.icon}`}>{icon}</div>
      <div className="mt-4">
        <div className="text-xs font-bold text-slate-600">{sub}</div>
        <div className="text-sm font-bold text-gray-600 mt-0.5">{label}</div>
        <div className={`text-[28px] font-bold font-mono-label mt-2 leading-tight ${s.val}`}>{value}</div>
      </div>
    </div>
  );
};

// Section Header (panel inside)
const SecHead: React.FC<{
  icon: React.ReactNode; title: string; sub: string; accentRed?: boolean;
}> = ({ icon, title, sub, accentRed }) => (
  <div className="bg-gray-50 border-b border-gray-100 px-5 py-4 flex items-center gap-2.5">
    <div style={{ color: accentRed ? colors.statusDanger : GOLD }}>{icon}</div>
    <div>
      <div className="text-base font-bold " style={{ color: accentRed ? colors.statusDanger : '#374151' }}>{title}</div>
      <div className="text-xs font-bold text-slate-600 mt-0.5">{sub}</div>
    </div>
  </div>
);

// Breakdown Card (Row 2)
const BreakCard: React.FC<{
  label: string; sub: string; value: string; pct: number; barClass: string; alert?: boolean;
}> = ({ label, sub, value, pct, barClass, alert }) => (
  <div className={`rounded-[10px] p-4 border ${alert ? 'bg-[#FBF1EE] border-[#E0846A]/20' : 'bg-gray-50 border-gray-100'}`}>
    <div className="text-xs font-bold text-slate-600 mb-0.5">{sub}</div>
    <div className={`text-sm font-bold ${alert ? 'text-[#A85D45]' : 'text-gray-700'} mb-2`}>{label}</div>
    <div className={`text-lg font-bold font-mono-label ${alert ? 'text-[#A85D45]' : 'text-[#080D1E]'} leading-tight mb-3`}>{value}</div>
    <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
      <div className={`h-full ${barClass} rounded-full`}
        style={{ width: `${Math.max(pct * 100, pct > 0 ? 2 : 0)}%` }} />
    </div>
    <div className="text-xs text-slate-600 font-bold mt-1">{Math.round(pct * 100)}%</div>
  </div>
);

// Channel Bar (Row 3)
const ChannelBar: React.FC<{
  label: string; subTag?: string; count: number; total: number; pct: number; barClass: string; dotClass: string;
}> = ({ label, subTag, count, total, pct, barClass, dotClass }) => (
  <div className="space-y-2">
    <div className="flex justify-between items-center flex-wrap gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <div className={`w-2.5 h-2.5 rounded-full ${dotClass} shrink-0`} />
        <span className="text-sm font-bold text-gray-700">{label}</span>
        {subTag && (
          <span className="text-xs font-bold text-[#7A5F2A] bg-[#D4A843]/10 border border-[#D4A843]/25 px-1.5 py-0.5 rounded-full">
            {subTag}
          </span>
        )}
        <span className="text-xs font-bold text-slate-600">{count} 单</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm font-bold font-mono-label text-gray-700">
          AED {total.toLocaleString('en-US', { maximumFractionDigits: 0 })}
        </span>
        <span className="text-xs font-bold text-slate-600 w-10 text-right">{pct}%</span>
      </div>
    </div>
    <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full ${barClass} rounded-full transition-all`}
        style={{ width: `${Math.max(pct, count > 0 ? 1 : 0)}%` }} />
    </div>
  </div>
);

// Rank Row (Top 10 tables)
const RankRow: React.FC<{
  rank: number; label: string; sub: string; value: string; pct: number; barClass: string;
}> = ({ rank, label, sub, value, pct, barClass }) => (
  <div className="space-y-1">
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="text-xs font-bold text-slate-600 w-6 shrink-0">#{rank}</span>
        <div className="min-w-0">
          <div className="text-sm font-bold text-gray-700 truncate">{label}</div>
          <div className="text-xs font-bold text-slate-600">{sub}</div>
        </div>
      </div>
      <div className="text-sm font-bold font-mono-label text-[#080D1E] shrink-0">{value}</div>
    </div>
    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden ml-8">
      <div className={`h-full ${barClass} rounded-full`}
        style={{ width: `${Math.max(pct * 100, 2)}%` }} />
    </div>
  </div>
);

// Empty State
const EmptyState: React.FC<{ text: string; icon?: string; green?: boolean }> = ({ text, icon, green }) => (
  <div className={`py-10 text-center rounded-[10px] ${green ? 'bg-[#6FBF8E]/10 border border-[#6FBF8E]/20' : 'bg-gray-50 border border-gray-100'}`}>
    {icon && <div className="text-2xl mb-2">{icon}</div>}
    <p className={`text-sm font-bold ${green ? 'text-[#15803d]' : 'text-slate-600'}`}>{text}</p>
  </div>
);

export default SalesDashboard;
