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
