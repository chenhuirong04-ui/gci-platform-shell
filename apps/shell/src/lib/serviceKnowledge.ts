// GCI Executive Desk — GIA Service Knowledge Read V1.
// Read-only queries against the real Business Solutions service catalog
// (service_catalog_items) and hourly labor rates (workforce_rate_card) —
// the two tables the 2026-08-22 data-import rounds populated with the
// first real Tax & Compliance (12 rows) and Workforce (9 rows) pricing.
// This module never writes anything, never generates a quote, and never
// computes a total (quantity x hours x rate is explicit future work, not
// this round). Rule-based matching only — no AI call.
import { supabase } from './supabase';

export interface ServiceCatalogRow {
  id: string;
  name_cn: string;
  name_en: string;
  default_billing_type: string;
  one_time_fee: number | null;
  monthly_fee: number | null;
  annual_fee: number | null;
  currency: string;
  frequency: string | null;
  is_price_on_request: boolean;
  description_zh: string | null;
  description_en: string | null;
  notes_zh: string | null;
  notes_en: string | null;
  active: boolean;
}

export interface WorkforceRateRow {
  id: string;
  role_name_zh: string;
  role_name_en: string | null;
  rate: number;
  currency: string;
  billing_unit: string;
  active: boolean;
}

export async function listActiveServiceCatalog(): Promise<ServiceCatalogRow[]> {
  const { data } = await supabase
    .from('service_catalog_items')
    .select('id,name_cn,name_en,default_billing_type,one_time_fee,monthly_fee,annual_fee,currency,frequency,is_price_on_request,description_zh,description_en,notes_zh,notes_en,active')
    .eq('active', true);
  return (data as ServiceCatalogRow[]) || [];
}

export async function listActiveWorkforceRates(): Promise<WorkforceRateRow[]> {
  const { data } = await supabase
    .from('workforce_rate_card')
    .select('id,role_name_zh,role_name_en,rate,currency,billing_unit,active')
    .eq('active', true)
    .order('sort_order', { ascending: true });
  return (data as WorkforceRateRow[]) || [];
}

// ── Matching — deterministic, no AI ───────────────────────────────────────
// Business names like "增值税（VAT）登记" and "VAT Filing" share the "VAT"
// acronym, so a naive "does the query contain this word" match can't tell
// VAT Registration and VAT Filing apart from a query that only says "VAT".
// A longest-common-substring score against each row's (depunctuated,
// synonym-normalized) name is what actually disambiguates them: "VAT注册"
// scores higher against "...VAT登记" (5-char run "vat登记") than against
// "...VAT申报" (3-char run "vat" only) — only the strictly-highest-scoring
// row(s) are returned, everything else is discarded rather than guessed at.
function normalize(s: string): string {
  return s.toLowerCase().trim();
}

// "注册"/"登记" are used interchangeably for "registration" in everyday
// Chinese business speech even though the catalog's real name only uses
// one of them — a tiny, explicit synonym pair, not a general thesaurus.
const ZH_SYNONYM_PAIRS: [RegExp, string][] = [[/注册/g, '登记']];
function normalizeZhSynonyms(s: string): string {
  return ZH_SYNONYM_PAIRS.reduce((out, [pattern, replacement]) => out.replace(pattern, replacement), s);
}

function depunct(s: string): string {
  return s.replace(/[（）()&/,-]/g, '').replace(/\s+/g, '');
}

function splitNameAndQualifier(name: string): { base: string; qualifier: string | null } {
  // Only strips a trailing parenthetical ("...（年营收低于300万迪拉姆）" /
  // "...(Revenue below AED 3 million)") — a mid-string parenthetical like
  // "增值税（VAT）登记" is left untouched (matches on the sub-service
  // qualifier, e.g. "Filing only" vs "Filing + attestation", not on an
  // inline acronym).
  const m = name.match(/^(.*?)\s*[（(]([^）)]*)[）)]\s*$/);
  if (m) return { base: m[1].trim(), qualifier: m[2].trim() };
  return { base: name.trim(), qualifier: null };
}

