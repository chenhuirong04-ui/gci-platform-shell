// GCI Executive Desk — Task 8/9: Decision Inbox / 老板审批箱 + Follow-through.
// Surfaces only items that genuinely require Chris's judgment (not routine
// to-dos), records his decision and its execution progress into
// executive_decisions, and never executes anything itself — no email, CRM
// write, quote change, system deletion, Calendar change, or Agent action.
import { supabase } from './supabase';
import { getBossDecisions } from './crmSupabase';
import { getSystemRegistry } from './systemRegistry';
import { AGENTS } from '../components/AgentsStatus';
import { parseRelativeDateZh } from '../ai/crmAskGciParsers';

export type DecisionStatus = 'pending' | 'decided' | 'dismissed';
export type DecisionSource = 'crm' | 'business' | 'systems' | 'email' | 'agents';
export type ExecutionStatus = 'not_required' | 'pending' | 'in_progress' | 'completed' | 'blocked';

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
  // Task 9 — execution follow-through fields (nullable; NULL = not tracked yet).
  execution_status: ExecutionStatus | null;
  assignee: string | null;
  execution_due_at: string | null;
  execution_note: string | null;
  completed_at: string | null;
  follow_up_at: string | null;
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

// GCI operates on Asia/Dubai (UTC+4). The +4h-shift-then-slice pattern below
// (same as actionCenter.ts / crmSupabase.ts / calendar-events.ts) is ONLY
// valid for extracting a Dubai *calendar-date string* from an instant — it
// must never be used as a raw epoch in an absolute-time comparison (e.g.
// against execution_due_at/decided_at/follow_up_at, which are real, already
// timezone-correct UTC instants). Comparing a shifted "now" epoch against a
// real epoch double-counts the offset and makes everything look ~4h more
// urgent than it is. Absolute comparisons below use the real Date.now();
// only the *day-string* comparisons route through the shifted helpers.
function dubaiDateStrOfMs(realMs: number): string {
  return new Date(realMs + 4 * 3600 * 1000).toISOString().slice(0, 10);
}
function isSameDubaiDay(iso: string | null, realNowMs: number): boolean {
  if (!iso) return false;
  return dubaiDateStrOfMs(new Date(iso).getTime()) === dubaiDateStrOfMs(realNowMs);
}

// Accepts a Chinese relative date phrase ("明天"/"周三"/"3天后"/"2026-08-20"),
// reusing Task 3's parser as-is (no new date logic). Stores as Dubai midnight
// for that calendar date so "today/overdue/due within 24h" comparisons stay
// timezone-consistent with the rest of the app.
function parseDueDateInput(text: string | undefined | null): string | null {
  if (!text || !text.trim()) return null;
  const dateStr = parseRelativeDateZh(text.trim());
  if (!dateStr) return null;
  return `${dateStr}T00:00:00+04:00`;
}

// ── §1: Very conservative rule + CRM-name correlation for Gmail candidates ──
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

  const emailCandidates = await collectEmailCandidates(stagnantCustomerNames);
  candidates.push(...emailCandidates);

  return candidates;
}

const COOLDOWN_MS = 7 * 24 * 3600 * 1000;

// Idempotency + Task 9 cooldown: never create a second PENDING row for the
// same source+source_ref; and once a source_ref has been decided, don't
// resurrect it as a new pending row for 7 days unless the decision's own
// follow_up_at has already passed (an explicit "come back on this date"
// signal Chris set himself — never inferred by comparing underlying data).
export async function syncDecisionCandidates(): Promise<
  { ok: true; created: number } | { ok: false; error: string }
