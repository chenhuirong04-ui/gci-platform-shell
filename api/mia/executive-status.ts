// GCI Executive Desk — Task 14.1: server-side adapter for MIA's
// /api/executive-status. This is the ONLY place GCI talks to MIA — the
// shared secret (MIA_EXECUTIVE_STATUS_SECRET) lives in this Edge function's
// server env only, never reaches the browser. GCI never connects directly
// to MIA's Supabase project and never holds its service_role key. Read-only:
// this function makes exactly one GET call and returns MIA's own bounded
// summary as-is — no additional data is fetched, nothing is written
// anywhere, on either side.
export const config = { runtime: 'edge' };

const MIA_BASE_URL = process.env.MIA_BASE_URL || 'https://gci-ai-sales-agent.vercel.app';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export default async function handler(): Promise<Response> {
  const secret = process.env.MIA_EXECUTIVE_STATUS_SECRET;
  if (!secret) {
    return json({ ok: false, status: 'no_data', error: 'MIA_EXECUTIVE_STATUS_SECRET not configured' });
  }

  try {
    const res = await fetch(`${MIA_BASE_URL}/api/executive-status`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const text = await res.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      return json({ ok: false, status: 'no_data', error: 'MIA returned a non-JSON response' });
    }
    if (!res.ok) {
      return json({ ok: false, status: 'no_data', error: data?.error || `MIA request failed (${res.status})` });
    }
    return json({ ok: true, ...data });
  } catch (e: any) {
    return json({ ok: false, status: 'no_data', error: String(e?.message ?? e) });
  }
}
