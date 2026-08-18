// GCI Executive Desk — Task 18.2: GIA Support Inbox.
// Reads/writes support_tickets directly via the authenticated Supabase
// client (RLS: authenticated-only, no anon access). Classification and
// draft generation go through the server-side AI endpoints — this module
// never calls OpenAI/Chanya directly. No auto-send anywhere: creating/
// updating a ticket only ever touches this one table.
import { supabase } from './supabase';

export type SupportChannel = 'email' | 'whatsapp';
export type SupportProduct = 'CHANYA' | '25H_AI' | 'TRADE' | 'WORKFORCE' | 'ECOMMERCE' | 'GCI' | 'OTHER';
export type SupportIssueType = 'PAYMENT' | 'SUBSCRIPTION' | 'LOGIN' | 'INVITE' | 'MINUTES_USAGE' | 'BILLING' | 'TECHNICAL' | 'ACCOUNT' | 'GENERAL' | 'OTHER';
export type SupportPriority = 'P1' | 'P2' | 'P3';
export type SupportStatus = 'open' | 'in_progress' | 'resolved';

export interface SupportTicket {
  id: string;
  channel: SupportChannel;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  product: SupportProduct;
  issue_type: SupportIssueType;
  priority: SupportPriority;
  raw_content: string;
  summary_zh: string | null;
  why_important: string | null;
  system_status_context: string | null;
  suggested_action: string | null;
  needs_chris: boolean;
  status: SupportStatus;
  source_thread_id: string | null;
  source_message_id: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

function base(): string {
  return typeof window !== 'undefined' ? window.location.origin : '';
}

// ── Classification (AI, read-only, no ticket write) ─────────────────────
export interface TicketClassification {
  product: SupportProduct;
  issue_type: SupportIssueType;
  priority: SupportPriority;
  summary_zh: string;
  why_important: string;
  suggested_action: string;
  needs_chris: boolean;
  system_status_context: string | null;
}

export async function classifySupportMessage(
  rawContent: string,
  hintedProduct?: string,
  customerName?: string,
): Promise<{ ok: true; data: TicketClassification } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${base()}/api/support/classify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawContent, hintedProduct, customerName }),
    });
    const data = await res.json();
    if (!data.ok) return { ok: false, error: data.error || 'classify failed' };
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}

// ── Draft reply (AI, never sends) ────────────────────────────────────────
export interface TicketDraft {
  channel: SupportChannel;
  subject: string;
  body: string;
}

export async function draftTicketReply(input: {
  channel: SupportChannel;
  rawContent: string;
  summaryZh?: string | null;
  suggestedAction?: string | null;
  systemStatusContext?: string | null;
  customerName?: string | null;
}): Promise<{ ok: true; data: TicketDraft } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${base()}/api/support/draft-reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const data = await res.json();
    if (!data.ok) return { ok: false, error: data.error || 'draft failed' };
    return { ok: true, data: { channel: data.channel, subject: data.subject, body: data.body } };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}

// ── Supabase CRUD ─────────────────────────────────────────────────────────
export async function createTicket(input: {
  channel: SupportChannel;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  rawContent: string;
  classification: TicketClassification;
  sourceThreadId?: string | null;
  sourceMessageId?: string | null;
}): Promise<{ ok: true; ticket: SupportTicket } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from('support_tickets')
    .insert({
      channel: input.channel,
      customer_name: input.customerName || null,
      customer_email: input.customerEmail || null,
      customer_phone: input.customerPhone || null,
      product: input.classification.product,
      issue_type: input.classification.issue_type,
      priority: input.classification.priority,
      raw_content: input.rawContent,
      summary_zh: input.classification.summary_zh,
      why_important: input.classification.why_important,
      system_status_context: input.classification.system_status_context,
      suggested_action: input.classification.suggested_action,
      needs_chris: input.classification.needs_chris,
      source_thread_id: input.sourceThreadId || null,
      source_message_id: input.sourceMessageId || null,
    })
    .select()
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, ticket: data as SupportTicket };
}

export async function listTickets(filter: { status?: SupportStatus; needsChris?: boolean } = {}): Promise<
  { ok: true; rows: SupportTicket[] } | { ok: false; error: string }
> {
  let query = supabase.from('support_tickets').select('*').order('created_at', { ascending: false }).limit(200);
  if (filter.status) query = query.eq('status', filter.status);
  if (filter.needsChris !== undefined) query = query.eq('needs_chris', filter.needsChris);
  const { data, error } = await query;
  if (error) return { ok: false, error: error.message };
  return { ok: true, rows: (data ?? []) as SupportTicket[] };
}

export async function updateTicketStatus(
  id: string,
  status: SupportStatus,
): Promise<{ ok: true; ticket: SupportTicket } | { ok: false; error: string }> {
  const updatePayload: Record<string, any> = { status, updated_at: new Date().toISOString() };
  if (status === 'resolved') updatePayload.resolved_at = new Date().toISOString();
  const { data, error } = await supabase.from('support_tickets').update(updatePayload).eq('id', id).select().single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, ticket: data as SupportTicket };
}

// Boss Action Center linkage (Task 18.2 §9) — P1, needs_chris, or long-
// unprocessed only. Never counts routine open tickets as noise.
export async function getUrgentTicketCounts(): Promise<
  { ok: true; p1Open: number; needsChris: number; staleOpen: number } | { ok: false; error: string }
> {
  const staleThreshold = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const [p1Res, needsChrisRes, staleRes] = await Promise.all([
    supabase.from('support_tickets').select('id', { count: 'exact', head: true }).eq('priority', 'P1').neq('status', 'resolved'),
    supabase.from('support_tickets').select('id', { count: 'exact', head: true }).eq('needs_chris', true).neq('status', 'resolved'),
    supabase.from('support_tickets').select('id', { count: 'exact', head: true }).eq('status', 'open').lt('created_at', staleThreshold),
  ]);
  if (p1Res.error) return { ok: false, error: p1Res.error.message };
  if (needsChrisRes.error) return { ok: false, error: needsChrisRes.error.message };
  if (staleRes.error) return { ok: false, error: staleRes.error.message };
  return { ok: true, p1Open: p1Res.count ?? 0, needsChris: needsChrisRes.count ?? 0, staleOpen: staleRes.count ?? 0 };
}
