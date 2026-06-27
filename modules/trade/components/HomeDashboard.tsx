/**
 * HomeDashboard — 经营驾驶舱 home-trends-pie-v1
 * Layout: KPI strip → Charts (trend + pie) → Risk grid → Alerts + Actions
 * Charts: recharts (ComposedChart for sales, PieChart placeholder for customers)
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  RefreshCw, AlertTriangle,
  CheckCircle2, Zap,
  TrendingUp as TrendUp, TrendingDown as TrendDown, Minus,
} from 'lucide-react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { Card } from '@gci/design-system';
import { persistence } from '../services/persistenceService';
import { roundTo2 } from '../services/currencyUtils';
import {
  normalizeCustomerSegment,
  readNotionCustomerType,
  SEGMENT_LABELS, SEGMENT_COLORS,
  type CustomerSegment,
} from '../services/customerSegment';

console.log('[TRADE HOME UI BUILD]',           'home-ui-v3');
console.log('[TRADE HOME INTELLIGENCE BUILD]',  'home-risk-actions-trends-v1');
console.log('[TRADE HOME CHARTS BUILD]',        'home-trends-pie-v1');

// ── Notion ────────────────────────────────────────────────────────────────
const DB_INVENTORY        = '2c6d0b13b3b9806db227fc01f723bc40';
const DB_PRODUCT_MASTER   = '2bfd0b13b3b980da819fd1dbea638c81';
const DB_CUSTOMER_MASTER  = '2bfd0b13b3b980fc8b49e81603b8183d';

const readLS = (k: string): any[] => {
  try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch { return []; }
};

async function notionQuery(dbId: string): Promise<any[]> {
  let all: any[] = []; let hasMore = true; let cursor: string | undefined;
  while (hasMore) {
    const body: any = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const r = await fetch('/api/trade/notion-proxy', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: `/databases/${dbId}/query`, method: 'POST', body }),
    });
    if (!r.ok) throw new Error(`notion-proxy ${r.status}`);
    const d = await r.json();
    all = all.concat(d.results || []);
    hasMore = d.has_more; cursor = d.next_cursor;
  }
  return all;
}

// ── Formatters ────────────────────────────────────────────────────────────
const fmtAED = (n: number) =>
  'AED ' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtK = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n.toFixed(0);
const daysSince = (d: string) =>
  d ? Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000) : 0;

type TrendData = { pct: number; dir: 'up' | 'down' | 'flat' } | null;
function calcTrend(curr: number, prev: number): TrendData {
  if (prev === 0 && curr === 0) return { pct: 0, dir: 'flat' };
  if (prev === 0) return null;
  const pct = ((curr - prev) / Math.abs(prev)) * 100;
  if (Math.abs(pct) < 0.5) return { pct: 0, dir: 'flat' };
  return { pct, dir: pct > 0 ? 'up' : 'down' };
}

type RiskLevel = 'red' | 'orange' | 'yellow';
interface RiskAlert { level: RiskLevel; message: string; }
type SS = 'loading' | 'ok' | 'error';

interface Props { onNavigate: (tab: string) => void; }

// ═══════════════════════════════════════════════════════════════════════════
const HomeDashboard: React.FC<Props> = () => {
  const [refreshKey,  setRefreshKey]  = useState(0);
  const [salesState,  setSalesState]  = useState<SS>('loading');
  const [orders,      setOrders]      = useState<any[]>([]);
  const [invState,    setInvState]    = useState<SS>('loading');
  const [invStats,    setInvStats]    = useState<{ qty: number; costPrice: number }[]>([]);
  const [consign,     setConsign]     = useState<any[]>([]);
  const [soConsignStock, setSoConsignStock] = useState<any[]>([]);
  const [consignLoading, setConsignLoading] = useState(true);
  // customer name → customerType fallback map (for orders without customerType set)
  const [custNameTypeMap, setCustNameTypeMap] = useState<Map<string, string>>(new Map());
  // Customer Master → segment count slices (source of truth for Customer Mix card)
  const [custSegSlices, setCustSegSlices] = useState<MixSlice[]>([]);
  const [custSegLoading, setCustSegLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const loadSales = useCallback(async () => {
    setSalesState('loading');
    try { const o = await persistence.getOrders(); setOrders(Array.isArray(o) ? o : []); setSalesState('ok'); }
    catch { setOrders([]); setSalesState('error'); }
  }, []);

  const loadInventory = useCallback(async () => {
    setInvState('loading');
    try {
      const [invRows, masterRows] = await Promise.all([
        notionQuery(DB_INVENTORY), notionQuery(DB_PRODUCT_MASTER),
      ]);
      const mm = new Map(masterRows.map(m => [m.id, m]));
      const stats = invRows.map(inv => {
        const ip = inv.properties;
        const relId = ip['产品名称']?.relation?.[0]?.id || '';
        const mp = (relId ? mm.get(relId)?.properties : undefined) || {};
        return { qty: ip['当前库存']?.formula?.number ?? 0, costPrice: mp['Cost Price AED']?.number ?? 0 };
      });
      setInvStats(stats);
      localStorage.setItem('icare_inventory', JSON.stringify(
        stats.map(s => ({ qty: s.qty, costPrice: s.costPrice, minQty: 10, entryDate: '' }))
      ));
      setInvState('ok');
    } catch {
      const c = readLS('icare_inventory');
      setInvStats(c.map((i: any) => ({ qty: Number(i.qty) || 0, costPrice: Number(i.costPrice) || 0 })));
      setInvState('error');
    }
  }, []);

  useEffect(() => {
    Promise.all([loadSales(), loadInventory()]);
    setConsign(readLS('icare_consignment'));
    setConsignLoading(true);
    persistence.getConsignmentStock()
      .then(stock => { setSoConsignStock(Array.isArray(stock) ? stock : []); setConsignLoading(false); })
      .catch(() => { setSoConsignStock([]); setConsignLoading(false); });
    // Build customerName → customerType fallback map AND compute segment counts from Customer Master
    setCustSegLoading(true);
    notionQuery(DB_CUSTOMER_MASTER).then(rows => {
      const m = new Map<string, string>();
      const segCount = new Map<CustomerSegment, number>();
      for (const r of rows) {
        const name = (r.properties['Customer Name']?.title?.[0]?.plain_text ||
                      r.properties['Customer Name']?.rich_text?.[0]?.plain_text || '').trim().toLowerCase();
        const type = readNotionCustomerType(r.properties);
        if (name && type) m.set(name, type);
        const seg = normalizeCustomerSegment(type || undefined);
        segCount.set(seg, (segCount.get(seg) || 0) + 1);
      }
      setCustNameTypeMap(m);
      const slices: MixSlice[] = Array.from(segCount.entries())
        .map(([seg, cnt]) => ({ seg, name: SEGMENT_LABELS[seg], value: cnt, count: cnt, color: SEGMENT_COLORS[seg] }))
        .filter(s => s.value > 0)
        .sort((a, b) => b.value - a.value);
      setCustSegSlices(slices);
      setCustSegLoading(false);
    }).catch(() => { setCustSegSlices([]); setCustSegLoading(false); });
    setLastRefresh(new Date());
  }, [refreshKey]); // eslint-disable-line

  // ── Month helpers ─────────────────────────────────────────────────────
  const thisMonth = useMemo(() => new Date().toISOString().substring(0, 7), []);
  const lastMonth = useMemo(() => {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
    return d.toISOString().substring(0, 7);
  }, []);

  const normalOrders = useMemo(() => {
    // ✅ Deduplicate by business order id (SO-...) before stats — keeps newest updatedAt row only
    const dedupMap = new Map<string, any>();
    for (const o of orders) {
      const bizId = o?.id;
      if (!bizId) continue;
      const existing = dedupMap.get(bizId);
      if (!existing) {
        dedupMap.set(bizId, o);
      } else {
        const tNew = String(o?.updatedAt || o?.updated_at || '');
        const tOld = String(existing?.updatedAt || existing?.updated_at || '');
        if (tNew > tOld) dedupMap.set(bizId, o);
      }
    }
    return Array.from(dedupMap.values()).filter(o =>
      (o as any).order_type !== 'ADJUSTMENT' &&
      (o as any).status !== 'VOIDED' &&
      (o as any).transactionMode !== 'Consignment'
    );
  }, [orders]);
  const monthOrders  = useMemo(
    () => normalOrders.filter(o => (o.createdAt || o.created_at || '').substring(0, 7) === thisMonth),
    [normalOrders, thisMonth]);
  const lastMonthOrders = useMemo(
    () => normalOrders.filter(o => (o.createdAt || o.created_at || '').substring(0, 7) === lastMonth),
    [normalOrders, lastMonth]);

  // ── KPIs ──────────────────────────────────────────────────────────────
  const salesKPI = useMemo(() => ({
    monthSales:         roundTo2(monthOrders.reduce((s, o)     => s + (Number(o.grandTotal)        || 0), 0)),
    monthCollected:     roundTo2(monthOrders.reduce((s, o)     => s + (Number(o.paidAmount)        || 0), 0)),
    totalOutstanding:   roundTo2(normalOrders.reduce((s, o)    => s + (Number(o.outstandingAmount) || 0), 0)),
    lastMonthSales:     roundTo2(lastMonthOrders.reduce((s, o) => s + (Number(o.grandTotal)        || 0), 0)),
    lastMonthCollected: roundTo2(lastMonthOrders.reduce((s, o) => s + (Number(o.paidAmount)        || 0), 0)),
  }), [monthOrders, normalOrders, lastMonthOrders]);

  const invKPI = useMemo(() => ({
    // 只统计 qty > 0 的在库产品（已寄售出库/销售出库的已在 Notion 当前库存公式中扣除）
    totalStockValue: roundTo2(invStats.filter(i => i.qty > 0).reduce((s, i) => s + i.qty * i.costPrice, 0)),
    lowStockCount:   invStats.filter(i => i.qty > 0 && i.qty <= 10).length,
    over90Count:     0,
  }), [invStats]);

  const conKPI = useMemo(() => ({
    totalConsignOut: roundTo2(
      soConsignStock
        .filter(r => r.settlementStatus !== 'SETTLED')
        .reduce((s, r) => {
          // Mirror ConsignmentManager formula exactly
          const inclUnit = (r as any).taxInclusiveUnitPrice ?? roundTo2((Number(r.unitPrice) || 0) * 1.05);
          const amt = (r as any).vatIncluded
            ? ((r as any).amount ?? roundTo2((Number(r.consignedQty) || 0) * inclUnit))
            : roundTo2((Number(r.consignedQty) || 0) * inclUnit);
          return s + amt;
        }, 0)
    ),
    over30Unsettled: soConsignStock
      .filter(r => r.settlementStatus !== 'SETTLED' && daysSince(r.createdAt) > 30).length,
  }), [soConsignStock]);

  // ── 6-month trend data ────────────────────────────────────────────────
  const monthlyTrend = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (5 - i));
      const key   = d.toISOString().substring(0, 7);
      const label = d.toLocaleDateString('zh-CN', { month: 'short' });
      const ords  = normalOrders.filter(o =>
        (o.createdAt || o.created_at || '').substring(0, 7) === key);
      return {
        label,
        sales:     roundTo2(ords.reduce((s, o) => s + (Number(o.grandTotal) || 0), 0)),
        collected: roundTo2(ords.reduce((s, o) => s + (Number(o.paidAmount) || 0), 0)),
      };
    });
  }, [normalOrders]);

  // ── Customer Segment Mix — reads Customer Master directly, counts customers ──

  // ── Trends ────────────────────────────────────────────────────────────
  const trendSales     = salesState === 'ok' ? calcTrend(salesKPI.monthSales,     salesKPI.lastMonthSales)     : null;
  const trendCollected = salesState === 'ok' ? calcTrend(salesKPI.monthCollected, salesKPI.lastMonthCollected) : null;

  // ── Risk alerts ───────────────────────────────────────────────────────
  const riskAlerts = useMemo((): RiskAlert[] => {
    if (salesState === 'loading' && invState === 'loading') return [];
    const list: RiskAlert[] = [];
    if (salesKPI.totalOutstanding > 0)
      list.push({ level: 'orange', message: '有未收应收款，请查看应收核销' });
    if (invKPI.lowStockCount > 0)
      list.push({ level: 'yellow', message: `有 ${invKPI.lowStockCount} 个低库存产品，请检查补货` });
    if (invKPI.over90Count > 0)
      list.push({ level: 'orange', message: `有 ${invKPI.over90Count} 个库存超过90天未动` });
    if (conKPI.over30Unsettled > 0)
      list.push({ level: 'red', message: `有 ${conKPI.over30Unsettled} 个寄售超过30天未结算，请跟进` });
    return list;
  }, [salesState, invState, salesKPI, invKPI, conKPI]);

  const todayActions = useMemo((): string[] => {
    const list: string[] = [];
    if (salesKPI.totalOutstanding > 0)   list.push('跟进逾期客户回款');
    if (conKPI.over30Unsettled > 0)      list.push('联系寄售客户确认销售和结算');
    if (invKPI.lowStockCount > 0)        list.push('检查是否需要补货');
    if (invKPI.over90Count > 0)          list.push('考虑促销、打包销售或清仓');
    return list;
  }, [salesKPI, invKPI, conKPI]);

  // ─────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* ── Header bar ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-semibold uppercase tracking-wide text-[#0F1E45]" style={{ fontFamily: "'Space Grotesk',sans-serif" }}>Trade Intelligence · Command Center</h2>
          <p className="font-mono-label text-xs text-gray-500 mt-0.5">
            GCI Global Operations · {lastRefresh.toLocaleTimeString()}
            {invState === 'error' && <span className="ml-2 text-[#A6822E]">· 库存来自缓存</span>}
          </p>
        </div>
        <button
          onClick={() => setRefreshKey(k => k + 1)}
          className="font-mono-label flex items-center gap-2 px-4 py-2 bg-white border rounded-[14px] text-xs font-bold uppercase tracking-wide text-gray-500 hover:text-[#0F1E45] hover:shadow-md transition-all shadow-sm"
          style={{ borderColor: '#0F1E4520' }}
        >
          <RefreshCw className={`w-3 h-3 ${salesState === 'loading' ? 'animate-spin' : ''}`} />刷新
        </button>
      </div>

      {/* ══ HERO ROW — dark command card + stat stack ════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* ── Hero Chart Card (3/5) ── */}
        <div className="lg:col-span-3 relative bg-gradient-to-br from-[#0C1B3A] via-[#0F2551] to-[#162B5E] rounded-[18px] p-6 md:p-7 overflow-hidden shadow-2xl shadow-[#0C1B3A]/25 group cursor-default">

          {/* Ambient glow orbs */}
          <div className="absolute -top-16 -right-16 w-72 h-72 bg-[#C9A84C]/6 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 -left-8 w-56 h-56 bg-[#8FA6D4]/6 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute top-1/2 left-1/2 w-96 h-32 bg-[#0F2551]/30 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 pointer-events-none" />

          {/* Top row */}
          <div className="flex items-start justify-between mb-5 relative z-10">
            <div>
              <div className="font-mono-label text-xs uppercase tracking-wide text-[#C9A84C]/90 mb-1.5">Trade Intelligence</div>
              <div className="text-white/65 text-sm font-semibold tracking-wide">本月销售概览 · 6M Trend</div>
            </div>
            <div className="flex items-center gap-2 bg-white/5 border border-white/8 rounded-lg px-3 py-1.5 backdrop-blur-sm">
              <div className={`w-1.5 h-1.5 rounded-full ${salesState === 'ok' ? 'bg-[#6FBF8E] animate-pulse' : salesState === 'loading' ? 'bg-[#D9B45A] animate-pulse' : 'bg-gray-500'}`} />
              <span className="font-mono-label text-xs uppercase tracking-wide text-white/70">
                {salesState === 'loading' ? 'SYNCING' : 'LIVE'}
              </span>
            </div>
          </div>

          {/* Primary metric */}
          <div className="relative z-10 mb-5">
            {salesState === 'loading' ? (
              <div className="space-y-2">
                <div className="h-14 w-60 bg-white/8 rounded-2xl animate-pulse" />
                <div className="h-4 w-36 bg-white/5 rounded-lg animate-pulse" />
              </div>
            ) : (
              <>
                <div className="text-[42px] md:text-[52px] font-bold text-white leading-none tracking-tight" style={{ fontFamily: "'Space Grotesk',sans-serif" }}>
                  {fmtAED(salesKPI.monthSales)}
                </div>
                <div className="flex items-center gap-3 mt-2.5">
                  <TrendBadgeDark trend={trendSales} />
                  <span className="text-white/55 text-xs font-medium">
                    上月 {fmtAED(salesKPI.lastMonthSales)}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Separator */}
          <div className="relative z-10 mb-4 flex items-center gap-3">
            <div className="flex-1 h-px bg-white/8" />
            <span className="font-mono-label text-xs uppercase tracking-wide text-white/50">6-Month Revenue Trend</span>
            <div className="flex-1 h-px bg-white/8" />
          </div>

          {/* Dark-themed chart */}
          <div className="relative z-10 -mx-1">
            {salesState === 'loading' ? (
              <div className="h-[155px] bg-white/5 rounded-2xl animate-pulse" />
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <ComposedChart data={monthlyTrend} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey="label"
                    tick={{ fontSize: 12, fill: 'rgba(255,255,255,0.65)', fontWeight: 700 }}
                    axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={fmtK}
                    tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.55)' }}
                    axisLine={false} tickLine={false} width={38} />
                  <Tooltip
                    contentStyle={{
                      fontSize: 12, borderRadius: 10,
                      background: 'rgba(8,18,45,0.97)',
                      border: '1px solid rgba(201,168,76,0.25)',
                      color: '#fff',
                      boxShadow: '0 12px 40px rgba(0,0,0,0.5)'
                    }}
                    formatter={(v: any, name: string) => [
                      `AED ${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
                      name === 'sales' ? '销售额' : '收款'
                    ]}
                    labelStyle={{ fontWeight: 700, color: '#C9A84C', marginBottom: 4 }}
                  />
                  <Bar dataKey="sales"
                    fill="rgba(201,168,76,0.18)" stroke="rgba(201,168,76,0.35)" strokeWidth={1}
                    radius={[3, 3, 0, 0]} maxBarSize={28} name="sales" />
                  <Line dataKey="collected" stroke="#C9A84C" strokeWidth={2.5}
                    dot={{ r: 3, fill: '#C9A84C', stroke: 'rgba(12,27,58,0.8)', strokeWidth: 2 }}
                    activeDot={{ r: 5, fill: '#C9A84C' }} name="collected" />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Bottom legend */}
          <div className="relative z-10 mt-3 flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-[#C9A84C]/30 border border-[#C9A84C]/50" />
              <span className="text-xs text-white/60 font-semibold">销售额</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-0.5 bg-[#C9A84C] rounded-full" />
              <span className="text-xs text-white/60 font-semibold">收款</span>
            </div>
          </div>
        </div>

        {/* ── Stat Stack (2/5) ── */}
        <div className="lg:col-span-2 grid grid-cols-2 lg:grid-cols-1 gap-3">
          <CommandStatCard
            label="应收未收" sub="OUTSTANDING AR"
            value={fmtAED(salesKPI.totalOutstanding)}
            loading={salesState === 'loading'} accent="rose"
            alert={salesKPI.totalOutstanding > 0}
            sourceMeta="Supabase · 实时 · 全部未收款累计"
          />
          <CommandStatCard
            label="本月收款" sub="COLLECTED MTD"
            value={fmtAED(salesKPI.monthCollected)}
            loading={salesState === 'loading'} accent="emerald"
            trend={trendCollected}
            sourceMeta="Supabase · 实时 · 本月 paidAmount"
          />
          <CommandStatCard
            label="库存估值" sub="STOCK VALUE"
            value={fmtAED(invKPI.totalStockValue)}
            loading={invState === 'loading'} accent="gold"
            badge={invKPI.lowStockCount > 0 ? `${invKPI.lowStockCount} 低库存` : undefined}
            sourceMeta="Notion · 实时 · 当前库存×成本价"
          />
          <CommandStatCard
            label="寄售在外" sub="CONSIGNMENT"
            value={fmtAED(conKPI.totalConsignOut)}
            loading={consignLoading} accent="violet"
            badge={conKPI.over30Unsettled > 0 ? `${conKPI.over30Unsettled} 超期` : undefined}
            sourceMeta="Supabase · consignment_stock · 含税"
          />
        </div>
      </div>

      {/* ══ INTELLIGENCE + RISK ROW ══════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <CustomerMixCard slices={custSegSlices} loading={custSegLoading} />
        <RiskAlertsPanel alerts={riskAlerts} loading={salesState === 'loading' && invState === 'loading'} />
        <TodayActionsPanel actions={todayActions} loading={salesState === 'loading' && invState === 'loading'} />
      </div>

    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════
//  Sub-components
// ══════════════════════════════════════════════════════════════════════════

// ── TrendBadgeDark — used inside the dark hero card ───────────────────────
const TrendBadgeDark: React.FC<{ trend: TrendData }> = ({ trend }) => {
  if (trend === null)
    return <span className="text-xs font-bold text-white/50">实时数据</span>;
  if (trend.dir === 'flat')
    return <span className="inline-flex items-center gap-0.5 text-xs font-bold text-white/55"><Minus className="w-3 h-3" />持平</span>;
  const up = trend.dir === 'up';
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-black px-2 py-0.5 rounded-full border ${
      up
        ? 'text-[#9FD9B8] bg-[#6FBF8E]/12 border-[#6FBF8E]/20'
        : 'text-[#E8A893] bg-[#E0846A]/12 border-[#E0846A]/20'
    }`}>
      {up ? <TrendUp className="w-3 h-3" /> : <TrendDown className="w-3 h-3" />}
      {Math.abs(trend.pct).toFixed(1)}%
    </span>
  );
};

// ── CommandStatCard — right-side stat stack ───────────────────────────────
const CSTAT_MAP = {
  rose:    { bar: 'bg-[#E0846A]',   bg: 'bg-gradient-to-br from-white to-[#FBF1EE]',     border: 'border-[#E0846A]/20',   val: 'text-[#A85D45]',   sub: 'text-[#C17F66]'      },
  emerald: { bar: 'bg-[#6FBF8E]',   bg: 'bg-gradient-to-br from-white to-[#F1F8F4]',     border: 'border-[#6FBF8E]/20',   val: 'text-[#3F7D58]',   sub: 'text-[#6FA582]'      },
  gold:    { bar: 'bg-[#C9A84C]',   bg: 'bg-gradient-to-br from-white to-[#FFFBEF]/60',  border: 'border-[#E5D5A0]/80',   val: 'text-[#6B4E15]',   sub: 'text-[#B89040]/80'   },
  violet:  { bar: 'bg-[#B69BD0]',   bg: 'bg-gradient-to-br from-white to-[#F6F2FA]',     border: 'border-[#B69BD0]/20',   val: 'text-[#7A5F95]',   sub: 'text-[#A48BBA]'      },
} as const;

const CommandStatCard: React.FC<{
  label: string; sub: string; value: string;
  loading: boolean; accent: keyof typeof CSTAT_MAP;
  alert?: boolean; badge?: string; trend?: TrendData;
  sourceMeta?: string;
}> = ({ label, sub, value, loading, accent, alert, badge, trend, sourceMeta }) => {
  const s = CSTAT_MAP[accent];
  return (
    <div className={`relative ${s.bg} border ${s.border} rounded-[18px] p-4 overflow-hidden shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 group ${alert ? 'ring-1 ring-[#E0846A]/40' : ''}`}>
      {/* Left accent bar */}
      <div className={`absolute top-3 bottom-3 left-0 w-[3px] ${s.bar} rounded-r-full`} />
      <div className="pl-3">
        <div className={`font-mono-label text-xs uppercase tracking-wide ${s.sub} mb-1`}>{sub}</div>
        {loading ? (
          <div className="h-7 w-28 bg-gray-100 rounded-lg animate-pulse my-1" />
        ) : (
          <div className={`text-xl md:text-[26px] font-bold leading-tight ${s.val}`} style={{ fontFamily: "'Space Grotesk',sans-serif" }}>{value}</div>
        )}
        <div className="flex items-center justify-between mt-1.5 gap-1">
          <div className="text-xs text-gray-500 font-semibold">{label}</div>
          <div className="flex items-center gap-1">
            {trend && trend.dir !== 'flat' && (
              <span className={`text-xs font-black px-1.5 py-0.5 rounded-full ${
                trend.dir === 'up' ? 'text-[#3F7D58] bg-[#6FBF8E]/15' : 'text-[#A85D45] bg-[#E0846A]/15'
              }`}>
                {trend.dir === 'up' ? '↑' : '↓'}{Math.abs(trend.pct).toFixed(1)}%
              </span>
            )}
            {badge && (
              <span className="text-xs font-black bg-[#E0846A]/15 text-[#A85D45] border border-[#E0846A]/25 px-1.5 py-0.5 rounded-full">
                {badge}
              </span>
            )}
          </div>
        </div>
        {sourceMeta && (
          <div className="font-mono-label text-xs text-gray-400 mt-0.5 tracking-wide truncate">{sourceMeta}</div>
        )}
      </div>
    </div>
  );
};

// ── CustomerMixCard — 客户细分结构（按 Customer Master 客户数量统计）──────
// Data: Notion Customer Master → normalizeCustomerSegment(customerType) → count per segment
interface MixSlice { seg: string; name: string; value: number; count: number; color: string; }

const CustomerMixCard: React.FC<{ slices: MixSlice[]; loading: boolean }> = ({ slices, loading }) => {
  const totalCount = slices.reduce((s, x) => s + x.value, 0);
  const hasData = slices.length > 0;

  return (
    <div className="bg-white rounded-[18px] border shadow-sm hover:shadow-md transition-shadow overflow-hidden flex flex-col" style={{ borderColor: '#0F1E4514' }}>
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2.5">
        <div className="w-2 h-2 rounded-full bg-[#B69BD0]" />
        <span className="font-mono-label text-sm uppercase tracking-wide text-gray-700">客户结构</span>
        <span className="font-mono-label text-xs text-gray-400 uppercase">Customer Segment</span>
        <span className={`ml-auto text-xs font-black px-2 py-0.5 rounded-full border ${
          hasData
            ? 'bg-[#6FBF8E]/12 text-[#3F7D58] border-[#6FBF8E]/25'
            : 'bg-[#D9B45A]/12 text-[#A6822E] border-[#D9B45A]/25'
        }`}>
          {hasData ? '实时' : '待录入'}
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 p-5 flex flex-col items-center gap-3">
        {loading ? (
          <>
            <div className="w-[130px] h-[130px] rounded-full bg-gray-100 animate-pulse" />
            <div className="w-full space-y-2">
              {[1,2,3].map(i => <div key={i} className="h-4 bg-gray-100 rounded animate-pulse" />)}
            </div>
          </>
        ) : hasData ? (
          /* ── Real pie + legend ── */
          <>
            <div className="relative">
              <ResponsiveContainer width={150} height={150}>
                <PieChart>
                  <Pie
                    data={slices}
                    cx="50%" cy="50%"
                    innerRadius={42} outerRadius={68}
                    strokeWidth={2} stroke="#fff"
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {slices.map((s, i) => <Cell key={i} fill={s.color} />)}
                  </Pie>
                  <Tooltip
                    formatter={(v: any) => [`${Number(v)} 个客户`, '客户数量']}
                    contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-[10px] font-black text-gray-400 uppercase">客户</span>
                <span className="text-xs font-black text-gray-700 font-mono">{totalCount}</span>
              </div>
            </div>

            <div className="w-full space-y-1.5">
              {slices.map((s, i) => {
                const pct = totalCount > 0 ? (s.value / totalCount * 100) : 0;
                return (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: s.color }} />
                    <span className="text-xs font-bold text-gray-600 flex-1 truncate">{s.name}</span>
                    <span className="text-xs font-mono text-gray-500">{s.value}家</span>
                    <span className="text-xs font-black text-gray-400 font-mono">{pct.toFixed(1)}%</span>
                  </div>
                );
              })}
            </div>

            <p className="text-[10px] text-gray-400 font-mono self-start">
              Notion Customer Master · 按客户数量统计
            </p>
          </>
        ) : (
          /* ── Placeholder — customerType not yet set ── */
          <>
            <div className="relative">
              <ResponsiveContainer width={150} height={150}>
                <PieChart>
                  <Pie
                    data={[{ value: 1 }]}
                    cx="50%" cy="50%"
                    innerRadius={42} outerRadius={68}
                    strokeWidth={0} dataKey="value"
                  >
                    <Cell fill="#f1f5f9" />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xs font-black text-gray-400 text-center leading-tight">
                  待<br/>录入
                </span>
              </div>
            </div>

            <div className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 space-y-2">
              <p className="text-xs font-black text-slate-500 uppercase tracking-wide">接入方式</p>
              <p className="text-xs text-slate-400 leading-relaxed">
                在 PI 报价单录入客户类型（customerType），分析图自动更新
              </p>
              <div className="flex flex-wrap gap-1 pt-1">
                {(['超市零售','批发贸易','工程项目','酒店餐饮','政府机构'] as const).map((t, i) => (
                  <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-full font-black bg-slate-100 text-slate-500">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ── Risk Alerts Panel ─────────────────────────────────────────────────────
const RISK_STYLE: Record<RiskLevel, { bg: string; border: string; dot: string; text: string }> = {
  red:    { bg: 'bg-[#E0846A]/10', border: 'border-[#E0846A]/20', dot: 'bg-[#E0846A]', text: 'text-[#A85D45]' },
  orange: { bg: 'bg-[#D9B45A]/12', border: 'border-[#D9B45A]/22', dot: 'bg-[#D9B45A]', text: 'text-[#8A6B2A]' },
  yellow: { bg: 'bg-[#D9B45A]/8',  border: 'border-[#D9B45A]/15', dot: 'bg-[#D9B45A]', text: 'text-[#A6822E]' },
};

const RiskAlertsPanel: React.FC<{ alerts: RiskAlert[]; loading: boolean }> = ({ alerts, loading }) => (
  <Card tone="light" className="overflow-hidden hover:shadow-md transition-shadow">
    <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2.5">
      <div className="w-7 h-7 rounded-lg bg-[#D9B45A]/12 flex items-center justify-center">
        <AlertTriangle className="w-3.5 h-3.5 text-[#A6822E]" />
      </div>
      <span className="font-mono-label text-sm uppercase tracking-wide text-gray-700">经营风险提醒</span>
      <span className="font-mono-label text-xs text-gray-400 uppercase ml-1">Risk Alerts</span>
      {alerts.length > 0 && (
        <span className="ml-auto text-[11px] font-black bg-[#D9B45A]/15 text-[#8A6B2A] border border-[#D9B45A]/25 px-2 py-0.5 rounded-full">
          {alerts.length} 项
        </span>
      )}
    </div>
    <div className="p-4 space-y-2 min-h-[140px]">
      {loading ? (
        <div className="animate-pulse space-y-2">
          {[1,2].map(i => <div key={i} className="h-9 bg-gray-100 rounded-xl" />)}
        </div>
      ) : alerts.length === 0 ? (
        <div className="flex items-center gap-3 px-4 py-3 bg-[#6FBF8E]/10 border border-[#6FBF8E]/20 rounded-xl">
          <CheckCircle2 className="w-4 h-4 text-[#3F7D58] flex-shrink-0" />
          <span className="text-sm font-semibold text-[#3F7D58]">当前暂无高风险事项</span>
        </div>
      ) : alerts.map((a, i) => {
        const st = RISK_STYLE[a.level];
        return (
          <div key={i} className={`flex items-start gap-3 px-4 py-2.5 ${st.bg} border ${st.border} rounded-xl`}>
            <div className={`w-1.5 h-1.5 rounded-full ${st.dot} mt-1.5 flex-shrink-0`} />
            <span className={`text-sm font-semibold ${st.text}`}>{a.message}</span>
          </div>
        );
      })}
    </div>
  </Card>
);

// ── Today Actions Panel ───────────────────────────────────────────────────
const P_CLS = [
  'bg-[#E0846A]/15 text-[#A85D45]', 'bg-[#D9B45A]/15 text-[#8A6B2A]',
  'bg-[#D9B45A]/10 text-[#A6822E]', 'bg-gray-100 text-gray-500',
];

const TodayActionsPanel: React.FC<{ actions: string[]; loading: boolean }> = ({ actions, loading }) => {
  const today = new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' });
  return (
    <Card tone="light" className="overflow-hidden hover:shadow-md transition-shadow">
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-[#0F1E45]/8 flex items-center justify-center">
            <Zap className="w-3.5 h-3.5 text-[#0F1E45]" />
          </div>
          <span className="font-mono-label text-sm uppercase tracking-wide text-gray-700">近期待处理事项</span>
        </div>
        <span className="text-xs text-gray-400 font-semibold">{today}</span>
      </div>
      <div className="p-4 space-y-2 min-h-[140px]">
        {loading ? (
          <div className="animate-pulse space-y-2">
            {[1,2,3].map(i => <div key={i} className="h-9 bg-gray-100 rounded-xl" />)}
          </div>
        ) : actions.length === 0 ? (
          <div className="flex items-center gap-3 px-4 py-2.5 bg-[#B69BD0]/10 border border-[#B69BD0]/20 rounded-xl">
            <CheckCircle2 className="w-4 h-4 text-[#9579B0] flex-shrink-0" />
            <span className="text-sm font-semibold text-[#7A5F95]">近期暂无紧急待办，正常开单即可</span>
          </div>
        ) : actions.map((a, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl hover:bg-[#B69BD0]/8 hover:border-[#B69BD0]/20 transition-all cursor-default">
            <span className={`text-xs font-black px-1.5 py-0.5 rounded-full flex-shrink-0 min-w-[22px] text-center ${P_CLS[i] ?? P_CLS[3]}`}>
              P{i + 1}
            </span>
            <span className="text-sm font-semibold text-gray-700">{a}</span>
          </div>
        ))}
      </div>
    </Card>
  );
};

export default HomeDashboard;
