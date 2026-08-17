// GCI Executive Desk — Task 12: Business Assistant context resolver.
// The one thin orchestration layer: given a customer/company name, decide
// which existing data sources to call, call them, and return a single
// aggregated, bounded context — never a full dump of any one source, and
// never a new copy of CRM/Gmail/Drive/Quotation data in a new table.
import { findCustomerByName, type CrmCustomer, type CrmContact, type CrmFollowup } from './crmSupabase';
import { searchGmail, searchDrive, getCalendarEvents, type GmailResult, type DriveResult, type CalendarResult } from './googleSearch';
import { getCommitments, type ExecutiveCommitment } from './commitments';
import { getDecisions, type ExecutiveDecision } from './decisionInbox';
import { getBossActions, type BossAction } from './actionCenter';

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

export interface QuotationSummary {
  total: number;
  totalAmount: number;
  statusSummary: Record<string, number>;
  quotes: any[];
}

export interface BusinessContext {
  queryName: string;
  found: boolean;
  potentialCustomer: boolean; // not in CRM, but Gmail/Drive has real hits
  customer: CrmCustomer | null;
  contacts: CrmContact[];
  followups: CrmFollowup[];
  emails: GmailResult[];
  driveFiles: DriveResult[];
  quotations: QuotationSummary | null;
  commitments: ExecutiveCommitment[];
  decisions: ExecutiveDecision[];
  bossActions: BossAction[];
  upcomingMeeting: CalendarResult | null;
}

function textMatches(haystack: string | null | undefined, name: string): boolean {
  return !!haystack && haystack.toLowerCase().includes(name.toLowerCase());
}

export async function resolveBusinessContext(rawName: string): Promise<BusinessContext> {
  const name = rawName.trim();

  const [custRes, emailRes, driveRes, quoteRes, commitRes, decisionRes, actionsRes, calendarRes] = await Promise.all([
    findCustomerByName(name),
    searchGmail(name),
    searchDrive(name),
    safeFetchJson<any>(`${base()}/api/ai/quotation-history?customer=${encodeURIComponent(name)}`),
    getCommitments(),
    getDecisions(),
    getBossActions(),
    getCalendarEvents('week'),
  ]);

  const found = custRes.ok && custRes.found;
  const customer = found ? (custRes as any).customer : null;
  const contacts = found ? (custRes as any).contacts : [];
  const followups = found ? (custRes as any).followups : [];

  const emails = emailRes.ok ? emailRes.results.slice(0, 8) : [];
  const driveFiles = driveRes.ok ? driveRes.results.slice(0, 8) : [];

  const quotations: QuotationSummary | null =
    quoteRes && quoteRes.ok
      ? { total: quoteRes.total ?? 0, totalAmount: quoteRes.totalAmount ?? 0, statusSummary: quoteRes.statusSummary ?? {}, quotes: (quoteRes.quotes ?? []).slice(0, 10) }
      : null;

  const matchKey = customer?.customer_name || name;
  const commitments = commitRes.ok
    ? commitRes.rows.filter((c) => c.status === 'open' && (textMatches(c.counterparty, matchKey) || textMatches(c.title, matchKey)))
    : [];
  const decisions = decisionRes.ok
    ? decisionRes.rows.filter((d) => (customer && d.related_customer_id === customer.id) || textMatches(d.title, matchKey))
    : [];
  const bossActions = actionsRes.ok
    ? actionsRes.actions.filter((a) => textMatches(a.related_customer, matchKey) || textMatches(a.title, matchKey))
    : [];

  let upcomingMeeting: CalendarResult | null = null;
  if (calendarRes.ok) {
    const contactEmails = contacts.map((c: CrmContact) => (c.email || '').toLowerCase()).filter(Boolean);
    upcomingMeeting =
      calendarRes.results.find(
        (e) => textMatches(e.title, matchKey) || e.attendees.some((a) => contactEmails.includes(a.toLowerCase())),
      ) || null;
  }

  const potentialCustomer = !found && (emails.length > 0 || driveFiles.length > 0);

  return {
    queryName: name,
    found,
    potentialCustomer,
    customer,
    contacts,
    followups,
    emails,
    driveFiles,
    quotations,
    commitments,
    decisions,
    bossActions,
    upcomingMeeting,
  };
}

// ── Business Summary (§3) — facts only, no AI, no hallucination risk.
// The "建议动作" (suggested action) line is generated separately by the AI
// chat route and must always be displayed as a labeled suggestion. ────────
export interface BusinessSummaryFacts {
  stage: string | null;
  lastContact: string | null;
  lastEmail: string | null;
  lastQuoteAmount: number | null;
  lastQuoteCurrency: string | null;
  openCommitments: number;
  nextFollowUp: string | null;
  riskNote: string | null;
  businessCategory: string | null;
}

