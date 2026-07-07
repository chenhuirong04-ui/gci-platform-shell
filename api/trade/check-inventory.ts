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
}

const LOW_STOCK_THRESHOLD = 5;

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
  const map = new Map<string, ProductSummary>();
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
      });
    }
    const entry = map.get(name)!;
    entry.totalConsigned += Number(row.consignedQty) || 0;
    entry.totalSold     += Number(row.soldQty)      || 0;
    entry.totalRemaining += Number(row.remainingQty) || 0;
    if (row.customerName && !entry.customers.includes(row.customerName)) {
      entry.customers.push(row.customerName);
    }
    if (row.soNo && !entry.soNos.includes(row.soNo)) {
      entry.soNos.push(row.soNo);
    }
  }

  const products = Array.from(map.values()).map(p => ({
    ...p,
    lowStock: p.totalRemaining <= LOW_STOCK_THRESHOLD,
  }));

  products.sort((a, b) => {
    if (a.lowStock !== b.lowStock) return a.lowStock ? -1 : 1;
    return a.totalRemaining - b.totalRemaining;
  });

  return json({
    ok: true,
    total: products.length,
    rawRowCount: dbRows.length,
    lowStockCount: products.filter(p => p.lowStock).length,
    products,
    productFilter: productFilter || null,
    asOf: new Date().toISOString(),
  });
}
