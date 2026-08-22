// /api/bs/receivables-brief-summary
// Read-only aggregation of Company Services accounts receivable, for the
// GIA Daily Business Brief. Reads service_receivables directly (same table
// and JSONB payload shape ReceivablesPanel.tsx already reads) — never
// writes anything.
//
// Scope: this is Company Services AR only (service_receivables /
// service_payments, source_module: 'BUSINESS_SOLUTIONS'). Trade-side
// invoicing (invoice_drafts) has no due_date/paid/overdue fields and is
// deliberately NOT covered here — do not treat this as "company-wide AR".
//
// Overdue/due-soon rules mirror modules/business-solutions/lib/overdueUtils.ts
// (computeDisplayStatus / getDaysOverdue / getDaysUntilDue) exactly — same
// "due_date < today" / day-diff math, not a new date rule. That file lives
// in a client-only module path and isn't imported cross-package elsewhere
// in api/*, so the same rule is mirrored here rather than imported, matching
// every other api/*.ts function in this codebase (each is self-contained).
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

interface ServiceReceivablePayload {
  customer_name?: string;
  quote_no?: string;
  currency?: string;
  outstanding_amount?: number;
  payment_status?: 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'CANCELLED';
  due_date?: string;
}

// Mirrors overdueUtils.ts getDaysOverdue() exactly.
function daysOverdue(dueDate: string, today: string): number {
  const due = new Date(dueDate + 'T00:00:00');
  const t = new Date(today + 'T00:00:00');
  return Math.max(0, Math.round((t.getTime() - due.getTime()) / 86400000));
}

// Mirrors overdueUtils.ts getDaysUntilDue() exactly.
function daysUntilDue(dueDate: string, today: string): number {
  const due = new Date(dueDate + 'T00:00:00');
  const t = new Date(today + 'T00:00:00');
  return Math.round((due.getTime() - t.getTime()) / 86400000);
}

interface CurrencyTotal {
  currency: string;
  count: number;
  totalOutstanding: number;
}

function groupByCurrency(rows: { currency: string; outstanding_amount: number }[]): CurrencyTotal[] {
  const map = new Map<string, CurrencyTotal>();
  for (const r of rows) {
    const cur = r.currency || 'AED';
    const entry = map.get(cur) ?? { currency: cur, count: 0, totalOutstanding: 0 };
    entry.count += 1;
    entry.totalOutstanding += r.outstanding_amount;
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

  const res = await fetch(
    `${supabaseUrl}/rest/v1/service_receivables?select=id,payload&state=eq.active&limit=500`,
    { headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } },
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    return json({ ok: false, error: `Supabase ${res.status}`, detail: errText }, 200);
  }

  const dbRows: { id: string; payload: ServiceReceivablePayload }[] = await res.json();
  const today = new Date().toISOString().slice(0, 10); // matches overdueUtils.ts's own `today` (UTC date, no Dubai shift)

  // Only receivables that still genuinely need attention: not settled, not
  // cancelled, and something is actually still outstanding.
  const open = dbRows
    .map((r) => r.payload)
    .filter(Boolean)
    .filter((p) => p.payment_status !== 'PAID' && p.payment_status !== 'CANCELLED')
    .filter((p) => (Number(p.outstanding_amount) || 0) > 0 && !!p.due_date);

  const overdueRows = open
    .filter((p) => (p.due_date as string) < today)
    .map((p) => ({
      customer_name: p.customer_name || '—',
      quote_no: p.quote_no || '—',
      currency: p.currency || 'AED',
      outstanding_amount: Number(p.outstanding_amount) || 0,
      due_date: p.due_date as string,
      daysOverdue: daysOverdue(p.due_date as string, today),
    }));

  const DUE_SOON_DAYS = 7;
  const dueSoonRows = open
    .filter((p) => (p.due_date as string) >= today)
    .map((p) => ({
      customer_name: p.customer_name || '—',
      quote_no: p.quote_no || '—',
      currency: p.currency || 'AED',
      outstanding_amount: Number(p.outstanding_amount) || 0,
      due_date: p.due_date as string,
      daysUntilDue: daysUntilDue(p.due_date as string, today),
    }))
    .filter((r) => r.daysUntilDue <= DUE_SOON_DAYS);

  const worstOverdue = overdueRows.length > 0
    ? [...overdueRows].sort((a, b) => b.daysOverdue - a.daysOverdue || b.outstanding_amount - a.outstanding_amount)[0]
    : null;

  const soonestDueSoon = dueSoonRows.length > 0
    ? [...dueSoonRows].sort((a, b) => a.daysUntilDue - b.daysUntilDue)[0]
    : null;

  return json({
    ok: true,
    scope: 'company_services_receivables', // service_receivables/service_payments only — never invoice_drafts (trade)
    asOf: new Date().toISOString(),
    overdue: {
      count: overdueRows.length,
      byCurrency: groupByCurrency(overdueRows),
      worst: worstOverdue,
    },
    dueSoon: {
      count: dueSoonRows.length,
      dueSoonDays: DUE_SOON_DAYS,
      byCurrency: groupByCurrency(dueSoonRows),
      soonest: soonestDueSoon,
    },
  });
}
