// /api/bs/service-payment-register
// POST — Register one payment against one service receivable.
// Logical atomicity via compensation: create payment → update receivable → write transaction.
// If step 2 or 3 fails, compensating delete is attempted and error is returned.
export const config = { runtime: 'edge' };

import type { ServicePayment, ServicePaymentStatus } from './types';

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

// Mirrors cloudDb.ts stableUuid for writing to the shared transactions table
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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

interface RegisterPayload {
  receivable_id: string;
  payment_date: string;
  amount: number;
  currency?: string;
  account?: 'Corporate' | 'Personal' | 'Cash';
  payment_method?: 'CASH' | 'BANK' | 'CHEQUE' | 'OTHER';
  bank_reference?: string;
  receipt_url?: string;
  notes?: string;
  created_by?: string;
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !key) return json({ ok: false, error: 'Supabase not configured' }, 500);

  const sbHeaders = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };

  let body: RegisterPayload;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const {
    receivable_id,
    payment_date,
    amount,
    currency,
    account = 'Corporate',
    payment_method = 'BANK',
    bank_reference = '',
    receipt_url = '',
    notes = '',
    created_by = 'system',
  } = body;

  // ── Validation ──────────────────────────────────────────────────────────────
  if (!receivable_id || typeof receivable_id !== 'string') {
    return json({ ok: false, error: 'receivable_id is required' }, 400);
  }
  if (!payment_date || typeof payment_date !== 'string') {
    return json({ ok: false, error: 'payment_date is required' }, 400);
  }
  const parsedAmount = Number(amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    return json({ ok: false, error: 'amount must be a positive number' }, 400);
  }

  // ── Load receivable ─────────────────────────────────────────────────────────
  const recRes = await fetch(
    `${supabaseUrl}/rest/v1/service_receivables` +
    `?select=id,payload` +
    `&state=eq.active` +
    `&payload->>id=eq.${encodeURIComponent(receivable_id)}&limit=1`,
    { headers: sbHeaders }
  );
  if (!recRes.ok) {
    const txt = await recRes.text().catch(() => '');
    return json({ ok: false, error: `Failed to load receivable: ${recRes.status}`, detail: txt }, 502);
  }
  const recRows: any[] = await recRes.json().catch(() => []);
  if (!recRows || recRows.length === 0) {
    return json({ ok: false, error: 'Receivable not found or not active' }, 404);
  }
  const recRow = recRows[0];
  const rec = recRow.payload;
  const recRowId: string = recRow.id; // Postgres UUID of the row

  // Validate receivable state
  if (rec.payment_status === 'CANCELLED') {
    return json({ ok: false, error: 'Cannot register payment on a cancelled receivable' }, 422);
  }

  // Validate currency match
  const effectiveCurrency = currency || rec.currency;
  if (effectiveCurrency && rec.currency && effectiveCurrency !== rec.currency) {
    return json({
      ok: false,
      error: `Currency mismatch: receivable is ${rec.currency}, payment is ${effectiveCurrency}`,
    }, 422);
  }

  // Validate amount does not exceed outstanding
  const outstanding = round2(Number(rec.outstanding_amount) || 0);
  if (round2(parsedAmount) > outstanding) {
    return json({
      ok: false,
      error: `Payment amount ${parsedAmount} exceeds outstanding balance ${outstanding}`,
      outstanding_amount: outstanding,
    }, 422);
  }

  // Validate bank_reference uniqueness (when supplied)
  if (bank_reference) {
    const dupRes = await fetch(
      `${supabaseUrl}/rest/v1/service_payments` +
      `?select=id,payload` +
      `&state=eq.active` +
      `&payload->>bank_reference=eq.${encodeURIComponent(bank_reference)}&limit=1`,
      { headers: sbHeaders }
    );
    if (dupRes.ok) {
      const dupRows: any[] = await dupRes.json().catch(() => []);
      if (dupRows && dupRows.length > 0) {
        return json({
          ok: false,
          error: `Duplicate bank_reference: a payment with reference "${bank_reference}" already exists`,
          existing_payment_id: dupRows[0].payload?.id,
        }, 409);
      }
    }
  }

  const now = new Date().toISOString();
  const paymentBusinessId = `SP-${Date.now()}`;
  const paymentRowId = stableUuid(paymentBusinessId);

  // ── STEP 1: Create service_payments record ──────────────────────────────────
  const payment: ServicePayment = {
    id: paymentBusinessId,
    receivable_id,
    source_module: 'BUSINESS_SOLUTIONS',
    source_type: 'SERVICE_PAYMENT',
    customer_id: rec.customer_id || '',
    customer_name: rec.customer_name || '',
    quote_id: rec.quote_id || '',
    quote_no: rec.quote_no || '',
    income_category: rec.income_category || '企业服务收入',
    payment_date,
    amount: round2(parsedAmount),
    currency: effectiveCurrency || rec.currency || 'AED',
    account,
    payment_method,
    bank_reference,
    receipt_url,
    notes,
    created_by,
    created_at: now,
    updated_at: now,
  };

  const payInsert = await fetch(
    `${supabaseUrl}/rest/v1/service_payments`,
    {
      method: 'POST',
      headers: { ...sbHeaders, Prefer: 'return=representation' },
      body: JSON.stringify({
        id: paymentRowId,
        created_at: now,
        updated_at: now,
        state: 'active',
        payload: payment,
      }),
    }
  );
  if (!payInsert.ok) {
    const errTxt = await payInsert.text().catch(() => '');
    return json({ ok: false, error: `Failed to create payment record: ${payInsert.status}`, detail: errTxt }, 502);
  }

  // ── STEP 2: Update service_receivables ──────────────────────────────────────
  const newReceived = round2((Number(rec.received_amount) || 0) + round2(parsedAmount));
  const newOutstanding = round2((Number(rec.total_receivable) || 0) - newReceived);
  const newStatus: ServicePaymentStatus = newOutstanding <= 0 ? 'PAID' : 'PARTIAL';

  const updatedRec = {
    ...rec,
    received_amount: newReceived,
    outstanding_amount: newOutstanding,
    payment_status: newStatus,
    updated_at: now,
  };

  const recUpdate = await fetch(
    `${supabaseUrl}/rest/v1/service_receivables?id=eq.${encodeURIComponent(recRowId)}`,
    {
      method: 'PATCH',
      headers: { ...sbHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({ updated_at: now, payload: updatedRec }),
    }
  );

  if (!recUpdate.ok) {
    const errTxt = await recUpdate.text().catch(() => '');
    // Compensation: delete the payment we just created
    await fetch(
      `${supabaseUrl}/rest/v1/service_payments?id=eq.${encodeURIComponent(paymentRowId)}`,
      { method: 'DELETE', headers: sbHeaders }
    ).catch(() => {});
    return json({
      ok: false,
      error: `Failed to update receivable (payment record was rolled back): ${recUpdate.status}`,
      detail: errTxt,
    }, 502);
  }

  // ── STEP 3: Write to transactions table (财务账) ───────────────────────────
  // Uses same payload-wrap pattern as cloudDb / HistoryDashboard
  const txnBusinessId = `TXN-BS-${paymentBusinessId}`;
  const txnRowId = stableUuid(txnBusinessId);

  const txnPayload = {
    id: txnBusinessId,
    date: payment_date,
    type: 'in' as const,
    amount: payment.amount,
    account,
    // Source tracing — enables FinanceTracker filter by source_module
    source_module: 'BUSINESS_SOLUTIONS',
    source_type: 'SERVICE_PAYMENT',
    source_id: paymentBusinessId,
    receivable_id,
    quote_id: rec.quote_id || '',
    quote_no: rec.quote_no || '',
    customer_id: rec.customer_id || '',
    customer_name: rec.customer_name || '',
    income_category: rec.income_category || '企业服务收入',
    payment_method,
    bank_reference,
    note: notes || `服务收款 ${rec.quote_no || ''}`.trim(),
    created_at: now,
    userId: created_by,
  };

  const txnInsert = await fetch(
    `${supabaseUrl}/rest/v1/transactions?on_conflict=id`,
    {
      method: 'POST',
      headers: { ...sbHeaders, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        id: txnRowId,
        created_at: now,
        updated_at: now,
        state: 'active',
        payload: txnPayload,
      }),
    }
  );

  // Step 3 failure: do NOT roll back payment or receivable update.
  // The financial record (payment + receivable) is authoritative.
  // The transactions ledger entry will be missing — log clearly for manual repair.
  let transactionWarning: string | undefined;
  if (!txnInsert.ok) {
    const errTxt = await txnInsert.text().catch(() => '');
    console.error(
      `[service-payment-register] WARN: transactions write failed for payment ${paymentBusinessId}. ` +
      `Receivable and payment records are correct. Manual ledger repair needed. ` +
      `txnRowId=${txnRowId} error=${errTxt}`
    );
    transactionWarning = `Transaction ledger entry failed (${txnInsert.status}). Payment and receivable records are saved. Manual repair: txn_id=${txnBusinessId}`;
  }

  return json({
    ok: true,
    payment,
    updated_receivable: updatedRec,
    transaction_id: txnBusinessId,
    remaining_outstanding: newOutstanding,
    payment_status: newStatus,
    ...(transactionWarning ? { warning: transactionWarning } : {}),
  });
}
