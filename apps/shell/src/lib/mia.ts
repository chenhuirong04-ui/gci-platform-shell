// GCI Executive Desk — Task 14.1: client-side wrapper for MIA's status.
// Always goes through GCI's own server-side adapter (api/mia/executive-status.ts)
// — never calls MIA directly from the browser, never sees the shared secret.
// Read-only. No function here can trigger MIA to do anything.
function base(): string {
  return typeof window !== 'undefined' ? window.location.origin : '';
}

export type MiaAgentStatus = 'healthy' | 'warning' | 'error' | 'no_data';

export interface MiaTopLead {
  company: string;
  contact: string | null;
  country: string | null;
  reason: string | null;
  current_stage: string | null;
  next_action: string | null;
  source_ref: string | null;
}

// Task 18.4 — MIA Detail Bridge. Additive contract fields: MIA's
// /api/executive-status does not populate these yet (confirmed live — see
// api/mia/executive-status.ts's header comment for the exact contract MIA's
// own side needs to implement). Optional here so the existing summary-only
// response keeps working unchanged; the UI shows an honest empty state
// until MIA starts sending real data through these fields.
export interface MiaLead {
  lead_id: string;
  company_name: string;
  country: string | null;
  industry: string | null;
  contact_name: string | null;
  email: string | null;
  whatsapp: string | null;
  score: number | null;
  priority: string | null;
  status: string | null;
  why_relevant: string | null;
  created_at: string;
}

export interface MiaNeedsChrisItem {
  id: string;
  lead_id: string | null;
  company_name: string;
  reason: string;
  suggested_action: string | null;
  priority: string | null;
  created_at: string;
}

export interface MiaStatus {
  agent_name: string;
  status: MiaAgentStatus;
  last_updated: string | null;
  runs_today: number;
  leads_found_today: number;
  researched_today: number;
  contacted_today: number;
  replies_today: number;
  needs_chris: number;
  errors: number;
  top_leads: MiaTopLead[];
  recent_leads?: MiaLead[];
  needs_chris_items?: MiaNeedsChrisItem[];
}

export async function getMiaStatus(): Promise<{ ok: true; data: MiaStatus } | { ok: false; status: MiaAgentStatus; error: string }> {
  try {
    const res = await fetch(`${base()}/api/mia/executive-status`);
    const data = await res.json();
    if (data?.ok) return { ok: true, data: data as MiaStatus };
    return { ok: false, status: (data?.status as MiaAgentStatus) ?? 'no_data', error: data?.error ?? 'Unknown error' };
  } catch (e: any) {
    return { ok: false, status: 'no_data', error: String(e?.message ?? e) };
  }
}
