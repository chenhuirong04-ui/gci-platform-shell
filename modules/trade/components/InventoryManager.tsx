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

// ── Stock status badge ──────────────────────────────────────────────────────
type Badge = { label: string; cls: string };
function getBadge(row: InventoryRow): Badge {
  if (row.currentQty <= 0)  return { label: '零库存', cls: 'bg-[#E0846A]/15 text-[#A85D45] border border-[#E0846A]/30' };
  if (row.currentQty <= 10) return { label: '低库存', cls: 'bg-[#D9B45A]/15 text-[#8A6D2F] border border-[#D9B45A]/30' };
  return { label: '正常',   cls: 'bg-[#6FBF8E]/15 text-[#3F7D58] border border-[#6FBF8E]/30' };
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
      setError(e.message || 'Notion 读取失败');
    } finally {
      setLoading(false);
    }
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
    if (isNaN(delta) || delta === 0) { setAdjMsg('请输入有效数量（正数=入库，负数=出库/盘减）'); return; }
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
      setAdjMsg('✅ 已写入 Notion STOCK_LEDGER，库存数字将在 Notion 公式刷新后更新');
      // Optimistically update local display
      setRows(prev => prev.map(r =>
        r.invPageId === adjRow.invPageId
          ? { ...r, currentQty: r.currentQty + delta }
          : r
      ));
      setTimeout(() => { setAdjRow(null); setAdjDelta(''); setAdjNote(''); setAdjMsg(''); }, 2500);
    } catch (e: any) {
      setAdjMsg(`❌ 写入失败: ${e.message}`);
    } finally {
      setAdjSaving(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center h-[60vh] gap-3" style={{ color: GOLD }}>
      <RefreshCw className="w-6 h-6 animate-spin" />
      <span className="text-sm font-black uppercase tracking-widest">Loading from Notion...</span>
    </div>
  );

  if (error) return (
    <div className="flex flex-col items-center justify-center h-[60vh] gap-4 text-center">
      <AlertCircle className="w-10 h-10" style={{ color: colors.statusDanger }} />
      <p className="text-sm font-black" style={{ color: colors.statusDanger }}>{error}</p>
      <p className="text-[10px] text-gray-400 max-w-sm">
        Notion 数据读取失败。请检查网络连接，或联系系统管理员确认 API 配置。
      </p>
      <button onClick={load} className="px-6 py-2 text-white rounded-xl text-xs font-black" style={{ backgroundColor: NAVY }}>重试</button>
    </div>
  );

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-black uppercase tracking-widest text-[#080D1E]">库存管理</h2>
          <p className="text-xs text-gray-500 font-bold mt-0.5 uppercase tracking-wide">
            Notion INVENTORY · {rows.length} 行 · 刷新 {refreshed.toLocaleTimeString()}
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-gray-500 hover:text-[#080D1E] transition-all shadow-sm"
        >
          <RefreshCw className="w-3 h-3" />从 Notion 刷新
        </button>
      </div>

      {/* OPERATIONS 分区"库存流水"入口暂时指向这个页面，直到独立的明细查看
          页面做出来——只是一个轻提示，不涉及任何数据/逻辑改动。 */}
      <div className="px-4 py-2.5 rounded-xl text-[11px] font-bold" style={{ backgroundColor: `${colors.statusWarning}1F`, border: `1px solid ${colors.statusWarning}40`, color: '#8A6D2F' }}>
        库存流水明细页面正在完善中。当前页面显示库存总览与库存调整功能。
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="库存总金额" value={`AED ${Number(stats.totalValue).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} color="indigo" icon={<Package className="w-4 h-4" />} />
        <StatCard label="在库 SKU" value={`${stats.inStock} 种`} color="emerald" icon={<CheckCircle className="w-4 h-4" />} />
        <StatCard label="低库存 (≤10)" value={`${stats.lowStock} 种`} color="amber" icon={<AlertCircle className="w-4 h-4" />} />
        <StatCard label="零库存" value={`${stats.zeroStock} 种`} color="red" icon={<Clock className="w-4 h-4" />} />
        <StatCard label="缺少成本价" value={`${stats.missingCost} 种`} color="orange" icon={<AlertCircle className="w-4 h-4" />} />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2 flex-1 min-w-[180px] bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
          <Search className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="搜索产品名 / SKU..."
            className="bg-transparent text-xs font-medium w-full outline-none text-gray-700 placeholder-gray-400"
          />
        </div>

        <select
          value={filterCat} onChange={e => setFilterCat(e.target.value)}
          className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-600 outline-none"
        >
          <option value="">全部类别</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <select
          value={filterWH} onChange={e => setFilterWH(e.target.value)}
          className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-600 outline-none"
        >
          <option value="">全部仓库</option>
          {warehouses.map(w => <option key={w} value={w}>{w}</option>)}
        </select>

        <label className="flex items-center gap-2 text-xs font-black text-gray-600 uppercase cursor-pointer select-none">
          <input
            type="checkbox" checked={showZero} onChange={e => setShowZero(e.target.checked)}
            className="accent-[#080D1E]"
          />
          显示零库存
        </label>

        <span className="text-xs font-black text-gray-500 ml-auto">
          显示 {filtered.length} / {rows.length} 行
        </span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['产品名称', 'SKU', '当前库存', '单位', '成本价 AED', '批发价 AED', '库存金额', '类别', '仓库', '状态', '操作'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-black text-xs uppercase tracking-wide text-gray-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={11} className="py-12 text-center text-gray-500 text-sm font-bold">暂无数据</td></tr>
              )}
              {filtered.map(row => {
                const badge = getBadge(row);
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
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{row.unit}</td>
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
                        <Edit3 className="w-3 h-3" />库存调整
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
                <h3 className="font-black text-[#080D1E] text-sm">库存调整</h3>
                <p className="text-[10px] text-gray-400 mt-0.5 font-bold uppercase tracking-widest">写入 Notion STOCK_LEDGER</p>
              </div>
              <button onClick={() => setAdjRow(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-gray-50 rounded-2xl p-4 space-y-1">
              <p className="font-black text-gray-800 text-sm truncate">{adjRow.name}</p>
              <p className="text-[10px] text-gray-400 font-mono">{adjRow.sku}</p>
              <p className="text-xs font-bold text-[#8A6D2F] mt-1">
                当前库存：<span className="font-black font-mono">{fmtQty(adjRow.currentQty)}</span> {adjRow.unit}
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 block mb-1">变动类型</label>
                <div className="flex gap-2">
                  {(['入库', '盘点调整'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setAdjType(t)}
                      className={`flex-1 py-2 rounded-xl text-[10px] font-black border transition-all ${
                        adjType === t
                          ? 'bg-[#080D1E] text-white border-[#080D1E]'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 block mb-1">
                  变动数量 <span className="text-gray-400 normal-case font-medium">（正数=增加，负数=减少）</span>
                </label>
                <input
                  type="number"
                  value={adjDelta}
                  onChange={e => setAdjDelta(e.target.value)}
                  placeholder="如：+50 或 -12"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-mono outline-none focus:border-[#CBA85C] bg-gray-50"
                />
                {adjDelta && !isNaN(parseFloat(adjDelta)) && (
                  <p className="text-[10px] text-[#8A6D2F] font-bold mt-1 pl-1">
                    预计调整后库存：{fmtQty(adjRow.currentQty + parseFloat(adjDelta))} {adjRow.unit}
                  </p>
                )}
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 block mb-1">备注（可选）</label>
                <input
                  type="text"
                  value={adjNote}
                  onChange={e => setAdjNote(e.target.value)}
                  placeholder="如：新到货/盘点误差"
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
                取消
              </button>
              <button
                onClick={handleAdjSubmit}
                disabled={adjSaving || !adjDelta}
                className="flex-1 py-3 bg-[#080D1E] text-white rounded-2xl text-xs font-black flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-black transition-all"
              >
                {adjSaving ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                {adjSaving ? '写入中...' : '确认写入'}
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
