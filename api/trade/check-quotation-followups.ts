// Vercel Edge Runtime — AI quotation follow-up query
// Reads quotation_records (flat schema, no payload wrapper).
// "Pending reply" = status GENERATED (quote sent to customer, awaiting confirmation).
// DRAFT = still being edited; SENT_TO_TRADE = already accepted/converted.
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

const OVERDUE_DAYS = 7;

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS });
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !key) {
    return json({ ok: false, error: 'Supabase not configured' }, 500);
  }

  // quotation_records is FLAT schema (no payload wrapper).
  // Actual columns: id, quote_no, customer_name, project_name, grand_total,
  //                 status (DRAFT|GENERATED|SENT_TO_TRADE), created_at, updated_at,
  //                 quote_date, salesperson, quote_type, margin_percent, vat_amount
  const queryUrl = `${supabaseUrl}/rest/v1/quotation_records`
    + `?select=id,quote_no,customer_name,project_name,grand_total,status,created_at,quote_date,salesperson,quote_type`
    + `&status=eq.GENERATED`
    + `&order=created_at.asc`
    + `&limit=50`;

  const res = await fetch(queryUrl, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    return json({ ok: false, error: `Supabase ${res.status}`, detail: errText }, 200);
  }

  const rows: any[] = await res.json();
  const now = Date.now();

  const quotes = rows.map(q => {
    // Use quote_date if set, else fall back to created_at
    const refDate = q.quote_date || q.created_at;
    const refMs = refDate ? new Date(refDate).getTime() : now;
    const daysAgo = Math.floor((now - refMs) / 86400000);
    const overdue = daysAgo >= OVERDUE_DAYS;

    return {
      id:           q.id,
      quoteNo:      q.quote_no  || '—',
      customerName: q.customer_name || '—',
      projectName:  q.project_name  || '',
      grandTotal:   Number(q.grand_total) || 0,
      currency:     'AED',
      daysAgo,
      overdue,
      quoteType:    q.quote_type || 'CUSTOM',
      salesperson:  q.salesperson || '',
      quoteDate:    q.quote_date || q.created_at || '',
      // Suggested action based on urgency
      action: overdue
        ? '⚠ 立即跟进 — 超过 7 天未回复'
        : daysAgo >= 3
          ? '建议本周内跟进'
          : '正常等待中',
    };
  });

  const overdueCount = quotes.filter(q => q.overdue).length;
  const totalAmount  = quotes.reduce((s, q) => s + q.grandTotal, 0);

  return json({
    ok:           true,
    total:        quotes.length,
    overdueCount,
    overdueDays:  OVERDUE_DAYS,
    totalAmount,
    quotes,
    asOf:         new Date().toISOString(),
  });
}
