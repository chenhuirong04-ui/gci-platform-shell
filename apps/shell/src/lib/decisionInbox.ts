// GCI Executive Desk — Task 8: Decision Inbox / 老板审批箱.
// Surfaces only items that genuinely require Chris's judgment (not routine
// to-dos), records his decision into executive_decisions, and never
// executes anything itself — no email, CRM write, payment, deletion, etc.
import { supabase } from './supabase';
import { getBossDecisions } from './crmSupabase';
import { getSystemRegistry } from './systemRegistry';
import { AGENTS } from '../components/AgentsStatus';

export type DecisionStatus = 'pending' | 'decided' | 'dismissed';
export type DecisionSource = 'crm' | 'business' | 'systems' | 'email' | 'agents';

export interface DecisionOption {
  key: string;
  label: string;
}

export interface ExecutiveDecision {
  id: string;
  source: DecisionSource;
  source_ref: string;
  category: string | null;
  title: string;
  summary: string | null;
  reason: string;
  priority: 'P1' | 'P2' | 'P3';
  status: DecisionStatus;
  decision_options: DecisionOption[];
  selected_option: string | null;
  decision_note: string | null;
  related_customer_id: string | null;
  related_system_id: string | null;
  due_at: string | null;
  created_at: string;
  decided_at: string | null;
  decided_by: string | null;
}

const LATER: DecisionOption = { key: 'later', label: '稍后决定' };

const QUOTE_OPTIONS: DecisionOption[] = [
  { key: 'continue_followup', label: '继续跟进' },
  { key: 'adjust_offer', label: '调整方案/价格' },
  { key: 'pause', label: '暂停' },
  LATER,
];

const SYSTEMS_OPTIONS: DecisionOption[] = [
  { key: 'keep', label: '保留' },
  { key: 'archive_candidate', label: '归档候选' },
  { key: 'needs_audit', label: '需要进一步审计' },
  LATER,
];

const CRM_STAGNANT_OPTIONS: DecisionOption[] = [
  { key: 'keep_focus', label: '继续重点跟进' },
  { key: 'lower_priority', label: '降低优先级' },
  { key: 'pause', label: '暂停' },
  LATER,
];

const AGENT_OPTIONS: DecisionOption[] = [
  { key: 'handle_now', label: '需要立即处理' },
  { key: 'keep_watching', label: '继续关注' },
  LATER,
];

const EMAIL_OPTIONS: DecisionOption[] = [
  { key: 'approve', label: '同意/确认' },
  { key: 'reject', label: '拒绝/不同意' },
  { key: 'need_more_info', label: '需要更多信息' },
  LATER,
];

interface DecisionCandidate {
  source: DecisionSource;
  source_ref: string;
  category: string;
  title: string;
  summary: string;
  reason: string;
  priority: 'P1' | 'P2' | 'P3';
  decision_options: DecisionOption[];
  related_customer_id: string | null;
  related_system_id: string | null;
  due_at: string | null;
}

function base(): string {
  return typeof window !== 'undefined' ? window.location.origin : '';
}

async function safeFetchJson<T = any>(url: string): Promise<T | { ok: false; error: string }> {
  try {
    const res = await fetch(url);
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      return { ok: false, error: `Bad response (${res.status})` };
    }
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}

// Very conservative rule + CRM-name correlation, per Task 8 §1.3: only a
// Gmail message whose subject/snippet both (a) mentions a known CRM
// customer name and (b) contains an explicit decision-language keyword
// becomes a candidate. Anything less certain stays in Boss Action Center's
// P2 instead — never guessed into the Decision Inbox.
const DECISION_KEYWORDS = /报价|价格|条款|合同|付款|合作条件|批准|确认|approve|contract|quote|confirm|decide|payment terms/i;

