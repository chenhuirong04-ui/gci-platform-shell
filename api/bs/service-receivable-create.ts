// /api/bs/service-receivable-create
// POST — Generate service receivable records from an accepted service quotation.
// Creates one record per fee type (ONE_TIME / MONTHLY / ANNUAL) when amount > 0.
// Duplicate protection: skips if an active record already exists for (quote_id, fee_type).
export const config = { runtime: 'edge' };

import type { ServiceReceivable, ServiceFeeType, ServiceFeeNature } from './types';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// Statuses that permit receivable generation
const ALLOWED_STATUSES = new Set([
  'ACCEPTED', 'IN_PROGRESS', 'CONTRACT_SIGNED', 'CONTRACT_PENDING',
  'MONTHLY_SERVICE',
]);

// Income category derived from service_type on the quote
function deriveIncomeCategory(serviceType?: string | null, feNature?: ServiceFeeNature): string {
  if (feNature === 'PASS_THROUGH_COST') return '代收代付';
  if (feNature === 'THIRD_PARTY_COST') return '第三方成本';
  if (!serviceType) return '企业服务收入';
  const t = serviceType.toUpperCase();
  if (t.includes('MARKET') || t.includes('ENTRY')) return '市场进入服务收入';
  if (t.includes('PROJECT') || t.includes('ADVISORY')) return '项目顾问收入';
  if (t.includes('WAREHOUSE') || t.includes('STORAGE')) return '海外仓服务收入';
  if (t.includes('SUPPLY') || t.includes('CHAIN')) return '供应链服务收入';
  if (t.includes('AI') || t.includes('DIGITAL')) return 'AI数字化服务收入';
  if (t.includes('MONTHLY') || t.includes('RECURRING')) return '月度服务收入';
  return '企业服务收入';
}

