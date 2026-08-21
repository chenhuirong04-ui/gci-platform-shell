// GCI Executive Desk — Task 14.1: server-side adapter for MIA's
// /api/executive-status. This is the ONLY place GCI talks to MIA — the
// shared secret (MIA_EXECUTIVE_STATUS_SECRET) lives in this Edge function's
// server env only, never reaches the browser. GCI never connects directly
// to MIA's Supabase project and never holds its service_role key. Read-only:
// this function makes exactly one GET call and returns MIA's own bounded
// summary as-is — no additional data is fetched, nothing is written
// anywhere, on either side.
//
// Task 18.4 (MIA Detail Bridge) — audited live: MIA's response today only
// has summary counts + an always-empty `top_leads` array with no stable id
// (fields: company/contact/country/reason/current_stage/next_action/
// source_ref — no lead_id, so GCI can't deep-link to a specific lead off
// it). To power a GIA-side lead list + deep-linkable detail page without
// building a second database, MIA's own /api/executive-status needs to
// start additionally returning:
//   "recent_leads": [{
//     "lead_id": string, "company_name": string, "country": string|null,
//     "industry": string|null, "contact_name": string|null,
//     "email": string|null, "whatsapp": string|null, "score": number|null,
//     "priority": string|null, "status": string|null,
//     "why_relevant": string|null, "created_at": string
//   }, ...]   // today's leads, most recent first, capped at 10
//   "needs_chris_items": [{
//     "id": string, "lead_id": string|null, "company_name": string,
//     "reason": string, "suggested_action": string|null,
//     "priority": string|null, "created_at": string
//   }, ...]
// This adapter needs NO code change to relay those once MIA sends them —
// it already passes through `...data` as-is below. Until MIA's side adds
// them, GCI's lead list/detail pages show an honest empty state rather
// than fabricating data.
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
    // GCI Home Final Structure §5 — this upstream call previously had NO
    // timeout at all, so a hung/slow MIA left the client's own 5s
    // AbortController (mia.ts) as the only thing that ever fired, surfacing
    // as an opaque "signal is aborted without reason" with no indication of
    // WHERE it failed. A server-side timeout, shorter than the client's,
    // means this adapter is always the one to time out first and can say so
    // plainly.
    const res = await fetch(`${MIA_BASE_URL}/api/executive-status`, {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(4000),
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
    const timedOut = e?.name === 'TimeoutError' || e?.name === 'AbortError';
    return json({
      ok: false,
      status: 'no_data',
      error: timedOut ? 'MIA 服务响应超时（4秒），可能未启动或正在冷启动' : String(e?.message ?? e),
    });
  }
}
