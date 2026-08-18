// GCI Executive Desk — Ask GCI CRM actions
// Reads/writes crm_customers / crm_contacts / crm_followups directly via the
// authenticated Supabase client (RLS: authenticated-only, no anon access).
// Does NOT touch Notion or localStorage — those remain the old (retired) CRM path.
import { supabase } from './supabase';

export interface CrmCustomer {
  id: string;
  customer_name: string;
  customer_type: string | null;
  business_type: string | null;
  country: string | null;
  city: string | null;
  owner: string | null;
  status: string | null;
  priority: string | null;
  source: string | null;
  last_follow_up_at: string | null;
  next_follow_up_at: string | null;
  follow_up_notes: string | null;
  next_action: string | null;
  // CRM Customer Archive — soft-deactivate only, never a physical delete.
  // Defaults to true for every existing/new row; archiving never touches
  // crm_contacts/crm_followups/quotations/commitments history.
  is_active: boolean;
  archived_at: string | null;
  archive_reason: string | null;
  [key: string]: any;
}

export interface CrmContact {
  id: string;
  customer_id: string;
  contact_name: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  is_primary: boolean;
}

export interface CrmFollowup {
  id: string;
  customer_id: string;
  follow_up_date: string;
  next_follow_up_at: string | null;
  method: string | null;
  notes: string | null;
  next_action: string | null;
  status_after: string | null;
  owner: string | null;
}

// GCI operates on Asia/Dubai (UTC+4). Using toISOString() directly on
// new Date() would return the UTC calendar date, which is wrong for roughly
// 4 hours a day (UTC 20:00–23:59 is already tomorrow in Dubai) — the same
// bug class fixed in crmAskGciParsers.ts's weekday parser. Shifting the
// timestamp by +4h before reading UTC date parts makes this timezone-
// independent regardless of the browser's own locale.
function todayISO(): string {
  return new Date(Date.now() + 4 * 3600 * 1000).toISOString().slice(0, 10);
}

// ── Action 1: "今天我要跟进谁？" ──────────────────────────────────────────────
export async function getTodaysFollowups(): Promise<
  { ok: true; date: string; rows: CrmCustomer[] } | { ok: false; error: string }
> {
  const date = todayISO();
  const { data, error } = await supabase
    .from('crm_customers')
    .select('*, crm_contacts(contact_name, is_primary)')
    .eq('next_follow_up_at', date)
    .eq('is_active', true)
    .order('customer_name', { ascending: true });
  if (error) return { ok: false, error: error.message };
  return { ok: true, date, rows: (data ?? []) as CrmCustomer[] };
}

// ── Action 2: "查一下 X" — exact match first, then contains. No fuzzy matching. ──
// Task 17.1 decision 1: the exact-name match is deliberately NOT filtered by
// is_active — this is what lets Chris look up (and restore) an archived
// customer by name, and what stops Business Capture from creating a
// duplicate when a name he mentions matches an archived record. The
// contains-fallback (ambiguous, multi-candidate "did you mean" suggestion
// list) IS filtered to active-only — that's a passive suggestion surface,
// not an explicit lookup, so archived customers shouldn't populate it.
export async function findCustomerByName(query: string): Promise<
  | { ok: true; found: true; customer: CrmCustomer; contacts: CrmContact[]; followups: CrmFollowup[] }
  | { ok: true; found: false; multiple: true; candidates: CrmCustomer[]; query: string }
  | { ok: true; found: false; multiple: false; query: string }
  | { ok: false; error: string }
> {
  const q = query.trim();
  if (!q) return { ok: false, error: 'empty query' };

  const { data: exactData, error: e1 } = await supabase
    .from('crm_customers')
    .select('*')
    .ilike('customer_name', q)
    .limit(5);
  if (e1) return { ok: false, error: e1.message };

  let candidates: CrmCustomer[] = (exactData ?? []) as CrmCustomer[];

  if (candidates.length === 0) {
    const { data: containsData, error: e2 } = await supabase
      .from('crm_customers')
      .select('*')
      .ilike('customer_name', `%${q}%`)
      .eq('is_active', true)
      .limit(10);
    if (e2) return { ok: false, error: e2.message };
    candidates = (containsData ?? []) as CrmCustomer[];
  }

  if (candidates.length === 0) return { ok: true, found: false, multiple: false, query: q };
  if (candidates.length > 1) return { ok: true, found: false, multiple: true, candidates, query: q };

  const customer = candidates[0];
  const [{ data: contacts, error: cErr }, { data: followups, error: fErr }] = await Promise.all([
    supabase.from('crm_contacts').select('*').eq('customer_id', customer.id),
    supabase
      .from('crm_followups')
      .select('*')
      .eq('customer_id', customer.id)
      .order('follow_up_date', { ascending: false })
      .limit(5),
  ]);
  if (cErr) return { ok: false, error: cErr.message };
  if (fErr) return { ok: false, error: fErr.message };

  return {
    ok: true,
    found: true,
    customer,
    contacts: (contacts ?? []) as CrmContact[],
    followups: (followups ?? []) as CrmFollowup[],
  };
}

