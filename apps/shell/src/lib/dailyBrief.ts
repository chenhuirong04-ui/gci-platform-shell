// GCI Executive Desk — Task 15: Daily Business Brief + Unified Follow-up.
// This is a thin resolver on top of the already-aggregated, already-deduped
// (decision-vs-commitment) getBossActions() list from Task 7/9/10/14.1 — it
// does NOT re-fetch CRM/Commitments/Decisions/Calendar/MIA itself and never
// copies their data into a new store. It only: filters out generic
// notification email, groups the remaining actions by the real business
// problem they represent (so the same issue never shows twice), sorts, and
// slices into the three views Home/Ask GCI need. Read-only — no function
// here writes anything, anywhere.
import { getBossActions, SOURCE_LABEL, type BossAction, type ActionSource, type ActionPriority } from './actionCenter';

export interface BriefItem {
  priority: ActionPriority;
  subject: string; // 客户 / 项目 / 事项
  fact: string;
  whyItMatters: string;
  suggestion: string;
  deepLink: string;
  source: ActionSource;
  // Kept alongside `source` specifically so todaysThreeActions' verb choice
  // can tell apart the different action_types the 'business' source bucket
  // bundles together (quotation_followup/invoice_review/inventory_alert) —
  // 'source' alone was the bug: it collapsed all three into one "Contact"
  // verb, which made no sense for an inventory alert.
  actionType: string;
  dueAt: string | null;
  // Home Daily Brief §六 — when `fact` is a translated/rewritten version of
  // raw technical text (currently: Systems Registry notes, often in
  // English), the untouched original is kept here so the UI can offer
  // "查看原始信息" without ever putting raw English in the primary line.
  // null when `fact` already IS the raw source text (nothing to hide).
  rawFact: string | null;
}

export interface ContactItem {
  subject: string;
  reason: string;
  dueAt: string | null;
  priority: ActionPriority;
  deepLink: string;
}

export interface DailyBrief {
  items: BriefItem[]; // max 5, the Home Brief
  todaysThreeActions: string[]; // max 3
  contactList: ContactItem[]; // "今天必须联系谁" — not capped at 5, it's a distinct view
  allDeduped: BriefItem[]; // full deduped pool (pre-slice-to-5), for Ask GCI "今天还有什么没处理"
}

// Task 15 §一.4 — the important-emails query (is:unread newer_than:7d
// -promotions -social) has no customer-relevance signal at all (see its own
// comment in api/google/important-emails.ts), so generic notification/
// transactional senders leak through. This is an explainable exclusion
// list, not a claim of perfect detection — it only keeps the Brief from
// treating a Vercel deploy-failure or a bank KYC auto-reminder as a boss
// event. The full unfiltered list is still visible on /actions.
const JUNK_SENDER_PATTERNS: RegExp[] = [
  /no-?reply@/i,
  /donotreply@/i,
  /notifications@vercel\.com/i,
  /@interactivebrokers\.com/i,
  /@zoom\.us/i,
  /@accounts\.google\.com/i,
  /@tax\.gov\.ae/i,
  /@amazon\.com/i,
  /@network\.ae/i,
  /@adib\.com/i, // bank KYC/ops threads — internal admin, not a customer
  /^chenhuirong04/i, // Chris's own inbox self-digest alias
  /@globalcareinfo\.com/i, // internal/self correspondence, not a customer
];

function looksLikeGenericNotification(a: BossAction): boolean {
  if (a.source !== 'email') return false;
  const sender = a.title.split(' — ')[0] ?? '';
  return JUNK_SENDER_PATTERNS.some((re) => re.test(sender));
}

// Lower number = stronger claim to being "the" representative of a
// deduped group — Task 15 §二's priority order: the real business record
// first (CRM/quotation), then Commitment, then Decision Follow-through,
// then everything else (generic Agents/Systems/Calendar/Email/MIA).
const REPRESENTATION_RANK: Record<ActionSource, number> = {
  crm: 0,
  business: 1,
  commitments: 2,
  decisions: 3,
  mia: 4,
  chanya: 4,
  support: 4,
  calendar: 5,
  email: 6,
  agents: 7,
  systems: 8,
};

