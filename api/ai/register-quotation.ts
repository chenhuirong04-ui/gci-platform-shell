// /api/ai/register-quotation
// GET  ?check=1&customer=X&total=Y&date=YYYY-MM-DD  → de-dup check
// POST { quote_no, customer_name, project_name, grand_total, status,
//         quote_date, salesperson, quote_type, phone_wa }
//      → writes to quotation_records (flat schema, no payload wrapper)
//
// NOTE: quotation_records has NO source / notes columns.
// These are kept in the draft UI only. Field gap reported to user.
export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS });

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key         = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !key) return json({ ok: false, error: 'Supabase not configured' }, 500);

  // ── GET: de-dup check ────────────────────────────────────────────────────
  if (request.method === 'GET') {
    const reqUrl = new URL(request.url);
    if (reqUrl.searchParams.get('check') !== '1') return json({ ok: false, error: 'Missing check=1' }, 400);

    const customer = reqUrl.searchParams.get('customer')?.trim() || '';
    const total    = Number(reqUrl.searchParams.get('total') || '0');
    const date     = reqUrl.searchParams.get('date') || '';

    if (!customer) return json({ ok: true, duplicates: [] });

    // Look for records with same customer in last 14 days
    const since = new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0];
    const queryUrl = `${supabaseUrl}/rest/v1/quotation_records`
      + `?select=id,quote_no,customer_name,project_name,grand_total,status,quote_date,quote_type`
      + `&customer_name=ilike.*${encodeURIComponent(customer)}*`
      + `&quote_date=gte.${since}`
      + `&order=quote_date.desc`
      + `&limit=10`;

    const res = await fetch(queryUrl, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    });
    if (!res.ok) return json({ ok: true, duplicates: [] }); // fail-open: don't block save on check error

    const rows: any[] = await res.json();

    // Filter: same customer + amount within AED 5000 tolerance + date within 7 days
    const dateMs = date ? new Date(date).getTime() : Date.now();
    const similar = rows.filter(r => {
      const amtMatch = total > 0 ? Math.abs(Number(r.grand_total) - total) < 5000 : false;
      const daysDiff = date ? Math.abs(new Date(r.quote_date || '').getTime() - dateMs) / 86400000 : 999;
      return amtMatch && daysDiff <= 7;
    });

    return json({ ok: true, duplicates: similar });
  }

  // ── POST: write quotation record ─────────────────────────────────────────
  if (request.method === 'POST') {
    let body: any;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: 'Invalid JSON body' }, 400);
    }

    const { quote_no, customer_name, project_name, grand_total, status, quote_date, salesperson, quote_type, phone_wa } = body;

    if (!customer_name) return json({ ok: false, error: 'customer_name is required' }, 400);
    if (!grand_total && grand_total !== 0) return json({ ok: false, error: 'grand_total is required' }, 400);

    const now = new Date().toISOString();
    const record = {
      quote_no:      quote_no || `AI-${now.slice(0,10).replace(/-/g,'')}-${Math.random().toString(36).slice(2,6).toUpperCase()}`,
      customer_name: customer_name.trim(),
      project_name:  (project_name || '').trim() || null,
      grand_total:   Number(grand_total) || 0,
      status:        status || 'GENERATED',
      quote_date:    quote_date || now.split('T')[0],
      salesperson:   salesperson || 'Chris',
      quote_type:    quote_type || 'TRADE',
      phone_wa:      phone_wa || null,
      created_at:    now,
      updated_at:    now,
    };

    const res = await fetch(`${supabaseUrl}/rest/v1/quotation_records`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify(record),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return json({ ok: false, error: `Supabase write failed: ${res.status}`, detail: errText }, 200);
    }

    const created = await res.json().catch(() => []);
    const savedRecord = Array.isArray(created) ? created[0] : created;

    return json({
      ok: true,
      id: savedRecord?.id || null,
      quote_no: record.quote_no,
      customer_name: record.customer_name,
      grand_total: record.grand_total,
      quote_date: record.quote_date,
      savedRecord,
    });
  }

  return json({ error: 'Method not allowed' }, 405);
}