> {
  const candidates = await collectCandidates();
  if (candidates.length === 0) return { ok: true, created: 0 };

  const { data: existing, error } = await supabase
    .from('executive_decisions')
    .select('source, source_ref, status, decided_at, follow_up_at')
    .in('status', ['pending', 'decided']);
  if (error) return { ok: false, error: error.message };

  const nowMs = Date.now();
  const byKey = new Map<string, { status: string; decided_at: string | null; follow_up_at: string | null }[]>();
  for (const r of existing ?? []) {
    const key = `${r.source}|${r.source_ref}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(r as any);
  }

  const suppressed = new Set<string>();
  for (const [key, rows] of byKey) {
    if (rows.some((r) => r.status === 'pending')) {
      suppressed.add(key);
      continue;
    }
    const decidedRows = rows.filter((r) => r.status === 'decided' && r.decided_at);
    if (decidedRows.length === 0) continue;
    const latest = decidedRows.reduce((a, b) => (new Date(a.decided_at!).getTime() > new Date(b.decided_at!).getTime() ? a : b));
    const withinCooldown = nowMs - new Date(latest.decided_at!).getTime() < COOLDOWN_MS;
    const followUpDue = latest.follow_up_at ? new Date(latest.follow_up_at).getTime() <= nowMs : false;
    if (withinCooldown && !followUpDue) suppressed.add(key);
  }

  const toInsert = candidates.filter((c) => !suppressed.has(`${c.source}|${c.source_ref}`));
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

export async function refreshPendingDecisions(): Promise<
  { ok: true; rows: ExecutiveDecision[] } | { ok: false; error: string }
> {
  const sync = await syncDecisionCandidates();
  if (!sync.ok) return sync;
  return getDecisions({ status: 'pending' });
}

export interface RecordDecisionInput {
  note?: string;
  assignee?: string;
  executionDueText?: string; // raw Chinese relative-date text, e.g. "明天"
  executionNote?: string;
  followUpText?: string; // raw Chinese relative-date text, e.g. "周三"
}

// Task 16 §十一 — Chris recording a decision he already made in
// conversation ("我决定按小时"), as opposed to the system surfacing a
// pending decision that needs options (Task 8). Inserted directly as
// status='decided' — there's nothing left to choose. Only ever called
// after Chris's explicit confirm click; never from a bare "we should
// figure this out" statement (that stays a Business To-Do — Task 16 §十一).
export async function createManualDecision(input: {
  title: string;
  reason: string;
  decisionNote: string;
  relatedCustomerId?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: userRes } = await supabase.auth.getUser();
  const { error } = await supabase.from('executive_decisions').insert({
    source: 'business',
    source_ref: `manual-${Date.now()}`,
    category: 'Business Assistant',
    title: input.title,
    reason: input.reason,
    priority: 'P3',
    status: 'decided',
    decision_options: [{ key: 'manual', label: '已决定' }],
    selected_option: 'manual',
    decision_note: input.decisionNote,
    related_customer_id: input.relatedCustomerId ?? null,
    decided_at: new Date().toISOString(),
    decided_by: userRes?.user?.id ?? null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Records what Chris decided (+ optional execution plan). Never triggers any
// external action — this is the only write this module performs for the
// decision step. "later" (稍后决定) keeps the item pending and only accepts
// a follow-up date; any other option marks it decided and opens execution
// tracking at execution_status='pending' (Chris can leave every field blank).
export async function recordDecision(
  id: string,
  optionKey: string,
  input: RecordDecisionInput = {},
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: userRes } = await supabase.auth.getUser();
  const isLater = optionKey === 'later';
  const update: Record<string, any> = {
    status: isLater ? 'pending' : 'decided',
    selected_option: optionKey,
    decision_note: input.note || null,
    decided_at: isLater ? null : new Date().toISOString(),
    decided_by: isLater ? null : userRes?.user?.id ?? null,
    follow_up_at: parseDueDateInput(input.followUpText),
  };
  if (!isLater) {
    update.execution_status = 'pending';
    update.assignee = input.assignee || null;
    update.execution_due_at = parseDueDateInput(input.executionDueText);
    update.execution_note = input.executionNote || null;
  }
  const { error } = await supabase.from('executive_decisions').update(update).eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Lets Chris start tracking execution on an already-decided item that has no
// execution_status yet (e.g. decided before Task 9 shipped). Same write
// surface as recordDecision's execution branch — still only this table.
export async function setExecutionDetails(
  id: string,
  input: { assignee?: string; executionDueText?: string; executionNote?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase
    .from('executive_decisions')
    .update({
      execution_status: 'pending',
      assignee: input.assignee || null,
      execution_due_at: parseDueDateInput(input.executionDueText),
      execution_note: input.executionNote || null,
    })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

const VALID_TRANSITIONS: Record<ExecutionStatus, ExecutionStatus[]> = {
  pending: ['in_progress', 'blocked'],
  in_progress: ['completed', 'blocked'],
  blocked: ['in_progress', 'completed'],
  completed: [],
  not_required: [],
};

export function canTransitionExecutionStatus(current: ExecutionStatus, next: ExecutionStatus): boolean {
  return VALID_TRANSITIONS[current]?.includes(next) ?? false;
}

// Only ever updates executive_decisions' own execution_status/completed_at —
// never CRM, quotes, Systems Registry, Gmail, Calendar, or Agents.
export async function updateExecutionStatus(
  id: string,
  currentStatus: ExecutionStatus,
  nextStatus: ExecutionStatus,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!canTransitionExecutionStatus(currentStatus, nextStatus)) {
    return { ok: false, error: `不允许从「${currentStatus}」直接切换到「${nextStatus}」` };
  }
  const update: Record<string, any> = { execution_status: nextStatus };
  if (nextStatus === 'completed') update.completed_at = new Date().toISOString();
  const { error } = await supabase.from('executive_decisions').update(update).eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ── Task 9 §6/§8: derived follow-through items — for the Home summary panel
// AND for Boss Action Center linkage. Never duplicates the raw Decision
// itself; these are distinct "still needs a next step" entries. ──────────
export type ExecutionUrgency = 'P1' | 'P2' | 'P3';

export interface FollowThroughItem {
  id: string;
  decisionId: string;
  kind: 'execution' | 'follow_up_due';
  priority: ExecutionUrgency;
  title: string;
  reason: string;
  source: DecisionSource;
  category: string | null;
  executionStatus: ExecutionStatus | null;
  dueAt: string | null;
  dueToday: boolean;
}

function classifyExecutionUrgency(d: ExecutiveDecision, nowMs: number): ExecutionUrgency {
  if (d.execution_status === 'blocked') return 'P1';
  const dueMs = d.execution_due_at ? new Date(d.execution_due_at).getTime() : null;
  if (dueMs !== null) {
    if (dueMs < nowMs) return 'P1'; // overdue
    if ((dueMs - nowMs) / 3600000 <= 24) return 'P2'; // due today / within 24h
  }
  if (d.execution_status === 'in_progress') return 'P2';
  return 'P3';
}

function buildFollowThroughItems(decisions: ExecutiveDecision[], nowMs: number): FollowThroughItem[] {
  const items: FollowThroughItem[] = [];

  for (const d of decisions) {
    if (d.status === 'decided' && d.execution_status && d.execution_status !== 'not_required' && d.execution_status !== 'completed') {
      const priority = classifyExecutionUrgency(d, nowMs);
      const overdue = d.execution_due_at ? new Date(d.execution_due_at).getTime() < nowMs : false;
      const reason =
        d.execution_status === 'blocked'
          ? '执行已卡住,需要老板处理'
          : overdue
            ? '执行已逾期'
            : d.execution_status === 'in_progress'
              ? '执行进行中,需要复查'
              : '决定已做出,尚未开始执行';
      items.push({
        id: `exec-${d.id}`,
        decisionId: d.id,
        kind: 'execution',
        priority,
        title: d.title,
        reason,
        source: d.source,
        category: d.category,
        executionStatus: d.execution_status,
        dueAt: d.execution_due_at,
        dueToday: isSameDubaiDay(d.execution_due_at, nowMs),
      });
    }

    // Follow-up reminders apply whether the underlying row is still pending
    // ("稍后决定") or already decided (a "review again on this date" note
    // set alongside execution details) — both use the same follow_up_at field.
    if (d.follow_up_at && new Date(d.follow_up_at).getTime() <= nowMs) {
      items.push({
        id: `followup-${d.id}`,
        decisionId: d.id,
        kind: 'follow_up_due',
        priority: 'P2',
        title: d.title,
        reason: d.status === 'pending' ? '之前选择「稍后决定」,复查时间已到,需要重新决定' : '复查时间已到,需要回顾这项决定',
        source: d.source,
        category: d.category,
        executionStatus: d.execution_status,
        dueAt: d.follow_up_at,
        dueToday: isSameDubaiDay(d.follow_up_at, nowMs),
      });
    }
  }

  const order: Record<ExecutionUrgency, number> = { P1: 0, P2: 1, P3: 2 };
  items.sort((a, b) => order[a.priority] - order[b.priority] || (a.dueAt && b.dueAt ? a.dueAt.localeCompare(b.dueAt) : 0));
  return items;
}

export interface FollowThroughCounts {
  pending: number;
  inProgress: number;
  blocked: number;
  dueToday: number;
}

export async function getFollowThroughData(): Promise<
  { ok: true; counts: FollowThroughCounts; items: FollowThroughItem[] } | { ok: false; error: string }
> {
  const res = await getDecisions();
  if (!res.ok) return res;
  const nowMs = Date.now();
  const tracked = res.rows.filter((d) => d.status === 'decided' && d.execution_status && d.execution_status !== 'not_required' && d.execution_status !== 'completed');
  const counts: FollowThroughCounts = {
    pending: tracked.filter((d) => d.execution_status === 'pending').length,
    inProgress: tracked.filter((d) => d.execution_status === 'in_progress').length,
    blocked: tracked.filter((d) => d.execution_status === 'blocked').length,
    dueToday: tracked.filter((d) => isSameDubaiDay(d.execution_due_at, nowMs)).length,
  };
  const items = buildFollowThroughItems(res.rows, nowMs).slice(0, 5);
  return { ok: true, counts, items };
}

// Used by actionCenter.ts to fold follow-through gaps into Boss Action Center.
export async function getDecisionFollowThroughActions(): Promise<FollowThroughItem[]> {
  const res = await getDecisions();
  if (!res.ok) return [];
  return buildFollowThroughItems(res.rows, Date.now());
}

// Uncapped follow-through list — used by Ask GCI queries ("哪些决定今天到期？",
// "哪些事情卡住了？") that shouldn't be limited to the Home panel's top 5.
export async function getAllFollowThroughItems(): Promise<
  { ok: true; items: FollowThroughItem[] } | { ok: false; error: string }
> {
  const res = await getDecisions();
  if (!res.ok) return res;
  return { ok: true, items: buildFollowThroughItems(res.rows, Date.now()) };
}

export const DECISION_SOURCE_LABEL: Record<DecisionSource, string> = {
  crm: 'CRM',
  business: 'Business',
  systems: 'Systems',
  email: 'Email',
  agents: 'Agents',
};

export const EXECUTION_STATUS_LABEL: Record<ExecutionStatus, string> = {
  not_required: '无需执行',
  pending: '待执行',
  in_progress: '进行中',
  completed: '已完成',
  blocked: '已阻塞',
};
