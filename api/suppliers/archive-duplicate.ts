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

  const supabaseUrl = 'https://efrkvwhzpgahjgfukjth.supabase.co';
  const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVmcmt2d2h6cGdhaGpnZnVranRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNTUwNDgsImV4cCI6MjA5NDkzMTA0OH0.i8TGQneIZHTWeJzuzVv-JBiBppaOjYkPbs4E5K73clU';

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
