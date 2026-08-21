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
import { createExecutiveTask, getExecutiveTasks, updateExecutiveTaskStatus, updateExecutiveTaskDueDate, type TaskBusinessArea, type ExecutiveTask } from './executiveTasks';
import { createBusinessMemory, type MemoryCategory } from './businessMemory';
import { registerExistingDriveFile, fetchAndStoreFromUrl, classifyFileDescription } from './giaFiles';

function base(): string {
  return typeof window !== 'undefined' ? window.location.origin : '';
}

function dubaiToday(): string {
  return new Date(Date.now() + 4 * 3600 * 1000).toISOString().slice(0, 10);
}

export type CaptureType =
  | 'NEW_CUSTOMER' | 'CRM_FOLLOWUP' | 'BUSINESS_TODO' | 'COMMITMENT' | 'DECISION' | 'BUSINESS_MEMORY'
  | 'STORE_DOCUMENT'
  | 'LOOKUP' | 'DRAFT_EMAIL' | 'DRAFT_WHATSAPP' | 'UNKNOWN';

export interface RawCaptureIntent {
  type: CaptureType;
  customer_name: string | null;
  contact_name: string | null;
  contact_phone: string | null;
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
  memory_category: MemoryCategory | null;
  memory_title: string | null;
  memory_content: string | null;
  memory_company: string | null;
  raw_fragment: string;
  // GIA Multi-Source File Intake — only populated for type === 'STORE_DOCUMENT'
  // when plannerV3.ts's detectFileSource() resolved an explicit source
  // (a literal URL or Drive link in the message). Undefined for every other
  // intent type and for the existing classify-capture.ts path.
  file_source?: 'drive_file' | 'url';
  file_ref?: string;
  file_name?: string;
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
  // A CRM_FOLLOWUP naming someone who isn't in CRM yet (no exact match, no
  // ambiguous candidates either) must never dead-end — it falls back to an
  // executive_task instead of failing, per the routing-priority fix: a
  // customer not existing yet is never a reason to drop what Chris asked
  // to be tracked.
  fallbackToTask: boolean;
  // A NEW_CUSTOMER intent with no customer_name at all (e.g. "帮我建个客户")
  // must never create a blank customer row — this stops the item at a
  // clarification question instead of a confirm button.
  needsCustomerName: boolean;
  // An explicit-destination command with nothing after it (e.g. "进入我的
  // 待办" alone) — stops at a clarification question instead of creating an
  // empty task/memory row. Same UI gate as needsCustomerName.
  needsContent: boolean;
  // "进入CRM，客户跟进：…" (explicit or auto-judged) named a customer that
  // isn't in CRM at all (zero matches, not ambiguous) — must never silently
  // fall back to an executive_task the way the ordinary CRM_FOLLOWUP path
  // does; stops and asks whether to create the customer first instead.
  crmNoMatchBlocked: boolean;
  // GIA Multi-Source File Intake — only set for type === 'STORE_DOCUMENT'
  // when a source was actually resolved (see plannerV3.ts's
  // classifyPlanV3Actions). fileSource/fileRef together tell
  // confirmCaptureItem() which giaFiles.ts fetch+store+register function to
  // call; nothing is fetched or written until Chris's explicit confirm.
  fileSource?: 'drive_file' | 'url' | 'gmail_attachment';
  fileRef?: string;
  fileName?: string;
  fileMimeType?: string;
}

async function resolveCustomer(name: string | null): Promise<{ matched: CrmCustomer | null; candidates: CrmCustomer[] | null; isNew: boolean }> {
  if (!name) return { matched: null, candidates: null, isNew: false };
  const res = await findCustomerByName(name);
  if (!res.ok) return { matched: null, candidates: null, isNew: true };
  if (res.found) return { matched: res.customer, candidates: null, isNew: false };
  if (res.multiple) return { matched: null, candidates: res.candidates, isNew: false };
  return { matched: null, candidates: null, isNew: true };
}