const PRIORITY_RANK: Record<ActionPriority, number> = { P1: 0, P2: 1, P3: 2 };

// Most titles in this codebase follow "{CustomerOrSubject} — {detail}"
// (CRM/quotation/decision/commitment all do). related_customer is only
// populated on CRM/quotation items — Decision/Commitment leave it null even
// when the title clearly names the same customer — so the title prefix is
// the only reliable shared key across sources for grouping "same real
// problem, different system's view of it".
function businessKey(a: BossAction): string {
  const name = a.related_customer?.trim();
  if (name) return name.toLowerCase();
  const m = a.title.match(/^([^—]+?)\s*—/);
  if (m) return m[1].trim().toLowerCase();
  return `__standalone__${a.id}`;
}

// Home Daily Brief §三 — Systems Registry `notes` is free text Chris/an
// engineer typed when the system was registered, often in English
// technical shorthand ("Uses growth_* tables..."). This is the only place
// in the Brief where raw untranslated text was leaking through to "发生了
// 什么". Known review-status systems get a specific, real-business-meaning
// translation; anything else gets an honest generic Chinese line instead of
// its raw notes — the raw notes are never dropped, just moved to rawFact
// for a "查看原始信息" toggle instead of the headline.
export type BriefLang = 'zh' | 'en';

const SYSTEM_REVIEW_TEXT: Record<string, { fact: string; why: string; suggestion: string }> = {
  'Chanya Growth Agent': {
    fact: 'Growth Agent 当前仍在使用 Chanya 共用数据库中的 growth_* 表。',
    why: '系统边界还没有完全确认，后续维护和权限可能混在一起。',
    suggestion: '确认是否继续共用数据库，或计划独立。',
  },
  'MIA / GCI AI Sales Agent': {
    fact: 'MIA 的 Production 环境仍需账号密码登录，对应的 Supabase 项目也还没有确认。',
    why: '目前无法直接核实 MIA 的真实运行状态，可能影响后续对接和数据核对。',
    suggestion: '确认登录方式，并核实对应的 Supabase 项目归属。',
  },
};

const SYSTEM_REVIEW_TEXT_EN: Record<string, { fact: string; why: string; suggestion: string }> = {
  'Chanya Growth Agent': {
    fact: 'Growth Agent still uses the growth_* tables in Chanya\'s shared database.',
    why: 'The system boundary isn\'t fully settled yet, so maintenance and access could get tangled.',
    suggestion: 'Decide whether to keep sharing the database or plan a separation.',
  },
  'MIA / GCI AI Sales Agent': {
    fact: 'MIA\'s production environment still needs a username/password login, and its Supabase project ownership is unconfirmed.',
    why: 'MIA\'s real operating status can\'t be verified directly, which may affect future integration and data checks.',
    suggestion: 'Confirm the login method and verify which Supabase project it belongs to.',
  },
};

// Display-only i18n (Chris request): dynamic Daily Brief text now has a
// zh AND an en variant, built from the same structured BossAction fields
// (action_type/priority/related_system) as the zh version already used —
// no change to actionCenter.ts, its data, priority, or sort logic; this
// only adds an alternate rendering of the same facts.
function systemReviewText(a: BossAction, lang: BriefLang): { fact: string; why: string; suggestion: string } {
  const table = lang === 'zh' ? SYSTEM_REVIEW_TEXT : SYSTEM_REVIEW_TEXT_EN;
  const known = a.related_system ? table[a.related_system] : undefined;
  if (known) return known;
  const name = a.related_system || (lang === 'zh' ? '该系统' : 'this system');
  return lang === 'zh'
    ? {
        fact: `「${name}」的资产状态仍待确认。`,
        why: '系统资产状态尚未确认，可能存在维护或权限风险。',
        suggestion: '核实该系统是否仍在使用，并决定保留或归档。',
      }
    : {
        fact: `The asset status of "${name}" is still unconfirmed.`,
        why: 'An unconfirmed system asset status may carry maintenance or access risk.',
        suggestion: 'Verify whether this system is still in use, then decide to keep or archive it.',
      };
}

