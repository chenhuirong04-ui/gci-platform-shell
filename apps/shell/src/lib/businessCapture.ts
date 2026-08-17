// GCI Executive Desk — Task 16: Chat-First Business Capture Router.
// Free text -> classify-capture (OpenAI, server-side, fixed enum only) ->
// resolve customer/dates/duplicates -> ResolvedCaptureItem[] -> Chris
// confirms -> confirmCaptureItem() writes exactly one row per item to the
// matching existing table. Nothing here ever writes before an explicit
// confirm call from the UI.
import {
  findCustomerByName, createCustomerWithContact, logFollowup,
  type CrmCustomer,
} from './crmSupabase';
import { parseRelativeDateZh } from '../ai/crmAskGciParsers';
import { confirmCommitmentCandidate, type CommitmentCandidate, type CommitmentType } from './commitments';
import { createManualDecision } from './decisionInbox';
import { createExecutiveTask, getExecutiveTasks, updateExecutiveTaskStatus, type TaskBusinessArea, type ExecutiveTask } from './executiveTasks';

function base(): string {
  return typeof window !== 'undefined' ? window.location.origin : '';
}

function dubaiToday(): string {
  return new Date(Date.now() + 4 * 3600 * 1000).toISOString().slice(0, 10);
}

export type CaptureType =
  | 'NEW_CUSTOMER' | 'CRM_FOLLOWUP' | 'BUSINESS_TODO' | 'COMMITMENT' | 'DECISION'
  | 'LOOKUP' | 'DRAFT_EMAIL' | 'DRAFT_WHATSAPP' | 'UNKNOWN';

export interface RawCaptureIntent {
  type: CaptureType;
  customer_name: string | null;
  contact_name: string | null;
  country: string | null;
  business_type: string | null;
  needs_summary: string | null;
  followup_notes: string | null;
  next_action: string | null;
  next_follow_up_at: string | null;
  commitment_direction: 'outbound' | 'inbound' | null;
  commitment_text: string | null;
  commitment_due_at: string | null;
  decision_title: string | null;
  decision_note: string | null;
  todo_title: string | null;
  todo_business_area: TaskBusinessArea | null;
  todo_due_at: string | null;
  raw_fragment: string;
}

export async function classifyCapture(
  text: string,
  currentCustomerName: string | null,
): Promise<{ ok: true; intents: RawCaptureIntent[] } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${base()}/api/business-assistant/classify-capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, currentCustomerName, todayDubai: dubaiToday() }),
    });
    const data = await res.json();
    if (!data?.ok) return { ok: false, error: data?.error ?? 'classify failed' };
    return { ok: true, intents: data.intents };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}

// ─── Resolved item — what the confirm card renders + what confirm() writes ──
export interface ResolvedCaptureItem {
  type: CaptureType;
  summaryLines: string[]; // human-readable lines for the confirm card
  raw: RawCaptureIntent;
  // customer resolution (NEW_CUSTOMER / CRM_FOLLOWUP / COMMITMENT tied to a customer)
  matchedCustomer: CrmCustomer | null;
  candidateCustomers: CrmCustomer[] | null; // set when ambiguous — Chris must pick
  isNewCustomer: boolean;
  resolvedNextFollowUpAt: string | null; // ISO date
  resolvedTodoDueAt: string | null;
  resolvedCommitmentDueAt: string | null;
}

async function resolveCustomer(name: string | null): Promise<{ matched: CrmCustomer | null; candidates: CrmCustomer[] | null; isNew: boolean }> {
  if (!name) return { matched: null, candidates: null, isNew: false };
  const res = await findCustomerByName(name);
  if (!res.ok) return { matched: null, candidates: null, isNew: true };
  if (res.found) return { matched: res.customer, candidates: null, isNew: false };
  if (res.multiple) return { matched: null, candidates: res.candidates, isNew: false };
  return { matched: null, candidates: null, isNew: true };
}