export interface ResolveCaptureItemsOptions {
  // "进入CRM，新建客户：…" — an exact-match customer must never silently
  // downgrade this to CRM_FOLLOWUP the way the ordinary NEW_CUSTOMER path
  // does; instead it's presented as a pick (use existing vs. create new
  // anyway), reusing the same candidate-picker UI as an ambiguous match.
  forceNewCustomerConfirm?: boolean;
  // "进入CRM，客户跟进：…" — zero matches must never silently fall back to
  // an executive_task; instead the item is blocked with a "create the
  // customer first?" prompt (crmNoMatchBlocked on the resolved item).
  suppressFollowupFallback?: boolean;
}

export async function resolveCaptureItems(
  intents: RawCaptureIntent[],
  currentCustomer: CrmCustomer | null,
  opts?: ResolveCaptureItemsOptions,
): Promise<ResolvedCaptureItem[]> {
  const out: ResolvedCaptureItem[] = [];
  for (const raw of intents) {
    if (raw.type === 'LOOKUP' || raw.type === 'DRAFT_EMAIL' || raw.type === 'DRAFT_WHATSAPP' || raw.type === 'UNKNOWN') {
      continue; // these aren't capture writes — handled by the existing chat/draft flows
    }

    if (raw.type === 'NEW_CUSTOMER' && !raw.customer_name) {
      out.push({
        type: 'NEW_CUSTOMER',
        summaryLines: ['可以，客户名称是什么？'],
        raw,
        matchedCustomer: null,
        candidateCustomers: null,
        isNewCustomer: true,
        resolvedNextFollowUpAt: null,
        resolvedTodoDueAt: null,
        resolvedCommitmentDueAt: null,
        fallbackToTask: false,
        needsCustomerName: true,
        needsContent: false,
        crmNoMatchBlocked: false,
      });
      continue;
    }

    const nameForCustomerLookup =
      raw.customer_name || (raw.type === 'CRM_FOLLOWUP' || raw.type === 'COMMITMENT' ? currentCustomer?.customer_name ?? null : null);

    let matched: CrmCustomer | null = null;
    let candidates: CrmCustomer[] | null = null;
    let isNew = false;

    // BUSINESS_TODO is included here (name-only, no currentCustomer
    // fallback via nameForCustomerLookup) so an explicit-destination task
    // like "进入我的待办：周五追Ray的付款" can still link relatedCustomerId to
    // Ray on confirm — linking a customer is never the same as changing the
    // destination to CRM_FOLLOWUP.
    if (raw.type === 'NEW_CUSTOMER' || raw.type === 'CRM_FOLLOWUP' || raw.type === 'BUSINESS_TODO' || (raw.type === 'COMMITMENT' && nameForCustomerLookup)) {
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
      if (opts?.forceNewCustomerConfirm) {
        // "进入CRM，新建客户" explicitly demanded NEW_CUSTOMER — an exact
        // match doesn't get to silently steer this into CRM_FOLLOWUP the
        // way the ordinary path does. Present it exactly like an ambiguous
        // match instead: Chris picks "use existing" or "create new anyway".
        candidates = [matched];
        matched = null;
      } else {
        effectiveType = 'CRM_FOLLOWUP';
      }
    }

    const noMatchNoCandidates = effectiveType === 'CRM_FOLLOWUP' && !matched && (!candidates || candidates.length === 0);
    const fallbackToTask = noMatchNoCandidates && !opts?.suppressFollowupFallback;
    const crmNoMatchBlocked = noMatchNoCandidates && !!opts?.suppressFollowupFallback;

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
        if (raw.contact_phone) summaryLines.push(`电话：${raw.contact_phone}`);
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
        if (crmNoMatchBlocked) {
          summaryLines.push('CRM里没有找到这个客户，要先创建客户吗？');
        } else if (fallbackToTask) {
          summaryLines.push(`${custName ?? '(未指定)'}暂未建立客户档案，已先建立商务待办进行跟踪`);
        } else {
          summaryLines.push(
            downgradedFromNewCustomer
              ? `客户：${custName}（已存在，记为跟进，不会重复建档）`
              : `客户：${custName ?? '(未指定)'}`
          );
        }
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
        if (matched) summaryLines.push(`关联客户：${matched.customer_name}`);
        break;
      case 'BUSINESS_MEMORY':
        summaryLines.push(`长期业务规则：${raw.memory_title ?? raw.raw_fragment}`);
        summaryLines.push(`分类：${raw.memory_category ?? 'other'}`);
        if (raw.memory_company) summaryLines.push(`适用主体：${raw.memory_company}`);
        summaryLines.push(`规则内容：${raw.memory_content ?? raw.raw_fragment}`);
        break;
      case 'STORE_DOCUMENT':
        summaryLines.push(`文件：${raw.file_name ?? raw.raw_fragment}`);
        summaryLines.push(`来源：${raw.file_source === 'drive_file' ? 'Google Drive（已存在文件，登记不重复上传）' : 'URL 链接（下载后存入 Drive）'}`);
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
      fallbackToTask,
      needsCustomerName: false,
      needsContent: false,
      crmNoMatchBlocked,
      fileSource: raw.file_source,
      fileRef: raw.file_ref,
      fileName: raw.file_name,
    });
  }
  return out;
}

