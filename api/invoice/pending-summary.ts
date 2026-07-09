// Vercel Edge Runtime — Invoice pending summary for Today's Workbench
// Returns counts + list of invoice_drafts with status: draft | waiting_approval | approved
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

const PENDING_STATUSES = ['draft', 'waiting_approval', 'approved'];

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS });
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !key) return json({ error: 'Supabase not configured' }, 500);

  // Fetch all pending invoices (not paid, not cancelled, not issued)
  const statusFilter = PENDING_STATUSES.map(s => `status.eq.${s}`).join(',');
  const res = await fetch(
    `${url}/rest/v1/invoice_drafts?select=id,status,customer_name,total,currency,created_at,invoice_no&or=(${statusFilter})&order=created_at.asc`,
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

  const byStatus: Record<string, number> = { draft: 0, waiting_approval: 0, approved: 0 };
  for (const row of rows) {
    if (byStatus[row.status] !== undefined) byStatus[row.status]++;
  }

  const items = rows.map(r => ({
    id: r.id,
    invoiceNo: r.invoice_no || '—',
    customerName: r.customer_name || r.customerName || '—',
    grandTotal: r.total ?? 0,
    currency: r.currency || 'AED',
    status: r.status,
    createdAt: r.created_at || r.createdAt,
  }));

  return json({
    ok: true,
    total: rows.length,
    byStatus,
    items,
    asOf: new Date().toISOString(),
  });
}
