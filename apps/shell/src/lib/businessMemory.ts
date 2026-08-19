// GCI Executive Desk — GIA Foundation Part B: Business Memory.
// Long-lived business rules Chris dictates ("记住…" / "以后都按这个…") — pricing,
// service model, process, company rule, product rule. Not a chat log: only
// confirmed rules are written here. A new active rule for the same
// category+company retires the old one (is_active=false, never deleted) —
// same supersede pattern as gia_file_registry's is_current.
import { supabase } from './supabase';
import { extractCompanyName } from './giaFiles';

export type MemoryCategory = 'pricing' | 'service_model' | 'process' | 'company_rule' | 'product_rule' | 'other';

export interface GiaBusinessMemoryRow {
  id: string;
  category: MemoryCategory;
  title: string;
  content: string;
  business_area: string | null;
  company_name: string | null;
  customer_id: string | null;
  raw_fragment: string | null;
  is_active: boolean;
  source: string;
  created_at: string;
  updated_at: string;
}

export async function createBusinessMemory(input: {
  category: MemoryCategory;
  title: string;
  content: string;
  businessArea?: string | null;
  companyName?: string | null;
  customerId?: string | null;
  rawFragment?: string | null;
}): Promise<{ ok: true; row: GiaBusinessMemoryRow } | { ok: false; error: string }> {
  let existingQuery = supabase.from('gia_business_memory').select('id').eq('category', input.category).eq('is_active', true);
  existingQuery = input.companyName ? existingQuery.eq('company_name', input.companyName) : existingQuery.is('company_name', null);
  existingQuery = input.customerId ? existingQuery.eq('customer_id', input.customerId) : existingQuery.is('customer_id', null);
  const { data: existing } = await existingQuery;
  if (existing && existing.length > 0) {
    await supabase.from('gia_business_memory').update({ is_active: false, updated_at: new Date().toISOString() }).in('id', existing.map((r) => r.id));
  }

  const { data, error } = await supabase.from('gia_business_memory').insert({
    category: input.category,
    title: input.title,
    content: input.content,
    business_area: input.businessArea ?? null,
    company_name: input.companyName ?? null,
    customer_id: input.customerId ?? null,
    raw_fragment: input.rawFragment ?? null,
  }).select().single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, row: data as GiaBusinessMemoryRow };
}

export async function searchActiveBusinessMemory(opts: {
  companyName?: string | null;
  customerId?: string | null;
  businessArea?: string | null;
  category?: MemoryCategory | null;
}): Promise<GiaBusinessMemoryRow[]> {
  let query = supabase.from('gia_business_memory').select('*').eq('is_active', true);
  if (opts.companyName) query = query.eq('company_name', opts.companyName);
  if (opts.customerId) query = query.eq('customer_id', opts.customerId);
  if (opts.businessArea) query = query.eq('business_area', opts.businessArea);
  if (opts.category) query = query.eq('category', opts.category);
  const { data } = await query.order('updated_at', { ascending: false }).limit(20);
  return (data as GiaBusinessMemoryRow[]) || [];
}

// Rule-based query trigger, same narrow-consumption pattern as
// giaFiles.looksLikeFileSeek — only fires on a recognized "what's the
// rule/how is it calculated" phrasing, so it never hijacks unrelated chat.
const MEMORY_QUERY_TRIGGER_RE = /(怎么算|怎么计算|如何计算|计算方式|规则是什么|规则是啥|什么规则|收费标准|报价规则|怎么收费|按什么算|按什么计算)/u;

export function looksLikeMemoryQuery(text: string): boolean {
  return MEMORY_QUERY_TRIGGER_RE.test(text);
}

// Only recognizes a known company name in the query text (same
// KNOWN_COMPANIES list giaFiles.ts uses) — a query naming an unrecognized
// company returns no rows rather than guessing, consistent with the rest
// of Business Memory never fabricating an answer.
export async function queryBusinessMemoryByText(text: string): Promise<GiaBusinessMemoryRow[]> {
  const company = extractCompanyName(text);
  if (!company) return [];
  return searchActiveBusinessMemory({ companyName: company });
}
