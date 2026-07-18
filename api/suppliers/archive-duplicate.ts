// api/suppliers/archive-duplicate.ts
// Sets a single supplier's status to 'archived'. No other mutations allowed.
export const config = { runtime: 'edge' };

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

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return json({ ok: false, error: 'Server configuration error: Supabase credentials not set' }, 500);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const { supplierId } = body ?? {};
  if (!supplierId || typeof supplierId !== 'string') {
    return json({ ok: false, error: 'supplierId is required' }, 400);
  }
  // Reject non-UUID strings to prevent injection via query param interpolation
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(supplierId)) {
    return json({ ok: false, error: 'supplierId must be a valid UUID' }, 400);
  }

  // Reject any extra fields in the request body — only supplierId is accepted
  const allowedKeys = new Set(['supplierId']);
  const extraKeys = Object.keys(body).filter(k => !allowedKeys.has(k));
  if (extraKeys.length > 0) {
    return json({ ok: false, error: 'Unexpected fields in request body' }, 400);
  }

  const headers = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };

  // Verify the supplier exists and is not already archived
  const checkRes = await fetch(
    `${supabaseUrl}/rest/v1/suppliers?id=eq.${encodeURIComponent(supplierId)}&select=id,status&limit=1`,
    { headers }
  );
  if (!checkRes.ok) return json({ ok: false, error: 'Database error' }, 500);
  const rows: any[] = await checkRes.json();

  if (rows.length === 0) return json({ ok: false, error: 'Supplier not found' }, 404);
  if (rows[0].status === 'archived') return json({ ok: false, error: 'Already archived' }, 409);

  // Only update status; no other fields
  const updateRes = await fetch(
    `${supabaseUrl}/rest/v1/suppliers?id=eq.${encodeURIComponent(supplierId)}`,
    {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status: 'archived' }),
    }
  );
  if (!updateRes.ok) return json({ ok: false, error: 'Update failed' }, 500);

  return json({ ok: true, supplierId });
}