// ─── V1 explicit-destination override — Chris naming the destination beats
// whatever classify-capture would otherwise decide. Field extraction still
// goes through the same classifier (it's already reliable at recognizing
// these trigger phrases as capturable per its own rule 1); only the
// resulting TYPE is forced afterward. Scoped to the exact trigger phrases
// below — not a general keyword router, so it never fires on ordinary
// mid-sentence mentions of "提醒我" etc. that the existing classifier
// already handles on its own. ────────────────────────────────────────────
export type ExplicitDestination = 'CRM' | 'MY_TASKS' | 'BUSINESS_MEMORY';
// CRM 二级明确指令 — only meaningful when destination === 'CRM'.
export type CrmSubAction = 'NEW_CUSTOMER' | 'CRM_FOLLOWUP' | 'CRM_QUERY';

const CRM_DEST_RE = /^(进入\s*CRM|记到\s*CRM|登记到\s*CRM)[：:，,]?\s*/iu;
const MY_TASKS_DEST_RE = /^(进入我的待办|加到我的待办|记到我的待办|提醒我)[：:，,]?\s*/u;
const MEMORY_DEST_RE = /^(记住这个|以后记住|作为业务规则记住)[：:，,]?\s*/u;

// Checked in this fixed order right after "进入CRM，" — each is its own
// mutually-exclusive prefix so order among these three never matters.
const CRM_SUB_NEW_CUSTOMER_RE = /^(新建客户|登记客户)[：:，,]?\s*/u;
const CRM_SUB_FOLLOWUP_RE = /^(进入客户跟进|客户跟进|记录跟进)[：:，,]?\s*/u;
const CRM_SUB_QUERY_RE = /^(查询客户|查客户)[：:，,]?\s*/u;

export function detectExplicitDestination(text: string): {
  destination: ExplicitDestination;
  content: string;
  crmSubAction: CrmSubAction | null;
} | null {
  const t = text.trim();
  let m = t.match(CRM_DEST_RE);
  if (m) {
    const rest = t.slice(m[0].length).trim();
    let sm = rest.match(CRM_SUB_NEW_CUSTOMER_RE);
    if (sm) return { destination: 'CRM', crmSubAction: 'NEW_CUSTOMER', content: rest.slice(sm[0].length).trim() };
    sm = rest.match(CRM_SUB_FOLLOWUP_RE);
    if (sm) return { destination: 'CRM', crmSubAction: 'CRM_FOLLOWUP', content: rest.slice(sm[0].length).trim() };
    sm = rest.match(CRM_SUB_QUERY_RE);
    if (sm) return { destination: 'CRM', crmSubAction: 'CRM_QUERY', content: rest.slice(sm[0].length).trim() };
    return { destination: 'CRM', crmSubAction: null, content: rest };
  }
  m = t.match(MY_TASKS_DEST_RE);
  if (m) return { destination: 'MY_TASKS', crmSubAction: null, content: t.slice(m[0].length).trim() };
  m = t.match(MEMORY_DEST_RE);
  if (m) return { destination: 'BUSINESS_MEMORY', crmSubAction: null, content: t.slice(m[0].length).trim() };
  return null;
}

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

function clarificationItem(type: CaptureType, message: string, rawFragment: string, isNameQuestion: boolean): ResolvedCaptureItem {
  return {
    type,
    summaryLines: [message],
    raw: emptyRawIntent(rawFragment),
    matchedCustomer: null,
    candidateCustomers: null,
    isNewCustomer: false,
    resolvedNextFollowUpAt: null,
    resolvedTodoDueAt: null,
    resolvedCommitmentDueAt: null,
    fallbackToTask: false,
    needsCustomerName: isNameQuestion,
    needsContent: !isNameQuestion,
    crmNoMatchBlocked: false,
  };
}

