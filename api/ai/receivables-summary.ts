// /api/ai/receivables-summary
// Reads orders table (cloudDb payload-wrapped format).
// Row structure: { id, created_at, updated_at, state, payload: { OrderRecord } }
// Filters: state=active, payload.status != VOIDED, payload.outstandingAmount > 0
// Optional ?customer= for fuzzy filter.
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
  status: string;       // PENDING | PARTIAL | PAID | CONSIGNMENT | VOIDED
  createdAt: string;
  dueDate?: string;
  quoteId?: string;
  transactionMode?: string;
}

interface DbRow {
  id: string;
  created_at: string;
  state: string;
  payload: OrderPayload;
}

interface CustomerSummary {
  customerName: string;
  orderCount: number;
  totalGrandTotal: number;
  totalPaid: number;
  totalOutstanding: number;
  orders: OrderEntry[];
}

interface OrderEntry {
  orderId: string;
  grandTotal: number;
  paidAmount: number;
  outstandingAmount: number;
  status: string;
  statusZh: string;
  createdAt: string;
  dueDate: string;
  overdue: boolean;
}

const STATUS_ZH: Record<string, string> = {
  PENDING:     '未付款',
  PARTIAL:     '部分付款',
  PAID:        '已付清',
  CONSIGNMENT: '寄售',
  VOIDED:      '已作废',
};

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS });
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key         = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !key) return json({ ok: false, error: 'Supabase not configured' }, 500);

  const reqUrl   = new URL(request.url);
  const customer = reqUrl.searchParams.get('customer')?.trim().toLowerCase() || '';

  // Fetch all active orders — JSONB payload fields cannot be filtered server-side via PostgREST
  // without special indexes, so we pull all active rows and filter in memory.
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
  const now = Date.now();

  // Filter: outstanding > 0 and not VOIDED
  const rows = dbRows
    .map(r => r.payload)
    .filter(Boolean)
    .filter(p => {
      const outstanding = Number(p.outstandingAmount) || 0;
      if (outstanding <= 0) return false;
      if (p.status === 'VOIDED') return false;
      if (customer) {
        return (p.customerName || '').toLowerCase().includes(customer);
      }
      return true;
    });

  // Aggregate by customer
  const map = new Map<string, CustomerSummary>();
  for (const p of rows) {
    const name = (p.customerName || '未知客户').trim();
    if (!map.has(name)) {
      map.set(name, { customerName: name, orderCount: 0, totalGrandTotal: 0, totalPaid: 0, totalOutstanding: 0, orders: [] });
    }
    const entry = map.get(name)!;
    const due   = p.dueDate ? new Date(p.dueDate).getTime() : 0;
    const overdue = due > 0 && due < now;
    entry.orderCount++;
    entry.totalGrandTotal  += Number(p.grandTotal)       || 0;
    entry.totalPaid        += Number(p.paidAmount)       || 0;
    entry.totalOutstanding += Number(p.outstandingAmount) || 0;
    entry.orders.push({
      orderId:           p.id || '—',
      grandTotal:        Number(p.grandTotal)        || 0,
      paidAmount:        Number(p.paidAmount)        || 0,
      outstandingAmount: Number(p.outstandingAmount) || 0,
      status:            p.status || 'PENDING',
      statusZh:          STATUS_ZH[p.status] || p.status,
      createdAt:         p.createdAt || '',
      dueDate:           p.dueDate   || '',
      overdue,
    });
  }

  // Sort by outstanding descending
  const customers = Array.from(map.values()).sort((a, b) => b.totalOutstanding - a.totalOutstanding);

  const totalOutstanding = customers.reduce((s, c) => s + c.totalOutstanding, 0);
  const totalGrandTotal  = customers.reduce((s, c) => s + c.totalGrandTotal, 0);
  const overdueCount     = customers.filter(c => c.orders.some(o => o.overdue)).length;

  return json({
    ok:             true,
    customerFilter: customer || null,
    customerCount:  customers.length,
    orderCount:     rows.length,
    totalGrandTotal,
    totalOutstanding,
    overdueCount,
    customers,
    source:         'orders (payload)',
    asOf:           new Date().toISOString(),
  });
}
