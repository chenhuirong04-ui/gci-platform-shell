// Knowledge & Rules — read access to the knowledge_* tables (migrated from the standalone Knowledge Hub).
// Every query runs as the signed-in user, so RLS (public.knowledge_can_read) decides which rows come back:
// knowledge_public -> PUBLIC, knowledge -> +INTERNAL, knowledge_confidential -> +CONFIDENTIAL, Admin -> all.
// No permission logic is duplicated here. Read-only except updateQuestionStatus (RLS: knowledge users / Admin).
import { supabase } from './supabase';

export type KnowledgeKind = 'rule' | 'item' | 'activity';

export interface KnowledgeHit {
  kind: KnowledgeKind;
  id: string;
  title: string;
  snippet: string;
  confidentiality: string;
  rank: number;
  verification_status: string | null;
  status: string | null;          // DRAFT / PUBLISHED … (rules and items only)
}

const TABLE: Record<KnowledgeKind, string> = { rule: 'knowledge_rules', item: 'knowledge_items', activity: 'knowledge_activities' };

/** Modules that open the Knowledge entry; the rows each one sees are decided by RLS. */
export const KNOWLEDGE_MODULES = ['knowledge_public', 'knowledge', 'knowledge_confidential'];

// knowledge_search() returns no verification/publish status, so fetch it for the hits (same RLS applies).
async function withStatus(hits: Omit<KnowledgeHit, 'verification_status' | 'status'>[]): Promise<KnowledgeHit[]> {
  const byKind = new Map<KnowledgeKind, string[]>();
  for (const h of hits) byKind.set(h.kind, [...(byKind.get(h.kind) ?? []), h.id]);
  const meta = new Map<string, { verification_status: string | null; status: string | null }>();
  await Promise.all([...byKind].map(async ([kind, ids]) => {
    const cols = kind === 'activity' ? 'id, verification_status' : 'id, verification_status, status';
    const { data, error } = await supabase.from(TABLE[kind]).select(cols).in('id', ids);
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as any[]) meta.set(r.id, { verification_status: r.verification_status ?? null, status: r.status ?? null });
  }));
  return hits.map((h) => ({ ...h, verification_status: meta.get(h.id)?.verification_status ?? null, status: meta.get(h.id)?.status ?? null }));
}

/** Direct search: the query text goes to knowledge_search() as typed. */
export async function searchKnowledge(q: string, maxResults = 30): Promise<KnowledgeHit[]> {
  const query = q.trim();
  if (!query) return [];
  const { data, error } = await supabase.rpc('knowledge_search', { q: query, max_results: maxResults });
  if (error) throw new Error(error.message);
  return withStatus(((data ?? []) as any[]).map((r) => ({
    kind: r.kind as KnowledgeKind, id: r.id, title: r.title ?? '', snippet: r.snippet ?? '', confidentiality: r.confidentiality, rank: Number(r.rank) || 0,
  })));
}

// Terms knowledge_search() can match inside a natural-language question (it matches the whole string otherwise).
const GLOSSARY = [
  'Golden Visa', '黄金签证', 'Green Visa', '绿色签证', 'work permit', '工作许可', 'visa', '签证', 'labour', 'labor', '劳工', 'MOHRE',
  'residence', '居留', 'Emirates ID', 'VAT', '增值税', 'Corporate Tax', '企业所得税', '公司税', 'tax', '税',
  'Dubai Customs', 'customs', '海关', 'HS code', '产品合规', 'compliance', '合规', 'Free Zone', 'freezone', '自贸区', '自由区',
  'Mainland', '大陆', 'IFZA', 'Expo City', 'Expo', 'DMCC', 'JAFZA', 'DED', 'licence', 'license', '执照', '营业执照',
  'activity', '经营活动', '经营范围', 'trading', '贸易', 'general trading', 'e-commerce', '电商', 'consultancy', '咨询',
  'company setup', 'company formation', '公司注册', '设立公司', '注册公司', 'bank account', '银行开户', 'PRO', 'Ejari', 'trade license',
];
const STOP = new Set(['what', 'which', 'how', 'the', 'and', 'for', 'with', 'can', 'does', 'need', 'about', 'uae', 'dubai', 'is', 'are', 'a', 'an', 'of', 'to', 'in']);

/** Picks searchable terms out of a question: activity codes, known glossary terms, then leftover English words. */
export function knowledgeTermsFromQuestion(question: string): string[] {
  const text = question.trim();
  const terms: string[] = [];
  const add = (t: string) => { const v = t.trim(); if (v && !terms.some((x) => x.toLowerCase() === v.toLowerCase())) terms.push(v); };
  for (const m of text.matchAll(/\b\d{4,}(?:[.-]\d+)*\b/g)) add(m[0]);                      // activity codes, e.g. 4610.01
  const lower = text.toLowerCase();
  for (const g of [...GLOSSARY].sort((a, b) => b.length - a.length)) {
    if (lower.includes(g.toLowerCase()) && !terms.some((x) => x.toLowerCase().includes(g.toLowerCase()))) add(g);
  }
  for (const w of text.match(/[A-Za-z][A-Za-z-]{2,}/g) ?? []) if (!STOP.has(w.toLowerCase()) && !terms.some((x) => x.toLowerCase().includes(w.toLowerCase()))) add(w);
  return terms.slice(0, 5);
}

