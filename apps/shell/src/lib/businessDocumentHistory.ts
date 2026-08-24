// GCI Executive Desk — Business History / Document Timeline V1, Round 2.
// CRUD + deterministic natural-language parsing for business_document_history
// (schema-only migration from Round 1: supabase/migrations/20260823_business_document_history.sql).
// No AI/OCR/PDF parsing — every field below comes from the user's own typed
// description text, never file content (explicit prohibition, this round).
import { supabase } from './supabase';
import { extractCompanyName } from './giaFiles';

export type BusinessDocumentType = 'QUOTATION' | 'CONTRACT' | 'PROPOSAL' | 'OTHER';
export type BusinessDocumentStatus = 'CURRENT' | 'SENT' | 'REVISED' | 'IN_NEGOTIATION' | 'DRAFT';

export interface BusinessDocumentHistoryRow {
  id: string;
  customer_id: string | null;
  entity_name: string;
  document_type: BusinessDocumentType;
  title: string;
  version_no: number | null;
  version_label: string | null;
  amount: number | null;
  currency: string | null;
  status: BusinessDocumentStatus;
  document_date: string | null;
  sent_at: string | null;
  valid_until: string | null;
  is_current: boolean;
  notes: string | null;
  drive_file_id: string | null;
  drive_file_name: string | null;
  drive_folder_id: string | null;
  drive_url: string | null;
  source: string;
  created_at: string;
  updated_at: string;
}

export const DOC_TYPE_LABEL_ZH: Record<BusinessDocumentType, string> = {
  QUOTATION: '报价', CONTRACT: '合同', PROPOSAL: '方案', OTHER: '其他资料',
};
export const DOC_TYPE_LABEL_EN: Record<BusinessDocumentType, string> = {
  QUOTATION: 'Quotation', CONTRACT: 'Contract', PROPOSAL: 'Proposal', OTHER: 'Other document',
};
export const STATUS_LABEL_ZH: Record<BusinessDocumentStatus, string> = {
  CURRENT: '当前版本', SENT: '已发送', REVISED: '已修改', IN_NEGOTIATION: '谈判中', DRAFT: '草稿',
};
export const STATUS_LABEL_EN: Record<BusinessDocumentStatus, string> = {
  CURRENT: 'Current', SENT: 'Sent', REVISED: 'Revised', IN_NEGOTIATION: 'In negotiation', DRAFT: 'Draft',
};

// GCI operates on Asia/Dubai (UTC+4) — same shift used elsewhere (e.g.
// crmSupabase.ts's todayISO) so document_date defaults to the Dubai calendar
// date, not whatever the browser's local timezone happens to be.
export function todayISO(): string {
  return new Date(Date.now() + 4 * 3600 * 1000).toISOString().slice(0, 10);
}

// ── Matching / supersede topic ──────────────────────────────────────────────
export interface BusinessDocumentTopic {
  customerId: string | null;
  entityName: string;
  documentType: BusinessDocumentType;
  title: string;
}

// The one shared "logical topic" scope used by both find and supersede.
// customer_id is preferred when known (a matched CRM customer is the
// reliable key even if the user phrases the same person's name two
// different ways later); entity_name is the fallback only when there's no
// CRM match. Always further scoped by document_type + title — this is what
// stops "客户所有 QUOTATION 全部置false": a 劳务报价 and a 公司注册报价 for the
// same customer get different titles, so each keeps its own is_current lane.
function scopeToTopic(query: any, topic: BusinessDocumentTopic): any {
  const scoped = topic.customerId ? query.eq('customer_id', topic.customerId) : query.eq('entity_name', topic.entityName);
  return scoped.eq('document_type', topic.documentType).eq('title', topic.title);
}

export async function findCurrentBusinessDocument(
  topic: BusinessDocumentTopic,
): Promise<{ ok: true; row: BusinessDocumentHistoryRow | null } | { ok: false; error: string }> {
  const query = scopeToTopic(supabase.from('business_document_history').select('*'), topic).eq('is_current', true);
  const { data, error } = await query.limit(1).maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, row: (data as BusinessDocumentHistoryRow) ?? null };
}