function longestCommonSubstringLength(a: string, b: string): number {
  let best = 0;
  let prevRow = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const row = new Array(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        row[j] = prevRow[j - 1] + 1;
        if (row[j] > best) best = row[j];
      }
    }
    prevRow = row;
  }
  return best;
}

function scoreCatalogRow(query: string, row: ServiceCatalogRow): number {
  const q = depunct(normalizeZhSynonyms(normalize(query)));
  const zhCore = depunct(normalizeZhSynonyms(splitNameAndQualifier(row.name_cn).base.toLowerCase()));
  const enCore = depunct(splitNameAndQualifier(row.name_en).base.toLowerCase());
  const zhScore = longestCommonSubstringLength(q, zhCore);
  // Latin matches need a higher floor (>=4) than CJK (>=2) — short English
  // words ("Tax", "Fee") are too common to be distinctive on their own.
  const enRaw = longestCommonSubstringLength(q, enCore);
  const enScore = enRaw >= 4 ? enRaw : 0;
  return Math.max(zhScore, enScore);
}

// Bug fix history: an action-only filter ("注册/登记/registration") still
// let "VAT注册多少钱？" match every *_registration row in the catalog —
// including pre-existing, unrelated placeholder services (Company
// Registration, Free Zone Company Registration, ... at AED 0) that happen
// to share the action word. An action word alone was never enough:
// "registration" describes WHAT KIND of step it is, not WHICH service.
// Real disambiguation needs a SUBJECT too — "VAT" registration vs
// "Corporate Tax" registration vs "Electronic Invoicing" registration are
// different services that all happen to be registrations. Entity is
// checked first (a closed, known vocabulary of real subjects in this
// catalog), then action narrows further within that subject — LCS scoring
// only runs last, as a tie-breaker inside the already-narrowed pool, never
// as the thing deciding which subject a query is about.
type ServiceEntity = 'vat' | 'corporate_tax' | 'electronic_invoicing' | 'bookkeeping' | 'audit';
const ENTITY_PATTERNS: [ServiceEntity, RegExp][] = [
  ['vat', /\bvat\b/i],
  ['corporate_tax', /企业税|corporate\s*tax/i],
  ['electronic_invoicing', /电子发票|electronic\s*invoicing|e-?invoicing/i],
  ['bookkeeping', /记账|bookkeeping/i],
  ['audit', /审计|audit/i],
];

type ServiceActionCategory = 'registration' | 'filing' | 'advisory' | 'update' | 'coordination';
const ACTION_CATEGORY_PATTERNS: [ServiceActionCategory, RegExp][] = [
  ['registration', /注册|登记|registration/i],
  ['filing', /申报|filing/i],
  ['advisory', /顾问|advisory/i],
  ['update', /更新|\bupdate\b/i],
  ['coordination', /协调|coordination/i],
];

function detectFromPatterns<T extends string>(text: string, patterns: [T, RegExp][]): T | null {
  for (const [key, pattern] of patterns) {
    if (pattern.test(text)) return key;
  }
  return null;
}

