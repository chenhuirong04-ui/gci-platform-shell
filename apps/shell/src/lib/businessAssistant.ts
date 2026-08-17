// GCI Executive Desk — Task 12: Business Assistant chat + write actions.
// Follow-up logging and reminders reuse Task 3's exact parser/writer
// (parseLogFollowupCommand / logFollowup) rather than trusting the AI to
// emit structured write data — deterministic parsing for anything that
// touches the database, AI only for conversation/explanation/drafting.
import { parseLogFollowupCommand, parseRelativeDateZh } from '../ai/crmAskGciParsers';
import { logFollowup, type CrmCustomer } from './crmSupabase';

function base(): string {
  return typeof window !== 'undefined' ? window.location.origin : '';
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface WhatsappDraft {
  to: string;
  body: string;
}

export async function sendBusinessAssistantChat(input: {
  contextSummary: string;
  question: string;
  history: ChatTurn[];
}): Promise<{ ok: true; reply: string; whatsappDraft: WhatsappDraft | null } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${base()}/api/business-assistant/chat`, {
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

// "记录一下：刚才和 MAG 沟通，他需要80个工人，下周二再跟。" — parsed via Task 3's
// exact parser (reused by synthesizing the format it expects), shown as a
// confirm card by the caller. Returns null if the message doesn't look like
// a follow-up record request.
export interface FollowupDraft {
  notes: string;
  nextAction: string;
  nextFollowUpAt: string | null;
  method: string | null;
}

const RECORD_TRIGGER_RE = /^记录一下[:：]?\s*(?:刚才)?(?:和|跟)\s*.+?(?:沟通|聊)/u;

export function parseFollowupDraftFromChat(customerName: string, message: string): FollowupDraft | null {
  if (!RECORD_TRIGGER_RE.test(message.trim())) return null;
  const parsed = parseLogFollowupCommand(`记录 ${customerName} 的沟通：${message.replace(RECORD_TRIGGER_RE, '').trim() || message}`);
  if (!parsed.notes) return null;
  return { notes: parsed.notes, nextAction: parsed.nextAction, nextFollowUpAt: parsed.nextFollowUpAt, method: parsed.method };
}

export async function confirmFollowupDraft(
  customerId: string,
  draft: FollowupDraft,
): Promise<{ ok: true; customer: CrmCustomer } | { ok: false; error: string }> {
  const res = await logFollowup({
    customerId,
    notes: draft.notes,
    nextAction: draft.nextAction || undefined,
    nextFollowUpAt: draft.nextFollowUpAt || undefined,
    method: draft.method || undefined,
  });
  if (!res.ok) return res;
  return { ok: true, customer: res.customer };
}

// "下周二提醒我跟 MAG。" — customer-follow-up reminders default to CRM's own
// next_follow_up_at (§6: "客户跟进提醒 → 优先 CRM next_follow_up_at"). Written
// as a lightweight follow-up log entry (reusing the same logFollowup write
// path — no second reminder engine).
export interface ReminderDraft {
  targetDate: string;
  text: string;
}

const REMINDER_TRIGGER_RE = /提醒我(?:跟|联系|跟进)/u;

export function parseReminderDraftFromChat(message: string): ReminderDraft | null {
  const t = message.trim();
  if (!REMINDER_TRIGGER_RE.test(t)) return null;
  const dateStr = parseRelativeDateZh(t);
  if (!dateStr) return null;
  return { targetDate: dateStr, text: t };
}

export async function confirmReminderDraft(
  customerId: string,
  draft: ReminderDraft,
): Promise<{ ok: true; customer: CrmCustomer } | { ok: false; error: string }> {
  const res = await logFollowup({
    customerId,
    notes: draft.text,
    nextFollowUpAt: draft.targetDate,
  });
  if (!res.ok) return res;
  return { ok: true, customer: res.customer };
}
