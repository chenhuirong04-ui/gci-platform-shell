// /api/ai/inventory-table-alerts
// Reads Notion INVENTORY_DB for warehouse-level stock alerts.
// Returns outOfStock / lowStock / anomaly items with adaptive field detection.
// Read-only. Does NOT write to Notion.
export const config = { runtime: 'edge' };

const INVENTORY_DB = '2c6d0b13b3b9806db227fc01f723bc40';
const LOW_STOCK_DEFAULT = 5;
const NOTION_BASE = 'https://api.notion.com/v1';

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

// Property name candidates — ordered by priority
const NAME_CANDS   = ['名称', '产品名称', 'Name', 'Product Name', '品名'];
const QTY_CANDS    = ['库存数量', '当前库存', '在库数量', '库存', '数量', 'Quantity', 'Stock', '库存量', '现有库存'];
const MIN_CANDS    = ['最低库存', '安全库存', '最小库存', '库存下限', 'Min Stock', 'Low Stock Threshold', 'Safety Stock'];
const CAT_CANDS    = ['分类', '类别', '品类', 'Category', '产品分类'];
const WH_CANDS     = ['仓库', '位置', '存放位置', 'Warehouse', 'Location', '存放仓库'];
const SKU_CANDS    = ['SKU', 'sku', '货号', '编号', '型号', 'Item Code'];
const STATUS_CANDS = ['状态', 'Status', '库存状态'];

function findField(props: Record<string, any>, cands: string[]): string | null {
  for (const c of cands) if (props[c] !== undefined) return c;
  return null;
}

function getTitle(page: any, field: string | null): string {
  if (!field) return '';
  const p = page.properties[field];
  if (!p || p.type !== 'title') return '';
  return (p.title || []).map((t: any) => t.plain_text || '').join('');
}

function getNumber(page: any, field: string | null): number | null {
  if (!field) return null;
  const p = page.properties[field];
  if (!p || p.type !== 'number' || p.number === null || p.number === undefined) return null;
  return p.number;
}

function getText(page: any, field: string | null): string {
  if (!field) return '';
  const p = page.properties[field];
  if (!p) return '';
  if (p.type === 'rich_text') return (p.rich_text || []).map((t: any) => t.plain_text || '').join('');
  if (p.type === 'title') return (p.title || []).map((t: any) => t.plain_text || '').join('');
  if (p.type === 'select') return p.select?.name || '';
  if (p.type === 'multi_select') return (p.multi_select || []).map((s: any) => s.name).join(', ');
  if (p.type === 'formula') {
    const fv = p.formula;
    if (fv?.type === 'string') return fv.string || '';
    if (fv?.type === 'number') return String(fv.number ?? '');
  }
  return '';
}

