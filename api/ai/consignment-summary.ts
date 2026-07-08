// /api/ai/consignment-summary
// Reads consignment_stock (cloudDb payload-wrapped format).
// Row structure: { id, created_at, state, payload: { ConsignmentStockRecord } }
// Optional ?customer= and ?product= fuzzy filters.
// Default focus: UNSETTLED + PARTIAL records (most actionable), but all shown.
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

interface StockPayload {
  id: string;
  soNo: string;
  customerName: string;
  productName: string;
  consignedQty: number;
  soldQty: number;
  remainingQty: number;
  unitPrice: number;
  amount: number;
  settlementStatus: 'UNSETTLED' | 'PARTIAL' | 'SETTLED';
  receivedAmount?: number;
  createdAt: string;
}

interface DbRow {
  id: string;
  created_at: string;
  state: string;
  payload: StockPayload;
}

const SETTLEMENT_ZH: Record<string, string> = {
  UNSETTLED: '未结算',
  PARTIAL:   '部分结算',
  SETTLED:   '已结算',
};

// Priority sort: UNSETTLED first, then PARTIAL, then SETTLED
const SETTLEMENT_ORDER: Record<string, number> = { UNSETTLED: 0, PARTIAL: 1, SETTLED: 2 };

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS });
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key         = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !key) return json({ ok: false, error: 'Supabase not configured' }, 500);

  const reqUrl  = new URL(request.url);
  const customer = reqUrl.searchParams.get('customer')?.trim().toLowerCase() || '';
  const product  = reqUrl.searchParams.get('product')?.trim().toLowerCase()  || '';

  const queryUrl = `${supabaseUrl}/rest/v1/consignment_stock`
    + `?select=id,created_at,state,payload`
    + `&state=eq.active`
    + `&order=created_at.desc`
    + `&limit=500`;

  const res = await fetch(queryUrl, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    return json({ ok: false, error: `Supabase ${res.status}`, detail: errText });
  }

  const dbRows: DbRow[] = await res.json();

  // Extract payload, apply optional filters
  const rows: StockPayload[] = dbRows
    .map(r => r.payload)
    .filter(Boolean)
    .filter(p => {
      if (customer && !(p.customerName || '').toLowerCase().includes(customer)) return false;
      if (product  && !(p.productName  || '').toLowerCase().includes(product))  return false;
      return true;
    });

  // Sort: unsettled/partial first, then by remaining qty desc
  rows.sort((a, b) => {
    const so = (SETTLEMENT_ORDER[a.settlementStatus] ?? 2) - (SETTLEMENT_ORDER[b.settlementStatus] ?? 2);
    if (so !== 0) return so;
    return (Number(b.remainingQty) || 0) - (Number(a.remainingQty) || 0);
  });

  // Summary stats
  const unsettledCount = rows.filter(r => r.settlementStatus === 'UNSETTLED').length;
  const partialCount   = rows.filter(r => r.settlementStatus === 'PARTIAL').length;
  const settledCount   = rows.filter(r => r.settlementStatus === 'SETTLED').length;
  const totalConsigned = rows.reduce((s, r) => s + (Number(r.consignedQty)  || 0), 0);
  const totalSold      = rows.reduce((s, r) => s + (Number(r.soldQty)       || 0), 0);
  const totalRemaining = rows.reduce((s, r) => s + (Number(r.remainingQty)  || 0), 0);
  const totalAmount    = rows.reduce((s, r) => s + (Number(r.amount)        || 0), 0);

  const records = rows.map(p => ({
    soNo:             p.soNo || '—',
    customerName:     p.customerName || '—',
    productName:      p.productName  || '—',
    consignedQty:     Number(p.consignedQty)  || 0,
    soldQty:          Number(p.soldQty)        || 0,
    remainingQty:     Number(p.remainingQty)   || 0,
    unitPrice:        Number(p.unitPrice)      || 0,
    amount:           Number(p.amount)         || 0,
    receivedAmount:   Number(p.receivedAmount) || 0,
    settlementStatus: p.settlementStatus || 'UNSETTLED',
    settlementZh:     SETTLEMENT_ZH[p.settlementStatus] || p.settlementStatus,
    createdAt:        p.createdAt || '',
    action: p.settlementStatus === 'UNSETTLED'
      ? '⚠ 待结算 — 确认已售数量后结算'
      : p.settlementStatus === 'PARTIAL'
        ? '部分已收 — 跟进余款'
        : '已结算',
  }));

  return json({
    ok:              true,
    customerFilter:  customer || null,
    productFilter:   product  || null,
    total:           records.length,
    unsettledCount,
    partialCount,
    settledCount,
    totalConsigned,
    totalSold,
    totalRemaining,
    totalAmount,
    records,
    source:          'consignment_stock (payload)',
    asOf:            new Date().toISOString(),
  });
}