function whyItMatters(a: BossAction, lang: BriefLang): string {
  if (lang === 'en') {
    switch (a.action_type) {
      case 'quotation_followup': return 'The project has stalled for a long time and may be lost.';
      case 'crm_followup': return 'Customer follow-up is overdue, affecting the relationship.';
      case 'crm_decision': return 'Needs your judgment before it can move forward.';
      case 'decision_execution': return 'A decision was made but not yet executed.';
      case 'decision_follow_up': return 'The agreed review date has arrived.';
      case 'commitment': return 'A commitment you or the other side made — being overdue hurts trust.';
      case 'mia_error': return 'MIA may have stopped developing new customers normally.';
      case 'mia_needs_chris': return 'A real reply came in — only you can judge how to respond.';
      case 'mia_warning': return 'MIA shows an anomaly — watch whether it affects tomorrow\'s output.';
      case 'chanya_error': return 'Chanya is in an abnormal state, which may affect customer use.';
      case 'chanya_payment_failure': return 'A payment failure could interrupt the customer\'s subscription.';
      case 'chanya_needs_chris': return 'An account/subscription issue only you can decide how to handle.';
      case 'calendar_meeting': return 'The meeting is about to start.';
      case 'inventory_alert': return 'May affect delivery or cash flow.';
      case 'invoice_review': return 'An invoice is stuck in approval, slowing down collections.';
      case 'receivables_overdue': return 'Overdue receivables may affect cash flow — worth confirming payment status.';
      case 'receivables_due_soon': return 'A reminder before it becomes overdue.';
      case 'contract_revision_requested': return 'The commercial terms are still unresolved — the deal hasn\'t closed yet.';
      case 'contract_pending_signature': return 'An unsigned contract for too long may delay revenue recognition and service start.';
      case 'contract_quote_expired': return 'An expired quote with the business still open needs a decision on how to proceed.';
      case 'agent_decision': return 'Needs your decision on whether to keep this asset.';
      case 'agent_warning': return 'Watch whether this affects normal operation.';
      case 'systems_review': case 'systems_audit': return systemReviewText(a, lang).why;
      default: return a.priority === 'P1' ? 'Highest priority — needs handling today.' : 'Needs attention.';
    }
  }
  switch (a.action_type) {
    case 'quotation_followup': return '项目长期停滞，可能流失';
    case 'crm_followup': return '客户跟进逾期，影响关系';
    case 'crm_decision': return '需要你做判断才能继续推进';
    case 'decision_execution': return '决策已做出但尚未执行';
    case 'decision_follow_up': return '到了约定的复查时间';
    case 'commitment': return '这是你或对方给出的承诺，逾期影响信任';
    case 'mia_error': return 'MIA 可能已停止正常开发新客户';
    case 'mia_needs_chris': return '有真实回复，只有你能判断如何回应';
    case 'mia_warning': return 'MIA 出现异常，需要留意是否影响明天的产出';
    case 'chanya_error': return 'Chanya 系统状态异常，可能影响客户正常使用';
    case 'chanya_payment_failure': return '支付失败可能导致客户订阅中断';
    case 'chanya_needs_chris': return '有账户/订阅类问题只有你能判断如何处理';
    case 'calendar_meeting': return '会议即将开始';
    case 'inventory_alert': return '可能影响交付或现金流';
    case 'invoice_review': return '发票卡在审批，影响回款节奏';
    case 'receivables_overdue': return '逾期应收可能影响现金流，应优先确认客户付款状态';
    case 'receivables_due_soon': return '提前提醒，避免变成逾期';
    case 'contract_revision_requested': return '商务条件仍未闭环，业务尚未成交';
    case 'contract_pending_signature': return '合同长期未闭环可能影响收入确认和后续服务启动';
    case 'contract_quote_expired': return '报价已过期但业务仍未关闭，需要决定如何处理';
    case 'agent_decision': return '需要你决定资产去留';
    case 'agent_warning': return '需要留意是否影响正常运行';
    case 'systems_review': case 'systems_audit': return systemReviewText(a, lang).why;
    default: return a.priority === 'P1' ? '优先级最高，今天需要处理' : '需要关注';
  }
}

