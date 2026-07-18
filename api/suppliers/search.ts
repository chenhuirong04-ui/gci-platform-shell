// api/suppliers/search.ts
// Server-side supplier text search. Never returns private file URLs or bank data.
export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// ── Country alias map ─────────────────────────────────────────────────────────
const COUNTRY_ALIASES: Record<string, string> = {
  'uae': 'UAE', '迪拜': 'UAE', '阿联酋': 'UAE', 'dubai': 'UAE', 'emirates': 'UAE',
  'china': 'China', '中国': 'China', '国内': 'China',
  'malaysia': 'Malaysia', '马来西亚': 'Malaysia',
  'thailand': 'Thailand', '泰国': 'Thailand',
  'indonesia': 'Indonesia', '印尼': 'Indonesia',
  'korea': 'South Korea', '韩国': 'South Korea', 'south korea': 'South Korea',
  'ethiopia': 'Ethiopia', '埃塞': 'Ethiopia',
  'singapore': 'Singapore', '新加坡': 'Singapore',
  'india': 'India', '印度': 'India',
  'vietnam': 'Vietnam', '越南': 'Vietnam',
  'saudi': 'Saudi Arabia', '沙特': 'Saudi Arabia',
  'france': 'France', '法国': 'France',
  'usa': 'USA', '美国': 'USA',
  'philippines': 'Philippines', '菲律宾': 'Philippines',
};

// ── Product synonym map → [canonical product term, ...target categories] ─────
// Used to expand product keywords into category matches.
// Key: any alias the user might type; value: [display term, ...categories to match]
const PRODUCT_SYNONYMS: Record<string, { term: string; categories: string[] }> = {
  // Baby / hygiene
  '纸尿裤': { term: '纸尿裤', categories: ['hygiene', 'baby care', 'FMCG'] },
  '尿不湿': { term: '纸尿裤', categories: ['hygiene', 'baby care', 'FMCG'] },
  '纸尿片': { term: '纸尿裤', categories: ['hygiene', 'baby care'] },
  '婴儿纸尿裤': { term: '纸尿裤', categories: ['hygiene', 'baby care', 'FMCG'] },
  'diaper': { term: 'diaper', categories: ['hygiene', 'baby care', 'FMCG'] },
  'diapers': { term: 'diaper', categories: ['hygiene', 'baby care', 'FMCG'] },
  'nappy': { term: 'diaper', categories: ['hygiene', 'baby care'] },
  'nappies': { term: 'diaper', categories: ['hygiene', 'baby care'] },
  'baby diaper': { term: 'diaper', categories: ['hygiene', 'baby care', 'FMCG'] },
  // Feminine care
  '卫生巾': { term: '卫生巾', categories: ['hygiene', 'feminine care', 'FMCG'] },
  '卫生棉': { term: '卫生巾', categories: ['hygiene', 'feminine care'] },
  '护垫': { term: '护垫', categories: ['hygiene', 'feminine care'] },
  'sanitary pad': { term: 'sanitary pad', categories: ['hygiene', 'feminine care'] },
  'sanitary napkin': { term: 'sanitary pad', categories: ['hygiene', 'feminine care'] },
  // Wipes / tissue
  '湿巾': { term: '湿巾', categories: ['hygiene', 'FMCG'] },
  '纸巾': { term: '纸巾', categories: ['hygiene', 'FMCG'] },
  '卫生纸': { term: '卫生纸', categories: ['hygiene', 'FMCG'] },
  'wet wipe': { term: 'wet wipe', categories: ['hygiene', 'FMCG'] },
  'wet wipes': { term: 'wet wipe', categories: ['hygiene', 'FMCG'] },
  'tissue': { term: 'tissue', categories: ['hygiene', 'FMCG'] },
  // Food / packaging
  '餐盒': { term: '餐盒', categories: ['food packaging', 'food', 'packaging'] },
  '饭盒': { term: '餐盒', categories: ['food packaging', 'food'] },
  '甘蔗渣': { term: '甘蔗渣餐盒', categories: ['food packaging', 'food'] },
  'food container': { term: 'food container', categories: ['food packaging', 'food'] },
  'takeaway box': { term: 'takeaway box', categories: ['food packaging', 'food'] },
  // Furniture
  '酒店家具': { term: '酒店家具', categories: ['furniture', 'FF&E'] },
  '家具': { term: '家具', categories: ['furniture', 'FF&E'] },
  'hotel furniture': { term: 'hotel furniture', categories: ['furniture', 'FF&E'] },
  'furniture': { term: 'furniture', categories: ['furniture', 'FF&E'] },
  // Coffee
  '咖啡': { term: '咖啡', categories: ['food', 'beverage', 'FMCG'] },
  'coffee': { term: 'coffee', categories: ['food', 'beverage'] },
  // Building
  '建材': { term: '建材', categories: ['building materials', 'renovation'] },
  '瓷砖': { term: '瓷砖', categories: ['tiles & stone', 'building materials'] },
  '地毯': { term: '地毯', categories: ['carpet', 'furniture', 'FF&E'] },
  '灯具': { term: '灯具', categories: ['lighting', 'building materials'] },
};

