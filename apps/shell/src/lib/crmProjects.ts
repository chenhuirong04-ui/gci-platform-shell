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

/** Live type-ahead customer search — always a contains-match, active customers only. */
export async function searchCustomers(query: string, limit = 10): Promise<CrmCustomer[]> {
  const q = query.trim();
  if (!q) return [];
  const { data, error } = await supabase
    .from('crm_customers')
    .select('*')
    .ilike('customer_name', `%${q}%`)
    .eq('is_active', true)
    .order('customer_name', { ascending: true })
    .limit(limit);
  if (error) {
    console.error('[crmProjects] searchCustomers failed:', error);
    return [];
  }
  return (data ?? []) as CrmCustomer[];
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

/** Quick Create Customer — only when a search for the customer's name genuinely finds nothing. */
export async function quickCreateCustomer(input: {
  customerName: string;
  contactName?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
}): Promise<{ customer: CrmCustomer; contact: CrmContact | null }> {
  const { data: customer, error: cErr } = await supabase
    .from('crm_customers')
    .insert({ customer_name: input.customerName, source: 'quote_quick_create' })
    .select()
    .single();
  if (cErr) throw new Error(cErr.message);

  const hasContactInfo = !!(input.contactName || input.phone || input.whatsapp || input.email);
  if (!hasContactInfo) return { customer: customer as CrmCustomer, contact: null };

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
  if (ctErr) throw new Error(`Customer created but contact failed: ${ctErr.message}`);

  return { customer: customer as CrmCustomer, contact: contact as CrmContact };
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
