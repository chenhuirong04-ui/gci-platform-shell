// /api/ai/receivables-summary  v2
// Three receivables views returned in one call (Promise.allSettled):
//
//   A. orderReceivables   — orders table (payload-wrapped)
//      Filters: state=active, outstandingAmount>0, status NOT IN (VOIDED, CONSIGNMENT),
//               transactionMode != 'Consignment', order_type = 'NORMAL' (excludes adjustment orders)
//
//   B. consignmentReceivables — consignment_stock table (payload-wrapped)
//      Receivable = soldQty × unitPrice - receivedAmount, settlementStatus != SETTLED
//
//   C. invoiceReceivables — invoice_drafts table (flat schema)
//      Filters: status IN ('issued', 'approved')
//      Amount field: `total` (not grand_total — invoiceStore writes to `total`)
//
// WARNING: Three views may overlap (a consignment batch may appear in orders AND consignment_stock).
// Do NOT sum them as a single "total AR" without explicit user confirmation.
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

function sbGet(url: string, key: string, path: string): Promise<any[]> {
  return fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  }).then(r => r.ok ? r.json() : Promise.reject(new Error(`Supabase ${r.status}`)));
}

// ── A. Order receivables ─────────────────────────────────────────────────────

const ORDER_STATUS_ZH: Record<string, string> = {
  PENDING: '未付款', PARTIAL: '部分付款', PAID: '已付清', CONSIGNMENT: '寄售', VOIDED: '已作废',
};

function buildOrderReceivables(dbRows: any[], now: number) {
  const payloads = dbRows.map(r => r.payload).filter(Boolean);

  const rows = payloads.filter(p => {
    const outstanding = Number(p.outstandingAmount) || 0;
    if (outstanding <= 0) return false;
    if (p.status === 'VOIDED') return false;
    if (p.status === 'CONSIGNMENT') return false;              // belongs in consignment view
    if ((p.transactionMode || '') === 'Consignment') return false;
    if ((p.order_type || 'NORMAL') !== 'NORMAL') return false; // exclude adjustments
    return true;
  });

  const map = new Map<string, any>();
  for (const p of rows) {
    const name = (p.customerName || '未知客户').trim();
    if (!map.has(name)) {
      map.set(name, { customerName: name, orderCount: 0, totalGrandTotal: 0, totalPaid: 0, totalOutstanding: 0, orders: [] });
    }
    const e = map.get(name)!;
    const due = p.dueDate ? new Date(p.dueDate).getTime() : 0;
    const overdue = due > 0 && due < now;
    e.orderCount++;
    e.totalGrandTotal  += Number(p.grandTotal)        || 0;
    e.totalPaid        += Number(p.paidAmount)        || 0;
    e.totalOutstanding += Number(p.outstandingAmount) || 0;
    e.orders.push({
      orderId:           p.id || '—',
      grandTotal:        Number(p.grandTotal)        || 0,
      paidAmount:        Number(p.paidAmount)        || 0,
      outstandingAmount: Number(p.outstandingAmount) || 0,
      status:            p.status || 'PENDING',
      statusZh:          ORDER_STATUS_ZH[p.status] || p.status,
      createdAt:         p.createdAt || '',
      dueDate:           p.dueDate   || '',
      overdue,
    });
  }

  const customers = Array.from(map.values()).sort((a, b) => b.totalOutstanding - a.totalOutstanding);
  const totalOutstanding = customers.reduce((s, c) => s + c.totalOutstanding, 0);
  const overdueCount     = customers.filter(c => c.orders.some((o: any) => o.overdue)).length;

  return {
    total:         totalOutstanding,
    customerCount: customers.length,
    orderCount:    rows.length,
    overdueCount,
    customers,
    note: '普通直销订单未收款，已排除寄售订单、调整单、已作废订单',
  };
}

// ── B. Consignment receivables ───────────────────────────────────────────────

const SETTLE_ZH: Record<string, string> = {
  UNSETTLED: '未结算', PARTIAL: '部分结算', SETTLED: '已结算',
};