// ── Simple category-name alias map (for queries without product synonym match) ─
const CATEGORY_ALIASES: Record<string, string> = {
  '卫生': 'hygiene', '卫生用品': 'hygiene',
  '快消': 'FMCG', 'fmcg': 'FMCG', '日化': 'FMCG',
  '工业': 'industry', '工业品': 'industry',
  '美容': 'beauty', '化妆品': 'beauty',
  '服务': 'service',
  '贸易': 'trade',
  '宠物': 'pet',
  '鞋': 'shoes', '鞋类': 'shoes',
  '医疗': 'medical', '医药': 'medical',
  '装修': 'renovation',
  '卫浴': 'sanitary fittings',
  '食品': 'food', '食品包装': 'food packaging', '包装': 'packaging', '饮料': 'beverage',
  '石材': 'tiles & stone',
};

// ── Known certification keywords ──────────────────────────────────────────────
const CERT_KEYWORDS = ['CE', 'ISO', 'FDA', 'HACCP', 'GMP', 'HALAL', 'BRC', 'SGS', 'TUV', 'UL', 'RoHS'];

// ── Supplier type keywords ────────────────────────────────────────────────────
const FACTORY_KEYWORDS_ZH = ['工厂', '厂家', '制造商', '生产厂', '源头工厂', '直接工厂'];
const FACTORY_KEYWORDS_EN = ['factory', 'manufacturer', 'producer', 'plant', 'production'];

// ── Intent extracted from a natural language query ────────────────────────────
interface ExtractedIntent {
  keywords: string[];               // cleaned product/topic tokens
  expandedCategories: string[];     // target category names for matching (may be multiple)
  primaryCategory: string | null;   // first/best category for display
  country: string | null;
  certificationKeyword: string | null;
  preferredOnly: boolean;
  requiresContact: boolean;
  supplierTypePreference: string | null;  // 'Factory' | null
  matchedSynonym: string | null;          // canonical product term matched, for display
}

