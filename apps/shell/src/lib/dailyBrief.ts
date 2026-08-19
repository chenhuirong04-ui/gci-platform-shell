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

function systemReviewText(a: BossAction): { fact: string; why: string; suggestion: string } {
  const known = a.related_system ? SYSTEM_REVIEW_TEXT[a.related_system] : undefined;
  if (known) return known;
  const name = a.related_system || '该系统';
  return {
    fact: `「${name}」的资产状态仍待确认。`,
    why: '系统资产状态尚未确认，可能存在维护或权限风险。',
    suggestion: '核实该系统是否仍在使用，并决定保留或归档。',
  };
}

function whyItMatters(a: BossAction): string {
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
    case 'agent_decision': return '需要你决定资产去留';
    case 'agent_warning': return '需要留意是否影响正常运行';
    case 'systems_review': case 'systems_audit': return systemReviewText(a).why;
    default: return a.priority === 'P1' ? '优先级最高，今天需要处理' : '需要关注';
  }
}

function suggestion(a: BossAction): string {
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
    case 'systems_review': case 'systems_audit': return systemReviewText(a).suggestion;
    default: return a.priority === 'P1' ? '今天优先处理' : '按计划推进';
  }
}

// Home Daily Brief §二 — "发生了什么": for systems_review/systems_audit this
// overrides the raw Systems Registry notes with a real Chinese business
// description; every other action_type's summary is already a Chinese,
// business-worded sentence built in actionCenter.ts, so it's used as-is.
function factFor(a: BossAction): { fact: string; rawFact: string | null } {
  if (a.action_type === 'systems_review' || a.action_type === 'systems_audit') {
    const raw = a.summary || a.title;
    return { fact: systemReviewText(a).fact, rawFact: raw };
  }
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

export async function getDailyBrief(): Promise<{ ok: true; brief: DailyBrief } | { ok: false; error: string }> {
  const res = await getBossActions();
  if (!res.ok) return res;

  const filtered = res.actions.filter((a) => !looksLikeGenericNotification(a));

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

    const { fact, rawFact } = factFor(rep);
    deduped.push({
      priority: rep.priority,
      subject: rep.related_customer || rep.title.split(' — ')[0] || rep.title,
      fact,
      rawFact,
      whyItMatters: whyItMatters(rep),
      suggestion: suggestion(rep),
      deepLink: deepLinkFor(rep, key),
      source: rep.source,
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

  const todaysThreeActions = items.slice(0, 3).map((it) => {
    const verb = it.source === 'crm' || it.source === 'business' ? '联系' : it.source === 'email' ? '回复' : it.source === 'decisions' ? '推进' : it.source === 'commitments' ? '兑现' : '处理';
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