export async function resolveCaptureItems(
  intents: RawCaptureIntent[],
  currentCustomer: CrmCustomer | null,
): Promise<ResolvedCaptureItem[]> {
  const out: ResolvedCaptureItem[] = [];
  for (const raw of intents) {
    if (raw.type === 'LOOKUP' || raw.type === 'DRAFT_EMAIL' || raw.type === 'DRAFT_WHATSAPP' || raw.type === 'UNKNOWN') {
      continue; // these aren't capture writes — handled by the existing chat/draft flows
    }

    const nameForCustomerLookup =
      raw.customer_name || (raw.type === 'CRM_FOLLOWUP' || raw.type === 'COMMITMENT' ? currentCustomer?.customer_name ?? null : null);

    let matched: CrmCustomer | null = null;
    let candidates: CrmCustomer[] | null = null;
    let isNew = false;

    if (raw.type === 'NEW_CUSTOMER' || raw.type === 'CRM_FOLLOWUP' || (raw.type === 'COMMITMENT' && nameForCustomerLookup)) {
      const r = await resolveCustomer(nameForCustomerLookup);
      matched = r.matched;
      candidates = r.candidates;
      isNew = raw.type === 'NEW_CUSTOMER' ? r.isNew : false; // CRM_FOLLOWUP never creates — if not found, treat as candidate-less "not found"
    }

    // The classifier only sees the raw text, not the CRM — it can call
    // something "NEW_CUSTOMER" for a name that already exists exactly
    // (e.g. asked with no chat context loaded). resolveCustomer() above is
    // the actual source of truth: an exact single match here always wins
    // and downgrades this item to CRM_FOLLOWUP against the real customer,
    // so a "new customer" write can never create a duplicate. An ambiguous
    // multi-candidate match still needs Chris's pick (§六) before this can
    // be decided either way — the UI's candidate picker sets the type once
    // he chooses.
    let effectiveType: CaptureType = raw.type;
    if (raw.type === 'NEW_CUSTOMER' && matched) {
      effectiveType = 'CRM_FOLLOWUP';
    }

    const resolvedNextFollowUpAt = raw.next_follow_up_at ? parseRelativeDateZh(raw.next_follow_up_at) : null;
    const resolvedTodoDueAt = raw.todo_due_at ? parseRelativeDateZh(raw.todo_due_at) : null;
    const resolvedCommitmentDueAt = raw.commitment_due_at ? parseRelativeDateZh(raw.commitment_due_at) : null;

    const summaryLines: string[] = [];
    const custName = matched?.customer_name || raw.customer_name || currentCustomer?.customer_name;
    const downgradedFromNewCustomer = raw.type === 'NEW_CUSTOMER' && matched;
    switch (effectiveType) {
      case 'NEW_CUSTOMER':
        summaryLines.push(`客户：${raw.customer_name}（新客户）`);
        if (raw.contact_name) summaryLines.push(`联系人：${raw.contact_name}`);
        if (raw.business_type) summaryLines.push(`业务：${raw.business_type}`);
        if (raw.needs_summary) summaryLines.push(`当前需求：${raw.needs_summary}`);
        if (raw.followup_notes) summaryLines.push(`本次沟通：${raw.followup_notes}`);
        // The classifier sometimes attaches an embedded promise
        // (§一 "他说周四给我项目清单") to this same NEW_CUSTOMER object instead
        // of emitting a separate COMMITMENT intent — confirmCaptureItem's
        // NEW_CUSTOMER branch already writes it either way, so the card
        // must show it either way too, or Chris would confirm a write he
        // can't see.
        if (raw.commitment_text && raw.commitment_direction) {
          summaryLines.push(`${raw.commitment_direction === 'inbound' ? '客户承诺' : '我方承诺'}：${raw.commitment_text}${resolvedCommitmentDueAt ? `（${resolvedCommitmentDueAt}）` : ''}`);
        }
        if (resolvedNextFollowUpAt) summaryLines.push(`我方下一步：${resolvedNextFollowUpAt} 再次联系`);
        break;
      case 'CRM_FOLLOWUP':
        summaryLines.push(
          downgradedFromNewCustomer
            ? `客户：${custName}（已存在，记为跟进，不会重复建档）`
            : `客户：${custName ?? '(未指定)'}`
        );
        if (raw.followup_notes) summaryLines.push(`跟进内容：${raw.followup_notes}`);
        if (raw.needs_summary && !raw.followup_notes) summaryLines.push(`跟进内容：${raw.needs_summary}`);
        if (raw.next_action) summaryLines.push(`下一步：${raw.next_action}`);
        if (raw.commitment_text && raw.commitment_direction) {
          summaryLines.push(`${raw.commitment_direction === 'inbound' ? '客户承诺' : '我方承诺'}：${raw.commitment_text}${resolvedCommitmentDueAt ? `（${resolvedCommitmentDueAt}）` : ''}`);
        }
        if (resolvedNextFollowUpAt) summaryLines.push(`下次跟进：${resolvedNextFollowUpAt}`);
        break;
      case 'COMMITMENT':
        summaryLines.push(`${raw.commitment_direction === 'inbound' ? '客户承诺' : '我方承诺'}：${raw.commitment_text ?? raw.raw_fragment}`);
        if (custName) summaryLines.push(`对象：${custName}`);
        if (resolvedCommitmentDueAt) summaryLines.push(`到期：${resolvedCommitmentDueAt}`);
        break;
      case 'DECISION':
        summaryLines.push(`决定：${raw.decision_title ?? raw.raw_fragment}`);
        if (raw.decision_note) summaryLines.push(`说明：${raw.decision_note}`);
        break;
      case 'BUSINESS_TODO':
        summaryLines.push(`待办：${raw.todo_title ?? raw.raw_fragment}`);
        summaryLines.push(`业务领域：${raw.todo_business_area ?? 'OTHER'}`);
        if (resolvedTodoDueAt) summaryLines.push(`到期：${resolvedTodoDueAt}`);
        break;
    }

    out.push({
      type: effectiveType,
      summaryLines,
      raw,
      matchedCustomer: matched,
      candidateCustomers: candidates,
      isNewCustomer: isNew,
      resolvedNextFollowUpAt,
      resolvedTodoDueAt,
      resolvedCommitmentDueAt,
    });
  }
  return out;
}