function extractIntent(query: string): ExtractedIntent {
  const q = query.toLowerCase().trim();
  const raw = query.trim();

  // ── Country ─────────────────────────────────────────────────────────────────
  let country: string | null = null;
  for (const [alias, canonical] of Object.entries(COUNTRY_ALIASES)) {
    if (q.includes(alias.toLowerCase())) { country = canonical; break; }
  }

  // ── Certification ────────────────────────────────────────────────────────────
  let certificationKeyword: string | null = null;
  for (const cert of CERT_KEYWORDS) {
    if (q.includes(cert.toLowerCase()) || raw.includes(cert)) {
      certificationKeyword = cert;
      break;
    }
  }

  // ── Factory preference ───────────────────────────────────────────────────────
  let supplierTypePreference: string | null = null;
  for (const kw of FACTORY_KEYWORDS_ZH) {
    if (q.includes(kw)) { supplierTypePreference = 'Factory'; break; }
  }
  if (!supplierTypePreference) {
    for (const kw of FACTORY_KEYWORDS_EN) {
      if (q.includes(kw)) { supplierTypePreference = 'Factory'; break; }
    }
  }

  // ── Preferred / contact flags ────────────────────────────────────────────────
  const preferredOnly = /常用|preferred/.test(q);
  const requiresContact = /联系人|联系方式|可以直接联系|有联系/.test(q);

  // ── Product synonym check (before stripping, on raw lowercase) ───────────────
  let expandedCategories: string[] = [];
  let matchedSynonym: string | null = null;
  for (const [alias, { term, categories }] of Object.entries(PRODUCT_SYNONYMS)) {
    if (q.includes(alias.toLowerCase())) {
      matchedSynonym = term;
      expandedCategories = [...new Set([...expandedCategories, ...categories])];
    }
  }

  // ── Simple category alias check (fallback when no synonym matched) ───────────
  if (expandedCategories.length === 0) {
    for (const [alias, canonical] of Object.entries(CATEGORY_ALIASES)) {
      if (q.includes(alias.toLowerCase())) {
        expandedCategories.push(canonical);
        break;
      }
    }
  }

  // ── Clean query to extract residual keyword tokens ───────────────────────────
  // 1. Remove intent-phrase prefixes (command words the user types but aren't product names)
  const cleaned = q
    .replace(/我想找|我在找|我要找|帮我找|请帮我找|我需要|我找|帮我|请问|你好|麻烦|能不能|能否|有没有|是否有/g, '')
    // 2. Remove structured intent terms
    .replace(/谁有|哪些|哪家|哪几家|谁做|谁能|找供应商|供应商|供货商|哪家公司做|which supplier|who has|find supplier|supplier|vendor/g, '')
    // 3. Remove factory/type words (already captured in supplierTypePreference)
    .replace(/工厂|厂家|制造商|生产厂|源头工厂|直接工厂|factory|manufacturer|producer/g, '')
    // 4. Remove cert phrases (already captured in certificationKeyword)
    .replace(/有[a-z]{1,6}认证|[a-z]{1,6}认证|认证的|认证要求|有认证|需要认证|带认证/gi, '')
    // 5. Remove country words (already captured)
    .replace(/uae|迪拜|阿联酋|中国|国内|马来西亚|泰国|印尼|韩国|埃塞|新加坡|印度|越南|沙特|法国|美国|菲律宾/g, '')
    // 6. Remove preference/contact words
    .replace(/常用|有联系人|联系方式|可以直接联系|有联系|preferred/g, '')
    // 7. Remove punctuation and trailing particles
    .replace(/[？?。！!，,、；;：:\-_]/g, ' ')
    .replace(/\b(的|了|呢|吗|吧)\b/g, ' ')
    .trim();

  // ── Tokenize ─────────────────────────────────────────────────────────────────
  // Split on whitespace; keep tokens ≥2 chars that aren't pure numbers/symbols
  const rawTokens = cleaned.split(/\s+/).filter(t => t.length >= 2 && !/^[\d\W]+$/.test(t));

  // Deduplicate and remove tokens that are substrings of a matched synonym (avoid noise like "纸尿裤" when we already have matchedSynonym)
  const synonymLower = matchedSynonym?.toLowerCase() ?? '';
  const keywords = rawTokens.filter(t => {
    if (synonymLower && (synonymLower.includes(t) || t.includes(synonymLower))) return false;
    // Remove single-char tokens for CJK (already >= 2 but double check)
    return true;
  });

  const primaryCategory = expandedCategories[0] ?? null;

  return {
    keywords,
    expandedCategories,
    primaryCategory,
    country,
    certificationKeyword,
    preferredOnly,
    requiresContact,
    supplierTypePreference,
    matchedSynonym,
  };
}

