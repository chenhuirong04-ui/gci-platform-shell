/**
 * Customer / Project Linking V1 (2026-09-15) — data layer backing the
 * shared <CustomerProjectSelector>. Reads/writes crm_customers/crm_contacts
 * (existing, see crmSupabase.ts) and crm_projects (new, see
 * supabase/migrations/20260915_crm_projects.sql).
 *
 * This file intentionally does NOT duplicate crmSupabase.ts's existing
 * exact-then-contains findCustomerByName() — that function is tuned for
 * Ask-GCI's "look up exactly this one customer" use case. The selector
 * needs a live, always-contains, multi-result type-ahead search instead,
 * which is what searchCustomers() below is for.
 */
import { supabase } from './supabase';
import type { CrmCustomer, CrmContact } from './crmSupabase';

export interface CrmProject {
  id: string;
  customer_id: string;
  project_name: string;
  status: 'active' | 'completed' | 'on_hold' | 'cancelled';
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Stage value of a customer created on the fly from a quotation before its formal CRM profile is complete. crm_customers.status is the
 * existing free-text CRM stage field (Notion vocabulary: 新询盘, 需求整理中, …); no new status machine is introduced. Formalising it sets it to
 * 新询盘, the CRM's own initial stage. */
export const LEAD_STATUS = '待建档';
export const FORMAL_STATUS = '新询盘';
export const isUnregisteredLead = (c: { status?: string | null } | null | undefined) => (c?.status || '').trim() === LEAD_STATUS;

export interface CustomerSearchHit {
  customer: CrmCustomer;
  /** primary (or first) contact of the customer, if any */
  contact: CrmContact | null;
  matchedOn: 'name' | 'contact' | 'phone' | 'email';
}

/** Remove characters that have a meaning in a LIKE pattern / PostgREST filter; the search is fuzzy anyway. */
const cleanTerm = (s: string) => s.replace(/[%*,()"\\]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Live type-ahead customer search over the REAL CRM (crm_customers + crm_contacts), contains-match, case-insensitive, active customers only.
 * Matches: company/customer name · contact name · phone · WhatsApp · email. Results carry the primary contact so the dropdown can show it.
 */
export async function searchCustomers(query: string, limit = 8): Promise<CustomerSearchHit[]> {
  const term = cleanTerm(query);
  if (!term) return [];
  const like = `%${term}%`;
  const digits = term.replace(/\D/g, '');
  const digitLike = digits.length >= 4 && digits !== term ? `%${digits}%` : null;

  const byName = supabase.from('crm_customers').select('*').ilike('customer_name', like).eq('is_active', true).order('customer_name', { ascending: true }).limit(20);
  const contactQ = (col: string, pat: string) => supabase.from('crm_contacts').select('customer_id, contact_name, phone, whatsapp, email').ilike(col, pat).limit(30);
  const [rName, rCn, rPhone, rWa, rEmail, rPhoneD, rWaD] = await Promise.all([
    byName,
    contactQ('contact_name', like),
    contactQ('phone', like),
    contactQ('whatsapp', like),
    contactQ('email', like),
    digitLike ? contactQ('phone', digitLike) : Promise.resolve({ data: [], error: null } as any),
    digitLike ? contactQ('whatsapp', digitLike) : Promise.resolve({ data: [], error: null } as any),
  ]);
  const firstError = [rName, rCn, rPhone, rWa, rEmail, rPhoneD, rWaD].find((r: any) => r.error);
  if (firstError) {
    console.error('[crmProjects] searchCustomers failed:', (firstError as any).error);
    return [];
  }

  const matched = new Map<string, CustomerSearchHit['matchedOn']>();
  for (const c of (rName.data ?? []) as CrmCustomer[]) matched.set(c.id, 'name');
  const addContactHits = (rows: any[] | null, kind: CustomerSearchHit['matchedOn']) => {
    for (const r of rows ?? []) if (!matched.has(r.customer_id)) matched.set(r.customer_id, kind);
  };
  addContactHits(rCn.data, 'contact');
  addContactHits(rPhone.data, 'phone'); addContactHits(rWa.data, 'phone'); addContactHits(rPhoneD.data, 'phone'); addContactHits(rWaD.data, 'phone');
  addContactHits(rEmail.data, 'email');
  if (matched.size === 0) return [];

  // customers found only through a contact still need their own row (active only)
  const have = new Map<string, CrmCustomer>();
  for (const c of (rName.data ?? []) as CrmCustomer[]) have.set(c.id, c);
  const missing = [...matched.keys()].filter((id) => !have.has(id));
  if (missing.length) {
    const { data, error } = await supabase.from('crm_customers').select('*').in('id', missing).eq('is_active', true);
    if (error) { console.error('[crmProjects] searchCustomers (contact hits) failed:', error); return []; }
    for (const c of (data ?? []) as CrmCustomer[]) have.set(c.id, c);
  }
  const ids = [...have.keys()];
  const contactsBy = new Map<string, CrmContact>();
  if (ids.length) {
    const { data } = await supabase.from('crm_contacts').select('*').in('customer_id', ids).order('is_primary', { ascending: false });
    for (const c of (data ?? []) as CrmContact[]) if (!contactsBy.has(c.customer_id)) contactsBy.set(c.customer_id, c);
  }

  const lower = term.toLowerCase();
  return ids
    .map((id) => ({ customer: have.get(id)!, contact: contactsBy.get(id) ?? null, matchedOn: matched.get(id)! }))
    .sort((x, y) => {
      const xs = x.customer.customer_name.toLowerCase().startsWith(lower) ? 0 : 1;
      const ys = y.customer.customer_name.toLowerCase().startsWith(lower) ? 0 : 1;
      return xs - ys || x.customer.customer_name.localeCompare(y.customer.customer_name);
    })
    .slice(0, limit);
}

/** Exact (case-insensitive) name match — used to stop a duplicate customer being created from a quotation. Archived customers count too. */
export async function findCustomerByExactName(name: string): Promise<CrmCustomer | null> {
  const n = name.trim();
  if (!n) return null;
  const { data, error } = await supabase.from('crm_customers').select('*').ilike('customer_name', n.replace(/[\\%_]/g, (m) => '\\' + m)).limit(1);
  if (error) { console.error('[crmProjects] findCustomerByExactName failed:', error); return null; }
  return ((data ?? [])[0] as CrmCustomer) ?? null;
}

export async function listContactsForCustomer(customerId: string): Promise<CrmContact[]> {
  const { data, error } = await supabase
    .from('crm_contacts')
    .select('*')
    .eq('customer_id', customerId)
    .order('is_primary', { ascending: false });
  if (error) {
    console.error('[crmProjects] listContactsForCustomer failed:', error);
    return [];
  }
  return (data ?? []) as CrmContact[];
}

/** Finance Profitability V1 (2026-09-15) — every non-cancelled project
 * across all customers, for resolving a transaction's project_id to a real
 * project_name/customer_id (never guessed from any snapshot text). */
export async function listAllProjects(): Promise<CrmProject[]> {
  const { data, error } = await supabase
    .from('crm_projects')
    .select('*')
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(2000);
  if (error) {
    console.error('[crmProjects] listAllProjects failed:', error);
    return [];
  }
  return (data ?? []) as CrmProject[];
}

export async function listProjectsForCustomer(customerId: string): Promise<CrmProject[]> {
  const { data, error } = await supabase
    .from('crm_projects')
    .select('*')
    .eq('customer_id', customerId)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[crmProjects] listProjectsForCustomer failed:', error);
    return [];
  }
  return (data ?? []) as CrmProject[];
}

/** Thrown by quickCreateCustomer when a customer with exactly this name already exists — the caller offers to use it instead. */
export class DuplicateCustomerError extends Error {
  existing: CrmCustomer;
  constructor(existing: CrmCustomer) {
    super(`Customer "${existing.customer_name}" already exists`);
    this.name = 'DuplicateCustomerError';
    this.existing = existing;
  }
}

const PRIMARY_TYPES = new Set(['project', 'trade', 'services']);

/**
 * Quick Create Customer — writes the real crm_customers row (+ crm_contacts row when contact details are given), same tables and same
 * rules as the CRM page. Refuses to create a second customer with the same name. `isLead` creates it at stage 待建档 (no formal profile yet).
 */
export async function quickCreateCustomer(input: {
  customerName: string;
  country?: string;
  /** crm_customers.customer_primary_type (project | trade | services); anything else is dropped, never guessed */
  customerPrimaryType?: string | null;
  source?: string;
  /** crm_customers.business_type (业务线) */
  businessType?: string;
  /** crm_customers.status (stage). Ignored when isLead (the lead stage 待建档 wins). */
  status?: string;
  isLead?: boolean;
  contactName?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
}): Promise<{ customer: CrmCustomer; contact: CrmContact | null }> {
  const name = input.customerName.trim();
  if (!name) throw new Error('Customer name is required');
  const dup = await findCustomerByExactName(name);
  if (dup) throw new DuplicateCustomerError(dup);

  const row: Record<string, unknown> = { customer_name: name, source: input.source?.trim() || 'quote_quick_create' };
  if (input.country?.trim()) row.country = input.country.trim();
  if (input.customerPrimaryType && PRIMARY_TYPES.has(input.customerPrimaryType)) row.customer_primary_type = input.customerPrimaryType;
  if (input.businessType?.trim()) row.business_type = input.businessType.trim();
  if (input.status?.trim()) row.status = input.status.trim();
  if (input.isLead) row.status = LEAD_STATUS;

  const { data: customer, error: cErr } = await supabase.from('crm_customers').insert(row).select().single();
  if (cErr) throw new Error(cErr.message);

  const hasContactInfo = !!(input.contactName || input.phone || input.whatsapp || input.email);
  if (!hasContactInfo) return { customer: customer as CrmCustomer, contact: null };

  const { data: contact, error: ctErr } = await supabase
    .from('crm_contacts')
    .insert({
      customer_id: customer.id,
      contact_name: input.contactName?.trim() || null,
      phone: input.phone?.trim() || null,
      whatsapp: input.whatsapp?.trim() || null,
      email: input.email?.trim() || null,
      is_primary: true,
    })
    .select()
    .single();
  if (ctErr) throw new Error(`Customer created but contact failed: ${ctErr.message}`);

  return { customer: customer as CrmCustomer, contact: contact as CrmContact };
}

/** 转为正式客户: only a customer still at the 待建档 stage is touched; nothing else on the row changes. */
export async function markCustomerFormal(customerId: string): Promise<CrmCustomer> {
  const { data, error } = await supabase
    .from('crm_customers')
    .update({ status: FORMAL_STATUS, updated_at: new Date().toISOString() })
    .eq('id', customerId)
    .eq('status', LEAD_STATUS)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as CrmCustomer;
}

/** Quick Create Project — only for a customer that already exists; always customer-linked. */
export async function quickCreateProject(customerId: string, projectName: string): Promise<CrmProject> {
  const { data, error } = await supabase
    .from('crm_projects')
    .insert({ customer_id: customerId, project_name: projectName })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as CrmProject;
}
