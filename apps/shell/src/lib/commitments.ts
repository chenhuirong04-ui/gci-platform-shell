// GCI Executive Desk — Task 10: Executive Memory / Commitment Tracker.
// Tracks explicit commitments only — never turns routine chat, generic
// emails, or generic next_action text into a commitment without either (a)
// a high-confidence structured source (a decided Decision's own
// execution_note) or (b) Chris explicitly confirming a detected candidate.
// This module never sends email, replies to customers, or writes to CRM,
// Decisions, Systems Registry, Calendar, or Agents — only its own table.
import { supabase } from './supabase';
import { getRecentFollowupsWithNotes } from './crmSupabase';
import { parseRelativeDateZh } from '../ai/crmAskGciParsers';

export type CommitmentType = 'outbound' | 'inbound' | 'internal';
export type CommitmentSource = 'crm' | 'gmail' | 'decision' | 'calendar' | 'manual';
export type CommitmentStoredStatus = 'open' | 'completed' | 'cancelled';
export type CommitmentDisplayStatus = CommitmentStoredStatus | 'overdue';
export type CommitmentPriority = 'P1' | 'P2' | 'P3';

export interface ExecutiveCommitment {
  id: string;
  title: string;
  commitment_type: CommitmentType;
  source: CommitmentSource;
  source_ref: string | null;
  related_customer_id: string | null;
  related_decision_id: string | null;
  counterparty: string | null;
  owner: string | null;
  commitment_text: string;
  due_at: string | null;
  status: CommitmentStoredStatus;
  priority: CommitmentPriority;
  source_link: string | null;
  completion_note: string | null;
  created_at: string;
  completed_at: string | null;
  updated_at: string;
}