function suggestion(a: BossAction, lang: BriefLang): string {
  if (lang === 'en') {
    switch (a.action_type) {
      case 'quotation_followup': return 'Confirm today whether the project continues.';
      case 'crm_followup': return 'Contact them today to confirm next steps.';
      case 'crm_decision': return 'Make the decision today.';
      case 'decision_execution': return 'Push execution forward or update progress.';
      case 'decision_follow_up': return 'Review the current status.';
      case 'commitment': return 'Deliver on it today or update progress.';
      case 'mia_error': return 'Check MIA\'s running status.';
      case 'mia_needs_chris': return 'Reply to or judge this lead today.';
      case 'mia_warning': return 'Keep an eye on MIA\'s subsequent runs.';
      case 'chanya_error': return 'Check Chanya\'s running status.';
      case 'chanya_payment_failure': return 'Verify the payment failure reason today.';
      case 'chanya_needs_chris': return 'Review and handle this issue today.';
      case 'calendar_meeting': return 'Confirm materials/prep ahead of time.';
      case 'inventory_alert': return 'Arrange restocking or verify today.';
      case 'invoice_review': return 'Approve or return it today.';
      case 'receivables_overdue': return 'Follow up first with the customer overdue longest or owing the most.';
      case 'receivables_due_soon': return 'Confirm payment status before it becomes overdue.';
      case 'contract_revision_requested': return 'Follow up on the requested revisions to move the deal forward.';
      case 'contract_pending_signature': return 'Contact these customers today to confirm signing progress.';
      case 'contract_quote_expired': return 'Decide today whether to renew the quote or close it out.';
      case 'systems_review': case 'systems_audit': return systemReviewText(a, lang).suggestion;
      default: return a.priority === 'P1' ? 'Handle this first today.' : 'Proceed as planned.';
    }
  }
  switch (a.action_type) {
    case 'quotation_followup': return '今天确认项目是否继续';
    case 'crm_followup': return '今天联系确认下一步';
    case 'crm_decision': return '今天做出决定';
    case 'decision_execution': return '推进执行或更新进度';
    case 'decision_follow_up': return '复查当前状态';
    case 'commitment': return '今天兑现或更新进度';
    case 'mia_error': return '检查 MIA 运行状态';
    case 'mia_needs_chris': return '今天回复或判断这条线索';
    case 'mia_warning': return '留意 MIA 后续运行情况';
    case 'chanya_error': return '检查 Chanya 运行状态';
    case 'chanya_payment_failure': return '今天核实支付失败原因';
    case 'chanya_needs_chris': return '今天查看并处理这条问题';
    case 'calendar_meeting': return '提前确认材料/是否需要准备';
    case 'inventory_alert': return '今天安排补货或核实';
    case 'invoice_review': return '今天审批或退回';
    case 'receivables_overdue': return '优先跟进逾期时间最长或未收金额最高的客户';
    case 'receivables_due_soon': return '提前确认客户付款状态';
    case 'contract_revision_requested': return '跟进对方要求的修改，推进成交';
    case 'contract_pending_signature': return '今天联系这些客户，确认签署进度';
    case 'contract_quote_expired': return '今天决定是否重新报价或结束跟进';
    case 'systems_review': case 'systems_audit': return systemReviewText(a, lang).suggestion;
    default: return a.priority === 'P1' ? '今天优先处理' : '按计划推进';
  }
}

