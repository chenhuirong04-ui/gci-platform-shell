/**
 * InventoryManager — 库存管理台账
 * Data source: Notion INVENTORY + PRODUCT_MASTER (read-only view)
 * Stock adjustments: write to STOCK_LEDGER via Notion API
 * After load: caches summary to localStorage('icare_inventory') for HomeDashboard
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  RefreshCw, Search, Package, AlertCircle, Clock,
  CheckCircle, Filter, Edit3, X, Save, ChevronDown
} from 'lucide-react';
import { colors } from '@gci/design-system';
import { useI18n } from '@gci/i18n';

const GOLD = colors.goldBase;
const NAVY = colors.bgBase;

console.log('[TRADE OPS BUILD]', 'inventory-notion-v2');

// ── Notion DB IDs — token is server-side in /api/notion-proxy ──────────────
const DB = {
  INVENTORY:      '2c6d0b13b3b9806db227fc01f723bc40',
  PRODUCT_MASTER: '2bfd0b13b3b980da819fd1dbea638c81',
  STOCK_LEDGER:   '2c6d0b13b3b9804f9ccff92be2566c30',
};

// ── Types ───────────────────────────────────────────────────────────────────
export interface InventoryRow {
  invPageId:   string;   // INVENTORY page ID (needed for STOCK_LEDGER relation)
  productPageId: string; // PRODUCT_MASTER page ID
  name:        string;   // 产品名称(CN) from PRODUCT_MASTER
  nameEN:      string;   // INVENTORY 名称 (full EN name)
  sku:         string;   // SKU from PRODUCT_MASTER
  currentQty:  number;   // 当前库存 (formula)
  initQty:     number;   // 初始库存
  unit:        string;   // 单位
  warehouse:   string;   // 仓库
  costPrice:   number;   // Cost Price AED
  wholesale:   number;   // Target Wholesale
  category:    string;   // 产品类别 Type
  brand:       string;   // Brand
  stockStatus: string;   // Stock Status
}

// ── Notion paged fetch — via /api/notion-proxy (no token in browser) ────────
async function callNotionPaged(dbId: string): Promise<any[]> {
  let results: any[] = [];
  let hasMore = true;
  let cursor: string | undefined;
  while (hasMore) {
    const body: any = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const res = await fetch('/api/trade/notion-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: `/databases/${dbId}/query`, method: 'POST', body }),
    });
    if (!res.ok) throw new Error(`Notion proxy ${res.status}`);
    const data = await res.json();
    results = results.concat(data.results || []);
    hasMore = data.has_more;
    cursor = data.next_cursor;
  }
  return results;
}

// ── Notion property extractors ──────────────────────────────────────────────
const txt = (p: any) => p?.rich_text?.[0]?.plain_text || p?.title?.[0]?.plain_text || '';
const num = (p: any) => p?.number ?? p?.formula?.number ?? 0;
const sel = (p: any) => p?.select?.name || '';

// ── Merge INVENTORY + PRODUCT_MASTER ───────────────────────────────────────
function mergeRows(invRows: any[], masterRows: any[]): InventoryRow[] {
  const masterMap = new Map(masterRows.map(m => [m.id, m]));
  return invRows
    .map(inv => {
      const ip   = inv.properties;
      const relId = ip['产品名称']?.relation?.[0]?.id || '';
      const master = relId ? masterMap.get(relId) : undefined;
      const mp   = master?.properties || {};

      const nameEN = txt(ip['名称']);
      if (!nameEN && !relId) return null; // skip truly empty rows

      // CN name from PRODUCT_MASTER.产品名称 (rich_text), fallback to INVENTORY title
      const nameCN =
        mp['产品名称']?.rich_text?.[0]?.plain_text ||
        mp['Product Master（产品主库）']?.title?.[0]?.plain_text ||
        nameEN;

      const sku =
        mp['SKU ']?.rich_text?.[0]?.plain_text ||
        ip['SKU ']?.rollup?.array?.[0]?.rich_text?.[0]?.plain_text ||
        '';

      return {
        invPageId:    inv.id,
        productPageId: relId,
        name:          nameCN,
        nameEN,
        sku,
        currentQty:   num(ip['当前库存']),
        initQty:      ip['初始库存']?.number ?? 0,
        unit:         sel(ip['单位'])  || txt(mp['Selling Unit（销售单位）']) || 'PCS',
        warehouse:    sel(ip['仓库'])  || 'Dubai',
        costPrice:    num(mp['Cost Price AED']),
        wholesale:    num(mp['Target Wholesale']),
        category:     sel(mp['产品类别 Type']) || '',
        brand:        txt(mp['Brand（品牌）']),
        stockStatus:  sel(mp['Stock Status']) || '',
      } as InventoryRow;
    })
    .filter(Boolean) as InventoryRow[];
}

// ── Sync to localStorage so HomeDashboard can read 库存总金额 ───────────────
function syncToLocalCache(rows: InventoryRow[]) {
  const cache = rows.map(r => ({
    qty: r.currentQty,
    costPrice: r.costPrice,
    minQty: 10,         // default low-stock threshold (Notion has no threshold field yet)
    entryDate: '',      // not available from Notion; over-90d KPI will show 0
  }));
  try { localStorage.setItem('icare_inventory', JSON.stringify(cache)); } catch {}
}

// ── Stock status badge (label is a display-only mapping; row.stockStatus /
// currentQty from Notion are never changed) ────────────────────────────────
type Badge = { label: string; cls: string };
function getBadge(row: InventoryRow, t: { statusOutOfStock: string; statusLowStock: string; statusNormal: string }): Badge {
  if (row.currentQty <= 0)  return { label: t.statusOutOfStock, cls: 'bg-[#E0846A]/15 text-[#A85D45] border border-[#E0846A]/30' };
  if (row.currentQty <= 10) return { label: t.statusLowStock, cls: 'bg-[#D9B45A]/15 text-[#8A6D2F] border border-[#D9B45A]/30' };
  return { label: t.statusNormal,   cls: 'bg-[#6FBF8E]/15 text-[#3F7D58] border border-[#6FBF8E]/30' };
}

// ── Unit display mapping — Notion select value is never changed, only the
// rendered label; unknown values fall back to the raw Notion value ────────
const UNIT_LABEL_EN: Record<string, string> = { '包': 'Pack', '箱': 'Carton', '件': 'Piece', '个': 'Unit', '提': 'Bundle' };
function unitLabel(raw: string, lang: string): string {
  if (lang !== 'en') return raw;
  return UNIT_LABEL_EN[raw] ?? raw;
}

const fmt2 = (n: number) => Number(n || 0).toFixed(2);
const fmtQty = (n: number) => Number(n || 0).toLocaleString();

// ── Write adjustment to STOCK_LEDGER via /api/notion-proxy ─────────────────
async function writeStockAdjust(params: {
  invPageId:     string;
  productPageId: string;
  delta:         number;   // positive = 入库, negative = 出库
  type:          '入库' | '盘点调整';
  operator:      string;
  note:          string;
}): Promise<void> {
  const title = `ADJ-${Date.now()}`;
  const pageBody = {
    parent: { database_id: DB.STOCK_LEDGER },
    properties: {
      '自动库存流水': { title: [{ text: { content: title } }] },
      '变动数量':    { number: params.delta },
      '变动类型':   { select: { name: params.type } },
      '仓库':       { select: { name: 'Dubai' } },
      '操作人':     { select: { name: params.operator || 'Chris' } },
      '日期':       { date: { start: new Date().toISOString().split('T')[0] } },
      '来源单据类型': { rich_text: [{ text: { content: '手动盘点' } }] },
      '来源单据编号': { rich_text: [{ text: { content: title } }] },
      '当前库存':   { relation: [{ id: params.invPageId }] },
      ...(params.productPageId
        ? { '产品名称': { relation: [{ id: params.productPageId }] } }
        : {}),
      '备注':       { rich_text: [{ text: { content: params.note || '' } }] },
    },
  };
  const res = await fetch('/api/trade/notion-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: '/pages', method: 'POST', body: pageBody }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`写入失败: ${err}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Main Component
// ═══════════════════════════════════════════════════════════════════════════
const InventoryManager: React.FC = () => {
  const { dict, lang } = useI18n();
  const t = dict.trade.inventory;
  const [rows,      setRows]      = useState<InventoryRow[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [search,    setSearch]    = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterWH,  setFilterWH]  = useState('');
  const [showZero,  setShowZero]  = useState(true);
  const [refreshed, setRefreshed] = useState(new Date());

  // Adjust modal
  const [adjRow,    setAdjRow]    = useState<InventoryRow | null>(null);
  const [adjDelta,  setAdjDelta]  = useState('');
  const [adjType,   setAdjType]   = useState<'入库' | '盘点调整'>('入库');
  const [adjNote,   setAdjNote]   = useState('');
  const [adjSaving, setAdjSaving] = useState(false);
  const [adjMsg,    setAdjMsg]    = useState('');

  // ── Load ────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [invRows, masterRows] = await Promise.all([
        callNotionPaged(DB.INVENTORY),
        callNotionPaged(DB.PRODUCT_MASTER),
      ]);
      const merged = mergeRows(invRows, masterRows);
      setRows(merged);
      syncToLocalCache(merged);
      setRefreshed(new Date());
    } catch (e: any) {
      setError(e.message || t.loadFailedFallback);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Filter ──────────────────────────────────────────────────────────────
  const categories = useMemo(() =>
    [...new Set(rows.map(r => r.category).filter(Boolean))].sort(), [rows]);

  const warehouses = useMemo(() =>
    [...new Set(rows.map(r => r.warehouse).filter(Boolean))].sort(), [rows]);

  const filtered = useMemo(() => {
    let list = rows;
    if (!showZero)    list = list.filter(r => r.currentQty > 0);
    if (filterCat)    list = list.filter(r => r.category === filterCat);
    if (filterWH)     list = list.filter(r => r.warehouse === filterWH);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        r.name.toLowerCase().includes(q) ||
        r.nameEN.toLowerCase().includes(q) ||
        r.sku.toLowerCase().includes(q)
      );
    }
    return list;
  }, [rows, showZero, filterCat, filterWH, search]);

  // ── Stats ────────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    totalValue:  rows.filter(r => r.currentQty > 0).reduce((s, r) => s + r.currentQty * r.costPrice, 0),
    inStock:     rows.filter(r => r.currentQty > 0).length,
    lowStock:    rows.filter(r => r.currentQty > 0 && r.currentQty <= 10).length,
    zeroStock:   rows.filter(r => r.currentQty <= 0).length,
    missingCost: rows.filter(r => r.currentQty > 0 && r.costPrice === 0).length,
  }), [rows]);

  // ── Adjust submit ────────────────────────────────────────────────────────
  const handleAdjSubmit = async () => {
    if (!adjRow) return;
    const delta = parseFloat(adjDelta);
    if (isNaN(delta) || delta === 0) { setAdjMsg(t.invalidQtyMsg); return; }
    setAdjSaving(true);
    setAdjMsg('');
    try {
      await writeStockAdjust({
        invPageId:     adjRow.invPageId,
        productPageId: adjRow.productPageId,
        delta,
        type:          adjType,
        operator:      'Chris',
        note:          adjNote,
      });
      setAdjMsg(t.writeSuccessMsg);
      // Optimistically update local display
      setRows(prev => prev.map(r =>
        r.invPageId === adjRow.invPageId
          ? { ...r, currentQty: r.currentQty + delta }
          : r
      ));
      setTimeout(() => { setAdjRow(null); setAdjDelta(''); setAdjNote(''); setAdjMsg(''); }, 2500);
    } catch (e: any) {
      setAdjMsg(t.writeFailedMsg.replace('{msg}', e.message));
    } finally {
      setAdjSaving(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center h-[60vh] gap-3" style={{ color: GOLD }}>
      <RefreshCw className="w-6 h-6 animate-spin" />
      <span className="text-sm font-black uppercase tracking-widest">{t.loadingFromNotion}</span>
    </div>
  );

  if (error) return (
    <div className="flex flex-col items-center justify-center h-[60vh] gap-4 text-center">
      <AlertCircle className="w-10 h-10" style={{ color: colors.statusDanger }} />
      <p className="text-sm font-black" style={{ color: colors.statusDanger }}>{error}</p>
      <p className="text-[10px] text-gray-400 max-w-sm">
        {t.loadFailedHint}
      </p>
      <button onClick={load} className="px-6 py-2 text-white rounded-xl text-xs font-black" style={{ backgroundColor: NAVY }}>{t.retry}</button>
    </div>
  );

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-black uppercase tracking-widest text-[#080D1E]">{t.pageTitle}</h2>
          <p className="text-xs text-gray-500 font-bold mt-0.5 uppercase tracking-wide">
            {t.sourceLine.replace('{n}', String(rows.length)).replace('{time}', refreshed.toLocaleTimeString())}
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-gray-500 hover:text-[#080D1E] transition-all shadow-sm"
        >
          <RefreshCw className="w-3 h-3" />{t.refreshFromNotion}
        </button>
      </div>

      {/* OPERATIONS 分区"库存流水"入口暂时指向这个页面，直到独立的明细查看
          页面做出来——只是一个轻提示，不涉及任何数据/逻辑改动。 */}
      <div className="px-4 py-2.5 rounded-xl text-[11px] font-bold" style={{ backgroundColor: `${colors.statusWarning}1F`, border: `1px solid ${colors.statusWarning}40`, color: '#8A6D2F' }}>
        {t.enhancementNotice}
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label={t.statTotalValue} value={`AED ${Number(stats.totalValue).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} color="indigo" icon={<Package className="w-4 h-4" />} />
        <StatCard label={t.statInStock} value={`${stats.inStock} ${t.statUnit}`} color="emerald" icon={<CheckCircle className="w-4 h-4" />} />
        <StatCard label={t.statLowStock} value={`${stats.lowStock} ${t.statUnit}`} color="amber" icon={<AlertCircle className="w-4 h-4" />} />
        <StatCard label={t.statZeroStock} value={`${stats.zeroStock} ${t.statUnit}`} color="red" icon={<Clock className="w-4 h-4" />} />
        <StatCard label={t.statMissingCost} value={`${stats.missingCost} ${t.statUnit}`} color="orange" icon={<AlertCircle className="w-4 h-4" />} />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2 flex-1 min-w-[180px] bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
          <Search className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder={t.searchPlaceholder}
            className="bg-transparent text-xs font-medium w-full outline-none text-gray-700 placeholder-gray-400"
          />
        </div>

        <select
          value={filterCat} onChange={e => setFilterCat(e.target.value)}
          className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-600 outline-none"
        >
          <option value="">{t.allCategories}</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <select
          value={filterWH} onChange={e => setFilterWH(e.target.value)}
          className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-600 outline-none"
        >
          <option value="">{t.allWarehouses}</option>
          {warehouses.map(w => <option key={w} value={w}>{w}</option>)}
        </select>

        <label className="flex items-center gap-2 text-xs font-black text-gray-600 uppercase cursor-pointer select-none">
          <input
            type="checkbox" checked={showZero} onChange={e => setShowZero(e.target.checked)}
            className="accent-[#080D1E]"
          />
          {t.showZeroStock}
        </label>

        <span className="text-xs font-black text-gray-500 ml-auto">
          {t.showingRecords.replace('{shown}', String(filtered.length)).replace('{total}', String(rows.length))}
        </span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {[t.colProductName, t.colSku, t.colCurrentStock, t.colUnit, t.colCostPrice, t.colWholesale, t.colInventoryValue, t.colCategory, t.colWarehouse, t.colStatus, t.colActions].map((h, i) => (
                  <th key={i} className="px-4 py-3 text-left font-black text-xs uppercase tracking-wide text-gray-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={11} className="py-12 text-center text-gray-500 text-sm font-bold">{t.noData}</td></tr>
              )}
              {filtered.map(row => {
                const badge = getBadge(row, t);
                return (
                  <tr key={row.invPageId} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-800 max-w-[220px]">
                      <div className="font-black text-gray-800 truncate" title={row.name}>{row.name || '—'}</div>
                      {row.nameEN && row.nameEN !== row.name && (
                        <div className="text-xs text-gray-400 truncate mt-0.5" title={row.nameEN}>{row.nameEN}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-gray-600 whitespace-nowrap">{row.sku || '—'}</td>
                    <td className="px-4 py-3 font-black font-mono text-[#080D1E] whitespace-nowrap text-right text-base">
                      {fmtQty(row.currentQty)}
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{unitLabel(row.unit, lang)}</td>
                    <td className="px-4 py-3 font-mono text-gray-600 whitespace-nowrap text-right">
                      {row.costPrice > 0 ? fmt2(row.costPrice) : '—'}
                    </td>
                    <td className="px-4 py-3 font-mono text-gray-600 whitespace-nowrap text-right">
                      {row.wholesale > 0 ? fmt2(row.wholesale) : '—'}
                    </td>
                    <td className="px-4 py-3 font-mono whitespace-nowrap text-right text-base">
                      {row.currentQty > 0 && row.costPrice > 0
                        ? <span className="text-[#080D1E] font-black">{fmt2(row.currentQty * row.costPrice)}</span>
                        : <span className="text-gray-300">—</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      <span className="text-xs bg-gray-100 px-2 py-1 rounded-lg font-bold">{row.category || '—'}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{row.warehouse}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`text-xs px-2 py-1 rounded-lg font-black ${badge.cls}`}>{badge.label}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <button
                        onClick={() => { setAdjRow(row); setAdjDelta(''); setAdjNote(''); setAdjMsg(''); setAdjType('入库'); }}
                        className="flex items-center gap-1 px-3 py-1.5 bg-[#CBA85C]/15 text-[#8A6D2F] rounded-lg text-xs font-black hover:bg-[#CBA85C]/25 transition-all"
                      >
                        <Edit3 className="w-3 h-3" />{t.adjustStock}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Adjust Modal */}
      {adjRow && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-black text-[#080D1E] text-sm">{t.adjustStock}</h3>
                <p className="text-[10px] text-gray-400 mt-0.5 font-bold uppercase tracking-widest">{t.adjustModalSubtitle}</p>
              </div>
              <button onClick={() => setAdjRow(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-gray-50 rounded-2xl p-4 space-y-1">
              <p className="font-black text-gray-800 text-sm truncate">{adjRow.name}</p>
              <p className="text-[10px] text-gray-400 font-mono">{adjRow.sku}</p>
              <p className="text-xs font-bold text-[#8A6D2F] mt-1">
                {t.currentStockLabel}<span className="font-black font-mono">{fmtQty(adjRow.currentQty)}</span> {unitLabel(adjRow.unit, lang)}
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 block mb-1">{t.changeTypeLabel}</label>
                <div className="flex gap-2">
                  {(['入库', '盘点调整'] as const).map(at => (
                    <button
                      key={at}
                      onClick={() => setAdjType(at)}
                      className={`flex-1 py-2 rounded-xl text-[10px] font-black border transition-all ${
                        adjType === at
                          ? 'bg-[#080D1E] text-white border-[#080D1E]'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {at === '入库' ? t.adjTypeIn : t.adjTypeCount}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 block mb-1">
                  {t.changeQtyLabel} <span className="text-gray-400 normal-case font-medium">{t.changeQtyHint}</span>
                </label>
                <input
                  type="number"
                  value={adjDelta}
                  onChange={e => setAdjDelta(e.target.value)}
                  placeholder={t.changeQtyPlaceholder}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-mono outline-none focus:border-[#CBA85C] bg-gray-50"
                />
                {adjDelta && !isNaN(parseFloat(adjDelta)) && (
                  <p className="text-[10px] text-[#8A6D2F] font-bold mt-1 pl-1">
                    {t.estimatedAfter}{fmtQty(adjRow.currentQty + parseFloat(adjDelta))} {unitLabel(adjRow.unit, lang)}
                  </p>
                )}
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 block mb-1">{t.noteLabel}</label>
                <input
                  type="text"
                  value={adjNote}
                  onChange={e => setAdjNote(e.target.value)}
                  placeholder={t.notePlaceholder}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#CBA85C] bg-gray-50"
                />
              </div>
            </div>

            {adjMsg && (
              <div className={`text-[10px] font-bold rounded-xl p-3 ${
                adjMsg.startsWith('✅') ? 'bg-[#6FBF8E]/15 text-[#3F7D58]' : 'bg-[#E0846A]/15 text-[#A85D45]'
              }`}>
                {adjMsg}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setAdjRow(null)}
                className="flex-1 py-3 border border-gray-200 rounded-2xl text-xs font-black text-gray-500 hover:bg-gray-50"
              >
                {t.cancel}
              </button>
              <button
                onClick={handleAdjSubmit}
                disabled={adjSaving || !adjDelta}
                className="flex-1 py-3 bg-[#080D1E] text-white rounded-2xl text-xs font-black flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-black transition-all"
              >
                {adjSaving ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                {adjSaving ? t.writing : t.confirmWrite}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

// ── Stat card — key names kept (call sites use color="indigo"/"orange" etc)
// -- only the literal colors changed, mapped onto the 5 allowed status
// colors. 'indigo' (库存总金额, the primary KPI) -> gold; 'orange' (缺少
//成本价, a data-quality warning like 低库存) -> the same warning color as
// 'amber', reusing one color across two warning-type stats rather than
// inventing a 6th hue. ──────────────────────────────────────────────────
const C = {
  indigo:  { border: 'border-[#CBA85C]/30',  bg: 'bg-[#CBA85C]/15',  icon: 'text-[#CBA85C]',  val: 'text-[#080D1E]' },
  emerald: { border: 'border-[#6FBF8E]/30', bg: 'bg-[#6FBF8E]/15', icon: 'text-[#3F7D58]', val: 'text-[#3F7D58]' },
  amber:   { border: 'border-[#D9B45A]/30',   bg: 'bg-[#D9B45A]/15',   icon: 'text-[#8A6D2F]',   val: 'text-[#8A6D2F]' },
  red:     { border: 'border-[#E0846A]/30',     bg: 'bg-[#E0846A]/15',     icon: 'text-[#A85D45]',     val: 'text-[#A85D45]' },
  orange:  { border: 'border-[#D9B45A]/30',  bg: 'bg-[#D9B45A]/15',  icon: 'text-[#8A6D2F]',  val: 'text-[#8A6D2F]' },
} as const;

const StatCard: React.FC<{
  label: string; value: string; color: keyof typeof C; icon: React.ReactNode;
}> = ({ label, value, color, icon }) => {
  const s = C[color];
  return (
    <div className={`bg-white rounded-2xl p-4 shadow-sm border ${s.border}`}>
      <div className={`inline-flex p-2 rounded-xl ${s.bg} ${s.icon}`}>{icon}</div>
      <div className="mt-3">
        <div className="text-xs font-black uppercase tracking-wide text-gray-500">{label}</div>
        <div className={`font-black font-mono mt-1.5 text-xl ${s.val}`}>{value}</div>
      </div>
    </div>
  );
};

export default InventoryManager;