// "进入CRM，新建客户：…" / "进入CRM，客户跟进：…" (explicit sub-action) and the
// auto-judged equivalents share the same forced-type + resolveCaptureItems
// path — only the safety option passed differs (see ResolveCaptureItemsOptions).
// After stripping "进入CRM，新建客户：" the bare content ("ABC贸易，联系人李总，
// 电话...") can read to the classifier as context-free noise with no
// "real business context" cue, leaving customer_name unextracted — a
// synthetic "新客户：" prefix restores that cue without changing what's
// actually recorded (NEW_CUSTOMER's summary/write use raw.customer_name
// directly, never raw_fragment).
async function buildForcedCrmItems(
  forceType: 'NEW_CUSTOMER' | 'CRM_FOLLOWUP',
  content: string,
  currentCustomer: CrmCustomer | null,
): Promise<ResolvedCaptureItem[]> {
  const classifyText = forceType === 'NEW_CUSTOMER' ? `新客户：${content}` : content;
  const cls = await classifyCapture(classifyText, currentCustomer?.customer_name ?? null);
  const first: RawCaptureIntent = (cls.ok && cls.intents[0]) || emptyRawIntent(content);
  const forced: RawCaptureIntent = { ...first, type: forceType };
  return resolveCaptureItems([forced], currentCustomer,
    forceType === 'NEW_CUSTOMER' ? { forceNewCustomerConfirm: true } : { suppressFollowupFallback: true });
}

// "进入CRM，查询客户：…" (explicit or auto-judged) — read-only: only ever
// calls classifyCapture (server-side OpenAI extraction, no DB write) and
// findCustomerByName (Supabase select). Never touches createCustomerWithContact
// / logFollowup / createExecutiveTask — there is no path from here to a write.
async function resolveCrmQueryReply(content: string, currentCustomer: CrmCustomer | null): Promise<string> {
  const cls = await classifyCapture(content, currentCustomer?.customer_name ?? null);
  const customerName = (cls.ok && cls.intents[0]?.customer_name) || null;
  if (!customerName) return '要查询哪个客户？';

  const res = await findCustomerByName(customerName);
  if (!res.ok) return `查询失败：${res.error}`;
  if (!res.found) {
    if (res.multiple) return `CRM里找到多个与「${customerName}」相关的客户，请提供更明确的名称。`;
    return `CRM里没有找到「${customerName}」这个客户。`;
  }

  const c = res.customer;
  const lastFollowup = res.followups[0];
  const lines = [
    `${c.customer_name}：`,
    `状态：${c.status ?? '未知'}`,
    `最近跟进：${c.last_follow_up_at ?? lastFollowup?.follow_up_date ?? '暂无记录'}`,
  ];
  if (lastFollowup?.notes) lines.push(`跟进内容：${lastFollowup.notes}`);
  if (c.next_follow_up_at) lines.push(`下次跟进：${c.next_follow_up_at}`);
  return lines.join('\n');
}