function buildConsignmentReceivables(dbRows: any[]) {
  const payloads = dbRows.map(r => r.payload).filter(Boolean);

  const rows = payloads.filter(p => p.settlementStatus !== 'SETTLED');

  const records = rows.map(p => {
    const soldQty       = Number(p.soldQty)        || 0;
    const unitPrice     = Number(p.unitPrice)       || 0;
    const receivedAmt   = Number(p.receivedAmount)  || 0;
    const soldAmount    = soldQty * unitPrice;
    const outstanding   = Math.max(0, soldAmount - receivedAmt);
    return {
      soNo:             p.soNo || '—',
      customerName:     (p.customerName || '—').trim(),
      productName:      p.productName  || '—',
      consignedQty:     Number(p.consignedQty)  || 0,
      soldQty,
      remainingQty:     Number(p.remainingQty)   || 0,
      unitPrice,
      soldAmount,
      receivedAmount:   receivedAmt,
      outstanding,
      settlementStatus: p.settlementStatus || 'UNSETTLED',
      settlementZh:     SETTLE_ZH[p.settlementStatus] || p.settlementStatus,
    };
  }).sort((a, b) => b.outstanding - a.outstanding);

  const customerNames  = new Set(records.map(r => r.customerName));
  const totalOutstanding = records.reduce((s, r) => s + r.outstanding, 0);

  return {
    total:         totalOutstanding,
    customerCount: customerNames.size,
    soCount:       records.length,
    records,
    note: 'soldQty × unitPrice − receivedAmount，settlementStatus ≠ SETTLED。寄售批次价格仅为该批次价，不等于产品主库标准价。',
  };
}

// ── C. Invoice receivables ───────────────────────────────────────────────────

const INVOICE_STATUS_ZH: Record<string, string> = {
  draft: '草稿', waiting_approval: '待审批', approved: '已审批', issued: '已开出', cancelled: '已取消', paid: '已付款',
};

function buildInvoiceReceivables(invoiceRows: any[], now: number) {
  // Only issued + approved count as formal receivables
  const rows = invoiceRows.filter(r => r.status === 'issued' || r.status === 'approved');
  const pendingApproval = invoiceRows.filter(r => r.status === 'waiting_approval');

  const invoices = rows.map(r => {
    const due = r.due_date ? new Date(r.due_date).getTime() : 0;
    const overdue = due > 0 && due < now;
    return {
      invoiceNo:   r.invoice_no || '—',
      customerName: (r.customer_name || '—').trim(),
      total:       Number(r.total) || 0,
      status:      r.status,
      statusZh:    INVOICE_STATUS_ZH[r.status] || r.status,
      invoiceDate: r.invoice_date || '',
      dueDate:     r.due_date    || '',
      overdue,
    };
  }).sort((a, b) => b.total - a.total);

  const customerNames = new Set(invoices.map(r => r.customerName));
  const totalAmount   = invoices.reduce((s, r) => s + r.total, 0);
  const overdueCount  = invoices.filter(r => r.overdue).length;

  return {
    total:              totalAmount,
    customerCount:      customerNames.size,
    invoiceCount:       invoices.length,
    overdueCount,
    pendingApprovalCount: pendingApproval.length,
    pendingApprovalAmount: pendingApproval.reduce((s, r) => s + (Number(r.total) || 0), 0),
    invoices,
    note: '已开出 (issued) + 已审批 (approved) 发票未收款。待审批发票单独列示，不计入正式应收。',
  };
}

// ── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS });
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key         = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !key) return json({ ok: false, error: 'Supabase not configured' }, 500);

  const now = Date.now();

  const [ordersRes, consignRes, invoiceRes] = await Promise.allSettled([
    // A: orders — all active, up to 1000 rows; filter in memory (JSONB payload)
    sbGet(supabaseUrl, key, 'orders?select=id,state,payload&state=eq.active&order=created_at.desc&limit=1000'),
    // B: consignment_stock — active rows
    sbGet(supabaseUrl, key, 'consignment_stock?select=id,state,payload&state=eq.active&order=created_at.desc&limit=500'),
    // C: invoice_drafts — flat schema; only issued+approved+waiting_approval
    sbGet(supabaseUrl, key,
      'invoice_drafts?select=id,invoice_no,customer_name,total,status,invoice_date,due_date'
      + '&or=(status.eq.issued,status.eq.approved,status.eq.waiting_approval)'
      + '&order=created_at.desc&limit=200'),
  ]);

  const warnings: string[] = [];

  const orderReceivables = ordersRes.status === 'fulfilled'
    ? buildOrderReceivables(ordersRes.value, now)
    : (warnings.push('订单应收查询失败：' + (ordersRes as any).reason?.message), null);

  const consignmentReceivables = consignRes.status === 'fulfilled'
    ? buildConsignmentReceivables(consignRes.value)
    : (warnings.push('寄售应收查询失败：' + (consignRes as any).reason?.message), null);

  const invoiceReceivables = invoiceRes.status === 'fulfilled'
    ? buildInvoiceReceivables(invoiceRes.value, now)
    : (warnings.push('发票应收查询失败：' + (invoiceRes as any).reason?.message), null);

  warnings.push('三个口径来源不同，可能存在重叠，仅作经营提醒，不作为财务最终对账依据。');

  return json({
    ok: true,
    orderReceivables,
    consignmentReceivables,
    invoiceReceivables,
    warnings,
    source: 'orders + consignment_stock + invoice_drafts',
    asOf:   new Date().toISOString(),
  });
}
