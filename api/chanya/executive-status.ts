// GCI Executive Desk — Task 18.1: server-side adapter for Chanya's
// /api/executive-status. Exact same pattern as api/mia/executive-status.ts:
// this is the ONLY place GCI talks to Chanya — the shared secret
// (CHANYA_EXECUTIVE_STATUS_SECRET) lives in this Edge function's server env
// only, never reaches the browser. GCI never connects directly to Chanya's
// Supabase project (fieqffsqvptweetfzvkh) and never holds its service_role
// key. Read-only: makes exactly one GET call and returns Chanya's own
// bounded summary as-is — no additional data fetched, nothing written on
// either side.
//
// CONTRACT expected from Chanya's side (does not exist yet as of this
// commit — confirmed via a live GET returning 404, not guessed):
//   GET https://chanya.globalcareinfo.com/api/executive-status
//   Header: Authorization: Bearer <CHANYA_EXECUTIVE_STATUS_SECRET>
//   200 response body:
//   {
//     "status": "healthy" | "warning" | "error",
//     "last_updated": "<ISO timestamp>",
//     "new_signups_today": number, "new_signups_month": number,
//     "new_paid_today": number, "new_paid_month": number,
//     "plan_breakdown": [{ "plan": string, "count": number }],
//     "revenue_today": number, "revenue_month": number, "currency": string,
//     "payment_failures_today": number, "cancellations_today": number,
//     "workspaces_created_today": number,
//     "usage_anomalies": number,
//     "system_issues": [{ "type": string, "count": number }],
//     "needs_chris": number,
//     "issues": string[]
//   }
export const config = { runtime: 'edge' };

const CHANYA_BASE_URL = process.env.CHANYA_BASE_URL || 'https://chanya.globalcareinfo.com';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export default async function handler(): Promise<Response> {
  const secret = process.env.CHANYA_EXECUTIVE_STATUS_SECRET;
  if (!secret) {
    return json({ ok: false, status: 'no_data', error: 'CHANYA_EXECUTIVE_STATUS_SECRET not configured' });
  }

  try {
    const res = await fetch(`${CHANYA_BASE_URL}/api/executive-status`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const text = await res.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      return json({ ok: false, status: 'no_data', error: 'Chanya returned a non-JSON response (endpoint likely not implemented yet)' });
    }
    if (!res.ok) {
      return json({ ok: false, status: 'no_data', error: data?.error || `Chanya request failed (${res.status})` });
    }
    return json({ ok: true, ...data });
  } catch (e: any) {
    return json({ ok: false, status: 'no_data', error: String(e?.message ?? e) });
  }
}