/** Question search for Ask GCI: runs knowledge_search() per extracted term and merges (best rank wins). */
export async function searchKnowledgeForQuestion(question: string, maxResults = 8): Promise<{ terms: string[]; hits: KnowledgeHit[] }> {
  const terms = knowledgeTermsFromQuestion(question);
  if (terms.length === 0) terms.push(question.trim());
  const lists = await Promise.all(terms.map(async (t) => {
    const { data, error } = await supabase.rpc('knowledge_search', { q: t, max_results: 20 });
    if (error) throw new Error(error.message);
    return (data ?? []) as any[];
  }));
  const best = new Map<string, any>();
  lists.flat().forEach((r) => {
    const prev = best.get(r.id);
    const score = (Number(r.rank) || 0) + (prev ? 0.5 : 0);        // matched by several terms -> ranks higher
    if (!prev || score > prev._score) best.set(r.id, { ...r, _score: prev ? Math.max(score, prev._score + 0.5) : score });
  });
  const top = [...best.values()].sort((a, b) => b._score - a._score).slice(0, maxResults)
    .map((r) => ({ kind: r.kind as KnowledgeKind, id: r.id, title: r.title ?? '', snippet: r.snippet ?? '', confidentiality: r.confidentiality, rank: r._score }));
  return { terms, hits: await withStatus(top) };
}

// PostgREST or() filter values: strip characters that would break the filter syntax.
const orSafe = (q: string) => q.replace(/[,()%*\\]/g, ' ').trim();

export interface KnowledgeActivity {
  id: string; activity_code: string | null; activity_name: string; business_sector: string | null; sub_sector: string | null;
  licence_type: string | null; activity_description: string | null; restrictions: string | null;
  third_party_approval_required: string | null; confidentiality: string; verification_status: string;
  jurisdiction: { name: string } | null;
}
export async function listActivities(q: string, limit = 100): Promise<{ rows: KnowledgeActivity[]; total: number }> {
  let query = supabase.from('knowledge_activities')
    .select('id, activity_code, activity_name, business_sector, sub_sector, licence_type, activity_description, restrictions, third_party_approval_required, confidentiality, verification_status, jurisdiction:knowledge_jurisdictions(name)', { count: 'exact' })
    .order('activity_code', { ascending: true, nullsFirst: false }).limit(limit);
  const s = orSafe(q);
  if (s) query = query.or(`activity_code.ilike.*${s}*,activity_name.ilike.*${s}*,business_sector.ilike.*${s}*,sub_sector.ilike.*${s}*`);
  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  return { rows: (data ?? []) as any, total: count ?? 0 };
}

export interface KnowledgeRule {
  id: string; title: string; applies_to: string | null; required_actions: string | null; required_documents: string | null;
  deadline: string | null; status: string; confidentiality: string; verification_status: string;
}
export async function listRules(q: string): Promise<KnowledgeRule[]> {
  let query = supabase.from('knowledge_rules')
    .select('id, title, applies_to, required_actions, required_documents, deadline, status, confidentiality, verification_status').order('title');
  const s = orSafe(q);
  if (s) query = query.or(`title.ilike.*${s}*,applies_to.ilike.*${s}*,required_actions.ilike.*${s}*`);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as any;
}

export interface KnowledgeItem {
  id: string; title: string; summary: string | null; status: string; confidentiality: string; verification_status: string; activity_code: string | null;
}
export async function listItems(q: string): Promise<KnowledgeItem[]> {
  let query = supabase.from('knowledge_items').select('id, title, summary, activity_code, status, confidentiality, verification_status').order('title');
  const s = orSafe(q);
  if (s) query = query.or(`title.ilike.*${s}*,summary.ilike.*${s}*,activity_code.ilike.*${s}*`);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as any;
}

export interface KnowledgeSource {
  id: string; title: string; file_name: string | null; drive_url: string | null; source_institution: string | null;
  document_type: string; version: string | null; status: string; confidentiality: string; verification_status: string;
}
export async function listSources(): Promise<KnowledgeSource[]> {
  const { data, error } = await supabase.from('knowledge_sources')
    .select('id, title, file_name, drive_url, source_institution, document_type, version, status, confidentiality, verification_status').order('title');
  if (error) throw new Error(error.message);
  return (data ?? []) as any;
}

export type QuestionStatus = 'OPEN' | 'RESOLVED' | 'STALE';
export interface KnowledgeQuestion {
  id: string; question: string; context: string | null; target_authority: string | null; status: QuestionStatus;
  review_note: string | null; confidentiality: string; verification_status: string; created_at: string;
}
export async function listQuestions(status: QuestionStatus | 'ALL'): Promise<KnowledgeQuestion[]> {
  let query = supabase.from('knowledge_questions')
    .select('id, question, context, target_authority, status, review_note, confidentiality, verification_status, created_at').order('created_at');
  if (status !== 'ALL') query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as any;
}

/** RLS decides: returns false when the policy did not let this user update the row. */
export async function updateQuestionStatus(id: string, status: QuestionStatus): Promise<boolean> {
  const { data, error } = await supabase.from('knowledge_questions').update({ status, updated_at: new Date().toISOString() }).eq('id', id).select('id');
  if (error) throw new Error(error.message);
  return (data ?? []).length === 1;
}