// CRM 二级指令优先级：显式指令 > AI 自动判断 > 追问，绝不硬猜。
async function resolveCrmDestination(
  dest: { crmSubAction: CrmSubAction | null; content: string },
  currentCustomer: CrmCustomer | null,
): Promise<ExplicitDestinationResult> {
  const { crmSubAction, content } = dest;

  if (crmSubAction === 'CRM_QUERY') {
    if (!content) return { kind: 'query', reply: '要查询哪个客户？' };
    return { kind: 'query', reply: await resolveCrmQueryReply(content, currentCustomer) };
  }

  if (crmSubAction === 'NEW_CUSTOMER') {
    if (!content) return { kind: 'capture', items: [clarificationItem('NEW_CUSTOMER', '客户名称是什么？', content, true)] };
    return { kind: 'capture', items: await buildForcedCrmItems('NEW_CUSTOMER', content, currentCustomer) };
  }

  if (crmSubAction === 'CRM_FOLLOWUP') {
    if (!content) return { kind: 'capture', items: [clarificationItem('CRM_FOLLOWUP', '是哪一个客户？要记录什么跟进内容？', content, false)] };
    return { kind: 'capture', items: await buildForcedCrmItems('CRM_FOLLOWUP', content, currentCustomer) };
  }

  // No explicit sub-action ("进入CRM：…") — auto-judge from content, or ask
  // if there's nothing to judge from.
  if (!content) return { kind: 'capture', items: [clarificationItem('NEW_CUSTOMER', '可以，客户名称是什么？', content, true)] };

  const cls = await classifyCapture(content, currentCustomer?.customer_name ?? null);
  const judged = cls.ok ? cls.intents[0]?.type : null;
  if (judged === 'NEW_CUSTOMER') return { kind: 'capture', items: await buildForcedCrmItems('NEW_CUSTOMER', content, currentCustomer) };
  if (judged === 'CRM_FOLLOWUP') return { kind: 'capture', items: await buildForcedCrmItems('CRM_FOLLOWUP', content, currentCustomer) };
  if (judged === 'LOOKUP') return { kind: 'query', reply: await resolveCrmQueryReply(content, currentCustomer) };

  // Can't reliably tell — never guess (spec §二).
  return {
    kind: 'capture',
    items: [clarificationItem('NEW_CUSTOMER', '不确定是要新建客户、记录跟进还是查询客户，能说清楚一点吗？', content, false)],
  };
}

export type ExplicitDestinationResult =
  | { kind: 'capture'; items: ResolvedCaptureItem[] }
  | { kind: 'query'; reply: string };

// Returns null when no explicit-destination trigger matched — the caller
// falls through to the normal router. Otherwise returns either a set of
// resolved capture items to show a confirm card for, or a read-only query
// reply string.
export async function resolveExplicitDestinationCapture(
  text: string,
  currentCustomer: CrmCustomer | null,
): Promise<ExplicitDestinationResult | null> {
  const dest = detectExplicitDestination(text);
  if (!dest) return null;

  if (dest.destination === 'CRM') return resolveCrmDestination(dest, currentCustomer);

  if (!dest.content) {
    const askLine = dest.destination === 'MY_TASKS' ? '要加入什么待办？' : '要记住什么？';
    return {
      kind: 'capture',
      items: [clarificationItem(dest.destination === 'MY_TASKS' ? 'BUSINESS_TODO' : 'BUSINESS_MEMORY', askLine, text, false)],
    };
  }

  // Pass the ORIGINAL text (trigger phrase included) to the classifier —
  // "提醒我"/"加到我的待办" are already-reliable capture triggers per its own
  // rule 1, so field extraction (dates, customer name) stays accurate even
  // though we override the type it assigns right after.
  const cls = await classifyCapture(text, currentCustomer?.customer_name ?? null);
  const first: RawCaptureIntent = (cls.ok && cls.intents[0]) || emptyRawIntent(dest.content);

  let forced: RawCaptureIntent;
  if (dest.destination === 'MY_TASKS') {
    forced = {
      ...first,
      type: 'BUSINESS_TODO',
      todo_title: dest.content,
      todo_due_at: first.todo_due_at ?? first.next_follow_up_at ?? first.commitment_due_at,
      todo_business_area: first.todo_business_area ?? 'OTHER',
    };
  } else {
    forced = {
      ...first,
      type: 'BUSINESS_MEMORY',
      memory_title: first.memory_title ?? dest.content,
      memory_content: first.memory_content ?? dest.content,
      memory_category: first.memory_category ?? 'other',
    };
  }

  return { kind: 'capture', items: await resolveCaptureItems([forced], currentCustomer) };
}

