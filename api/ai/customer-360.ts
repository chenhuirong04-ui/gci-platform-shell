// /api/ai/customer-360
// Cross-table customer overview using customerName fuzzy match.
// WARNING: No unified customer_id — matches by name substring (case-insensitive).
// May miss records if spelling differs across tables.
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

async function sbGet(supabaseUrl: string, key: string, path: string): Promise<any[]> {
  const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

const QUOTE_STATUS_ZH: Record<string, string> = {
  DRAFT: '草稿', GENERATED: '已发出/待回复', SENT_TO_TRADE: '已转Trade PI',
};
const ORDER_STATUS_ZH: Record<string, string> = {
  PENDING: '待付款', PARTIAL: '部分付款', PAID: '已付清', CONSIGNMENT: '寄售', VOIDED: '已作废',
};
const INVOICE_STATUS_ZH: Record<string, string> = {
  draft: '草稿', waiting_approval: '待审批', approved: '已审批', issued: '已开出', cancelled: '已取消', paid: '已付款',
};

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS });
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key         = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !key) return json({ ok: false, error: 'Supabase not configured' }, 500);

  const reqUrl   = new URL(request.url);
  const customer = reqUrl.searchParams.get('customer')?.trim() || '';
  if (!customer) return json({ ok: false, error: 'customer 参数必填，例如 ?customer=IFZA' }, 400);

  const kw = customer.toLowerCase();

  // Parallel queries — all tables, then filter in memory by customer name substring
  const [quotRows, orderRows, stockRows, invoiceRows] = await Promise.all([
    sbGet(supabaseUrl, key,
      `quotation_records?select=id,quote_no,customer_name,project_name,grand_total,status,created_at,quote_date,salesperson,quote_type&customer_name=ilike.*${encodeURIComponent(customer)}*&order=created_at.desc&limit=50`),

    sbGet(supabaseUrl, key,
      `orders?select=id,created_at,state,payload&state=eq.active&order=created_at.desc&limit=500`),

    sbGet(supabaseUrl, key,
      `consignment_stock?select=id,state,payload&state=eq.active&limit=500`),

    sbGet(supabaseUrl, key,
      `invoice_drafts?select=id,invoice_no,customer_name,total,status,invoice_date,due_date&customer_name=ilike.*${encodeURIComponent(customer)}*&order=created_at.desc&limit=50`),
  ]);

  // Filter orders and stock in memory (no ilike on JSONB payload)
  const matchedOrders = orderRows
    .map(r => r.payload)
    .filter(Boolean)
    .filter(p => (p.customerName || '').toLowerCase().includes(kw));

  const matchedStock = stockRows
    .map(r => r.payload)
    .filter(Boolean)
    .filter(p => (p.customerName || '').toLowerCase().includes(kw));

  // ── Quotation history ─────────────────────────────────────────────────────
  const quotes = quotRows.map(q => ({
    quoteNo:      q.quote_no || '—',
    projectName:  q.project_name || '',
    grandTotal:   Number(q.grand_total) || 0,
    status:       q.status,
    statusZh:     QUOTE_STATUS_ZH[q.status] || q.status,
    quoteType:    q.quote_type || 'CUSTOM',
    salesperson:  q.salesperson || '',
    date:         q.quote_date || q.created_at || '',
  }));

  const pendingQuotes = quotes.filter(q => q.status === 'GENERATED');
  const totalQuoteAmt = quotes.reduce((s, q) => s + q.grandTotal, 0);

  // ── Orders / receivables ──────────────────────────────────────────────────
  const orders = matchedOrders.map(p => ({
    orderId:           p.id || '—',
    grandTotal:        Number(p.grandTotal)        || 0,
    paidAmount:        Number(p.paidAmount)        || 0,
    outstandingAmount: Number(p.outstandingAmount) || 0,
    status:            p.status,
    statusZh:          ORDER_STATUS_ZH[p.status] || p.status,
    createdAt:         p.createdAt || '',
    dueDate:           p.dueDate  || '',
  }));

  const totalOutstanding = orders.reduce((s, o) => s + o.outstandingAmount, 0);
  const totalOrderAmt    = orders.reduce((s, o) => s + o.grandTotal, 0);
  const activeOrders     = orders.filter(o => o.status !== 'VOIDED');

  // ── Consignment ───────────────────────────────────────────────────────────
  const consignment = matchedStock.map(p => ({
    soNo:             p.soNo || '—',
    productName:      p.productName || '—',
    consignedQty:     Number(p.consignedQty)  || 0,
    soldQty:          Number(p.soldQty)        || 0,
    remainingQty:     Number(p.remainingQty)   || 0,
    settlementStatus: p.settlementStatus || 'UNSETTLED',
    amount:           Number(p.amount) || 0,
  }));

  const unsettledConsign = consignment.filter(c => c.settlementStatus !== 'SETTLED');

  // ── Invoices ──────────────────────────────────────────────────────────────
  const invoices = invoiceRows.map(r => ({
    invoiceNo:   r.invoice_no || '—',
    total:       Number(r.total) || 0,
    status:      r.status,
    statusZh:    INVOICE_STATUS_ZH[r.status] || r.status,
    invoiceDate: r.invoice_date || '',
    dueDate:     r.due_date || '',
  }));

  const pendingInvoices = invoices.filter(i => i.status === 'issued' || i.status === 'approved');

  // ── Suggestions ───────────────────────────────────────────────────────────
  const suggestions: string[] = [];
  if (pendingQuotes.length > 0)
    suggestions.push(`有 ${pendingQuotes.length} 张报价待回复，建议跟进确认意向`);
  if (totalOutstanding > 0)
    suggestions.push(`未收款 AED ${totalOutstanding.toLocaleString()}，建议催收`);
  if (unsettledConsign.length > 0)
    suggestions.push(`${unsettledConsign.length} 条寄售记录未结算，确认已售数量后结算`);
  if (pendingInvoices.length > 0)
    suggestions.push(`${pendingInvoices.length} 张发票已开出待收款`);
  if (suggestions.length === 0)
    suggestions.push('暂无紧急事项，保持正常跟进节奏');

  return json({
    ok:           true,
    customerQuery: customer,
    matchWarning: '当前按客户名称模糊匹配，可能因拼写不一致遗漏记录。',
    summary: {
      quoteCount:        quotes.length,
      totalQuoteAmt,
      pendingQuoteCount: pendingQuotes.length,
      orderCount:        activeOrders.length,
      totalOrderAmt,
      totalOutstanding,
      consignmentCount:  consignment.length,
      unsettledCount:    unsettledConsign.length,
      invoiceCount:      invoices.length,
    },
    quotes,
    orders,
    consignment,
    invoices,
    suggestions,
    crm: null,
    crmNote: 'CRM 跟进记录来自前端 localStorage/Notion sync，后端无法直接读取。',
    source: 'quotation_records + orders + consignment_stock + invoice_drafts',
    asOf:   new Date().toISOString(),
  });
}
