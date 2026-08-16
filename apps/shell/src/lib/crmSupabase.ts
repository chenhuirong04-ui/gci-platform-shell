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

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Action 1: "今天我要跟进谁？" ──────────────────────────────────────────────
export async function getTodaysFollowups(): Promise<
  { ok: true; date: string; rows: CrmCustomer[] } | { ok: false; error: string }
> {
  const date = todayISO();
  const { data, error } = await supabase
    .from('crm_customers')
    .select('id, customer_name, status, priority, owner, next_follow_up_at, next_action, follow_up_notes')
    .eq('next_follow_up_at', date)
    .order('customer_name', { ascending: true });
  if (error) return { ok: false, error: error.message };
  return { ok: true, date, rows: (data ?? []) as CrmCustomer[] };
}

// ── Action 2: "查一下 X" — exact match first, then contains. No fuzzy matching. ──
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
