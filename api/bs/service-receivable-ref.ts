export const config = { runtime: 'edge' };

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);

  const SUPA_URL = process.env.SUPABASE_URL!;
  const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!SUPA_URL || !SUPA_KEY) return json({ ok: false, error: 'server_config_missing' }, 500);

  const H = {
    apikey: SUPA_KEY,
    Authorization: `Bearer ${SUPA_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };

  const sb = (path: string, init?: RequestInit) =>
    fetch(`${SUPA_URL}/rest/v1/${path}`, { headers: H, ...init });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ ok: false, error: 'invalid_json' }, 400); }

  const { action } = body;

  // ── CREATE ───────────────────────────────────────────────────────────────────
  if (action === 'create') {
    const { receivable_id, invoice_draft_id, quote_id, customer_id, notes, created_by } = body as Record<string, string>;
    if (!receivable_id || !invoice_draft_id) return json({ ok: false, error: 'missing_fields' }, 400);

    // Verify invoice_draft exists
    const invRes = await sb(`invoice_drafts?id=eq.${encodeURIComponent(invoice_draft_id)}&select=id,invoice_no,status`);
    if (!invRes.ok) return json({ ok: false, error: 'invoice_lookup_failed' }, 502);
    const invRows: { id: string; invoice_no: string; status: string }[] = await invRes.json();
    if (!invRows.length) return json({ ok: false, error: 'invoice_draft_not_found' }, 404);

    const payload = {
      id: `REF-${Date.now()}`,
      receivable_id,
      invoice_draft_id,
      quote_id: quote_id || null,
      customer_id: customer_id || null,
      source_module: 'BUSINESS_SOLUTIONS',
      created_at: new Date().toISOString(),
      created_by: created_by || 'user',
      notes: notes || null,
    };

    const insertRes = await sb('service_receivable_refs', {
      method: 'POST',
      body: JSON.stringify({ state: 'active', payload }),
    });

    if (!insertRes.ok) {
      const errText = await insertRes.text();
      if (errText.includes('23505') || errText.includes('unique') || insertRes.status === 409) {
        return json({ ok: false, error: 'duplicate_ref' }, 409);
      }
      return json({ ok: false, error: 'insert_failed', detail: errText }, 500);
    }

    const created = await insertRes.json();
    return json({ ok: true, ref: created[0], invoice: invRows[0] });
  }

  // ── DELETE (soft) ────────────────────────────────────────────────────────────
  if (action === 'delete') {
    const { ref_id } = body as Record<string, string>;
    if (!ref_id) return json({ ok: false, error: 'missing_ref_id' }, 400);

    const findRes = await sb(
      `service_receivable_refs?payload->>id=eq.${encodeURIComponent(ref_id)}&state=eq.active&select=id`
    );
    if (!findRes.ok) return json({ ok: false, error: 'find_failed' }, 500);
    const rows: { id: string }[] = await findRes.json();
    if (!rows.length) return json({ ok: false, error: 'ref_not_found' }, 404);

    const patchRes = await sb(`service_receivable_refs?id=eq.${rows[0].id}`, {
      method: 'PATCH',
      body: JSON.stringify({ state: 'deleted', updated_at: new Date().toISOString() }),
    });
    if (!patchRes.ok) return json({ ok: false, error: 'delete_failed' }, 500);
    return json({ ok: true });
  }

  return json({ ok: false, error: 'unknown_action' }, 400);
}