// ─── Write path — only ever called after Chris's explicit confirm click ────
export async function confirmCaptureItem(item: ResolvedCaptureItem): Promise<{ ok: true } | { ok: false; error: string }> {
  switch (item.type) {
    case 'NEW_CUSTOMER': {
      const { raw } = item;
      if (!raw.customer_name) return { ok: false, error: '客户名称是什么？' };
      const created = await createCustomerWithContact({
        customerName: raw.customer_name,
        contactName: raw.contact_name || undefined,
        phone: raw.contact_phone || undefined,
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
      // Routing-priority fix: naming someone who isn't in CRM yet must
      // never dead-end the capture — fall back to an executive_task so
      // what Chris asked to be tracked is still recorded somewhere, rather
      // than failing with "未找到匹配的客户" after he's already confirmed.
      if (!item.matchedCustomer) {
        if (!item.fallbackToTask) return { ok: false, error: '未找到匹配的客户' };
        const { raw } = item;
        const custName = raw.customer_name || '(未指定)';
        const notesParts = [raw.followup_notes, raw.needs_summary].filter(Boolean);
        const created = await createExecutiveTask({
          title: `${custName} — ${notesParts[0] || raw.next_action || raw.raw_fragment}`.slice(0, 120),
          description: notesParts.join(' · ') || raw.raw_fragment,
          businessArea: 'OTHER',
          dueAt: item.resolvedNextFollowUpAt || null,
        });
        if (!created.ok) return created;
        return { ok: true };
      }
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
      if (!raw.todo_title && !raw.raw_fragment) return { ok: false, error: '要加入什么待办？' };
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
    case 'BUSINESS_MEMORY': {
      const { raw } = item;
      if (!raw.memory_content && !raw.raw_fragment) return { ok: false, error: '要记住什么？' };
      const res = await createBusinessMemory({
        category: raw.memory_category ?? 'other',
        title: raw.memory_title ?? raw.raw_fragment,
        content: raw.memory_content ?? raw.raw_fragment,
        companyName: raw.memory_company ?? null,
        customerId: item.matchedCustomer?.id ?? null,
        rawFragment: raw.raw_fragment,
      });
      if (!res.ok) return res;
      return { ok: true };
    }
    case 'STORE_DOCUMENT': {
      if (!item.fileSource || !item.fileRef) return { ok: false, error: '缺少文件来源信息' };
      const classification = classifyFileDescription(item.fileName ?? item.raw.raw_fragment, item.fileName ?? '');
      if (item.fileSource === 'drive_file') {
        return registerExistingDriveFile(item.fileRef, classification, item.matchedCustomer?.id ?? null);
      }
      if (item.fileSource === 'url') {
        return fetchAndStoreFromUrl(item.fileRef, classification, item.matchedCustomer?.id ?? null);
      }
      return { ok: false, error: '该文件来源暂不支持自动收好' };
    }
    default:
      return { ok: false, error: `不支持的类型: ${item.type}` };
  }
}

// ─── Task 16 §18 — "这个事情完成了" ──────────────────────────────────────────
const COMPLETE_TRIGGER_RE = /(.+?)(?:这个事情|这件事|这个)?(?:完成了|做完了|搞定了)$/u;
const CANCEL_TRIGGER_RE = /(.+?)(?:先)?(?:取消了?|不用做了|不做了)$/u;

export function matchTaskLifecycleCommand(text: string): { keyword: string; action: 'completed' | 'cancelled' } | null {
  // Strip trailing punctuation first — "...完成了。"/"...完成了！" otherwise
  // never matches the `$`-anchored triggers below.
  const t = text.trim().replace(/[。.！!\s]+$/u, '');
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

// GIA Foundation §A.4 — "SHADI这件事下周再提醒我" / "肯尼亚保姆延期到周五" /
// "报价的事改到明天". Distinct from complete/cancel — this only ever
// changes due_at, never status.
const RESCHEDULE_TRIGGER_RES: RegExp[] = [
  /^(.{1,24}?)(?:这件事|这个事情|这个)(.+?)(?:再)?提醒我$/u,
  /^(.{1,24}?)(?:延期|改期|推迟|往后推)到(.+)$/u,
  /^(.{1,24}?)(?:改到|挪到)(.+)$/u,
];

export function matchTaskRescheduleCommand(text: string): { keyword: string; whenPhrase: string } | null {
  const t = text.trim().replace(/[。.！!\s]+$/u, '');
  for (const re of RESCHEDULE_TRIGGER_RES) {
    const m = t.match(re);
    if (m && m[1]?.trim() && m[2]?.trim()) return { keyword: m[1].trim(), whenPhrase: m[2].trim() };
  }
  return null;
}

export async function rescheduleTask(id: string, dueAt: string): Promise<{ ok: true } | { ok: false; error: string }> {
  return updateExecutiveTaskDueDate(id, dueAt);
}