async function collectEmailCandidates(customerNames: string[]): Promise<DecisionCandidate[]> {
  if (customerNames.length === 0) return [];
  const importantEmails = await safeFetchJson<any>(`${base()}/api/google/important-emails`);
  if (!importantEmails || !importantEmails.ok) return [];

  const candidates: DecisionCandidate[] = [];
  for (const m of importantEmails.results ?? []) {
    const text = `${m.subject || ''} ${m.snippet || ''}`;
    if (!DECISION_KEYWORDS.test(text)) continue;
    const matchedCustomer = customerNames.find((name) => name.length >= 2 && text.toLowerCase().includes(name.toLowerCase()));
    if (!matchedCustomer) continue;
    candidates.push({
      source: 'email',
      source_ref: `email-${m.id}`,
      category: 'Email',
      title: `${matchedCustomer} — ${m.subject || '(无主题)'}`,
      summary: m.snippet,
      reason: `邮件提及客户「${matchedCustomer}」且包含明确的决定性用语(价格/条款/合同/付款/批准等),需要老板确认`,
      priority: 'P2',
      decision_options: EMAIL_OPTIONS,
      related_customer_id: null,
      related_system_id: null,
      due_at: null,
    });
  }
  return candidates;
}

async function collectCandidates(): Promise<DecisionCandidate[]> {
  const candidates: DecisionCandidate[] = [];

  const [quotationFollowups, systemRegistry, bossDecisions] = await Promise.all([
    safeFetchJson<any>(`${base()}/api/trade/check-quotation-followups`),
    getSystemRegistry(),
    getBossDecisions(),
  ]);

  // 1. Quotation: overdue >=7 days — continue / adjust price / pause.
  if (quotationFollowups && quotationFollowups.ok) {
    for (const q of quotationFollowups.quotes ?? []) {
      if (!q.overdue) continue;
      candidates.push({
        source: 'business',
        source_ref: `quote-${q.id}`,
        category: 'Quotation',
        title: `${q.customerName} — 报价 ${q.daysAgo} 天未回复`,
        summary: q.projectName || q.quoteNo,
        reason: `报价已 ${q.daysAgo} 天未回复,需要决定是继续跟进、调整方案/价格,还是暂停`,
        priority: 'P1',
        decision_options: QUOTE_OPTIONS,
        related_customer_id: null,
        related_system_id: null,
        due_at: null,
      });
    }
  }

  // 2. Systems Registry: deletion_status = review — keep / archive / audit.
  if (systemRegistry.ok) {
    for (const r of systemRegistry.rows) {
      if (r.deletion_status !== 'review') continue;
      candidates.push({
        source: 'systems',
        source_ref: `sys-${r.id}`,
        category: 'Systems',
        title: `${r.system_name} — 系统资产待复核`,
        summary: r.notes || '需要确认是否仍在使用',
        reason: `系统资产的删除状态为 review,需要决定保留还是归档候选`,
        priority: 'P2',
        decision_options: SYSTEMS_OPTIONS,
        related_customer_id: null,
        related_system_id: r.id,
        due_at: null,
      });
    }
  }

  // 3. CRM: focus-priority customers stagnant 7+ days — the only CRM rule
  // reliable enough to surface as a decision (not every "no follow-up date"
  // item — that stays a routine to-do in Boss Action Center).
  const stagnantCustomerNames: string[] = [];
  if (bossDecisions.ok) {
    for (const it of bossDecisions.items) {
      if (it.reason !== '重点客户超7天无跟进') continue;
      stagnantCustomerNames.push(it.customerName);
      candidates.push({
        source: 'crm',
        source_ref: `crm-stagnant-${it.id}`,
        category: 'CRM',
        title: `${it.customerName} — 重点客户长期未跟进`,
        summary: it.detail,
        reason: `重点客户超过 7 天无跟进记录,需要决定是否继续重点投入`,
        priority: 'P2',
        decision_options: CRM_STAGNANT_OPTIONS,
        related_customer_id: it.id,
        related_system_id: null,
        due_at: null,
      });
    }
  }

  // 4. AI Agents: only real error / needsChris>0 states — never a fake
  // decision for no_data/deferred/healthy agents.
  for (const a of AGENTS) {
    if (a.status === 'error' || a.needsChris > 0) {
      candidates.push({
        source: 'agents',
        source_ref: `agent-${a.name}`,
        category: 'Agents',
        title: `${a.name} — 需要处理方式`,
        summary: a.todaySummary,
        reason: `Agent 处于 error 状态或有 ${a.needsChris} 项需要人工处理,需要决定如何应对`,
        priority: 'P1',
        decision_options: AGENT_OPTIONS,
        related_customer_id: null,
        related_system_id: null,
        due_at: null,
      });
    }
  }

  // 5. Gmail: conservative rule + CRM-name correlation (customer names from
  // the CRM stagnant list above, kept minimal — no separate full customer scan).
  const emailCandidates = await collectEmailCandidates(stagnantCustomerNames);
  candidates.push(...emailCandidates);

  return candidates;
}