// Minimal djb2-variant stableUuid — mirrors cloudDb.ts for consistency
function stableUuid(seed: string): string {
  let a = 0x9e3779b9 >>> 0;
  let b = 0x6c62272e >>> 0;
  for (let i = 0; i < seed.length; i++) {
    const c = seed.charCodeAt(i);
    a = (Math.imul(a ^ c, 0x45d9f3b) >>> 0) ^ (a >>> 16);
    b = (Math.imul(b ^ c, 0x119de1f3) >>> 0) ^ (b >>> 13);
  }
  const p = (a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0')).padEnd(32, '0');
  return `${p.slice(0,8)}-${p.slice(8,12)}-4${p.slice(13,16)}-8${p.slice(17,20)}-${p.slice(20,32)}`;
}

interface CreatePayload {
  quote_id: string;
  customer_id: string;
  due_date?: string;
  owner?: string;
  notes?: string;
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !key) return json({ ok: false, error: 'Supabase not configured' }, 500);

  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };

  let body: CreatePayload;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const { quote_id, customer_id, due_date, owner = '', notes = '' } = body;

  // ── Validation ──────────────────────────────────────────────────────────────
  if (!quote_id || typeof quote_id !== 'string') {
    return json({ ok: false, error: 'quote_id is required' }, 400);
  }
  if (!customer_id || typeof customer_id !== 'string') {
    return json({ ok: false, error: 'customer_id is required' }, 400);
  }

  // ── Load quote from service_quotes (direct columns, not payload-wrapped) ────
  const quoteRes = await fetch(
    `${supabaseUrl}/rest/v1/service_quotes?id=eq.${encodeURIComponent(quote_id)}&limit=1`,
    { headers }
  );
  if (!quoteRes.ok) {
    const txt = await quoteRes.text().catch(() => '');
    return json({ ok: false, error: `Failed to load quote: ${quoteRes.status}`, detail: txt }, 502);
  }
  const quoteRows: any[] = await quoteRes.json().catch(() => []);
  if (!quoteRows || quoteRows.length === 0) {
    return json({ ok: false, error: 'Quotation not found' }, 404);
  }
  const quote = quoteRows[0];

  // Validate ownership
  if (quote.customer_id && quote.customer_id !== customer_id) {
    return json({ ok: false, error: 'Quotation does not belong to this customer' }, 403);
  }

  // Validate status
  if (!ALLOWED_STATUSES.has(quote.status)) {
    return json({
      ok: false,
      error: `Quotation status "${quote.status}" does not permit receivable generation. Required: ACCEPTED, IN_PROGRESS, CONTRACT_SIGNED, CONTRACT_PENDING, or MONTHLY_SERVICE`,
    }, 422);
  }

  // ── Load quote items ─────────────────────────────────────────────────────────
  const itemsRes = await fetch(
    `${supabaseUrl}/rest/v1/service_quote_items?service_quote_id=eq.${encodeURIComponent(quote_id)}&order=sort_order.asc`,
    { headers }
  );
  const items: any[] = itemsRes.ok ? (await itemsRes.json().catch(() => [])) : [];

  // ── Compute per-fee-type totals ─────────────────────────────────────────────
  // Prefer quote-level subtotals; fall back to summing items.
  const oneTimeAmount = Number(quote.subtotal_one_time ?? quote.total_one_time ?? 0) ||
    items.reduce((s: number, it: any) => s + (Number(it.one_time_fee) || 0), 0);
  const monthlyAmount = Number(quote.subtotal_monthly ?? quote.monthly_fee ?? 0) ||
    items.reduce((s: number, it: any) => s + (Number(it.monthly_fee) || 0), 0);
  const annualAmount  = Number(quote.subtotal_annual ?? quote.annual_recurring_amount ?? 0) ||
    items.reduce((s: number, it: any) => s + (Number(it.annual_fee) || 0), 0);

  // ── Load existing active receivables (duplicate check) ──────────────────────
  const existingRes = await fetch(
    `${supabaseUrl}/rest/v1/service_receivables` +
    `?select=id,payload` +
    `&state=eq.active` +
    `&payload->>quote_id=eq.${encodeURIComponent(quote_id)}`,
    { headers }
  );
  const existingRows: any[] = existingRes.ok ? (await existingRes.json().catch(() => [])) : [];
  const existingFeeTypes = new Set<string>(
    existingRows.map((r: any) => r.payload?.fee_type).filter(Boolean)
  );

  // ── Build receivable records ─────────────────────────────────────────────────
  const now = new Date().toISOString();
  const effectiveDueDate = due_date || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const currency: string = quote.currency || 'AED';
  const serviceType: string = quote.service_type || '';
  const quoteNo: string = quote.quote_no || '';
  const customerName: string = quote.customer_name || '';
  const today = new Date().toISOString().slice(0, 10);

  // Build candidate fee entries
  const candidates: Array<{
    fee_type: ServiceFeeType;
    amount: number;
    billing_period_start?: string;
    billing_period_end?: string;
    service_summary: string;
    fee_nature: ServiceFeeNature;
  }> = [];

  if (oneTimeAmount > 0) {
    candidates.push({
      fee_type: 'ONE_TIME',
      amount: oneTimeAmount,
      service_summary: quote.quotation_title || `一次性服务费 — ${quoteNo}`,
      fee_nature: 'SERVICE_REVENUE',
    });
  }
  if (monthlyAmount > 0) {
    const monthStart = today;
    const monthEnd = new Date(new Date(today).getFullYear(), new Date(today).getMonth() + 1, 0)
      .toISOString().slice(0, 10);
    candidates.push({
      fee_type: 'MONTHLY',
      amount: monthlyAmount,
      billing_period_start: monthStart,
      billing_period_end: monthEnd,
      service_summary: quote.quotation_title || `月服务费（首月）— ${quoteNo}`,
      fee_nature: 'SERVICE_REVENUE',
    });
  }
  if (annualAmount > 0) {
    const yearStart = today;
    const yearEnd = new Date(new Date(today).getFullYear() + 1, new Date(today).getMonth(),
      new Date(today).getDate()).toISOString().slice(0, 10);
    candidates.push({
      fee_type: 'ANNUAL',
      amount: annualAmount,
      billing_period_start: yearStart,
      billing_period_end: yearEnd,
      service_summary: quote.quotation_title || `年度服务费 — ${quoteNo}`,
      fee_nature: 'SERVICE_REVENUE',
    });
  }

  const created: ServiceReceivable[] = [];
  const skipped: string[] = [];

  for (const c of candidates) {
    // Duplicate check
    if (existingFeeTypes.has(c.fee_type)) {
      skipped.push(c.fee_type);
      continue;
    }

    const incomeCategory = deriveIncomeCategory(serviceType, c.fee_nature);
    const businessId = `SR-${Date.now()}-${c.fee_type}`;
    const rowId = stableUuid(businessId);

    const receivable: ServiceReceivable = {
      id: businessId,
      source_module: 'BUSINESS_SOLUTIONS',
      source_type: 'SERVICE_QUOTE',
      source_id: quote_id,
      customer_id,
      customer_name: customerName,
      quote_id,
      quote_no: quoteNo,
      service_summary: c.service_summary,
      service_name: quote.quotation_title || '',
      service_category: serviceType,
      currency,
      fee_type: c.fee_type,
      fee_nature: c.fee_nature,
      amount: c.amount,
      vat_amount: 0,
      total_receivable: c.amount,
      received_amount: 0,
      outstanding_amount: c.amount,
      payment_status: 'PENDING',
      due_date: effectiveDueDate,
      billing_period_start: c.billing_period_start,
      billing_period_end: c.billing_period_end,
      income_category: incomeCategory,
      owner,
      notes,
      created_at: now,
      updated_at: now,
    };

    const insertRes = await fetch(
      `${supabaseUrl}/rest/v1/service_receivables`,
      {
        method: 'POST',
        headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify({ id: rowId, created_at: now, updated_at: now, state: 'active', payload: receivable }),
      }
    );

    if (!insertRes.ok) {
      const errTxt = await insertRes.text().catch(() => '');
      console.error(`[service-receivable-create] Insert failed for ${c.fee_type}:`, insertRes.status, errTxt);
      return json({
        ok: false,
        error: `Failed to create ${c.fee_type} receivable`,
        detail: errTxt,
        already_created: created.map(r => r.id),
      }, 502);
    }

    created.push(receivable);
    // Small delay to ensure unique timestamps for business IDs
    await new Promise(r => setTimeout(r, 2));
  }

  const totalCreatedAmount = created.reduce((s, r) => s + r.total_receivable, 0);

  return json({
    ok: true,
    quote_id,
    quote_no: quoteNo,
    created_receivables: created,
    skipped_duplicates: skipped,
    total_created_amount: totalCreatedAmount,
    currency,
  });
}
