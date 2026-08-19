// GCI Executive Desk — GIA WhatsApp Intake V1: read-side access for
// Support Inbox display and Ask GIA queries. This file never sends a
// WhatsApp message — writes here are display-only status updates the
// webhook (api/whatsapp/webhook.ts) doesn't already own.
import { supabase } from './supabase';

export type WaClassification = 'general_chat' | 'new_inquiry' | 'support' | 'quotation_contract' | 'payment_subscription' | 'complaint_urgent';

export interface WhatsAppMessageRow {
  id: string;
  message_id: string;
  phone: string;
  contact_name: string | null;
  message_type: string;
  text_content: string;
  media_id: string | null;
  wa_timestamp: string;
  customer_id: string | null;
  classification: WaClassification | null;
  summary_zh: string | null;
  suggested_action: string | null;
  priority: 'P1' | 'P2' | 'P3' | null;
  linked_followup_id: string | null;
  linked_task_id: string | null;
  linked_ticket_id: string | null;
  created_at: string;
  crm_customers: { customer_name: string } | null;
}

export async function getWhatsAppMessages(limit = 50): Promise<
  { ok: true; rows: WhatsAppMessageRow[] } | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from('whatsapp_messages')
    .select('*, crm_customers(customer_name)')
    .order('wa_timestamp', { ascending: false })
    .limit(limit);
  if (error) return { ok: false, error: error.message };
  return { ok: true, rows: (data ?? []) as unknown as WhatsAppMessageRow[] };
}

export async function getWhatsAppMessagesForCustomer(customerId: string, limit = 20): Promise<
  { ok: true; rows: WhatsAppMessageRow[] } | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from('whatsapp_messages')
    .select('*, crm_customers(customer_name)')
    .eq('customer_id', customerId)
    .order('wa_timestamp', { ascending: false })
    .limit(limit);
  if (error) return { ok: false, error: error.message };
  return { ok: true, rows: (data ?? []) as unknown as WhatsAppMessageRow[] };
}

function dubaiDateStr(ms: number): string {
  return new Date(ms + 4 * 3600 * 1000).toISOString().slice(0, 10);
}

export function isSameDubaiDay(iso: string, nowMs: number): boolean {
  return dubaiDateStr(new Date(iso).getTime()) === dubaiDateStr(nowMs);
}

export const CLASSIFICATION_LABEL: Record<WaClassification, string> = {
  general_chat: '普通沟通',
  new_inquiry: '新客户询盘',
  support: '客服问题',
  quotation_contract: '报价/合同',
  payment_subscription: '付款/订阅',
  complaint_urgent: '投诉/紧急',
};

// ── Ask GIA — "今天 WhatsApp 有什么要处理？" / "SHADI 最近 WhatsApp 说了什么？" /
// "有哪些 WhatsApp 客户还没回复？". Rule-based trigger + real-data formatting,
// same narrow-consumption pattern as the other Ask GIA query handlers
// (giaFiles/businessMemory/chanya) — only fires on a recognized WhatsApp
// question, never hijacks unrelated chat, and only ever reads real rows
// already captured by the webhook. ───────────────────────────────────────
const WA_TODAY_RE = /(今天|今日).{0,6}whatsapp.{0,10}(要|需要).{0,6}处理/i;
const WA_CUSTOMER_RE = /(.{1,24}?)\s*(最近|近期)?\s*whatsapp\s*(上)?\s*说了什么/i;
const WA_UNREPLIED_RE = /whatsapp.{0,10}(客户|联系人).{0,6}(还没|未).{0,4}回复/i;

export type WaQueryKind = 'today' | 'customer' | 'unreplied' | null;

export function matchWhatsAppQuery(text: string): { kind: WaQueryKind; customerName?: string } {
  const customerMatch = text.match(WA_CUSTOMER_RE);
  if (customerMatch && customerMatch[1]?.trim()) return { kind: 'customer', customerName: customerMatch[1].trim() };
  if (WA_TODAY_RE.test(text)) return { kind: 'today' };
  if (WA_UNREPLIED_RE.test(text)) return { kind: 'unreplied' };
  return { kind: null };
}

function formatRow(r: WhatsAppMessageRow): string {
  const who = r.crm_customers?.customer_name || r.contact_name || `+${r.phone}`;
  const cls = r.classification ? CLASSIFICATION_LABEL[r.classification] : '未分类';
  return `【${who}】${r.summary_zh || r.text_content}（${cls}${r.priority ? ` · ${r.priority}` : ''}）`;
}

export async function answerWhatsAppQuery(kind: WaQueryKind, customerName?: string): Promise<string> {
  const res = await getWhatsAppMessages(200);
  if (!res.ok) return `读取 WhatsApp 消息失败：${res.error}`;

  if (kind === 'today') {
    const now = Date.now();
    const todays = res.rows.filter((r) => isSameDubaiDay(r.wa_timestamp, now));
    if (todays.length === 0) return '今天暂无需要处理的 WhatsApp 消息。';
    return `今天 WhatsApp 共 ${todays.length} 条：\n${todays.map(formatRow).join('\n')}`;
  }

  if (kind === 'customer' && customerName) {
    const kw = customerName.toLowerCase();
    const matches = res.rows.filter((r) =>
      (r.crm_customers?.customer_name || '').toLowerCase().includes(kw) ||
      (r.contact_name || '').toLowerCase().includes(kw),
    );
    if (matches.length === 0) return `没有找到「${customerName}」的 WhatsApp 记录。`;
    return `「${customerName}」最近的 WhatsApp 消息：\n${matches.slice(0, 5).map(formatRow).join('\n')}`;
  }

  if (kind === 'unreplied') {
    // "还没回复" = no drafted/sent reply on file yet — V1 doesn't persist
    // draft state, so this honestly reports every inbound message that
    // hasn't been marked resolved via its linked ticket/followup/task,
    // rather than guessing at a reply status that isn't tracked.
    const openOnes = res.rows.filter((r) => r.linked_ticket_id || r.linked_followup_id || r.linked_task_id);
    if (openOnes.length === 0) return '暂无待跟进的 WhatsApp 客户。';
    return `以下 WhatsApp 联系人有记录在案、可能仍待跟进：\n${openOnes.slice(0, 10).map(formatRow).join('\n')}`;
  }

  return '暂无法识别这个 WhatsApp 问题。';
}