// ── Action 3: log a follow-up + sync crm_customers ─────────────────────────────
export async function logFollowup(input: {
  customerId: string;
  notes: string;
  nextAction?: string | null;
  nextFollowUpAt?: string | null;
  method?: string | null;
  status?: string | null;
  owner?: string | null;
}): Promise<{ ok: true; followup: CrmFollowup; customer: CrmCustomer } | { ok: false; error: string }> {
  const followUpDate = todayISO();

  const { data: followup, error: fErr } = await supabase
    .from('crm_followups')
    .insert({
      customer_id: input.customerId,
      follow_up_date: followUpDate,
      next_follow_up_at: input.nextFollowUpAt || null,
      method: input.method || null,
      notes: input.notes,
      next_action: input.nextAction || null,
      status_after: input.status || null,
      owner: input.owner || null,
      source: 'ask_gci',
    })
    .select()
    .single();
  if (fErr) return { ok: false, error: fErr.message };

  const updatePayload: Record<string, any> = {
    last_follow_up_at: followUpDate,
    follow_up_notes: input.notes,
    updated_at: new Date().toISOString(),
  };
  if (input.nextFollowUpAt) updatePayload.next_follow_up_at = input.nextFollowUpAt;
  if (input.nextAction) updatePayload.next_action = input.nextAction;
  if (input.status) updatePayload.status = input.status;

  const { data: customer, error: cErr } = await supabase
    .from('crm_customers')
    .update(updatePayload)
    .eq('id', input.customerId)
    .select()
    .single();
  if (cErr) return { ok: false, error: cErr.message };

  return { ok: true, followup: followup as CrmFollowup, customer: customer as CrmCustomer };
}

// ── Executive Desk (Task 4): overdue follow-ups ─────────────────────────────────
// "Closed/done" statuses are the only ones we can reliably infer from the new
// crm_customers.status free-text field today — kept intentionally short per
// Task 4 scope ("don't invent complex rules"). Extend as the status taxonomy
// for crm_customers solidifies.
const CLOSED_STATUSES = ['已关闭', '已完成', 'closed', 'done'];

export interface CrmOverdueCustomer extends CrmCustomer {
  overdueDays: number;
}

export async function getOverdueFollowups(): Promise<
  { ok: true; rows: CrmOverdueCustomer[] } | { ok: false; error: string }
> {
  const today = todayISO();
  const { data, error } = await supabase
    .from('crm_customers')
    .select('*, crm_contacts(contact_name, is_primary)')
    .lt('next_follow_up_at', today)
    .not('next_follow_up_at', 'is', null)
    .eq('is_active', true);
  if (error) return { ok: false, error: error.message };

  const todayMs = new Date(today).getTime();
  const rows = (data ?? [])
    .filter((c) => !CLOSED_STATUSES.some((s) => (c.status || '').trim().toLowerCase() === s))
    .map((c) => ({
      ...c,
      overdueDays: Math.max(1, Math.round((todayMs - new Date(c.next_follow_up_at as string).getTime()) / 86400000)),
    }))
    .sort((a, b) => b.overdueDays - a.overdueDays) as CrmOverdueCustomer[];

  return { ok: true, rows };
}

// ── Executive Desk (Task 4): new customers in the last N days ──────────────────
export interface CrmNewCustomerRow {
  id: string;
  customer_name: string;
  created_at: string;
  source: string | null;
  business_type: string | null;
  status: string | null;
}