// ─── Write path — only ever called after Chris's explicit confirm click ────
export async function confirmCaptureItem(item: ResolvedCaptureItem): Promise<{ ok: true } | { ok: false; error: string }> {
  switch (item.type) {
    case 'NEW_CUSTOMER': {
      const { raw } = item;
      const created = await createCustomerWithContact({
        customerName: raw.customer_name!,
        contactName: raw.contact_name || undefined,
      });
      if (!created.ok) return created;
      const notesParts = [raw.needs_summary, raw.followup_notes].filter(Boolean);
      if (notesParts.length > 0 || item.resolvedNextFollowUpAt) {
        const fu = await logFollowup({
          customerId: created.customer.id,
          notes: notesParts.join(' · ') || '首次沟通',
          nextFollowUpAt: item.resolvedNextFollowUpAt || undefined,
        });
        if (!fu.ok) return fu;
      }
      // Inbound commitment embedded in the same message (e.g. "他说周四给我项目清单")
      if (raw.commitment_text && raw.commitment_direction) {
        const candidate: CommitmentCandidate = {
          id: `manual-${Date.now()}`,
          source: 'manual',
          source_ref: `new-customer-${created.customer.id}`,
          title: `${raw.customer_name} — ${raw.commitment_text}`.slice(0, 120),
          commitment_text: raw.commitment_text,
          due_at: item.resolvedCommitmentDueAt,
          counterparty: raw.customer_name,
          commitment_type: raw.commitment_direction as CommitmentType,
          source_link: null,
          priority: 'P2',
        };
        const c = await confirmCommitmentCandidate(candidate);
        if (!c.ok) return c;
      }
      return { ok: true };
    }
    case 'CRM_FOLLOWUP': {
      if (!item.matchedCustomer) return { ok: false, error: '未找到匹配的客户' };
      const res = await logFollowup({
        customerId: item.matchedCustomer.id,
        notes: item.raw.followup_notes || item.raw.needs_summary || item.raw.raw_fragment,
        nextAction: item.raw.next_action || undefined,
        nextFollowUpAt: item.resolvedNextFollowUpAt || undefined,
      });
      if (!res.ok) return res;
      if (item.raw.commitment_text && item.raw.commitment_direction) {
        const candidate: CommitmentCandidate = {
          id: `manual-${Date.now()}`,
          source: 'manual',
          source_ref: `followup-${item.matchedCustomer.id}-${Date.now()}`,
          title: `${item.matchedCustomer.customer_name} — ${item.raw.commitment_text}`.slice(0, 120),
          commitment_text: item.raw.commitment_text,
          due_at: item.resolvedCommitmentDueAt,
          counterparty: item.matchedCustomer.customer_name,
          commitment_type: item.raw.commitment_direction as CommitmentType,
          source_link: null,
          priority: 'P2',
        };
        const c = await confirmCommitmentCandidate(candidate);
        if (!c.ok) return c;
      }
      return { ok: true };
    }
    case 'COMMITMENT': {
      const { raw } = item;
      const candidate: CommitmentCandidate = {
        id: `manual-${Date.now()}`,
        source: 'manual',
        source_ref: `manual-${Date.now()}`,
        title: (item.matchedCustomer ? `${item.matchedCustomer.customer_name} — ` : '') + (raw.commitment_text ?? raw.raw_fragment).slice(0, 100),
        commitment_text: raw.commitment_text ?? raw.raw_fragment,
        due_at: item.resolvedCommitmentDueAt,
        counterparty: item.matchedCustomer?.customer_name ?? raw.customer_name,
        commitment_type: (raw.commitment_direction ?? 'outbound') as CommitmentType,
        source_link: null,
        priority: 'P2',
      };
      return confirmCommitmentCandidate(candidate);
    }
    case 'DECISION': {
      const { raw } = item;
      return createManualDecision({
        title: raw.decision_title ?? raw.raw_fragment,
        reason: '由 Chris 在商务助理中直接记录的决定',
        decisionNote: raw.decision_note ?? raw.raw_fragment,
        relatedCustomerId: item.matchedCustomer?.id ?? null,
      });
    }
    case 'BUSINESS_TODO': {
      const { raw } = item;
      const res = await createExecutiveTask({
        title: raw.todo_title ?? raw.raw_fragment,
        description: raw.raw_fragment,
        businessArea: raw.todo_business_area ?? 'OTHER',
        dueAt: item.resolvedTodoDueAt,
        relatedCustomerId: item.matchedCustomer?.id ?? null,
      });
      if (!res.ok) return res;
      return { ok: true };
    }
    default:
      return { ok: false, error: `不支持的类型: ${item.type}` };
  }
}

