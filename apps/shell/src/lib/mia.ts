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

// Task 18.4 — MIA Detail Bridge. MIA's /api/executive-status now sends
// real per-lead data, but with its own field names (no lead_id at all —
// company name is the only stable identifier within a day's list) rather
// than the contract originally proposed. Below, MiaLead/MiaNeedsChrisItem
// are GCI's stable internal shape (unchanged, so MiaLeads.tsx/
// MiaLeadDetail.tsx needed zero changes); mapRawLead/mapRawNeedsChrisItem
// do the field-name translation from MIA's actual response. Every field
// here traces to a real field MIA sent — nothing is invented. Fields MIA
// doesn't provide (contact_name/email/whatsapp/status) stay null rather
// than being guessed.
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
  website_url?: string | null;
}

export interface MiaNeedsChrisItem {
  id: string;
  lead_id: string | null;
  company_name: string;
  reason: string;
  suggested_action: string | null;
  priority: string | null;
  created_at: string;
  source_ref?: string | null;
}

interface MiaRawLead {
  company: string;
  website_url?: string | null;
  business_type?: string | null;
  country?: string | null;
  confidence?: number | null;
  discovered_at: string;
}

interface MiaRawNeedsChrisItem {
  company: string;
  intent?: string | null;
  risk_level?: string | null;
  confidence?: number | null;
  summary: string;
  recommended_action?: string | null;
  received_at: string;
  source_ref?: string | null;
}

function mapRawLead(raw: MiaRawLead): MiaLead {
  return {
    lead_id: raw.company,
    company_name: raw.company,
    country: raw.country ?? null,
    industry: raw.business_type ?? null,
    contact_name: null,
    email: null,
    whatsapp: null,
    score: typeof raw.confidence === 'number' ? Math.round(raw.confidence * 100) : null,
    priority: null,
    status: null,
    why_relevant: null,
    created_at: raw.discovered_at,
    website_url: raw.website_url ?? null,
  };
}

function mapRawNeedsChrisItem(raw: MiaRawNeedsChrisItem): MiaNeedsChrisItem {
  return {
    id: raw.source_ref || `${raw.company}-${raw.received_at}`,
    lead_id: raw.company,
    company_name: raw.company,
    reason: raw.summary,
    suggested_action: raw.recommended_action ?? null,
    priority: raw.risk_level ?? null,
    created_at: raw.received_at,
    source_ref: raw.source_ref ?? null,
  };
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

// GCI Home Final Cleanup §3 — this call chain (Home KPI row, Agents Status
// card, and getBossActions()) had no timeout anywhere, so a slow/hanging
// MIA production endpoint (already known to be login-gated) could block
// whichever card called this directly for 6-9s+. Fixed at the root here so
// every caller is bounded, not just the ones that happened to wrap it.
export async function getMiaStatus(): Promise<{ ok: true; data: MiaStatus } | { ok: false; status: MiaAgentStatus; error: string }> {
  try {
    // GCI Home Final Structure §5 — 7s here, longer than the server
    // adapter's own 4s upstream timeout, so the adapter is always the one
    // to fail first and return a real error message; this client-side
    // timeout is now just a backstop for the adapter itself hanging, not
    // the primary failure path. abort() is given an explicit reason so a
    // genuine client-side timeout never again surfaces as the opaque
    // "signal is aborted without reason".
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('GCI 请求 MIA 状态接口超时（7秒）')), 7000);
    const res = await fetch(`${base()}/api/mia/executive-status`, { signal: controller.signal });
    clearTimeout(timer);
    const data = await res.json();
    if (!data?.ok) return { ok: false, status: (data?.status as MiaAgentStatus) ?? 'no_data', error: data?.error ?? 'Unknown error' };
    const mapped: MiaStatus = {
      ...data,
      recent_leads: Array.isArray(data.recent_leads) ? data.recent_leads.map(mapRawLead) : undefined,
      needs_chris_items: Array.isArray(data.needs_chris_items) ? data.needs_chris_items.map(mapRawNeedsChrisItem) : undefined,
    };
    return { ok: true, data: mapped };
  } catch (e: any) {
    return { ok: false, status: 'no_data', error: String(e?.message ?? e) };
  }
}
