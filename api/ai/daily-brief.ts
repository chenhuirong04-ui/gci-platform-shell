// /api/ai/daily-brief
// Single-function daily business brief — queries all tables in parallel, never calls other APIs.
// CRM data is frontend-local (localStorage/Notion sync), marked as partial in response.
// Tables: quotation_records (flat), orders (payload), consignment_stock (payload), invoice_drafts (flat)
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

const OVERDUE_QUOTE_DAYS = 7;
const SALE_STATUSES = new Set(['PAID', 'PARTIAL', 'CONSIGNMENT']);

function monthStart(): number {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), 1).getTime();
}
function todayStart(): number {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
}

async function sbGet(supabaseUrl: string, key: string, path: string): Promise<any[]> {
  const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS });
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key         = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !key) return json({ ok: false, error: 'Supabase not configured' }, 500);

  const now      = Date.now();
  const monthMs  = monthStart();
  const todayMs  = todayStart();

  // ── Parallel queries ──────────────────────────────────────────────────────
  const [quotRows, orderRows, stockRows, invoiceRows] = await Promise.all([
    // 1. quotation_records — flat schema
    sbGet(supabaseUrl, key,
      `quotation_records?select=id,quote_no,customer_name,grand_total,status,created_at,quote_date&order=created_at.desc&limit=200`),

    // 2. orders — payload wrapped, fetch all active
    sbGet(supabaseUrl, key,
      `orders?select=id,created_at,state,payload&state=eq.active&order=created_at.desc&limit=1000`),

    // 3. consignment_stock — payload wrapped
    sbGet(supabaseUrl, key,
      `consignment_stock?select=id,state,payload&state=eq.active&limit=500`),

    // 4. invoice_drafts — flat schema
    sbGet(supabaseUrl, key,
      `invoice_drafts?select=id,invoice_no,customer_name,total,status,invoice_date,due_date&order=created_at.desc&limit=200`),
  ]);

  // ── Section 1: Quotation follow-ups ───────────────────────────────────────
  const pendingQuotes = quotRows.filter(q => q.status === 'GENERATED');
  const quotFollowups = pendingQuotes.map(q => {
    const ref     = q.quote_date || q.created_at;
    const daysAgo = ref ? Math.floor((now - new Date(ref).getTime()) / 86400000) : 0;
    return {
      quoteNo:      q.quote_no || '—',
      customerName: q.customer_name || '—',
      grandTotal:   Number(q.grand_total) || 0,
      daysAgo,
      overdue:      daysAgo >= OVERDUE_QUOTE_DAYS,
    };
  });
  const overdueQuotes = quotFollowups.filter(q => q.overdue);

  // ── Section 2: Receivables ────────────────────────────────────────────────
  const orderPayloads = orderRows.map(r => r.payload).filter(Boolean);
  const unpaidOrders  = orderPayloads.filter(p =>
    (Number(p.outstandingAmount) || 0) > 0 && p.status !== 'VOIDED'
  );
  const totalOutstanding = unpaidOrders.reduce((s, p) => s + (Number(p.outstandingAmount) || 0), 0);

  // Customer receivables summary (top 5)
  const recvMap = new Map<string, number>();
  for (const p of unpaidOrders) {
    const name = (p.customerName || '—').trim();
    recvMap.set(name, (recvMap.get(name) || 0) + (Number(p.outstandingAmount) || 0));
  }
  const topReceivables = Array.from(recvMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, amt]) => ({ customerName: name, outstanding: amt }));

  // ── Section 3: Sales this month ───────────────────────────────────────────
  const monthSales = orderPayloads.filter(p => {
    if (!SALE_STATUSES.has(p.status)) return false;
    const t = p.createdAt ? new Date(p.createdAt).getTime() : 0;
    return t >= monthMs;
  });
  const monthlySalesTotal = monthSales.reduce((s, p) => s + (Number(p.grandTotal) || 0), 0);
  const monthlyPaid       = monthSales.reduce((s, p) => s + (Number(p.paidAmount) || 0), 0);

  // Today's sales
  const todaySales      = monthSales.filter(p => {
    const t = p.createdAt ? new Date(p.createdAt).getTime() : 0;
    return t >= todayMs;
  });
  const todaySalesTotal = todaySales.reduce((s, p) => s + (Number(p.grandTotal) || 0), 0);

  // ── Section 4: Consignment ────────────────────────────────────────────────
  const stockPayloads   = stockRows.map(r => r.payload).filter(Boolean);
  const unsettledStock  = stockPayloads.filter(p => p.settlementStatus === 'UNSETTLED' || p.settlementStatus === 'PARTIAL');
  const totalRemaining  = stockPayloads.reduce((s, p) => s + (Number(p.remainingQty) || 0), 0);

  // ── Section 5: Invoices ───────────────────────────────────────────────────
  const pendingInvoices = invoiceRows.filter(r => r.status === 'issued' || r.status === 'approved');
  const draftInvoices   = invoiceRows.filter(r => r.status === 'draft');
  const totalInvoiceAmt = pendingInvoices.reduce((s, r) => s + (Number(r.total) || 0), 0);

  // ── Priorities & Risks ────────────────────────────────────────────────────
  const priorities: string[] = [];
  const risks:      string[] = [];

  if (overdueQuotes.length > 0)
    risks.push(`${overdueQuotes.length} 张报价超过 ${OVERDUE_QUOTE_DAYS} 天未回复（最高 AED ${Math.max(...overdueQuotes.map(q => q.grandTotal)).toLocaleString()}）`);

  if (unpaidOrders.length > 0)
    priorities.push(`跟进应收款：共 ${unpaidOrders.length} 张订单，未收 AED ${totalOutstanding.toLocaleString()}`);

  if (unsettledStock.length > 0)
    priorities.push(`${unsettledStock.length} 条寄售记录待结算，总剩余库存 ${totalRemaining} 件`);

  if (pendingInvoices.length > 0)
    priorities.push(`${pendingInvoices.length} 张发票待收款，总额 AED ${totalInvoiceAmt.toLocaleString()}`);

  if (pendingQuotes.length > 0)
    priorities.push(`${pendingQuotes.length} 张报价等待客户回复`);

  if (draftInvoices.length > 0)
    priorities.push(`${draftInvoices.length} 张发票仍为草稿，确认后及时发出`);

  const dateStr = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

  const summaryParts: string[] = [];
  if (todaySalesTotal > 0)   summaryParts.push(`今日成交 AED ${todaySalesTotal.toLocaleString()}`);
  if (monthlySalesTotal > 0) summaryParts.push(`本月累计销售 AED ${monthlySalesTotal.toLocaleString()}`);
  if (totalOutstanding > 0)  summaryParts.push(`待收款 AED ${totalOutstanding.toLocaleString()}`);
  if (overdueQuotes.length)  summaryParts.push(`${overdueQuotes.length} 张报价超期`);
  const summary = summaryParts.length > 0 ? summaryParts.join('，') + '。' : '今日暂无重大业务动态。';

  return json({
    ok:   true,
    date: dateStr,
    summary,
    priorities,
    risks,
    quotations: {
      pendingCount: pendingQuotes.length,
      overdueCount: overdueQuotes.length,
      overdueItems: overdueQuotes,
      allPending:   quotFollowups,
    },
    receivables: {
      unpaidOrderCount: unpaidOrders.length,
      totalOutstanding,
      topCustomers: topReceivables,
    },
    sales: {
      todayTotal:   todaySalesTotal,
      todayCount:   todaySales.length,
      monthlyTotal: monthlySalesTotal,
      monthlyPaid,
      monthlyCount: monthSales.length,
    },
    consignment: {
      unsettledCount: unsettledStock.length,
      totalRemaining,
    },
    invoices: {
      pendingCount: pendingInvoices.length,
      draftCount:   draftInvoices.length,
      totalPendingAmount: totalInvoiceAmt,
    },
    crm: null,
    crmNote: 'CRM 跟进数据来自前端 localStorage/Notion sync，后端无法直接读取。请在前端组件内获取并补充。',
    source: 'quotation_records + orders + consignment_stock + invoice_drafts',
    asOf:   new Date().toISOString(),
  });
}