// Flips every currently-current row for this exact topic to is_current=false.
// Never touches a different title/type for the same customer — see
// scopeToTopic. Runs strictly before createBusinessDocumentHistory (never
// Promise.all'd with it) so a failure here can reliably stop the write.
export async function supersedeCurrentBusinessDocuments(
  topic: BusinessDocumentTopic,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const query = scopeToTopic(
    supabase.from('business_document_history').update({ is_current: false, updated_at: new Date().toISOString() }),
    topic,
  ).eq('is_current', true);
  const { error } = await query;
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function createBusinessDocumentHistory(row: {
  customerId: string | null;
  entityName: string;
  documentType: BusinessDocumentType;
  title: string;
  versionNo: number | null;
  versionLabel: string | null;
  amount: number | null;
  currency: string | null;
  status: BusinessDocumentStatus;
  documentDate: string | null;
  notes: string | null;
  driveFileId: string | null;
  driveFileName: string | null;
  driveFolderId: string | null;
  driveUrl: string | null;
}): Promise<{ ok: true; row: BusinessDocumentHistoryRow } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from('business_document_history')
    .insert({
      customer_id: row.customerId,
      entity_name: row.entityName,
      document_type: row.documentType,
      title: row.title,
      version_no: row.versionNo,
      version_label: row.versionLabel,
      amount: row.amount,
      currency: row.currency,
      status: row.status,
      document_date: row.documentDate,
      sent_at: row.status === 'SENT' ? new Date().toISOString() : null,
      notes: row.notes,
      is_current: true,
      drive_file_id: row.driveFileId,
      drive_file_name: row.driveFileName,
      drive_folder_id: row.driveFolderId,
      drive_url: row.driveUrl,
      source: 'chat_confirm',
    })
    .select()
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, row: data as BusinessDocumentHistoryRow };
}

// Home 7-day trend (homeTrends.ts) — QUOTATION/CONTRACT rows created in the
// last N days, real per-day signal for the "报价"/"合同" trend series.
// Read-only, no schema change.
export async function getRecentDocumentCounts(
  days = 7,
): Promise<{ ok: true; rows: { document_type: BusinessDocumentType; created_at: string }[] } | { ok: false; error: string }> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const { data, error } = await supabase
    .from('business_document_history')
    .select('document_type, created_at')
    .in('document_type', ['QUOTATION', 'CONTRACT'])
    .gte('created_at', since.toISOString())
    .limit(500);
  if (error) return { ok: false, error: error.message };
  return { ok: true, rows: (data ?? []) as { document_type: BusinessDocumentType; created_at: string }[] };
}

export async function listBusinessDocumentHistory(
  topic: { customerId: string | null; entityName: string; documentType?: BusinessDocumentType },
): Promise<{ ok: true; rows: BusinessDocumentHistoryRow[] } | { ok: false; error: string }> {
  let query = topic.customerId
    ? supabase.from('business_document_history').select('*').eq('customer_id', topic.customerId)
    : supabase.from('business_document_history').select('*').eq('entity_name', topic.entityName);
  if (topic.documentType) query = query.eq('document_type', topic.documentType);
  const { data, error } = await query.order('created_at', { ascending: false }).limit(50);
  if (error) return { ok: false, error: error.message };
  return { ok: true, rows: (data as BusinessDocumentHistoryRow[]) ?? [] };
}

export async function getLatestBusinessDocument(
  topic: { customerId: string | null; entityName: string; documentType?: BusinessDocumentType },
): Promise<{ ok: true; row: BusinessDocumentHistoryRow | null } | { ok: false; error: string }> {
  const res = await listBusinessDocumentHistory(topic);
  if (!res.ok) return res;
  return { ok: true, row: res.rows[0] ?? null };
}

// ── Natural-language parsing (deterministic, no AI) ─────────────────────────
const DOC_TYPE_PATTERNS: [BusinessDocumentType, RegExp][] = [
  ['QUOTATION', /报价|quotation|quote\b/i],
  ['CONTRACT', /合同|协议|contract\b|agreement/i],
  ['PROPOSAL', /方案|proposal/i],
  ['OTHER', /其他资料|其他|other\b/i],
];

