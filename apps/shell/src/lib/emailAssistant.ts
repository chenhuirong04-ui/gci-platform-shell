// GCI Executive Desk — Task 11.1: Email Chat Assistant.
// Ties together the read-only Gmail thread fetch, a server-side AI chat
// route, and on-demand customer context (CRM/Commitments/Decisions) — only
// pulled in when a thread is opened, never a bulk dump of company data.
// This module never sends, drafts, archives, or modifies any email; it only
// ever prepares text for Chris to review and send himself.
import { findCustomerByName } from './crmSupabase';
import { getCommitments } from './commitments';
import { getDecisions } from './decisionInbox';
import type { GmailThreadMessage } from './googleSearch';

function base(): string {
  return typeof window !== 'undefined' ? window.location.origin : '';
}

export interface DraftShape {
  to: string;
  subject: string;
  body: string;
  language: string;
  tone: string;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface EmailChatThreadMessage {
  from: string;
  to: string;
  subject: string;
  date: string;
  body: string;
}

export async function sendEmailAssistantChat(input: {
  thread: EmailChatThreadMessage[];
  question: string;
  history: ChatTurn[];
  customerContext: string | null;
  currentDraft: DraftShape | null;
}): Promise<{ ok: true; reply: string; draft: DraftShape | null } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${base()}/api/email-assistant/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
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

// Extracts a display name from a Gmail "From" header, e.g.
// `"Ray Wu" <ray@example.com>` → "Ray Wu", or a bare address → its local part.
export function extractSenderName(fromHeader: string): string {
  const quoted = fromHeader.match(/^"?([^"<]+?)"?\s*<[^>]+>$/);
  if (quoted && quoted[1].trim()) return quoted[1].trim();
  const bareEmail = fromHeader.match(/^([^<>@\s]+)@/);
  if (bareEmail) return bareEmail[1];
  return fromHeader.trim();
}

// On-demand only — called once when a thread is opened, never for every
// row in a list. Builds a short, human-readable summary, never a full dump.
export async function resolveCustomerContext(
  fromHeader: string,
): Promise<{ summary: string | null; customerName: string | null }> {
  const rawName = extractSenderName(fromHeader);
  if (!rawName) return { summary: null, customerName: null };

  const custRes = await findCustomerByName(rawName);
  if (!custRes.ok || !custRes.found) return { summary: null, customerName: null };

  const { customer, followups } = custRes;
  const lines: string[] = [`客户: ${customer.customer_name}`];
  if (customer.status) lines.push(`状态: ${customer.status}`);
  if (customer.priority) lines.push(`优先级: ${customer.priority}`);
  if (customer.next_action) lines.push(`下一步: ${customer.next_action}`);
  if (customer.last_follow_up_at) lines.push(`最近跟进时间: ${customer.last_follow_up_at}`);
  const recentNote = followups?.[0]?.notes || followups?.[0]?.next_action;
  if (recentNote) lines.push(`最近跟进内容: ${recentNote}`);

  const [commitRes, decisionRes] = await Promise.all([getCommitments(), getDecisions()]);
  if (commitRes.ok) {
    const related = commitRes.rows.filter(
      (c) => c.status === 'open' && c.counterparty && c.counterparty.includes(customer.customer_name),
    );
    if (related.length > 0) {
      lines.push(`未完成承诺: ${related.slice(0, 3).map((c) => c.commitment_text).join('; ')}`);
    }
  }
  if (decisionRes.ok) {
    const related = decisionRes.rows.filter(
      (d) => d.related_customer_id === customer.id || d.title.includes(customer.customer_name),
    );
    if (related.length > 0) {
      lines.push(`相关决定: ${related.slice(0, 2).map((d) => `${d.title}(${d.status})`).join('; ')}`);
    }
  }

  return { summary: lines.join('\n'), customerName: customer.customer_name };
}

export function threadMessagesForChat(messages: GmailThreadMessage[]): EmailChatThreadMessage[] {
  return messages.map((m) => ({ from: m.from, to: m.to, subject: m.subject, date: m.date, body: m.body }));
}

// ── Summary-first redesign: one AI call per opened thread (never per list
// row, never a bulk scan) — the 中文摘要/为什么重要/建议下一步 block shown
// above the collapsed original. ──────────────────────────────────────────
export interface EmailSummary {
  summary: string;
  why: string;
  nextStep: string;
  needsChris: boolean;
}