// ── Scoring ───────────────────────────────────────────────────────────────────
function scoreSupplier(
  s: any,
  contacts: any[],
  certs: any[],
  products: any[],
  services: any[],
  intent: ExtractedIntent,
): {
  score: number;
  semanticScore: number;
  certMatched: boolean;
  matchType: string;
  matchReason: string;
  matchedProducts: string[];
  matchedServices: string[];
  matchedCategories: string[];
} {
  const cats: string[] = Array.isArray(s.product_categories) ? s.product_categories : [];
  const nameFull = `${s.supplier_name_display ?? ''} ${s.name_cn ?? ''} ${s.name_en ?? ''}`.toLowerCase();
  const strengthNotes = (s.strength_notes ?? '').toLowerCase();
  const allKeywordsLower = intent.keywords.map(k => k.toLowerCase());
  // Match synonym term against name/notes too
  const synLower = intent.matchedSynonym?.toLowerCase() ?? '';

  let semanticScore = 0;
  let countryScore = 0;
  let certMatched = false;
  let matchType = 'profile_match';
  const reasons: string[] = [];
  const matchedCategories: string[] = [];
  const matchedProducts: string[] = [];
  const matchedServices: string[] = [];

  // ── Product-level match (supplier_products table) ─────────────────────────
  const searchTerms = [...allKeywordsLower, ...(synLower ? [synLower] : [])];
  for (const p of products) {
    const pName = `${p.product_name_cn ?? ''} ${p.product_name_en ?? ''} ${p.specification ?? ''} ${p.material ?? ''} ${p.model ?? ''}`.toLowerCase();
    let hitCount = 0;
    for (const kw of searchTerms) {
      if (kw.length >= 2 && pName.includes(kw)) hitCount++;
    }
    if (hitCount > 0) {
      const displayName = p.product_name_cn || p.product_name_en || p.model || '';
      if (displayName && !matchedProducts.includes(displayName)) matchedProducts.push(displayName);
      if (hitCount >= 2 || searchTerms.length <= 2) {
        semanticScore += 40;
        matchType = 'exact_product';
        reasons.push(`产品记录：${displayName}`);
      } else {
        semanticScore += 20;
        if (matchType === 'profile_match') matchType = 'similar_product';
        reasons.push(`产品相关：${displayName}`);
      }
    }
  }

  // ── Service-level match ───────────────────────────────────────────────────
  for (const sv of services) {
    const svText = `${sv.service_name ?? ''} ${sv.service_category ?? ''} ${sv.service_description ?? ''}`.toLowerCase();
    for (const kw of searchTerms) {
      if (kw.length >= 2 && svText.includes(kw)) {
        const sName = sv.service_name || sv.service_category || '';
        if (sName && !matchedServices.includes(sName)) matchedServices.push(sName);
        semanticScore += 18;
        if (matchType === 'profile_match') matchType = 'service_match';
        reasons.push(`服务：${sName}`);
        break;
      }
    }
  }

  // ── Category match — supports multiple target categories ──────────────────
  const targetCats = intent.expandedCategories.length > 0 ? intent.expandedCategories : [];
  if (targetCats.length > 0) {
    for (const cat of cats) {
      const catLow = cat.toLowerCase();
      for (const target of targetCats) {
        const targetLow = target.toLowerCase();
        if (catLow === targetLow || catLow.includes(targetLow) || targetLow.includes(catLow)) {
          if (!matchedCategories.includes(cat)) matchedCategories.push(cat);
          semanticScore += 25;
          if (matchType === 'profile_match') matchType = 'category_only';
          if (!reasons.some(r => r.includes(cat))) reasons.push(`品类：${cat}`);
          break; // one target match per cat is enough
        }
      }
    }
  } else if (allKeywordsLower.length > 0) {
    // No explicit category — keyword scan against categories
    for (const kw of allKeywordsLower) {
      for (const cat of cats) {
        if (cat.toLowerCase().includes(kw) || kw.includes(cat.toLowerCase())) {
          if (!matchedCategories.includes(cat)) matchedCategories.push(cat);
          semanticScore += 15;
          if (matchType === 'profile_match') matchType = 'category_only';
          if (!reasons.some(r => r.includes(cat))) reasons.push(`品类：${cat}`);
        }
      }
    }
  }

  // ── Name / strength_notes keyword match ──────────────────────────────────
  for (const kw of [...allKeywordsLower, ...(synLower ? [synLower] : [])]) {
    if (kw.length >= 2 && nameFull.includes(kw)) {
      semanticScore += 10;
      if (!reasons.some(r => r.includes('名称'))) reasons.push(`名称含：${kw}`);
    }
    if (kw.length >= 2 && strengthNotes.includes(kw)) {
      semanticScore += 8;
      if (!reasons.some(r => r.includes('优势'))) reasons.push(`优势描述：${kw}`);
    }
  }

  // ── Certification match (BONUS, not hard filter) ──────────────────────────
  if (intent.certificationKeyword) {
    const certLow = intent.certificationKeyword.toLowerCase();
    for (const c of certs) {
      if ((c.certification_type ?? '').toLowerCase().includes(certLow)) {
        const isValid = c.status === 'available' || c.status === 'pending_verification' || !c.status;
        if (isValid) {
          certMatched = true;
          semanticScore += 30;
          if (matchType === 'profile_match') matchType = 'certification_match';
          reasons.push(`认证：${c.certification_type}(${c.status ?? '有效'})`);
        }
        break;
      }
    }
  }

  // ── Country match (boost, not semantic requirement) ───────────────────────
  if (intent.country && s.country === intent.country) {
    countryScore = 12;
    reasons.push(`国家：${s.country}`);
  }

  // ── Semantic intent guard ─────────────────────────────────────────────────
  // Supplier must have at least one content match when query has semantic intent.
  // Cert intent alone no longer causes exclusion — product/category match is enough.
  const hasSemanticIntent = allKeywordsLower.length > 0 || intent.expandedCategories.length > 0
    || (intent.certificationKeyword && intent.expandedCategories.length > 0);
  const hasPureCertOnly = !!intent.certificationKeyword && intent.expandedCategories.length === 0 && allKeywordsLower.length === 0;

  if (hasSemanticIntent && !hasPureCertOnly && semanticScore === 0) {
    return { score: 0, semanticScore: 0, certMatched: false, matchType: 'profile_match', matchReason: '', matchedProducts: [], matchedServices: [], matchedCategories: [] };
  }
  // For pure cert-only queries ("哪些供应商有CE" no product context), still filter by cert
  if (hasPureCertOnly && !certMatched) {
    return { score: 0, semanticScore: 0, certMatched: false, matchType: 'profile_match', matchReason: '', matchedProducts: [], matchedServices: [], matchedCategories: [] };
  }

  // ── Bonus factors (ranking only) ─────────────────────────────────────────
  let bonusScore = 0;
  // Factory preference: when user wants a factory, boost factory suppliers
  if (intent.supplierTypePreference === 'Factory' && s.supplier_type === 'Factory') bonusScore += 15;
  if (s.is_preferred) bonusScore += 8;
  const rating = s.current_rating;
  if (rating === 'A') bonusScore += 6;
  else if (rating === 'B') bonusScore += 3;
  if (contacts.length > 0) {
    const primary = contacts[0];
    if (primary.whatsapp || primary.email) bonusScore += 4;
  }

  // ── Require-contact hard filter ───────────────────────────────────────────
  if (intent.requiresContact && contacts.length === 0) {
    return { score: 0, semanticScore: 0, certMatched: false, matchType: 'profile_match', matchReason: '', matchedProducts: [], matchedServices: [], matchedCategories: [] };
  }

  const score = Math.min(100, Math.round(semanticScore + countryScore + bonusScore));
  const matchReason = reasons.slice(0, 3).join('，') || (intent.requiresContact ? '有联系方式' : '档案匹配');

  return { score, semanticScore, certMatched, matchType, matchReason, matchedProducts, matchedServices, matchedCategories };
}