// The first document-type pattern that matches, in the same priority order
// detectBusinessDocumentType uses — shared by entity extraction below so the
// "prefix before the type keyword" it slices is always the same keyword the
// caller will actually classify the document as.
function findTypeMatch(text: string): RegExpMatchArray | null {
  for (const [, re] of DOC_TYPE_PATTERNS) {
    const m = text.match(re);
    if (m) return m;
  }
  return null;
}

export function detectBusinessDocumentType(text: string): BusinessDocumentType | null {
  for (const [type, re] of DOC_TYPE_PATTERNS) if (re.test(text)) return type;
  return null;
}

// Gate for entering the Business History flow at all (spec section 十三): a
// plain routing instruction like "把这个放到HIGHWAYGLOBAL" has no recognized
// document-type word and must fall through to the existing plain describe/
// folder-routing flow untouched.
export function looksLikeBusinessDocumentDescription(text: string): boolean {
  return detectBusinessDocumentType(text) !== null;
}

// Generic words that are never a real entity name even when they land in an
// entity-shaped regex slot (e.g. "发给客户的" — "客户" is the word "customer",
// not anyone's name).
const ENTITY_STOPWORDS = new Set(['这', '这是', '这个', '也是', '还是', '就是', '客户', '对方', '顾客', '大家']);

function cleanEntityCandidate(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const v = raw.trim();
  // Length < 2 rejects stray single characters (e.g. a lone "是"/"的" left
  // over from stripping) — every real name/company token this needs to
  // catch (蒲总, 王旭, HIGHWAYGLOBAL, ZIMO, GCI...) is at least 2 characters.
  if (!v || v.length < 2 || ENTITY_STOPWORDS.has(v)) return null;
  return v;
}

// Deliberately NOT a fixed "X的<类型词>" template — real descriptions put
// arbitrary descriptive text between the entity and the type keyword (e.g.
// "HIGHWAYGLOBAL / ZIMO 的 V1 劳务及项目服务合同": entity, 的, version, then
// FOUR more descriptive characters before 合同 finally appears). Instead:
// take everything before the matched type keyword, strip a leading "这是/
// 这个/这/给" cue, and cut at the LAST "的" in what's left — that "的" is the
// boundary between "who this is for" and "what kind of document/version/
// description follows". If there's no "的" at all (e.g. "王旭最新合同"), the
// whole prefix (minus a trailing 最新/最终) is the entity.
export function extractBusinessDocumentEntityName(text: string): string | null {
  const typeMatch = findTypeMatch(text);
  if (typeMatch && typeMatch.index !== undefined) {
    let prefix = text.slice(0, typeMatch.index);
    prefix = prefix.replace(/^(这是|这个|这|给)+/, '').trim();
    const lastDe = prefix.lastIndexOf('的');
    const candidate = lastDe >= 0
      ? prefix.slice(0, lastDe).trim()
      : prefix.replace(/(最新|最终)$/, '').trim();
    const cleaned = cleanEntityCandidate(candidate.replace(/[，,、]+$/, ''));
    if (cleaned) return cleaned;
  }
  return extractCompanyName(text);
}

// The word(s) sitting between the entity name and the document-type keyword,
// stripped of version/particle noise — this is what turns "蒲总" + 报价 into
// "蒲总劳务报价" instead of a bare "蒲总报价" when the user actually said
// "劳务". Required for acceptance case 4 (同客户另一份不同主题的报价 must not
// collide on title with an unrelated one) — without a qualifier, two
// different quotes for the same customer/type would share one title and
// wrongly supersede each other.
function extractQualifier(text: string, entityName: string, documentType: BusinessDocumentType): string {
  const entityIdx = text.indexOf(entityName);
  if (entityIdx < 0) return '';
  const afterEntity = text.slice(entityIdx + entityName.length);
  const [, typeRe] = DOC_TYPE_PATTERNS.find(([t]) => t === documentType)!;
  const typeMatch = afterEntity.match(typeRe);
  if (!typeMatch || typeMatch.index === undefined) return '';
  let between = afterEntity.slice(0, typeMatch.index);
  between = between.replace(/第\s*\d+\s*版|[Vv]\d+|version\s*\d+|最新|最终/gi, '');
  between = between.replace(/^[的给是，,\s]+|[的给是，,\s]+$/g, '');
  return between.length >= 1 && between.length <= 10 ? between : '';
}

