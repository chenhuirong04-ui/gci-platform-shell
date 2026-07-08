// /api/ai/sales-summary
// Reads orders table (cloudDb payload-wrapped format).
// Valid sale statuses: PAID, PARTIAL, CONSIGNMENT (excludes VOIDED, PENDING has no revenue yet).
// Optional ?period=today|week|month (default: month)
// Optional ?customer= fuzzy filter
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

interface OrderPayload {
  id: string;
  customerName: string;
  grandTotal: number;
  paidAmount: number;
  outstandingAmount: number;
  status: string;
  createdAt: string;
  subtotal?: number;
  vat?: number;
}

interface DbRow {
  id: string;
  created_at: string;
  state: string;
  payload: OrderPayload;
}

// Valid revenue-generating statuses (excludes VOIDED; PENDING = no payment yet)
const SALE_STATUSES = new Set(['PAID', 'PARTIAL', 'CONSIGNMENT']);

const STATUS_ZH: Record<string, string> = {
  PENDING:     '待付款',
  PARTIAL:     '部分付款',
  PAID:        '已付清',
  CONSIGNMENT: '寄售',
  VOIDED:      '已作废',
};

function periodStart(period: string): number {
  const now = new Date();
  if (period === 'today') {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return d.getTime();
  }
  if (period === 'week') {
    const day = now.getDay(); // 0=Sun
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
    return d.getTime();
  }
  // month (default)
  return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS });
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key         = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !key) return json({ ok: false, error: 'Supabase not configured' }, 500);

  const reqUrl   = new URL(request.url);
  const period   = reqUrl.searchParams.get('period')?.toLowerCase() || 'month';
  const customer = reqUrl.searchParams.get('customer')?.trim().toLowerCase() || '';

  // TECH DEBT (V1): orders uses JSONB payload — period and status filtering done in memory (≤1000 rows).
  // Future: mirror createdAt + status + grandTotal as top-level columns for server-side filtering.
  const queryUrl = `${supabaseUrl}/rest/v1/orders`
    + `?select=id,created_at,state,payload`
    + `&state=eq.active`
    + `&order=created_at.desc`
    + `&limit=1000`;

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
  const cutoff = periodStart(period);

  // Filter by period, valid sale statuses, optional customer
  const rows = dbRows
    .map(r => r.payload)
    .filter(Boolean)
    .filter(p => {
      if (!SALE_STATUSES.has(p.status)) return false;
      const t = p.createdAt ? new Date(p.createdAt).getTime() : 0;
      if (t < cutoff) return false;
      if (customer && !(p.customerName || '').toLowerCase().includes(customer)) return false;
      return true;
    });

  const totalGrandTotal  = rows.reduce((s, r) => s + (Number(r.grandTotal)        || 0), 0);
  const totalPaid        = rows.reduce((s, r) => s + (Number(r.paidAmount)        || 0), 0);
  const totalOutstanding = rows.reduce((s, r) => s + (Number(r.outstandingAmount) || 0), 0);

  // Top customers by grand total
  const custMap = new Map<string, { grandTotal: number; paidAmount: number; orderCount: number }>();
  for (const p of rows) {
    const name = (p.customerName || '未知').trim();
    if (!custMap.has(name)) custMap.set(name, { grandTotal: 0, paidAmount: 0, orderCount: 0 });
    const e = custMap.get(name)!;
    e.grandTotal  += Number(p.grandTotal)  || 0;
    e.paidAmount  += Number(p.paidAmount)  || 0;
    e.orderCount  += 1;
  }
  const topCustomers = Array.from(custMap.entries())
    .map(([name, v]) => ({ customerName: name, ...v }))
    .sort((a, b) => b.grandTotal - a.grandTotal)
    .slice(0, 10);

  // Recent orders (up to 20)
  const recentOrders = rows.slice(0, 20).map(p => ({
    customerId:  p.id || '—',
    customerName: p.customerName || '—',
    grandTotal:  Number(p.grandTotal)  || 0,
    paidAmount:  Number(p.paidAmount)  || 0,
    status:      p.status,
    statusZh:    STATUS_ZH[p.status] || p.status,
    createdAt:   p.createdAt || '',
  }));

  const PERIOD_ZH: Record<string, string> = { today: '今日', week: '本周', month: '本月' };

  return json({
    ok:              true,
    period,
    periodZh:        PERIOD_ZH[period] || period,
    customerFilter:  customer || null,
    orderCount:      rows.length,
    totalGrandTotal,
    totalPaid,
    totalOutstanding,
    collectionRate:  totalGrandTotal > 0 ? Math.round((totalPaid / totalGrandTotal) * 100) : 0,
    topCustomers,
    recentOrders,
    source:          'orders (payload)',
    asOf:            new Date().toISOString(),
  });
}
