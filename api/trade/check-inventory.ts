// Vercel Edge Runtime — AI inventory query
// Reads consignment_stock from Supabase.
//
// IMPORTANT: cloudDb wraps all business data into a fixed schema:
//   { id, created_at, updated_at, state, payload: { productName, ... } }
// Business fields live inside `payload` (JSONB), NOT as top-level columns.
// We select `payload` and filter/aggregate in memory.
export const config = { runtime: 'edge' };

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

interface StockRow {
  productName: string;
  customerName: string;
  consignedQty: number;
  soldQty: number;
  remainingQty: number;
  unitPrice: number;
  settlementStatus: string;
  soNo?: string;
  productId?: string | null;
}

interface DbRow {
  id: string;
  created_at: string;
  state: string;
  payload: StockRow;
}

interface ProductSummary {
  productName: string;
  totalConsigned: number;
  totalSold: number;
  totalRemaining: number;
  customers: string[];
  soNos: string[];
  lowStock: boolean;
  outOfStock: boolean;   // remainingQty <= 0
  anomaly: boolean;      // remainingQty missing or NaN across all rows for this product
}

export const LOW_STOCK_THRESHOLD = 5;

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS });
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !key) {
    return json({ ok: false, error: 'Supabase not configured — check env vars SUPABASE_URL and SUPABASE_ANON_KEY' }, 500);
  }

  // Optional product keyword filter from ?product=xxx (applied in memory after fetch)
  const reqUrl = new URL(request.url);
  const productFilter = reqUrl.searchParams.get('product')?.trim().toLowerCase() || '';

  // Fetch all rows — select only payload (business data stored inside JSONB payload column)
  // state=active excludes soft-deleted rows
  const queryUrl = `${supabaseUrl}/rest/v1/consignment_stock?select=id,created_at,state,payload&state=eq.active&order=created_at.desc&limit=500`;

  const res = await fetch(queryUrl, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    return json({ ok: false, error: `Supabase ${res.status}`, detail: errText }, 200);
  }

  const dbRows: DbRow[] = await res.json();

  // Extract business data from payload, filter by product keyword if provided
  const rows: StockRow[] = dbRows
    .map(r => r.payload)
    .filter(Boolean)
    .filter(p => {
      if (!productFilter) return true;
      const name = (p.productName || '').toLowerCase();
      return name.includes(productFilter);
    });

  // Aggregate by productName
  // Track whether each product has any row with a valid remainingQty
  const map = new Map<string, ProductSummary & { _hasValidQty: boolean }>();
  for (const row of rows) {
    const name = (row.productName || '').trim();
    if (!name) continue;
    if (!map.has(name)) {
      map.set(name, {
        productName: name,
        totalConsigned: 0,
        totalSold: 0,
        totalRemaining: 0,
        customers: [],
        soNos: [],
        lowStock: false,
        outOfStock: false,
        anomaly: false,
        _hasValidQty: false,
      });
    }
    const entry = map.get(name)!;
    const rawQty = row.remainingQty;
    const parsedQty = Number(rawQty);
    if (rawQty !== null && rawQty !== undefined && !isNaN(parsedQty)) {
      entry._hasValidQty = true;
      entry.totalRemaining += parsedQty;
    }
    entry.totalConsigned += Number(row.consignedQty) || 0;
    entry.totalSold     += Number(row.soldQty)      || 0;
    if (row.customerName && !entry.customers.includes(row.customerName)) {
      entry.customers.push(row.customerName);
    }
    if (row.soNo && !entry.soNos.includes(row.soNo)) {
      entry.soNos.push(row.soNo);
    }
  }

  const products = Array.from(map.values()).map(({ _hasValidQty, ...p }) => ({
    ...p,
    anomaly: !_hasValidQty,
    outOfStock: _hasValidQty && p.totalRemaining <= 0,
    lowStock: _hasValidQty && p.totalRemaining > 0 && p.totalRemaining <= LOW_STOCK_THRESHOLD,
  }));

  // Sort: out-of-stock first, then low-stock, then anomaly, then normal (by remaining asc)
  products.sort((a, b) => {
    const rank = (p: typeof products[0]) =>
      p.outOfStock ? 0 : p.anomaly ? 1 : p.lowStock ? 2 : 3;
    const ra = rank(a), rb = rank(b);
    if (ra !== rb) return ra - rb;
    return a.totalRemaining - b.totalRemaining;
  });

  // ── Row-level classification (excludes SETTLED rows) ──────────────────────
  // Product-level aggregation (products[]) is kept for reference but counts
  // now reflect individual rows so that a single 0-qty row correctly shows as 缺货.
  const settledRows  = rows.filter(r => (r.settlementStatus || '').toUpperCase() === 'SETTLED');
  const activeRows   = rows.filter(r => (r.settlementStatus || '').toUpperCase() !== 'SETTLED');
  const settledRowsExcluded = settledRows.length;

  const zeroRemainingRows = rows.filter(r => {
    const q = Number(r.remainingQty);
    return r.remainingQty != null && !isNaN(q) && q <= 0;
  }).length;

  function classifyRow(r: StockRow): 'outOfStock' | 'lowStock' | 'anomaly' | 'normal' {
    const raw = r.remainingQty;
    const q   = Number(raw);
    if (raw === null || raw === undefined || isNaN(q)) return 'anomaly';
    if (q <= 0) return 'outOfStock';
    if (q <= LOW_STOCK_THRESHOLD) return 'lowStock';
    return 'normal';
  }

  const classifiedActive = activeRows.map(r => ({ ...r, rowAlertType: classifyRow(r) }));
  const alertRowsAll = classifiedActive.filter(r => r.rowAlertType !== 'normal');

  const outOfStockCount = alertRowsAll.filter(r => r.rowAlertType === 'outOfStock').length;
  const lowStockCount   = alertRowsAll.filter(r => r.rowAlertType === 'lowStock').length;
  const anomalyCount    = alertRowsAll.filter(r => r.rowAlertType === 'anomaly').length;
  const alertCount = outOfStockCount + lowStockCount + anomalyCount;

  // Sort alertRows: outOfStock first, then anomaly, then lowStock
  alertRowsAll.sort((a, b) => {
    const rank = (t: string) => t === 'outOfStock' ? 0 : t === 'anomaly' ? 1 : 2;
    return rank(a.rowAlertType) - rank(b.rowAlertType);
  });

  const alertRows = alertRowsAll.map(r => ({
    productName:      (r.productName || '').trim(),
    customerName:     r.customerName || '',
    soNo:             r.soNo || '',
    consignedQty:     Number(r.consignedQty) || 0,
    soldQty:          Number(r.soldQty)      || 0,
    remainingQty:     r.remainingQty != null && !isNaN(Number(r.remainingQty)) ? Number(r.remainingQty) : null,
    settlementStatus: r.settlementStatus || '',
    unitPrice:        r.unitPrice ? Number(r.unitPrice) : null,
    rowAlertType:     r.rowAlertType,
  }));

  return json({
    ok: true,
    source: 'supabase',
    sourceTable: 'consignment_stock',
    stockScope: 'consignment_only',
    total: products.length,
    rawRowCount: dbRows.length,
    activeRowCount: activeRows.length,
    settledRowsExcluded,
    zeroRemainingRows,
    alertCount,
    outOfStockCount,
    lowStockCount,
    anomalyCount,
    lowStockThreshold: LOW_STOCK_THRESHOLD,
    products,
    alertRows,
    productFilter: productFilter || null,
    asOf: new Date().toISOString(),
  });
}
