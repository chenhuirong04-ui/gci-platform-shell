// /api/ai/inventory-table-alerts
// Reads self-owned warehouse stock via api/_lib/inventoryCatalog — the same
// canonical Notion INVENTORY_DB + PRODUCT_MASTER reader that backs the real
// /trade?tab=inventory page (modules/trade/components/InventoryManager.tsx).
// Read-only. Does NOT write to Notion.
export const config = { runtime: 'edge' };

import { fetchInventoryCatalog, type InventoryCatalogRow } from '../_lib/inventoryCatalog';

const LOW_STOCK_DEFAULT = 5;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// Module-level best-effort cache (single Vercel Edge instance)
let _cache: { data: any; ts: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ── Product match helper ─────────────────────────────────────────────────────
// Bidirectional + multi-field + multi-token matching against name/EN name/SKU/category.
function matchItem(row: InventoryCatalogRow, keyword: string): boolean {
  const kw = keyword.toLowerCase().trim();
  if (!kw) return true;
  const nameLower = (row.name || '').toLowerCase().trim();
  const text = [nameLower, (row.nameEN || '').toLowerCase(), (row.sku || '').toLowerCase(), (row.category || '').toLowerCase(), (row.brand || '').toLowerCase()]
    .filter(Boolean).join(' ');

  if (text.includes(kw)) return true;
  if (nameLower.length >= 2 && kw.includes(nameLower)) return true;
  const tokens = kw.split(/\s+/).filter(t => t.length >= 1);
  if (tokens.length > 1 && tokens.every(t => text.includes(t))) return true;

  return false;
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS });
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const token = process.env.NOTION_TOKEN;
  if (!token) {
    return json({
      ok: false,
      error: 'NOTION_TOKEN 未配置',
      source: 'notion',
      sourceTable: 'INVENTORY_DB',
      stockScope: 'warehouse_inventory',
    }, 200);
  }

  const reqUrl = new URL(request.url);
  const productFilter = reqUrl.searchParams.get('product')?.trim().toLowerCase() || '';
  const bustCache = reqUrl.searchParams.get('nocache') === '1';

  // Serve from cache when no product filter (homepage count call)
  if (!bustCache && !productFilter && _cache && Date.now() - _cache.ts < CACHE_TTL) {
    return json({ ..._cache.data, cached: true });
  }

  let catalog: InventoryCatalogRow[];
  try {
    catalog = await fetchInventoryCatalog(token);
  } catch (e: any) {
    return json({
      ok: false,
      error: 'Notion 库存表读取失败，请稍后重试。',
      detail: e?.message,
      source: 'notion',
      sourceTable: 'INVENTORY_DB',
      stockScope: 'warehouse_inventory',
    }, 200);
  }

  const rowsToUse = productFilter ? catalog.filter(r => matchItem(r, productFilter)) : catalog;

  const allItems = rowsToUse.map(row => {
    const threshold = LOW_STOCK_DEFAULT;
    let alertType: 'outOfStock' | 'lowStock' | 'anomaly' | 'normal';
    if (row.currentQty === null || Number.isNaN(row.currentQty)) alertType = 'anomaly';
    else if (row.currentQty <= 0) alertType = 'outOfStock';
    else if (row.currentQty <= threshold) alertType = 'lowStock';
    else alertType = 'normal';

    const actionSuggestion =
      alertType === 'outOfStock' ? '请尽快补货或暂停相关报价' :
      alertType === 'lowStock'   ? '建议确认是否需要补货' :
      alertType === 'anomaly'    ? '请检查库存记录字段是否完整' : '';

    return {
      pageId: row.invPageId,
      productName: row.name || row.nameEN,
      nameEN: row.nameEN,
      sku: row.sku,
      category: row.category,
      warehouse: row.warehouse,
      unit: row.unit,
      currentQty: row.currentQty,
      threshold,
      statusVal: row.stockStatus,
      updatedAt: row.updatedAt,
      alertType,
      actionSuggestion,
    };
  });

  const items = allItems;

  // Sort: outOfStock → anomaly → lowStock → normal
  const sortRank = (t: string) => t === 'outOfStock' ? 0 : t === 'anomaly' ? 1 : t === 'lowStock' ? 2 : 3;
  items.sort((a, b) => sortRank(a.alertType) - sortRank(b.alertType));

  // When a keyword filter is active, return ALL matching items so users see every coffee/tissue/etc.
  // Without a filter (homepage alert mode), show only alert items.
  const alertItems = productFilter
    ? items
    : items.filter(i => i.alertType !== 'normal');
  const outOfStockCount = alertItems.filter(i => i.alertType === 'outOfStock').length;
  const lowStockCount   = alertItems.filter(i => i.alertType === 'lowStock').length;
  const anomalyCount    = alertItems.filter(i => i.alertType === 'anomaly').length;
  const alertCount      = alertItems.length;

  const result = {
    ok: true,
    source: 'notion',
    sourceTable: 'INVENTORY_DB',
    stockScope: 'warehouse_inventory',
    totalRows: items.length,
    alertCount,
    outOfStockCount,
    lowStockCount,
    anomalyCount,
    lowStockThreshold: LOW_STOCK_DEFAULT,
    alertItems,
    productFilter: productFilter || null,
    asOf: new Date().toISOString(),
  };

  // Cache full-DB result only (no product filter)
  if (!productFilter) _cache = { data: result, ts: Date.now() };

  return json(result);
}
