// Vercel Edge Runtime — AI inventory query
// Reads consignment_stock from Supabase, aggregates remaining qty by product.
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
}

interface ProductSummary {
  productName: string;
  totalConsigned: number;
  totalSold: number;
  totalRemaining: number;
  customers: string[];
  lowStock: boolean;
}

const LOW_STOCK_THRESHOLD = 5;

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS });
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !key) return json({ error: 'Supabase not configured' }, 500);

  // Optional product keyword filter from ?product=xxx
  const reqUrl = new URL(request.url);
  const productFilter = reqUrl.searchParams.get('product')?.trim() || '';

  // Build query — add ilike filter when product keyword is provided
  const baseQuery = `${url}/rest/v1/consignment_stock?select=productName,customerName,consignedQty,soldQty,remainingQty,unitPrice,settlementStatus&order=productName.asc`;
  const queryUrl = productFilter
    ? `${baseQuery}&productName=ilike.*${encodeURIComponent(productFilter)}*`
    : baseQuery;

  const res = await fetch(
    queryUrl,
    {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return json({ error: `Supabase error ${res.status}`, detail: err }, res.status);
  }

  const rows: StockRow[] = await res.json();

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
        lowStock: false,
      });
    }
    const entry = map.get(name)!;
    entry.totalConsigned += Number(row.consignedQty) || 0;
    entry.totalSold += Number(row.soldQty) || 0;
    entry.totalRemaining += Number(row.remainingQty) || 0;
    if (row.customerName && !entry.customers.includes(row.customerName)) {
      entry.customers.push(row.customerName);
    }
  }

  // Mark low stock and sort: low stock first, then by remaining asc
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
    lowStockCount: products.filter(p => p.lowStock).length,
    products,
    productFilter: productFilter || null,
    asOf: new Date().toISOString(),
  });
}