function getSelect(page: any, field: string | null): string {
  if (!field) return '';
  const p = page.properties[field];
  if (!p) return '';
  if (p.type === 'select') return p.select?.name || '';
  if (p.type === 'multi_select') return (p.multi_select || []).map((s: any) => s.name).join(', ');
  return '';
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

  const notionHeaders = {
    Authorization: `Bearer ${token}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
  };

  // ── Step 1: Fetch DB schema to discover property names ────────────────────
  let schemaProps: Record<string, any> = {};
  try {
    const schemaRes = await fetch(`${NOTION_BASE}/databases/${INVENTORY_DB}`, { headers: notionHeaders });
    if (schemaRes.ok) {
      const schema = await schemaRes.json();
      schemaProps = schema.properties || {};
    } else {
      const errText = await schemaRes.text().catch(() => '');
      return json({
        ok: false,
        error: `Notion 库存表读取失败 (schema ${schemaRes.status})`,
        detail: errText,
        source: 'notion',
        sourceTable: 'INVENTORY_DB',
        stockScope: 'warehouse_inventory',
      }, 200);
    }
  } catch (e: any) {
    return json({
      ok: false,
      error: `Notion 库存表读取失败，请稍后重试。`,
      detail: e.message,
      source: 'notion',
      sourceTable: 'INVENTORY_DB',
      stockScope: 'warehouse_inventory',
    }, 200);
  }

  // Detect field names
  const nameField   = findField(schemaProps, NAME_CANDS);
  const qtyField    = findField(schemaProps, QTY_CANDS);
  const minField    = findField(schemaProps, MIN_CANDS);
  const catField    = findField(schemaProps, CAT_CANDS);
  const whField     = findField(schemaProps, WH_CANDS);
  const skuField    = findField(schemaProps, SKU_CANDS);
  const statusField = findField(schemaProps, STATUS_CANDS);

  const warnings: string[] = [];
  if (!nameField) warnings.push('未找到产品名称字段（候选：名称/产品名称/Name）。');
  if (!qtyField)  warnings.push('未找到库存数量字段（候选：库存数量/当前库存/数量/Quantity）。所有产品将显示为数据异常。');
  if (!minField)  warnings.push(`未找到安全库存字段（候选：最低库存/安全库存），当前使用默认低库存阈值 ${LOW_STOCK_DEFAULT}。`);

  // ── Step 2: Paginate through all records ─────────────────────────────────
  const pages: any[] = [];
  let cursor: string | undefined;
  let loopCount = 0;
  try {
    do {
      const body: any = { page_size: 100 };
      if (cursor) body.start_cursor = cursor;
      const queryRes = await fetch(`${NOTION_BASE}/databases/${INVENTORY_DB}/query`, {
        method: 'POST',
        headers: notionHeaders,
        body: JSON.stringify(body),
      });
      if (!queryRes.ok) {
        const errText = await queryRes.text().catch(() => '');
        return json({
          ok: false,
          error: `Notion 库存表查询失败 (${queryRes.status})`,
          detail: errText,
          source: 'notion',
          sourceTable: 'INVENTORY_DB',
          stockScope: 'warehouse_inventory',
        }, 200);
      }
      const qdata = await queryRes.json();
      pages.push(...(qdata.results || []));
      cursor = qdata.has_more ? qdata.next_cursor : undefined;
      loopCount++;
      if (loopCount > 10) break; // safety: max 1000 rows
    } while (cursor);
  } catch (e: any) {
    return json({
      ok: false,
      error: 'Notion 库存表读取失败，请稍后重试。',
      detail: e.message,
      source: 'notion',
      sourceTable: 'INVENTORY_DB',
      stockScope: 'warehouse_inventory',
    }, 200);
  }

  // ── Step 3: Map pages to items and classify ──────────────────────────────
  const allItems = pages.map(page => {
    const productName = getTitle(page, nameField);
    if (!productName) return null;

    const sku        = getText(page, skuField);
    const category   = getSelect(page, catField) || getText(page, catField);
    const warehouse  = getSelect(page, whField) || getText(page, whField);
    const statusVal  = getSelect(page, statusField) || getText(page, statusField);
    const currentQty = getNumber(page, qtyField);
    const minQty     = getNumber(page, minField);
    const threshold  = minQty ?? LOW_STOCK_DEFAULT;
    const updatedAt  = page.last_edited_time || '';
    const pageId     = page.id;

    let alertType: 'outOfStock' | 'lowStock' | 'anomaly' | 'normal';
    if (currentQty === null || isNaN(currentQty)) alertType = 'anomaly';
    else if (currentQty <= 0) alertType = 'outOfStock';
    else if (currentQty <= threshold) alertType = 'lowStock';
    else alertType = 'normal';

    const actionSuggestion =
      alertType === 'outOfStock' ? '请尽快补货或暂停相关报价' :
      alertType === 'lowStock'   ? '建议确认是否需要补货' :
      alertType === 'anomaly'    ? '请检查库存记录字段是否完整' : '';

    return { pageId, productName, sku, category, warehouse, currentQty, minQty, threshold, statusVal, updatedAt, alertType, actionSuggestion };
  }).filter(Boolean) as NonNullable<ReturnType<typeof pages[0]>>[];

  // Apply product filter if provided
  const items = productFilter
    ? allItems.filter(i => i.productName.toLowerCase().includes(productFilter))
    : allItems;

  // Sort: outOfStock → anomaly → lowStock → normal
  const sortRank = (t: string) => t === 'outOfStock' ? 0 : t === 'anomaly' ? 1 : t === 'lowStock' ? 2 : 3;
  items.sort((a, b) => sortRank(a.alertType) - sortRank(b.alertType));

  const alertItems     = items.filter(i => i.alertType !== 'normal');
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
    fieldMap: { nameField, qtyField, minField, catField, whField, skuField, statusField },
    warnings,
    alertItems,
    productFilter: productFilter || null,
    asOf: new Date().toISOString(),
  };

  // Cache full-DB result only (no product filter)
  if (!productFilter) _cache = { data: result, ts: Date.now() };

  return json(result);
}