export async function getRecentNewCustomers(
  days = 7
): Promise<{ ok: true; rows: CrmNewCustomerRow[] } | { ok: false; error: string }> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  since.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('crm_customers')
    .select('id, customer_name, created_at, source, business_type, status')
    .gte('created_at', since.toISOString())
    .eq('is_active', true)
    .order('created_at', { ascending: false });
  if (error) return { ok: false, error: error.message };
  return { ok: true, rows: (data ?? []) as CrmNewCustomerRow[] };
}

// ── Executive Desk (Task 4): "needs Chris's decision" ───────────────────────────
// Only rules directly answerable from existing crm_customers columns. No
// fabricated/heuristic rules — if the data can't support a rule, it's omitted.
export interface BossDecisionItem {
  id: string;
  customerName: string;
  reason: string;
  detail: string;
}

export async function getBossDecisions(): Promise<
  { ok: true; items: BossDecisionItem[] } | { ok: false; error: string }
> {
  const [overdueRes, allRes] = await Promise.all([
    getOverdueFollowups(),
    supabase
      .from('crm_customers')
      .select('id, customer_name, priority, next_action, next_follow_up_at, last_follow_up_at')
      .eq('is_active', true)
      .limit(500),
  ]);
  if (!overdueRes.ok) return { ok: false, error: overdueRes.error };
  if (allRes.error) return { ok: false, error: allRes.error.message };

  const items: BossDecisionItem[] = [];

  // Rule 1: already-overdue customers (reuse the overdue query — same definition).
  for (const c of overdueRes.rows) {
    items.push({ id: c.id, customerName: c.customer_name, reason: '已逾期跟进', detail: `逾期 ${c.overdueDays} 天` });
  }

  // Rule 2: has a next_action but no next_follow_up_at — action was decided but never scheduled.
  // Rule 3: priority looks like a "focus" customer (contains 重点, or is exactly 'A') with no
  // follow-up in 7+ days (or never followed up).
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  for (const c of allRes.data ?? []) {
    if (c.next_action && !c.next_follow_up_at) {
      items.push({ id: c.id, customerName: c.customer_name, reason: '有下一步但未设跟进日期', detail: c.next_action });
    }
    const priority = (c.priority || '').trim();
    const isFocus = priority.includes('重点') || priority.toUpperCase() === 'A';
    if (isFocus) {
      const last = c.last_follow_up_at ? new Date(c.last_follow_up_at) : null;
      if (!last || last < sevenDaysAgo) {
        items.push({
          id: c.id,
          customerName: c.customer_name,
          reason: '重点客户超7天无跟进',
          detail: last ? `最近跟进 ${c.last_follow_up_at}` : '从未记录跟进',
        });
      }
    }
  }

  // De-dup identical (customer, reason) pairs — a customer can legitimately
  // appear once per distinct reason, just not twice for the same one.
  const seen = new Set<string>();
  const deduped = items.filter((it) => {
    const key = `${it.id}|${it.reason}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { ok: true, items: deduped };
}

// ── Task 17.2: Supabase CRM directory (客户名录 / 已停用客户) — read-only
// list with the primary contact embedded, for the new CRM page's table.
export interface CrmCustomerWithContact extends CrmCustomer {
  crm_contacts?: { contact_name: string | null; is_primary: boolean }[];
}

export async function getCustomerDirectory(isActive: boolean): Promise<
  { ok: true; rows: CrmCustomerWithContact[] } | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from('crm_customers')
    .select('*, crm_contacts(contact_name, is_primary)')
    .eq('is_active', isActive)
    .order('customer_name', { ascending: true })
    .limit(500);
  if (error) return { ok: false, error: error.message };
  return { ok: true, rows: (data ?? []) as CrmCustomerWithContact[] };
}

// ── Task 11.1: Email Chat Assistant — lightweight name list for client-side
// sender/customer matching in the email list. Names only, no PII beyond
// what's already shown elsewhere in the CRM UI. ────────────────────────────
export async function getAllCustomerNames(): Promise<
  { ok: true; rows: { id: string; customer_name: string }[] } | { ok: false; error: string }
> {
  const { data, error } = await supabase.from('crm_customers').select('id, customer_name').eq('is_active', true).limit(1000);
  if (error) return { ok: false, error: error.message };
  return { ok: true, rows: (data ?? []) as { id: string; customer_name: string }[] };
}

// ── Task 13: Business Overview — customer count grouped by existing
// business_type column. No guessing: a customer with no business_type set
// is counted as UNKNOWN rather than assigned a line. ───────────────────────
const BUSINESS_LINES = ['25H/AI', 'Trade', 'Workforce/Technical Services', 'Ecommerce', 'Other'] as const;

export interface BusinessLineCount {
  line: string;
  count: number;
}

export async function getBusinessLineBreakdown(): Promise<
  { ok: true; total: number; lines: BusinessLineCount[]; unknown: number } | { ok: false; error: string }
> {
  const { data, error } = await supabase.from('crm_customers').select('business_type').eq('is_active', true).limit(2000);
  if (error) return { ok: false, error: error.message };
  const counts = new Map<string, number>(BUSINESS_LINES.map((l) => [l, 0]));
  let unknown = 0;
  for (const row of data ?? []) {
    const bt = (row as any).business_type as string | null;
    if (bt && counts.has(bt)) counts.set(bt, (counts.get(bt) ?? 0) + 1);
    else unknown += 1;
  }
  return {
    ok: true,
    total: (data ?? []).length,
    lines: BUSINESS_LINES.map((l) => ({ line: l, count: counts.get(l) ?? 0 })),
    unknown,
  };
}

// ── Task 10: Commitment Tracker — recent follow-up text for candidate scan ──
// Read-only. Joins the customer name via the FK relationship so callers don't
// need a second round-trip.
export interface CrmFollowupWithCustomer extends CrmFollowup {
  customer_name: string | null;
}

export async function getRecentFollowupsWithNotes(
  days = 30,
): Promise<{ ok: true; rows: CrmFollowupWithCustomer[] } | { ok: false; error: string }> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await supabase
    .from('crm_followups')
    .select('id, customer_id, follow_up_date, next_follow_up_at, method, notes, next_action, status_after, owner, crm_customers(customer_name)')
    .gte('follow_up_date', since.toISOString().slice(0, 10))
    .order('follow_up_date', { ascending: false })
    .limit(200);
  if (error) return { ok: false, error: error.message };

  const rows: CrmFollowupWithCustomer[] = (data ?? []).map((r: any) => ({
    ...r,
    customer_name: r.crm_customers?.customer_name ?? null,
  }));
  return { ok: true, rows };
}

// ── Action 4: create customer (+ optional primary contact) ─────────────────────
export async function createCustomerWithContact(input: {
  customerName: string;
  contactName?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  owner?: string;
}): Promise<
  | { ok: true; customer: CrmCustomer; contact: CrmContact | null }
  | { ok: false; error: string }
> {
  const { data: customer, error: cErr } = await supabase
    .from('crm_customers')
    .insert({
      customer_name: input.customerName,
      owner: input.owner || null,
      source: 'ask_gci',
    })
    .select()
    .single();
  if (cErr) return { ok: false, error: cErr.message };

  const hasContactInfo = !!(input.contactName || input.phone || input.whatsapp || input.email);
  if (!hasContactInfo) {
    return { ok: true, customer: customer as CrmCustomer, contact: null };
  }

  const { data: contact, error: ctErr } = await supabase
    .from('crm_contacts')
    .insert({
      customer_id: customer.id,
      contact_name: input.contactName || null,
      phone: input.phone || null,
      whatsapp: input.whatsapp || null,
      email: input.email || null,
      is_primary: true,
    })
    .select()
    .single();
  if (ctErr) return { ok: false, error: `Customer created but contact failed: ${ctErr.message}` };

  return { ok: true, customer: customer as CrmCustomer, contact: contact as CrmContact };
}

// ── CRM Customer Archive — soft deactivate/restore only. Never deletes the
// customer row, never touches crm_contacts/crm_followups or any
// quotation/commitment/decision history — those stay exactly as they are,
// and reactivating (is_active back to true) restores full visibility with
// nothing to "recover" because nothing was ever removed. Only ever called
// after Chris's explicit confirm click. ─────────────────────────────────
export async function setCustomerActive(
  customerId: string,
  isActive: boolean,
  reason?: string,
): Promise<{ ok: true; customer: CrmCustomer } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from('crm_customers')
    .update({
      is_active: isActive,
      archived_at: isActive ? null : new Date().toISOString(),
      archive_reason: isActive ? null : (reason || null),
    })
    .eq('id', customerId)
    .select()
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, customer: data as CrmCustomer };
}