// Returns the catalog rows whose name most strongly matches the query.
// Step 1: if the query names a real subject (VAT / Corporate Tax /
// Electronic Invoicing / Bookkeeping / Audit), hard-filter to only rows
// whose own name is that same subject.
// Step 2: if the query also names a business action (注册/登记, 申报,
// 顾问, 更新, 协调), further hard-filter (within whatever step 1 already
// narrowed to) to rows whose own name is that same action — this is what
// makes "VAT注册" resolve to exactly VAT Registration and nothing else,
// and "Corporate Tax Registration" never leaks into a "VAT" query.
// Step 3 (unchanged): fuzzy LCS scoring picks the top-scoring row(s)
// within whatever step 1+2 narrowed to — this is what still lets the two
// deliberate tiers of one service (Bookkeeping, Corporate Tax Filing) tie
// and both come back, since they share an identical base name.
// When the query names no entity at all (e.g. "注册服务有哪些？"), no
// entity filter is applied and the (possibly action-filtered) pool stays
// broad — intentional, per the "只有用户没说清entity时才允许更宽结果" rule.
export function matchServiceCatalog(query: string, rows: ServiceCatalogRow[]): ServiceCatalogRow[] {
  const FLOOR = 2;
  const queryEntity = detectFromPatterns(query, ENTITY_PATTERNS);
  const queryAction = detectFromPatterns(query, ACTION_CATEGORY_PATTERNS);

  let pool = rows;
  if (queryEntity) {
    const filtered = pool.filter((r) => detectFromPatterns(`${r.name_cn} ${r.name_en}`, ENTITY_PATTERNS) === queryEntity);
    if (filtered.length > 0) pool = filtered;
  }
  if (queryAction) {
    const filtered = pool.filter((r) => detectFromPatterns(`${r.name_cn} ${r.name_en}`, ACTION_CATEGORY_PATTERNS) === queryAction);
    if (filtered.length > 0) pool = filtered;
  }

  const scored = pool.map((r) => ({ row: r, score: scoreCatalogRow(query, r) })).filter((x) => x.score >= FLOOR);
  if (scored.length === 0) return [];
  const max = Math.max(...scored.map((x) => x.score));
  return scored.filter((x) => x.score === max).map((x) => x.row);
}

// If the query explicitly names a revenue threshold ("低于300万"/"below
// AED 3 million" or "高于"/"above"), and exactly one of the tied matches
// carries that same qualifier, narrow to it — never invented when the
// query doesn't actually say which tier.
export function narrowByCondition(query: string, rows: ServiceCatalogRow[]): ServiceCatalogRow[] {
  if (rows.length <= 1) return rows;
  const q = normalize(query);
  const belowCue = /低于|不到|少于|below|under/;
  const aboveCue = /高于|超过|以上|above|over|exceed/;
  if (belowCue.test(q)) {
    const narrowed = rows.filter((r) => /低于|below/i.test(r.name_cn) || /below/i.test(r.name_en));
    if (narrowed.length === 1) return narrowed;
  }
  if (aboveCue.test(q)) {
    const narrowed = rows.filter((r) => /高于|above/i.test(r.name_cn) || /above/i.test(r.name_en));
    if (narrowed.length === 1) return narrowed;
  }
  return rows;
}

export function matchWorkforceRates(query: string, rows: WorkforceRateRow[]): WorkforceRateRow[] {
  const q = normalize(query);
  return rows.filter((r) => {
    const zhHit = r.role_name_zh.length > 0 && q.includes(r.role_name_zh.toLowerCase());
    const enHit = !!r.role_name_en && q.includes(normalize(r.role_name_en));
    return zhHit || enHit;
  });
}

// ── Formatting — bilingual, compact (per spec: no long AI-style prose) ───
function billingLabel(row: ServiceCatalogRow, lang: 'zh' | 'en'): string {
  const type = row.default_billing_type;
  if (type === 'fixed') return lang === 'zh' ? '一次性收费' : 'One-time';
  if (type === 'monthly') return lang === 'zh' ? '按月收费' : 'Monthly';
  if (type === 'yearly') return lang === 'zh' ? '按年收费' : 'Yearly';
  return type;
}

export function formatCatalogRow(row: ServiceCatalogRow, lang: 'zh' | 'en'): string {
  const { base: baseZh, qualifier: qualZh } = splitNameAndQualifier(row.name_cn);
  const { base: baseEn, qualifier: qualEn } = splitNameAndQualifier(row.name_en);
  const nameLine = lang === 'zh' ? `${baseZh} / ${baseEn}` : `${baseEn} / ${baseZh}`;
  const lines = [nameLine];

  const qualifier = lang === 'zh' ? (qualZh ?? qualEn) : (qualEn ?? qualZh);
  if (qualifier) lines.push(qualifier);

  if (row.is_price_on_request) {
    lines.push(lang === 'zh' ? '价格面议' : 'Price on request');
    return lines.join('\n');
  }

  const amount = row.default_billing_type === 'monthly' ? row.monthly_fee
    : row.default_billing_type === 'yearly' ? row.annual_fee
    : row.one_time_fee;
  if (amount != null) {
    lines.push(`${row.currency} ${amount.toLocaleString('en-US')}`);
  }
  lines.push(billingLabel(row, lang));
  if (row.frequency && row.frequency !== 'monthly') lines.push(row.frequency);
  return lines.join('\n');
}