// Idempotency: never create a second PENDING row for the same source+source_ref.
export async function syncDecisionCandidates(): Promise<
  { ok: true; created: number } | { ok: false; error: string }
> {
  const candidates = await collectCandidates();
  if (candidates.length === 0) return { ok: true, created: 0 };

  const { data: existing, error } = await supabase
    .from('executive_decisions')
    .select('source, source_ref')
    .eq('status', 'pending');
  if (error) return { ok: false, error: error.message };

  const existingKeys = new Set((existing ?? []).map((r: any) => `${r.source}|${r.source_ref}`));
  const toInsert = candidates.filter((c) => !existingKeys.has(`${c.source}|${c.source_ref}`));
  if (toInsert.length === 0) return { ok: true, created: 0 };

  const { error: insErr } = await supabase.from('executive_decisions').insert(
    toInsert.map((c) => ({
      source: c.source,
      source_ref: c.source_ref,
      category: c.category,
      title: c.title,
      summary: c.summary,
      reason: c.reason,
      priority: c.priority,
      status: 'pending',
      decision_options: c.decision_options,
      related_customer_id: c.related_customer_id,
      related_system_id: c.related_system_id,
      due_at: c.due_at,
    })),
  );
  if (insErr) return { ok: false, error: insErr.message };
  return { ok: true, created: toInsert.length };
}

export async function getDecisions(filter?: {
  status?: DecisionStatus;
}): Promise<{ ok: true; rows: ExecutiveDecision[] } | { ok: false; error: string }> {
  let q = supabase.from('executive_decisions').select('*').order('created_at', { ascending: false });
  if (filter?.status) q = q.eq('status', filter.status);
  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };
  return { ok: true, rows: (data ?? []) as ExecutiveDecision[] };
}

// Sync candidates then return the current pending list — the combined
// entrypoint the UI and Ask GCI use so callers never need two round-trips.
export async function refreshPendingDecisions(): Promise<
  { ok: true; rows: ExecutiveDecision[] } | { ok: false; error: string }
> {
  const sync = await syncDecisionCandidates();
  if (!sync.ok) return sync;
  return getDecisions({ status: 'pending' });
}

// Records what Chris decided. Never triggers any external action — this is
// the only write this module performs. "later" (稍后决定) is recorded but
// leaves the item pending; any other option marks it decided.
export async function recordDecision(
  id: string,
  optionKey: string,
  note?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: userRes } = await supabase.auth.getUser();
  const isLater = optionKey === 'later';
  const { error } = await supabase
    .from('executive_decisions')
    .update({
      status: isLater ? 'pending' : 'decided',
      selected_option: optionKey,
      decision_note: note || null,
      decided_at: isLater ? null : new Date().toISOString(),
      decided_by: isLater ? null : userRes?.user?.id ?? null,
    })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export const DECISION_SOURCE_LABEL: Record<DecisionSource, string> = {
  crm: 'CRM',
  business: 'Business',
  systems: 'Systems',
  email: 'Email',
  agents: 'Agents',
};
