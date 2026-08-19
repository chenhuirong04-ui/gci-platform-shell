// GCI Executive Desk — Task 18.1: client-side wrapper for Chanya's status.
// Always goes through GCI's own server-side adapter (api/chanya/executive-status.ts)
// — never calls Chanya directly from the browser, never sees the shared
// secret. Read-only. No function here can trigger Chanya to do anything.
function base(): string {
  return typeof window !== 'undefined' ? window.location.origin : '';
}

export type ChanyaAgentStatus = 'healthy' | 'warning' | 'error' | 'no_data';

export interface ChanyaPlanCount {
  plan: string;
  count: number;
}

export interface ChanyaSystemIssue {
  type: string;
  count: number;
}

export interface ChanyaStatus {
  status: ChanyaAgentStatus;
  last_updated: string | null;
  new_signups_today: number;
  new_signups_month: number;
  new_paid_today: number;
  new_paid_month: number;
  plan_breakdown: ChanyaPlanCount[];
  revenue_today: number;
  revenue_month: number;
  currency: string;
  payment_failures_today: number;
  cancellations_today: number;
  workspaces_created_today: number;
  usage_anomalies: number;
  system_issues: ChanyaSystemIssue[];
  needs_chris: number;
  issues: string[];
}

// GCI Home Final Cleanup §3 — same root-cause fix as getMiaStatus(): bound
// at the source so every caller (Home KPI row, Agents Status card,
// getBossActions()) is protected, not just call sites that happen to wrap it.
export async function getChanyaStatus(): Promise<{ ok: true; data: ChanyaStatus } | { ok: false; status: ChanyaAgentStatus; error: string }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${base()}/api/chanya/executive-status`, { signal: controller.signal });
    clearTimeout(timer);
    const data = await res.json();
    if (data?.ok) return { ok: true, data: data as ChanyaStatus };
    return { ok: false, status: (data?.status as ChanyaAgentStatus) ?? 'no_data', error: data?.error ?? 'Unknown error' };
  } catch (e: any) {
    return { ok: false, status: 'no_data', error: String(e?.message ?? e) };
  }
}