// A candidate is NEVER persisted until Chris confirms it — it's computed
// fresh on each read from live CRM/Gmail data, never stored anywhere.
export interface CommitmentCandidate {
  id: string; // stable client key = `${source}|${source_ref}|${commitment_text}`
  source: CommitmentSource;
  source_ref: string;
  title: string;
  commitment_text: string;
  due_at: string | null;
  counterparty: string | null;
  commitment_type: CommitmentType;
  source_link: string | null;
  priority: CommitmentPriority;
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

// Real epoch for absolute comparisons; the Dubai shift is only ever applied
// when extracting a calendar-date STRING (see dubaiDateStrOfMs/isSameDubaiDay
// below) — never mixed into overdue/due-within arithmetic. See the standing
// rule from Task 9 / 9.1.
function dubaiDateStrOfMs(realMs: number): string {
  return new Date(realMs + 4 * 3600 * 1000).toISOString().slice(0, 10);
}
function isSameDubaiDay(iso: string | null, realNowMs: number): boolean {
  if (!iso) return false;
  return dubaiDateStrOfMs(new Date(iso).getTime()) === dubaiDateStrOfMs(realNowMs);
}
function toDubaiMidnightIso(dateStr: string): string {
  return `${dateStr}T00:00:00+04:00`;
}

export function commitmentDisplayStatus(c: ExecutiveCommitment, realNowMs: number): CommitmentDisplayStatus {
  if (c.status === 'open' && c.due_at && new Date(c.due_at).getTime() < realNowMs) return 'overdue';
  return c.status;
}

function classifyCommitmentUrgency(c: ExecutiveCommitment, realNowMs: number): CommitmentPriority {
  const dueMs = c.due_at ? new Date(c.due_at).getTime() : null;
  if (dueMs !== null) {
    if (dueMs < realNowMs) return 'P1'; // overdue
    if ((dueMs - realNowMs) / 3600000 <= 24) return 'P2'; // due today / within 24h
  }
  return 'P3';
}

async function existingCommitmentKeySet(): Promise<Set<string>> {
  const { data } = await supabase.from('executive_commitments').select('source, source_ref, commitment_text');
  return new Set((data ?? []).map((r: any) => `${r.source}|${r.source_ref}|${r.commitment_text}`));
}

// ── §3.A — high-confidence structured source: a decided Decision's own
// execution_note. Auto-generated directly (idempotent), no candidate step. ──
export async function syncStructuredCommitments(): Promise<
  { ok: true; created: number } | { ok: false; error: string }
> {
  const { data: decisions, error } = await supabase
    .from('executive_decisions')
    .select('id, title, priority, related_customer_id, execution_note, execution_status, execution_due_at, assignee, completed_at')
    .eq('status', 'decided');
  if (error) return { ok: false, error: error.message };

  const relevant = (decisions ?? []).filter((d: any) => (d.execution_note || '').trim().length > 0);
  if (relevant.length === 0) return { ok: true, created: 0 };

  const { data: existing, error: exErr } = await supabase
    .from('executive_commitments')
    .select('id, source_ref, status')
    .eq('source', 'decision');
  if (exErr) return { ok: false, error: exErr.message };
  const byRef = new Map((existing ?? []).map((r: any) => [r.source_ref, r]));

  let created = 0;
  for (const d of relevant) {
    const sourceRef = `decision-${d.id}`;
    const text = (d.execution_note as string).trim();
    const derivedStatus: 'open' | 'completed' = d.execution_status === 'completed' ? 'completed' : 'open';
    const row = byRef.get(sourceRef);

    if (!row) {
      const { error: insErr } = await supabase.from('executive_commitments').insert({
        title: d.title,
        commitment_type: 'internal',
        source: 'decision',
        source_ref: sourceRef,
        related_decision_id: d.id,
        related_customer_id: d.related_customer_id,
        owner: d.assignee || null,
        commitment_text: text,
        due_at: d.execution_due_at,
        status: derivedStatus,
        priority: d.priority,
        source_link: '/decisions',
        completed_at: derivedStatus === 'completed' ? (d.completed_at ?? new Date().toISOString()) : null,
      });
      if (!insErr) created++;
      continue;
    }

    // Mirror the decision's completion into an already-open commitment —
    // never touches a manually cancelled or already-completed commitment.
    if (row.status === 'open' && derivedStatus === 'completed') {
      await supabase
        .from('executive_commitments')
        .update({ status: 'completed', completed_at: d.completed_at ?? new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', row.id);
    }
  }
  return { ok: true, created };
}

// ── §3.B — free-text candidates. Requires BOTH an explicit action verb AND
// a parseable date phrase (Task 3's parser, reused as-is) — text with only
// one of the two is not confident enough to count as a commitment. ──────
const CRM_COMMITMENT_VERB_RE = /发送|发给|发出|回复|确认|报价|提交|寄出|安排|联系|跟进|签署|提供|回访|电话/;
const CRM_INBOUND_RE = /客户(?:会|答应|承诺)|对方(?:会|答应|承诺)/;

export async function getCrmCommitmentCandidates(): Promise<
  { ok: true; candidates: CommitmentCandidate[] } | { ok: false; error: string }
> {
  const res = await getRecentFollowupsWithNotes(30);
  if (!res.ok) return res;
  const existing = await existingCommitmentKeySet();

  const candidates: CommitmentCandidate[] = [];
  for (const f of res.rows) {
    const text = [f.next_action, f.notes].filter(Boolean).join(' ').trim();
    if (!text || !CRM_COMMITMENT_VERB_RE.test(text)) continue;
    const dateStr = parseRelativeDateZh(text);
    if (!dateStr) continue; // no explicit date signal — not confident enough
    const sourceRef = `crm-followup-${f.id}`;
    const key = `crm|${sourceRef}|${text}`;
    if (existing.has(key)) continue;
    candidates.push({
      id: key,
      source: 'crm',
      source_ref: sourceRef,
      title: `${f.customer_name ?? '客户'} — ${text.slice(0, 40)}`,
      commitment_text: text,
      due_at: toDubaiMidnightIso(dateStr),
      counterparty: f.customer_name,
      commitment_type: CRM_INBOUND_RE.test(text) ? 'inbound' : 'outbound',
      source_link: '/crm?tab=dashboard',
      priority: 'P2',
    });
  }
  return { ok: true, candidates };
}

const GMAIL_COMMITMENT_RE =
  /\bI will\b|\bWe will\b|\bI'll\b|\bWe'll\b|will send|will provide|will confirm|will get back to you|by tomorrow|by (?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)|我会|我们会|明天发|下周给|稍后确认|会回复|会提供/i;

export async function getGmailCommitmentCandidates(): Promise<
  { ok: true; candidates: CommitmentCandidate[] } | { ok: false; error: string }
> {
  const important = await safeFetchJson<any>(`${base()}/api/google/important-emails`);
  if (!important || !important.ok) return { ok: true, candidates: [] };
  const existing = await existingCommitmentKeySet();

  const candidates: CommitmentCandidate[] = [];
  for (const m of important.results ?? []) {
    const text = `${m.subject || ''} ${m.snippet || ''}`.trim();
    if (!text || !GMAIL_COMMITMENT_RE.test(text)) continue;
    const sourceRef = `email-${m.id}`;
    const key = `gmail|${sourceRef}|${text}`;
    if (existing.has(key)) continue;
    const dateStr = parseRelativeDateZh(text); // English weekday phrases aren't parsed by this helper — due_at stays null rather than guessed
    candidates.push({
      id: key,
      source: 'gmail',
      source_ref: sourceRef,
      title: `${m.sender} — ${m.subject || '(无主题)'}`,
      commitment_text: text,
      due_at: dateStr ? toDubaiMidnightIso(dateStr) : null,
      counterparty: m.sender,
      commitment_type: 'inbound', // the sender is the one promising, in an email addressed to Chris
      source_link: m.link,
      priority: 'P2',
    });
  }
  return { ok: true, candidates };
}

// Chris explicitly confirms a candidate — this is the ONLY way free-text
// candidates ever get written.
export async function confirmCommitmentCandidate(c: CommitmentCandidate): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.from('executive_commitments').insert({
    title: c.title,
    commitment_type: c.commitment_type,
    source: c.source,
    source_ref: c.source_ref,
    counterparty: c.counterparty,
    commitment_text: c.commitment_text,
    due_at: c.due_at,
    status: 'open',
    priority: c.priority,
    source_link: c.source_link,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function getCommitments(): Promise<
  { ok: true; rows: ExecutiveCommitment[] } | { ok: false; error: string }
> {
  const { data, error } = await supabase.from('executive_commitments').select('*').order('created_at', { ascending: false });
  if (error) return { ok: false, error: error.message };
  return { ok: true, rows: (data ?? []) as ExecutiveCommitment[] };
}

// Combined entrypoint: sync structured commitments (idempotent), then return
// the full list — mirrors the Task 8/9 refreshPendingDecisions() pattern.
export async function refreshCommitments(): Promise<
  { ok: true; rows: ExecutiveCommitment[] } | { ok: false; error: string }
> {
  const sync = await syncStructuredCommitments();
  if (!sync.ok) return sync;
  return getCommitments();
}

export async function updateCommitmentStatus(
  id: string,
  status: 'completed' | 'cancelled',
  note?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const update: Record<string, any> = { status, updated_at: new Date().toISOString() };
  if (status === 'completed') {
    update.completed_at = new Date().toISOString();
    update.completion_note = note || null;
  }
  const { error } = await supabase.from('executive_commitments').update(update).eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export interface CommitmentHomeSummary {
  open: number;
  overdue: number;
  dueToday: number;
}

export async function getCommitmentHomeData(): Promise<
  { ok: true; summary: CommitmentHomeSummary; items: ExecutiveCommitment[] } | { ok: false; error: string }
> {
  const res = await refreshCommitments();
  if (!res.ok) return res;
  const nowMs = Date.now();
  const open = res.rows.filter((c) => c.status === 'open');
  const overdue = open.filter((c) => c.due_at && new Date(c.due_at).getTime() < nowMs);
  const dueToday = open.filter((c) => c.due_at && isSameDubaiDay(c.due_at, nowMs));

  const order: Record<CommitmentPriority, number> = { P1: 0, P2: 1, P3: 2 };
  const sorted = [...open].sort((a, b) => {
    const pa = classifyCommitmentUrgency(a, nowMs);
    const pb = classifyCommitmentUrgency(b, nowMs);
    if (order[pa] !== order[pb]) return order[pa] - order[pb];
    if (a.due_at && b.due_at) return a.due_at.localeCompare(b.due_at);
    if (a.due_at) return -1;
    if (b.due_at) return 1;
    return 0;
  });

  return { ok: true, summary: { open: open.length, overdue: overdue.length, dueToday: dueToday.length }, items: sorted.slice(0, 5) };
}

// ── Boss Action Center linkage (Task 10 §8) ──────────────────────────────
export interface CommitmentActionItem {
  id: string;
  relatedDecisionId: string | null;
  title: string;
  reason: string;
  dueAt: string | null;
  priority: CommitmentPriority;
  sourceLink: string | null;
}

export async function getOpenCommitmentActions(): Promise<CommitmentActionItem[]> {
  // Sync structured (Decision-sourced) commitments first — Boss Action
  // Center's dedup against Decision Follow-through only works if a just-
  // decided item's commitment has actually been created yet. Without this,
  // whichever page loads first (Home/Commitments vs Actions) determines
  // whether the dedup fires, which is wrong — every reader must see the
  // same up-to-date state.
  const sync = await syncStructuredCommitments();
  if (!sync.ok) return [];
  const res = await getCommitments();
  if (!res.ok) return [];
  const nowMs = Date.now();
  return res.rows
    .filter((c) => c.status === 'open')
    .map((c) => ({
      id: `commitment-${c.id}`,
      relatedDecisionId: c.related_decision_id,
      title: c.title,
      reason: c.commitment_text,
      dueAt: c.due_at,
      priority: classifyCommitmentUrgency(c, nowMs),
      sourceLink: c.source_link,
    }));
}

export const COMMITMENT_SOURCE_LABEL: Record<CommitmentSource, string> = {
  crm: 'CRM',
  gmail: 'Email',
  decision: 'Decision',
  calendar: 'Calendar',
  manual: 'Manual',
};

export const COMMITMENT_TYPE_LABEL: Record<CommitmentType, string> = {
  outbound: '我方承诺',
  inbound: '对方承诺',
  internal: '内部承诺',
};