// ─── Task 16 §18 — "这个事情完成了" ──────────────────────────────────────────
const COMPLETE_TRIGGER_RE = /(.+?)(?:这个事情|这件事|这个)?(?:完成了|做完了|搞定了)$/u;
const CANCEL_TRIGGER_RE = /(.+?)(?:先)?(?:取消了?|不用做了|不做了)$/u;

export function matchTaskLifecycleCommand(text: string): { keyword: string; action: 'completed' | 'cancelled' } | null {
  const t = text.trim();
  let m = t.match(COMPLETE_TRIGGER_RE);
  if (m && m[1].trim()) return { keyword: m[1].trim(), action: 'completed' };
  m = t.match(CANCEL_TRIGGER_RE);
  if (m && m[1].trim()) return { keyword: m[1].trim(), action: 'cancelled' };
  return null;
}

export async function findOpenTasksByKeyword(keyword: string): Promise<{ ok: true; matches: ExecutiveTask[] } | { ok: false; error: string }> {
  const res = await getExecutiveTasks();
  if (!res.ok) return res;
  const open = res.rows.filter((t) => t.status === 'open' || t.status === 'in_progress');
  const kw = keyword.replace(/[的了吗？?。.！!]/g, '').trim();
  const matches = open.filter((t) => t.title.includes(kw) || kw.includes(t.title) || (t.description ?? '').includes(kw));
  return { ok: true, matches };
}

export async function completeOrCancelTask(id: string, action: 'completed' | 'cancelled'): Promise<{ ok: true } | { ok: false; error: string }> {
  return updateExecutiveTaskStatus(id, action);
}
