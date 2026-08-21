// GIA Action Planner V3 — client wrapper + feature flag.
// STEP 2 minimal integration: calls the already-validated (9/9) standalone
// endpoint api/business-assistant/plan-v3.ts, and adapts its output onto
// the EXISTING businessCapture.ts pipeline (RawCaptureIntent ->
// resolveCaptureItems -> confirm card -> confirmCaptureItem) — no changes
// to businessCapture.ts, no new write path, no deleted code. Only actions
// V3 already scored 9/9 on are wired here; anything else falls back to the
// old classify-capture router untouched.
import type { CaptureType, RawCaptureIntent } from './businessCapture';
import type { TaskBusinessArea } from './executiveTasks';

function base(): string {
  return typeof window !== 'undefined' ? window.location.origin : '';
}

const FLAG_STORAGE_KEY = 'gia_planner_v3_enabled';

// Source of truth is the VITE_GIA_PLANNER_V3_ENABLED env var (set in Vercel
// project settings, default off — flipping it to "false" and redeploying is
// the instant full rollback). A ?v3=1 / ?v3=0 URL param additionally lets a
// single browser opt in/out via localStorage for live acceptance testing
// without touching the env var or redeploying.
export function isPlannerV3Enabled(): boolean {
  if (import.meta.env.VITE_GIA_PLANNER_V3_ENABLED === 'true') return true;
  if (typeof window === 'undefined') return false;
  try {
    const qp = new URLSearchParams(window.location.search).get('v3');
    if (qp === '1') { window.localStorage.setItem(FLAG_STORAGE_KEY, '1'); return true; }
    if (qp === '0') { window.localStorage.removeItem(FLAG_STORAGE_KEY); return false; }
    return window.localStorage.getItem(FLAG_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export interface PlanV3Action {
  action: string;
  entities: Record<string, unknown>;
  resolved_date: string | null;
  date_unresolved: boolean;
  executable: boolean;
  missing_context: string | null;
}

interface PlanV3Response {
  ok: boolean;
  actions?: PlanV3Action[];
  error?: string;
}

export async function callPlannerV3(
  text: string,
  currentCustomerName: string | null,
  openTaskTitle: string | null,
): Promise<{ ok: true; actions: PlanV3Action[] } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${base()}/api/business-assistant/plan-v3`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_message: text, currentCustomerName, openTaskTitle }),
    });
    const data: PlanV3Response = await res.json();
    if (!data.ok || !Array.isArray(data.actions)) return { ok: false, error: data.error || 'plan-v3 returned no actions' };
    return { ok: true, actions: data.actions };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}

// Only these 4 action types are routed into a real write via the existing
// capture/confirm pipeline — exactly the set proven by the 9/9 test AND
// needed by acceptance scenarios A/B/D/E. CREATE_PROJECT, PREPARE_QUOTE,
// SUPPORT_ACTION have no wired execution path yet (known gap, not faked).
const MAPPABLE: Record<string, CaptureType> = {
  CREATE_CUSTOMER: 'NEW_CUSTOMER',
  CREATE_FOLLOWUP: 'CRM_FOLLOWUP',
  CREATE_TASK: 'BUSINESS_TODO',
  BUSINESS_MEMORY_WRITE: 'BUSINESS_MEMORY',
};

// Read-only action types answered directly (no confirm card needed) —
// mirrors how tryFileSearch/tryBusinessMemoryQuery already behave.
export const READ_ONLY_ACTIONS = new Set(['QUERY_DOCUMENT', 'BUSINESS_MEMORY_QUERY']);

// Known-but-not-executable-from-text-alone — STORE_DOCUMENT from a plain
// chat message never has a real attachment; plan-v3.ts already flags this
// (executable:false) and we surface it as an honest note rather than a
// silent drop or a fake success.
const HONEST_GAP_ACTIONS = new Set(['STORE_DOCUMENT']);

function emptyRawIntent(rawFragment: string): RawCaptureIntent {
  return {
    type: 'UNKNOWN', customer_name: null, contact_name: null, contact_phone: null, country: null,
    business_type: null, needs_summary: null, followup_notes: null, next_action: null,
    next_follow_up_at: null, commitment_direction: null, commitment_text: null, commitment_due_at: null,
    decision_title: null, decision_note: null, todo_title: null, todo_business_area: null, todo_due_at: null,
    memory_category: null, memory_title: null, memory_content: null, memory_company: null,
    raw_fragment: rawFragment,
  };
}

function entityStr(e: Record<string, unknown>, key: string): string | null {
  const v = e[key];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

// Converts one mappable PlanV3Action into a RawCaptureIntent that
// resolveCaptureItems()/confirmCaptureItem() already know how to resolve
// and write — this is the entire "deterministic mapping to existing write
// paths" step; no new write function is introduced.
function toRawIntent(a: PlanV3Action, rawFragment: string): RawCaptureIntent | null {
  const type = MAPPABLE[a.action];
  if (!type) return null;
  const base = emptyRawIntent(rawFragment);
  const topic = entityStr(a.entities, 'business_topic') || entityStr(a.entities, 'document_topic');

  switch (type) {
    case 'NEW_CUSTOMER':
      return { ...base, type, customer_name: entityStr(a.entities, 'customer_name'), business_type: topic };
    case 'CRM_FOLLOWUP':
      return { ...base, type, customer_name: entityStr(a.entities, 'customer_name'), followup_notes: topic };
    case 'BUSINESS_TODO':
      return {
        ...base, type,
        todo_title: topic || rawFragment,
        todo_due_at: a.resolved_date,
        todo_business_area: 'OTHER' as TaskBusinessArea,
      };
    case 'BUSINESS_MEMORY':
      return {
        ...base, type,
        memory_title: entityStr(a.entities, 'company') ? `${entityStr(a.entities, 'company')} 规则` : rawFragment,
        memory_content: entityStr(a.entities, 'rule') || rawFragment,
        memory_company: entityStr(a.entities, 'company'),
        memory_category: 'other',
      };
    default:
      return null;
  }
}

export interface PlanV3Outcome {
  // Capture-pipeline intents to hand to resolveCaptureItems() for a confirm card.
  intents: RawCaptureIntent[];
  // Read-only replies to show immediately (QUERY_DOCUMENT / BUSINESS_MEMORY_QUERY).
  readOnlyActions: PlanV3Action[];
  // STORE_DOCUMENT-style honest-gap notes to prepend to the confirm card.
  honestGapNotes: string[];
  // Anything not in MAPPABLE/READ_ONLY/HONEST_GAP — unwired action types.
  unhandled: string[];
}

export function classifyPlanV3Actions(actions: PlanV3Action[], rawFragment: string): PlanV3Outcome {
  const outcome: PlanV3Outcome = { intents: [], readOnlyActions: [], honestGapNotes: [], unhandled: [] };
  for (const a of actions) {
    if (READ_ONLY_ACTIONS.has(a.action)) { outcome.readOnlyActions.push(a); continue; }
    if (HONEST_GAP_ACTIONS.has(a.action)) { outcome.honestGapNotes.push(a.missing_context || `${a.action} 暂无法自动执行`); continue; }
    const intent = toRawIntent(a, rawFragment);
    if (intent) { outcome.intents.push(intent); continue; }
    outcome.unhandled.push(a.action);
  }
  return outcome;
}