// Home Daily Brief §二 — "发生了什么"/"What happened": for systems_review/
// systems_audit this overrides the raw Systems Registry notes with a real
// business description in the requested language; every other action_type's
// `summary` is built in actionCenter.ts and is Chinese-only there (that file
// is out of scope for this fix), so in English mode this falls back to the
// raw `a.title` rather than mixing a Chinese sentence into an English card —
// titles are typically "{Customer} — {short tag}" and read acceptably in
// either language.
function factFor(a: BossAction, lang: BriefLang): { fact: string; rawFact: string | null } {
  if (a.action_type === 'systems_review' || a.action_type === 'systems_audit') {
    const raw = a.summary || a.title;
    return { fact: systemReviewText(a, lang).fact, rawFact: raw };
  }
  // receivables_overdue/receivables_due_soon and the 3 contract-status
  // types (contract_revision_requested/contract_pending_signature/
  // contract_quote_expired) all carry real, per-request numbers/customer
  // names baked into title/summary — a.title alone (the Chinese default
  // every other action_type falls back to in English mode) would leak
  // Chinese here, so these use their own English fields.
  const EN_TEXT_ACTION_TYPES = new Set([
    'receivables_overdue', 'receivables_due_soon',
    'contract_revision_requested', 'contract_pending_signature', 'contract_quote_expired',
  ]);
  if (lang === 'en' && EN_TEXT_ACTION_TYPES.has(a.action_type)) {
    return { fact: a.enSummary || a.enTitle || a.title, rawFact: null };
  }
  if (lang === 'en') return { fact: a.title, rawFact: null };
  return { fact: a.summary || a.title, rawFact: null };
}

function deepLinkFor(a: BossAction, key: string): string {
  const isCustomerKey = a.related_customer || !key.startsWith('__standalone__');
  if (isCustomerKey && (a.source === 'crm' || a.source === 'business')) {
    return `/business-assistant?customer=${encodeURIComponent(a.related_customer || key)}`;
  }
  if (a.source === 'decisions') return '/decisions';
  if (a.source === 'commitments') return '/commitments';
  if (a.source === 'email') return '/email-assistant';
  if (a.source === 'mia') return a.deep_link && a.deep_link.startsWith('http') ? a.deep_link : '/actions?filter=mia';
  return a.deep_link || '/actions';
}

// "今天必须联系谁" only includes sources that genuinely mean "pick up the
// phone / reply to this person" — never a plain systems/agents/inventory
// item, per Task 15 §七.
const CONTACT_ACTION_TYPES = new Set([
  'crm_followup', 'quotation_followup', 'email_review', 'commitment', 'mia_needs_chris',
]);

