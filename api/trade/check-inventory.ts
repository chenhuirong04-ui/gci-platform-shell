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

  const outOfStockCount = products.filter(p => p.outOfStock).length;
  const lowStockCount   = products.filter(p => p.lowStock).length;
  const anomalyCount    = products.filter(p => p.anomaly).length;
  const alertCount = outOfStockCount + lowStockCount + anomalyCount;

  // Build per-row detail for alert products (for Drawer display)
  const alertProductNames = new Set(
    products.filter(p => p.outOfStock || p.lowStock || p.anomaly).map(p => p.productName)
  );
  const alertRows = rows
    .filter(r => alertProductNames.has((r.productName || '').trim()))
    .map(r => ({
      productName:      (r.productName || '').trim(),
      customerName:     r.customerName || '',
      soNo:             r.soNo || '',
      consignedQty:     Number(r.consignedQty) || 0,
      soldQty:          Number(r.soldQty)      || 0,
      remainingQty:     r.remainingQty != null && !isNaN(Number(r.remainingQty)) ? Number(r.remainingQty) : null,
      settlementStatus: r.settlementStatus || '',
      unitPrice:        r.unitPrice ? Number(r.unitPrice) : null,
    }));

  return json({
    ok: true,
    total: products.length,
    rawRowCount: dbRows.length,
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