export async function summarizeEmailThread(
  thread: EmailChatThreadMessage[],
): Promise<{ ok: true; data: EmailSummary } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${base()}/api/email-assistant/summarize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ thread }),
    });
    const text = await res.text();
    const data = JSON.parse(text);
    if (!data.ok) return { ok: false, error: data.error || 'summarize failed' };
    return { ok: true, data: { summary: data.summary, why: data.why, nextStep: data.nextStep, needsChris: data.needsChris } };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}

// ── Rule-based category tabs — deterministic, zero AI cost, so a 30-day
// list of dozens of emails never needs a bulk classification call. Mirrors
// the six buckets Chris already uses. Customer match takes priority over
// keyword rules (a supplier-sounding subject from a known customer should
// still land under 客户/业务).
export type EmailCategory = 'gov' | 'bank' | 'customer' | 'platform' | 'contract' | 'supplier' | 'other';

export const EMAIL_CATEGORIES: { key: EmailCategory; label: string }[] = [
  { key: 'gov', label: '政府/合规' },
  { key: 'bank', label: '银行/财务' },
  { key: 'customer', label: '客户/业务' },
  { key: 'platform', label: '平台/系统' },
  { key: 'contract', label: '合同/付款' },
  { key: 'supplier', label: '供应商/员工' },
];

const CATEGORY_KEYWORD_RULES: { cat: EmailCategory; keywords: string[] }[] = [
  { cat: 'gov', keywords: ['.gov', 'gov.ae', 'moec', 'freezone', 'free zone', 'dmcc', 'immigration', 'visa', 'trade license', 'compliance', 'customs'] },
  { cat: 'bank', keywords: ['bank', 'hsbc', 'emirates nbd', 'adcb', 'mashreq', 'rakbank', 'wio', 'statement', 'swift', 'iban', 'account balance'] },
  { cat: 'platform', keywords: ['vercel', 'supabase', 'github', 'notion', 'openai', 'anthropic', 'google workspace', 'no-reply', 'noreply', 'notification', 'deployment'] },
  { cat: 'contract', keywords: ['contract', 'agreement', 'invoice', 'payment', 'purchase order', ' po ', '合同', '付款', '发票', '协议'] },
  { cat: 'supplier', keywords: ['supplier', 'vendor', 'employee', 'payroll', 'hr@', 'staff'] },
];

// ── Today-only triage — one bulk AI call over today's Dubai-date emails
// (metadata + snippet only), never the full 30-day list. ────────────────
export type EmailTier = 'must' | 'important' | 'ignored';

export interface TriageResult {
  id: string;
  tier: EmailTier;
  chineseTitle: string;
  summary: string;
  why: string;
  nextStep: string;
  importantReason: string;
}

export interface TriageInputEmail {
  id: string;
  sender: string;
  subject: string;
  snippet: string;
  date: string;
}

export async function triageEmails(
  emails: TriageInputEmail[],
): Promise<{ ok: true; results: TriageResult[] } | { ok: false; error: string }> {
  if (emails.length === 0) return { ok: true, results: [] };
  try {
    const res = await fetch(`${base()}/api/email-assistant/triage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emails }),
    });
    const text = await res.text();
    const data = JSON.parse(text);
    if (!data.ok) return { ok: false, error: data.error || 'triage failed' };
    return { ok: true, results: data.results as TriageResult[] };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}

// Asia/Dubai (UTC+4) calendar-date helpers — same +4h shift-then-slice
// pattern used across the app (crmSupabase.ts todayISO, businessCapture.ts
// dubaiToday). Only ever used to bucket by calendar day for display, never
// for absolute time-difference math.
export function dubaiDateStr(dateHeader: string): string {
  const d = new Date(dateHeader);
  if (Number.isNaN(d.getTime())) return '';
  return new Date(d.getTime() + 4 * 3600 * 1000).toISOString().slice(0, 10);
}

export function todayDubaiStr(): string {
  return new Date(Date.now() + 4 * 3600 * 1000).toISOString().slice(0, 10);
}

export function yesterdayDubaiStr(): string {
  return new Date(Date.now() + 4 * 3600 * 1000 - 86400000).toISOString().slice(0, 10);
}

export function categorizeEmail(sender: string, subject: string, customerNames: string[]): EmailCategory {
  const text = `${sender} ${subject}`.toLowerCase();
  if (customerNames.some((n) => n.length >= 2 && text.includes(n.toLowerCase()))) return 'customer';
  for (const rule of CATEGORY_KEYWORD_RULES) {
    if (rule.keywords.some((k) => text.includes(k))) return rule.cat;
  }
  return 'other';
}