export async function getDailyBrief(lang: BriefLang = 'zh'): Promise<{ ok: true; brief: DailyBrief } | { ok: false; error: string }> {
  const res = await getBossActions();
  if (!res.ok) return res;

  // Business Brief = boss's business radar, not a second to-do list.
  // source === 'tasks' (executive_tasks, e.g. "8/24 跟进 SHADI") already has
  // a name/what/date/status and lives on /tasks + the Home "我的事项" KPI
  // (both read executive_tasks directly, untouched by this filter) — showing
  // it again here as a full Brief card was the actual duplication. Excluded
  // at the source, not swapped for a "3 tasks today" count card: Home's
  // "我的事项" KPI already owns that reminder job.
  const filtered = res.actions.filter((a) => !looksLikeGenericNotification(a) && a.source !== 'tasks');

  const groups = new Map<string, BossAction[]>();
  for (const a of filtered) {
    const key = businessKey(a);
    const arr = groups.get(key) ?? [];
    arr.push(a);
    groups.set(key, arr);
  }

  const deduped: BriefItem[] = [];
  for (const [key, group] of groups) {
    const rep = [...group].sort((a, b) => {
      const pr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      if (pr !== 0) return pr;
      const rr = REPRESENTATION_RANK[a.source] - REPRESENTATION_RANK[b.source];
      if (rr !== 0) return rr;
      if (a.due_at && b.due_at) return a.due_at.localeCompare(b.due_at);
      return 0;
    })[0];

    const { fact, rawFact } = factFor(rep, lang);
    // Same reasoning as factFor above: an aggregate item (no related_customer)
    // would otherwise show its raw Chinese title as the subject/headline even
    // in English mode. Only receivables_overdue/receivables_due_soon set
    // enTitle, so every other action_type's subject is unaffected.
    const subjectTitle = lang === 'en' && rep.enTitle ? rep.enTitle : rep.title;
    deduped.push({
      priority: rep.priority,
      subject: rep.related_customer || subjectTitle.split(' — ')[0] || subjectTitle,
      fact,
      rawFact,
      whyItMatters: whyItMatters(rep, lang),
      suggestion: suggestion(rep, lang),
      deepLink: deepLinkFor(rep, key),
      source: rep.source,
      actionType: rep.action_type,
      dueAt: rep.due_at,
    });
  }

  deduped.sort((a, b) => {
    const pr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (pr !== 0) return pr;
    if (a.dueAt && b.dueAt) return a.dueAt.localeCompare(b.dueAt);
    if (a.dueAt) return -1;
    if (b.dueAt) return 1;
    return 0;
  });

  // Same precedent as Task 13's Home Top-3: even after the junk-sender
  // filter above, "important" email (unread + last 7d, no bulk category)
  // still has no real customer-relevance signal — a cold-outreach pitch or
  // an internal thread with an unusual sender can slip through. Rather than
  // risk the boss's headline 5 items being 80% email noise, 'email' is kept
  // out of the Home Brief specifically; it's still fully visible via the
  // "重要客户邮件" KPI, the dedicated Ask GCI "今天有哪些邮件需要我处理" mode, and
  // Today Contact List (Task 15 §七 explicitly wants "customer email needs
  // reply" there).
  const items = deduped.filter((it) => it.source !== 'email').slice(0, 5);

  // Bug fix: verb choice was keyed purely on `source`, and 'business' bundles
  // three unrelated action_types (quotation_followup/invoice_review/
  // inventory_alert) under one bucket — every one of them got "联系"/"Contact"
  // regardless, which made no sense for e.g. an inventory alert ("联系8项库存
  // 异常"/"Contact 8 inventory alerts"). action_type is checked FIRST for the
  // 3 business sub-types; everything else falls through to the original
  // source-based mapping, unchanged.
  const todaysThreeActions = items.slice(0, 3).map((it) => {
    if (lang === 'en') {
      let verb: string;
      if (it.actionType === 'inventory_alert') verb = 'Review';
      else if (it.actionType === 'invoice_review') verb = 'Review';
      else if (it.actionType === 'quotation_followup') verb = 'Follow up on';
      else if (it.source === 'crm' || it.source === 'business') verb = 'Contact';
      else if (it.source === 'email') verb = 'Reply to';
      else if (it.source === 'decisions') verb = 'Progress';
      else if (it.source === 'commitments') verb = 'Deliver on';
      else verb = 'Handle';
      return `${verb} ${it.subject}`;
    }
    let verb: string;
    if (it.actionType === 'inventory_alert') verb = '核查';
    else if (it.actionType === 'invoice_review') verb = '审核';
    else if (it.actionType === 'quotation_followup') verb = '跟进';
    else if (it.source === 'crm' || it.source === 'business') verb = '联系';
    else if (it.source === 'email') verb = '回复';
    else if (it.source === 'decisions') verb = '推进';
    else if (it.source === 'commitments') verb = '兑现';
    else verb = '处理';
    return `${verb}${it.subject}`;
  });

  const contactList: ContactItem[] = [];
  for (const [, group] of groups) {
    const contactCandidates = group.filter((a) => CONTACT_ACTION_TYPES.has(a.action_type));
    if (contactCandidates.length === 0) continue;
    const rep = contactCandidates.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority])[0];
    contactList.push({
      subject: rep.related_customer || rep.title.split(' — ')[0] || rep.title,
      reason: rep.summary || rep.title,
      dueAt: rep.due_at,
      priority: rep.priority,
      deepLink: deepLinkFor(rep, businessKey(rep)),
    });
  }
  contactList.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);

  return {
    ok: true,
    brief: { items, todaysThreeActions, contactList, allDeduped: deduped },
  };
}

export { SOURCE_LABEL };
