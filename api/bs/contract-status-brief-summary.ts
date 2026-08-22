// /api/bs/contract-status-brief-summary
// Read-only aggregation of Company Services contract/commercial status, for
// the GIA Daily Business Brief. Reads service_quotes and service_customers
// directly (same flat tables modules/business-solutions/lib/bsCloud.ts
// already reads via listQuotes()/listCustomers()) — never writes anything,
// no AI/inference involved, only literal status-field matches.
//
// Field-location note (confirmed by reading the actual write paths, not
// assumed from the type file): REVISION_REQUESTED and EXPIRED are
// service_quotes.status values (QuoteStatus). CONTRACT_PENDING is NOT a
// quote status — it only exists on service_customers.status
// (ServiceCustomerStatus, set via ServiceCustomerForm.tsx). This endpoint
// reads each from its real table accordingly.
//
// Day-count note: neither table has a dedicated status-change timestamp.
// service_quotes.updated_at / service_customers.updated_at are both
// overwritten on ANY field patch (bsCloud.ts's updateQuote()/
// updateCustomer() unconditionally set updated_at = now on every call), so
// neither is a reliable "how long in this status" signal. This endpoint
// deliberately reports counts/customers only — no "stuck for N days" claim.
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

interface QuoteRow {
  customer_name?: string;
  quote_no?: string;
  currency?: string;
  grand_total?: number;
  status?: string;
}

interface CustomerRow {
  customer_name?: string;
  company_name?: string;
  status?: string;
}

interface CurrencyTotal {
  currency: string;
  totalAmount: number;
}

function groupByCurrency(rows: { currency: string; grand_total: number }[]): CurrencyTotal[] {
  const map = new Map<string, CurrencyTotal>();
  for (const r of rows) {
    const cur = r.currency || 'AED';
    const entry = map.get(cur) ?? { currency: cur, totalAmount: 0 };
    entry.totalAmount += r.grand_total;
    map.set(cur, entry);
  }
  return Array.from(map.values());
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS });
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !key) return json({ ok: false, error: 'Supabase not configured' }, 500);
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

  const [quotesRes, customersRes] = await Promise.all([
    fetch(
      `${supabaseUrl}/rest/v1/service_quotes?select=customer_name,quote_no,currency,grand_total,status&status=in.(REVISION_REQUESTED,EXPIRED)&limit=200`,
      { headers },
    ),
    fetch(
      `${supabaseUrl}/rest/v1/service_customers?select=customer_name,company_name,status&status=eq.CONTRACT_PENDING&limit=200`,
      { headers },
    ),
  ]);

  if (!quotesRes.ok) {
    const errText = await quotesRes.text().catch(() => '');
    return json({ ok: false, error: `Supabase ${quotesRes.status} (service_quotes)`, detail: errText }, 200);
  }
  if (!customersRes.ok) {
    const errText = await customersRes.text().catch(() => '');
    return json({ ok: false, error: `Supabase ${customersRes.status} (service_customers)`, detail: errText }, 200);
  }

  const quoteRows: QuoteRow[] = await quotesRes.json();
  const customerRows: CustomerRow[] = await customersRes.json();

  const revisionRequested = quoteRows.filter((q) => q.status === 'REVISION_REQUESTED');
  const expired = quoteRows.filter((q) => q.status === 'EXPIRED');

  const toQuoteSummary = (rows: QuoteRow[]) => ({
    count: rows.length,
    byCurrency: groupByCurrency(rows.map((r) => ({ currency: r.currency || 'AED', grand_total: Number(r.grand_total) || 0 }))),
    // Preview only — same "first 3 names" convention actionCenter.ts already
    // uses for invoice_review, not a "worst/longest" ranking (no reliable
    // duration signal to rank by).
    customerPreview: rows.slice(0, 3).map((r) => r.customer_name || '—'),
  });

  return json({
    ok: true,
    scope: 'company_services_contract_status', // service_quotes.status + service_customers.status only
    asOf: new Date().toISOString(),
    revisionRequested: toQuoteSummary(revisionRequested),
    expired: toQuoteSummary(expired),
    contractPending: {
      count: customerRows.length,
      customerPreview: customerRows.slice(0, 3).map((c) => c.customer_name || c.company_name || '—'),
    },
  });
}