// ── Completeness score ────────────────────────────────────────────────────────
function calcCompleteness(s: any, hasContact: boolean, hasContactMethod: boolean, hasBizLicense: boolean, hasCatalog: boolean, hasCertOrQuote: boolean): number {
  const cats = Array.isArray(s.product_categories) ? s.product_categories : [];
  let n = 0;
  if (s.country) n++;
  if (s.city) n++;
  if (cats.length > 0) n++;
  if (hasContact) n++;
  if (hasContactMethod) n++;
  if (s.website) n++;
  if (hasBizLicense) n++;
  if (hasCatalog) n++;
  if (hasCertOrQuote) n++;
  return Math.round((n / 9) * 100);
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return json({ ok: false, error: 'Server configuration error: Supabase credentials not set' }, 500);
  }

  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, error: 'Invalid JSON' }, 400); }

  const query: string = typeof body?.query === 'string' ? body.query.slice(0, 500) : '';
  if (!query.trim()) return json({ ok: false, error: 'query is required' }, 400);

  const clientFilters = body?.filters ?? {};

  async function supaGet(path: string) {
    const res = await fetch(`${supabaseUrl}${path}`, {
      headers: { apikey: supabaseKey!, Authorization: `Bearer ${supabaseKey}` },
    });
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
  }

  try {
    const intent = extractIntent(query);
    if (clientFilters.country) intent.country = clientFilters.country;
    if (clientFilters.category) { intent.primaryCategory = clientFilters.category; intent.expandedCategories = [clientFilters.category]; }
    if (clientFilters.certification) intent.certificationKeyword = clientFilters.certification;
    if (clientFilters.preferredOnly) intent.preferredOnly = true;

    // Build supplier query
    let supplierUrl = '/rest/v1/suppliers?status=eq.active&select=id,supplier_name_display,name_cn,name_en,short_code,supplier_type,country,city,product_categories,is_preferred,current_rating,strength_notes,website&limit=500';
    if (intent.preferredOnly) supplierUrl += '&is_preferred=eq.true';
    if (intent.country) supplierUrl += `&country=eq.${encodeURIComponent(intent.country)}`;

    const [suppliers, contacts, certs, quotes, products, services, documents] = await Promise.all([
      supaGet(supplierUrl),
      supaGet('/rest/v1/supplier_contacts?select=supplier_id,full_name,whatsapp,email,is_primary&limit=2000'),
      supaGet('/rest/v1/supplier_certifications?select=supplier_id,certification_type,status,expire_date&limit=2000'),
      supaGet('/rest/v1/supplier_quotes?select=supplier_id,supplier_quote_no,quote_date,currency,total_cost,valid_until,status&limit=1000'),
      supaGet('/rest/v1/supplier_products?select=supplier_id,product_name_cn,product_name_en,specification,material,model,category&limit=2000').catch(() => []),
      supaGet('/rest/v1/supplier_services?select=supplier_id,service_name,service_category,service_description,coverage_countries&limit=1000').catch(() => []),
      supaGet('/rest/v1/supplier_documents?select=supplier_id,document_type&limit=2000'),
    ]);

    const productTableEmpty = !Array.isArray(products) || products.length === 0;

    // Build lookup maps
    const contactsBySup = new Map<string, any[]>();
    for (const c of contacts) {
      if (!contactsBySup.has(c.supplier_id)) contactsBySup.set(c.supplier_id, []);
      contactsBySup.get(c.supplier_id)!.push(c);
    }
    const certsBySup = new Map<string, any[]>();
    for (const c of certs) {
      if (!certsBySup.has(c.supplier_id)) certsBySup.set(c.supplier_id, []);
      certsBySup.get(c.supplier_id)!.push(c);
    }
    const quotesBySup = new Map<string, any[]>();
    for (const q of quotes) {
      if (!q.supplier_id) continue;
      if (!quotesBySup.has(q.supplier_id)) quotesBySup.set(q.supplier_id, []);
      quotesBySup.get(q.supplier_id)!.push(q);
    }
    const productsBySup = new Map<string, any[]>();
    for (const p of Array.isArray(products) ? products : []) {
      if (!productsBySup.has(p.supplier_id)) productsBySup.set(p.supplier_id, []);
      productsBySup.get(p.supplier_id)!.push(p);
    }
    const servicesBySup = new Map<string, any[]>();
    for (const sv of Array.isArray(services) ? services : []) {
      if (!servicesBySup.has(sv.supplier_id)) servicesBySup.set(sv.supplier_id, []);
      servicesBySup.get(sv.supplier_id)!.push(sv);
    }
    const docsBySup = new Map<string, Set<string>>();
    for (const d of documents) {
      if (!docsBySup.has(d.supplier_id)) docsBySup.set(d.supplier_id, new Set());
      docsBySup.get(d.supplier_id)!.add(d.document_type);
    }

    const today = new Date().toISOString().slice(0, 10);

    const scored: any[] = [];
    let anyCertMatched = false;

    for (const s of suppliers) {
      const supContacts = contactsBySup.get(s.id) ?? [];
      const supCerts = certsBySup.get(s.id) ?? [];
      const supQuotes = quotesBySup.get(s.id) ?? [];
      const supProducts = productsBySup.get(s.id) ?? [];
      const supServices = servicesBySup.get(s.id) ?? [];
      const supDocs = docsBySup.get(s.id) ?? new Set<string>();

      const primary = supContacts.find((c: any) => c.is_primary) ?? supContacts[0] ?? null;
      const hasContactMethod = !!primary && (!!primary.whatsapp || !!primary.email);
      const hasBizLicense = supDocs.has('business_license') || supDocs.has('营业执照') || supDocs.has('公司注册文件');
      const hasCatalog = supDocs.has('product_catalog') || supDocs.has('产品目录');
      const hasCert = supCerts.length > 0;
      const hasQuote = supQuotes.length > 0;

      const result = scoreSupplier(s, supContacts, supCerts, supProducts, supServices, intent);

      const hasAnyIntent = intent.keywords.length > 0 || intent.country || intent.expandedCategories.length > 0
        || intent.certificationKeyword || intent.preferredOnly || intent.requiresContact;
      if (hasAnyIntent && result.score === 0) continue;

      if (result.certMatched) anyCertMatched = true;

      const latestQuote = supQuotes.length > 0
        ? supQuotes.sort((a: any, b: any) => (b.quote_date ?? '').localeCompare(a.quote_date ?? ''))[0]
        : null;

      const completeness = calcCompleteness(s, supContacts.length > 0, hasContactMethod, hasBizLicense, hasCatalog, hasCert || hasQuote);

      // ── Per-result warnings ───────────────────────────────────────────────
      const warnings: string[] = [];
      const cats: string[] = Array.isArray(s.product_categories) ? s.product_categories : [];

      if (result.matchType === 'category_only' && result.matchedProducts.length === 0) {
        warnings.push('仅按品类标签匹配，暂无具体产品记录，请联系供应商确认是否有该产品');
      }
      // Cert requested but this supplier doesn't have it
      if (intent.certificationKeyword && !result.certMatched) {
        warnings.push(`${intent.certificationKeyword} 认证：暂无记录，状态待核实`);
      }
      if (!primary) warnings.push('暂无联系人，请在供应商档案中补充');
      if (hasCert && supCerts.some((c: any) => c.expire_date && c.expire_date < today)) {
        warnings.push('存在已过期认证，请核实');
      }
      if (cats.length === 0) warnings.push('品类信息未完善，搜索准确度受影响');
      // Supplier type mismatch
      if (intent.supplierTypePreference === 'Factory' && s.supplier_type && s.supplier_type !== 'Factory') {
        warnings.push(`供应商类型为 ${s.supplier_type}，非工厂直供`);
      }

      scored.push({
        supplierId: s.id,
        supplierName: s.supplier_name_display,
        shortCode: s.short_code,
        matchScore: result.score,
        matchType: result.matchType,
        matchReason: result.matchReason,
        matchedProducts: result.matchedProducts,
        matchedServices: result.matchedServices,
        matchedCategories: result.matchedCategories,
        country: s.country ?? null,
        city: s.city ?? null,
        supplierType: s.supplier_type ?? null,
        isPreferred: !!s.is_preferred,
        currentRating: s.current_rating ?? null,
        certStatus: result.certMatched ? 'confirmed' : (intent.certificationKeyword ? 'not_recorded' : 'na'),
        primaryContact: primary ? {
          name: primary.full_name ?? null,
          whatsapp: primary.whatsapp ?? null,
          email: primary.email ?? null,
        } : null,
        certifications: supCerts.map((c: any) => ({
          type: c.certification_type,
          status: c.status,
          expireDate: c.expire_date ?? null,
        })),
        latestQuote: latestQuote ? {
          quoteNo: latestQuote.supplier_quote_no,
          quoteDate: latestQuote.quote_date ?? null,
          currency: latestQuote.currency ?? null,
          totalCost: latestQuote.total_cost ?? null,
          validUntil: latestQuote.valid_until ?? null,
          expired: latestQuote.valid_until ? latestQuote.valid_until < today : false,
        } : null,
        profileCompleteness: completeness,
        warnings,
        detailLink: `/suppliers?open=${s.id}`,
      });
    }

    // Sort: certMatched first (when cert intent), then Factory (when factory intent), then score
    scored.sort((a, b) => {
      // Cert confirmed suppliers first
      if (intent.certificationKeyword) {
        const aCert = a.certStatus === 'confirmed' ? 1 : 0;
        const bCert = b.certStatus === 'confirmed' ? 1 : 0;
        if (bCert !== aCert) return bCert - aCert;
      }
      // Factory preferred suppliers when factory intent
      if (intent.supplierTypePreference === 'Factory') {
        const aFac = a.supplierType === 'Factory' ? 1 : 0;
        const bFac = b.supplierType === 'Factory' ? 1 : 0;
        if (bFac !== aFac) return bFac - aFac;
      }
      if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
      if (a.isPreferred !== b.isPreferred) return a.isPreferred ? -1 : 1;
      const ratingOrder: Record<string, number> = { A: 4, B: 3, C: 2, D: 1 };
      return (ratingOrder[b.currentRating ?? ''] ?? 0) - (ratingOrder[a.currentRating ?? ''] ?? 0);
    });

    // ── Notes ────────────────────────────────────────────────────────────────
    const notes: string[] = [];
    if (productTableEmpty) {
      notes.push('supplier_products 表暂无产品记录，仅按品类标签、档案信息和关键词匹配。如需精准产品搜索，请在供应商详情中添加产品目录。');
    }
    // Cert fallback note
    if (intent.certificationKeyword && !anyCertMatched && scored.length > 0) {
      notes.unshift(`没有找到已记录 ${intent.certificationKeyword} 认证的供应商。以下为产品/品类相关候选，但 ${intent.certificationKeyword} 状态尚未录入或待核实，请直接向供应商确认。`);
    }
    if (intent.certificationKeyword && !anyCertMatched && scored.length === 0) {
      notes.unshift(`没有找到符合条件的供应商。${intent.certificationKeyword} 认证：数据库暂无记录。`);
    }

    return json({
      ok: true,
      query,
      extractedIntent: {
        keywords: intent.keywords,
        matchedSynonym: intent.matchedSynonym,
        expandedCategories: intent.expandedCategories,
        primaryCategory: intent.primaryCategory,
        country: intent.country,
        certificationKeyword: intent.certificationKeyword,
        preferredOnly: intent.preferredOnly,
        requiresContact: intent.requiresContact,
        supplierTypePreference: intent.supplierTypePreference,
      },
      certFallback: !!intent.certificationKeyword && !anyCertMatched,
      total: scored.length,
      results: scored,
      notes,
    });

  } catch (err: any) {
    return json({ ok: false, error: err.message ?? 'Unknown error' }, 500);
  }
}