export function buildBusinessSummaryFacts(ctx: BusinessContext): BusinessSummaryFacts {
  const stage = ctx.customer?.status || null;
  const lastContact = ctx.customer?.last_follow_up_at || null;
  const lastEmail = ctx.emails[0]?.date || null;
  const latestQuote = ctx.quotations?.quotes?.[0] || null;
  const lastQuoteAmount = latestQuote ? latestQuote.grandTotal ?? latestQuote.sellingTotal ?? null : null;
  const lastQuoteCurrency = latestQuote?.currency || null;
  const openCommitments = ctx.commitments.length;
  const nextFollowUp = ctx.customer?.next_follow_up_at || null;

  let riskNote: string | null = null;
  if (latestQuote && latestQuote.status === 'GENERATED') {
    const days = Math.round((Date.now() - new Date(latestQuote.quoteDate || latestQuote.createdAt).getTime()) / 86400000);
    if (days >= 7) riskNote = `报价已发出 ${days} 天未获回复`;
  }
  if (!riskNote && ctx.bossActions.some((a) => a.priority === 'P1')) {
    riskNote = '存在 P1 级待处理事项';
  }

  return {
    stage,
    lastContact,
    lastEmail,
    lastQuoteAmount,
    lastQuoteCurrency,
    openCommitments,
    nextFollowUp,
    riskNote,
    businessCategory: ctx.customer?.business_type || null,
  };
}

// Compact, bounded text block for the AI chat route — never the full raw data.
export function buildContextSummaryForAI(ctx: BusinessContext): string {
  const lines: string[] = [];
  lines.push(`客户/公司: ${ctx.customer?.customer_name || ctx.queryName}`);
  if (ctx.customer) {
    lines.push(`状态: ${ctx.customer.status || '未知'} · 优先级: ${ctx.customer.priority || '未知'} · 负责人: ${ctx.customer.owner || '未知'}`);
    lines.push(`业务类别: ${ctx.customer.business_type || '未分类'}`);
    lines.push(`最近跟进: ${ctx.customer.last_follow_up_at || '无'} · 下次跟进: ${ctx.customer.next_follow_up_at || '未设置'}`);
    if (ctx.customer.next_action) lines.push(`下一步计划: ${ctx.customer.next_action}`);
  } else {
    lines.push('该名称尚未在 CRM 建档。');
  }

  if (ctx.followups.length > 0) {
    lines.push(`\n最近跟进记录:`);
    ctx.followups.slice(0, 3).forEach((f) => lines.push(`- ${f.follow_up_date}: ${f.notes || f.next_action || ''}`));
  }

  if (ctx.emails.length > 0) {
    lines.push(`\n最近邮件 (共 ${ctx.emails.length} 条):`);
    ctx.emails.slice(0, 5).forEach((m) => lines.push(`- ${m.date} | ${m.sender} | ${m.subject}: ${m.snippet}`));
  }

  if (ctx.driveFiles.length > 0) {
    lines.push(`\n相关文件 (共 ${ctx.driveFiles.length} 个):`);
    ctx.driveFiles.slice(0, 5).forEach((f) => lines.push(`- ${f.name} (更新于 ${f.modifiedTime})`));
  }

  if (ctx.quotations && ctx.quotations.quotes.length > 0) {
    lines.push(`\n历史报价 (共 ${ctx.quotations.total} 份, 累计 ${ctx.quotations.totalAmount}):`);
    ctx.quotations.quotes.slice(0, 5).forEach((q) => lines.push(`- ${q.quoteDate || q.createdAt} | ${q.quoteNo} | ${q.grandTotal ?? q.sellingTotal ?? '未知金额'} ${q.currency || ''} | ${q.statusZh || q.status}`));
  }

  if (ctx.commitments.length > 0) {
    lines.push(`\n未完成承诺:`);
    ctx.commitments.forEach((c) => lines.push(`- [${c.commitment_type}] ${c.commitment_text}${c.due_at ? ` (截止 ${c.due_at})` : ''}`));
  }

  if (ctx.decisions.length > 0) {
    lines.push(`\n相关决定:`);
    ctx.decisions.slice(0, 3).forEach((d) => lines.push(`- ${d.title} (${d.status}${d.status === 'decided' ? `: ${d.selected_option}` : ''})`));
  }

  if (ctx.bossActions.length > 0) {
    lines.push(`\n当前待办 (Boss Action Center):`);
    ctx.bossActions.slice(0, 5).forEach((a) => lines.push(`- [${a.priority}] ${a.title}`));
  }

  if (ctx.upcomingMeeting) {
    lines.push(`\n近期会议: ${ctx.upcomingMeeting.title} (${ctx.upcomingMeeting.start})`);
  }

  return lines.join('\n');
}