function parseVersion(text: string): { versionNo: number | null; versionLabel: string | null } {
  let m = text.match(/第\s*(\d+)\s*版/);
  if (m) return { versionNo: Number(m[1]), versionLabel: `V${m[1]}` };
  m = text.match(/[Vv]\s*(\d+)\b/);
  if (m) return { versionNo: Number(m[1]), versionLabel: `V${m[1]}` };
  m = text.match(/version\s*(\d+)/i);
  if (m) return { versionNo: Number(m[1]), versionLabel: `V${m[1]}` };
  return { versionNo: null, versionLabel: null };
}

function parseStatus(text: string): BusinessDocumentStatus {
  if (/还在谈|谈判中|in negotiation/i.test(text)) return 'IN_NEGOTIATION';
  if (/发给客户|已发送|已发给|sent to client/i.test(text)) return 'SENT';
  if (/修改后|改过的|revised/i.test(text)) return 'REVISED';
  if (/草稿|draft/i.test(text)) return 'DRAFT';
  return 'CURRENT';
}

const CURRENCY_TOKEN_MAP: Record<string, string> = {
  AED: 'AED', 迪拉姆: 'AED', USD: 'USD', 美元: 'USD', 美金: 'USD',
  CNY: 'CNY', RMB: 'CNY', 人民币: 'CNY', 元: 'CNY',
};

// Only fills amount/currency when the user's text pairs a number with an
// explicit currency token — never guesses an amount from a bare number
// (which would otherwise false-positive on things like a year or phone
// digits), per the explicit "不要猜金额" prohibition.
function parseAmount(text: string): { amount: number | null; currency: string | null } {
  const m = text.match(/(AED|USD|CNY|RMB|人民币|美元|美金|迪拉姆)\s*([\d,]+(?:\.\d+)?)|([\d,]+(?:\.\d+)?)\s*(AED|USD|CNY|RMB|人民币|美元|美金|迪拉姆|元)/i);
  if (!m) return { amount: null, currency: null };
  const token = (m[1] ?? m[4] ?? '').trim();
  const numStr = m[2] ?? m[3];
  const currency = CURRENCY_TOKEN_MAP[token] ?? CURRENCY_TOKEN_MAP[token.toUpperCase()] ?? null;
  if (!currency || !numStr) return { amount: null, currency: null };
  return { amount: Number(numStr.replace(/,/g, '')), currency };
}

export interface ParsedBusinessDocument {
  entityName: string;
  documentType: BusinessDocumentType;
  title: string;
  versionNo: number | null;
  versionLabel: string | null;
  status: BusinessDocumentStatus;
  amount: number | null;
  currency: string | null;
  notes: string | null;
}

// entity_name is NOT NULL in the schema, so a failed/weak extraction falls
// back to the raw description text rather than blocking the flow — a weak
// entity name just means the confirm card shows "尚未关联CRM客户" (see
// looksLikeBusinessDocumentDescription for the actual entry gate).
export function parseBusinessDocumentDescription(text: string): ParsedBusinessDocument | null {
  const documentType = detectBusinessDocumentType(text);
  if (!documentType) return null;
  const entityName = extractBusinessDocumentEntityName(text) || text.trim().slice(0, 60);
  const qualifier = extractQualifier(text, entityName, documentType);
  const { versionNo, versionLabel } = parseVersion(text);
  const status = parseStatus(text);
  const { amount, currency } = parseAmount(text);
  const title = `${entityName}${qualifier}${DOC_TYPE_LABEL_ZH[documentType]}`;
  return { entityName, documentType, title, versionNo, versionLabel, status, amount, currency, notes: null };
}
