// Vercel Edge Runtime — AI quotation follow-up query
// Reads quotation_records from Supabase, returns QUOTED (pending) quotes sorted by age.
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

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !key) return json({ error: 'Supabase not configured' }, 500);

  // Fetch only QUOTED status (sent to customer, awaiting reply)
  const res = await fetch(
    `${url}/rest/v1/quotation_records?select=id,createdAt,customerName,grandTotal,currency,piType,projectName,quoteRef&status=eq.QUOTED&order=createdAt.asc`,
    {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return json({ error: `Supabase error ${res.status}`, detail: err }, res.status);
  }

  const rows: any[] = await res.json();
  const now = Date.now();

  const quotes = rows.map(q => {
    const createdMs = new Date(q.createdAt).getTime();
    const daysAgo = Math.floor((now - createdMs) / 86400000);
    return {
      id: q.id,
      customerName: q.customerName || '—',
      grandTotal: q.grandTotal,
      currency: q.currency || 'AED',
      daysAgo,
      overdue: daysAgo >= OVERDUE_DAYS,
      piType: q.piType || 'STANDARD',
      projectName: q.projectName || '',
      quoteRef: q.quoteRef || q.id?.slice(0, 8) || '—',
      createdAt: q.createdAt,
    };
  });

  const overdueCount = quotes.filter(q => q.overdue).length;

  return json({
    ok: true,
    total: quotes.length,
    overdueCount,
    overdueDays: OVERDUE_DAYS,
    quotes,
    asOf: new Date().toISOString(),
  });
}