export function formatWorkforceRow(row: WorkforceRateRow, lang: 'zh' | 'en'): string {
  const nameLine = lang === 'zh'
    ? `${row.role_name_zh}${row.role_name_en ? ' / ' + row.role_name_en : ''}`
    : `${row.role_name_en ?? row.role_name_zh}${row.role_name_en ? ' / ' + row.role_name_zh : ''}`;
  const rateLine = `${row.currency} ${row.rate.toFixed(2)} / ${row.billing_unit}`;
  return `${nameLine}\n${rateLine}`;
}

// ── Top-level gate + answer ────────────────────────────────────────────────
const PRICE_QUESTION_CUE_RE = /多少钱|多少|费率|价格|收费|报价|面议|price|cost|how much|\brate\b/iu;
const LIST_SERVICES_RE = /哪些.{0,4}服务|what services|show.{0,10}services|服务目录|service catalog/iu;
const LIST_WORKFORCE_RE = /哪些.{0,6}(?:工种|费率)|workforce rate|labor rate|labour rate/iu;
const LIST_PRICE_ON_REQUEST_RE = /哪些.{0,6}面议|price on request/iu;

export function looksLikeServiceKnowledgeQuery(text: string): boolean {
  return PRICE_QUESTION_CUE_RE.test(text) || LIST_SERVICES_RE.test(text) || LIST_WORKFORCE_RE.test(text) || LIST_PRICE_ON_REQUEST_RE.test(text);
}

// Priority inside this module itself: real structured catalog/workforce
// data always wins over a generic "list everything" fallback, and a
// specific-item lookup always wins over a list. Returns null when nothing
// in the real catalog/workforce data matches — the caller (giaRouter.ts)
// then falls through to the rest of the chain (Business Memory, etc.)
// exactly as before, so unrelated questions ("我们规定报价最低毛利是多少？")
// are entirely unaffected.
export async function answerServiceKnowledgeQuery(text: string, lang: 'zh' | 'en'): Promise<string | null> {
  const isPriceOnRequestList = LIST_PRICE_ON_REQUEST_RE.test(text);
  const isWorkforceList = LIST_WORKFORCE_RE.test(text);
  const isServiceList = LIST_SERVICES_RE.test(text);

  const [catalogRows, workforceRows] = await Promise.all([listActiveServiceCatalog(), listActiveWorkforceRates()]);

  if (isPriceOnRequestList) {
    const rows = catalogRows.filter((r) => r.is_price_on_request);
    if (rows.length === 0) return lang === 'zh' ? '目前没有标记为面议的服务。' : 'No services are currently marked as price on request.';
    return rows.map((r) => formatCatalogRow(r, lang)).join('\n\n');
  }

  if (isWorkforceList) {
    if (workforceRows.length === 0) return null;
    return workforceRows.map((r) => formatWorkforceRow(r, lang)).join('\n\n');
  }

  // Specific-item lookup: catalog first, then workforce (§三 priority).
  let catalogMatches = matchServiceCatalog(text, catalogRows);
  catalogMatches = narrowByCondition(text, catalogMatches);
  if (catalogMatches.length > 0) {
    return catalogMatches.map((r) => formatCatalogRow(r, lang)).join('\n\n');
  }

  const workforceMatches = matchWorkforceRates(text, workforceRows);
  if (workforceMatches.length > 0) {
    return workforceMatches.map((r) => formatWorkforceRow(r, lang)).join('\n\n');
  }

  if (isServiceList) {
    if (catalogRows.length === 0) return null;
    return catalogRows.map((r) => formatCatalogRow(r, lang)).join('\n\n');
  }

  return null;
}
