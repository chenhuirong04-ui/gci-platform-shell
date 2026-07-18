// api/suppliers/search.ts
// Server-side supplier text search. Reads active suppliers + related tables,
// scores in memory, returns top results. Never returns private file URLs or bank data.
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

// ── Country alias map (subset sufficient for extraction) ──────────────────────
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
};

// ── Category alias map ────────────────────────────────────────────────────────
const CATEGORY_ALIASES: Record<string, string> = {
  '食品': 'food', '食品包装': 'food', '餐盒': 'food', '包装': 'food', '饮料': 'food',
  '卫生': 'hygiene', '卫生用品': 'hygiene', '纸巾': 'hygiene', '湿巾': 'hygiene',
  '日化': 'FMCG', '快消': 'FMCG', 'fmcg': 'FMCG',
  '家具': 'furniture', '酒店家具': 'furniture', 'furniture': 'furniture', '沙发': 'furniture',
  '工业': 'industry', '工业品': 'industry', 'industry': 'industry',
  '美容': 'beauty', '化妆品': 'beauty', 'beauty': 'beauty',
  '服务': 'service', 'service': 'service',
  '贸易': 'trade', 'trade': 'trade',
  '宠物': 'pet', 'pet': 'pet',
  '鞋': 'shoes', '鞋类': 'shoes', 'shoes': 'shoes',
  '医疗': 'medical', '医药': 'medical', 'medical': 'medical',
  '装修': 'renovation', '建材': 'building materials', 'building': 'building materials',
  '卫浴': 'sanitary fittings', '灯具': 'lighting', '地毯': 'carpet',
  '瓷砖': 'tiles & stone', 'tile': 'tiles & stone',
};

// ── Known certification keywords ──────────────────────────────────────────────
const CERT_KEYWORDS = ['CE', 'ISO', 'FDA', 'HACCP', 'GMP', 'HALAL', 'BRC', 'SGS', 'TUV', 'UL', 'RoHS'];

// ── Intent extraction from natural language query ─────────────────────────────
interface ExtractedIntent {
  keywords: string[];
  country: string | null;
  category: string | null;
  certificationKeyword: string | null;
  preferredOnly: boolean;
  requiresContact: boolean;
}

function extractIntent(query: string): ExtractedIntent {
  const q = query.toLowerCase().trim();
  const raw = query.trim();

  // Country
  let country: string | null = null;
  for (const [alias, canonical] of Object.entries(COUNTRY_ALIASES)) {
    if (q.includes(alias.toLowerCase())) { country = canonical; break; }
  }

  // Category
  let category: string | null = null;
  for (const [alias, canonical] of Object.entries(CATEGORY_ALIASES)) {
    if (q.includes(alias.toLowerCase())) { category = canonical; break; }
  }

  // Certification
  let certificationKeyword: string | null = null;
  for (const cert of CERT_KEYWORDS) {
    if (q.includes(cert.toLowerCase()) || raw.includes(cert)) {
      certificationKeyword = cert;
      break;
    }
  }

  // Preferred
  const preferredOnly = /常用|preferred/.test(q);

  // Requires contact
  const requiresContact = /联系人|联系方式|可以直接联系|有联系/.test(q);

  // General keywords: strip command words and known structured terms
  const stripped = q
    .replace(/谁有|哪些|哪家|哪几家|谁做|谁能|找供应商|供应商|供货商|厂家|工厂|哪家公司做|which supplier|who has|find supplier|supplier|vendor|manufacturer|factory/g, '')
    .replace(/常用|有认证|有联系人|联系方式|可以直接联系|有联系|preferred/g, '')
    .replace(/[？?。！!，,、；;：:]/g, ' ')
    .trim();

  // Extract meaningful keyword tokens (2+ chars, not purely punctuation)
  const tokens = stripped.split(/\s+/).filter(t => t.length >= 2 && !/^[\d\s]+$/.test(t));

  return { keywords: tokens, country, category, certificationKeyword, preferredOnly, requiresContact };
}

// ── Scoring ───────────────────────────────────────────────────────────────────
// Returns 0–100. Higher = better match.
function scoreSupplier(
  s: any,
  contacts: any[],
  certs: any[],
  quotes: any[],
  products: any[],
  services: any[],
  intent: ExtractedIntent,
): {
  score: number;
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

  let semanticScore = 0; // score from actual content match (product/category/cert/keyword/name)
  let countryScore = 0;  // country match — boosts rank but does not satisfy category/cert intent alone
  let matchType = 'profile_match';
  const reasons: string[] = [];
  const matchedCategories: string[] = [];
  const matchedProducts: string[] = [];
  const matchedServices: string[] = [];

  // ── Product-level match (supplier_products table) ─────────────────────────
  for (const p of products) {
    const pName = `${p.product_name_cn ?? ''} ${p.product_name_en ?? ''} ${p.specification ?? ''} ${p.material ?? ''} ${p.model ?? ''}`.toLowerCase();
    let hitCount = 0;
    for (const kw of allKeywordsLower) {
      if (kw.length >= 2 && pName.includes(kw)) hitCount++;
    }
    if (hitCount > 0) {
      const displayName = p.product_name_cn || p.product_name_en || p.model || '';
      if (displayName && !matchedProducts.includes(displayName)) matchedProducts.push(displayName);
      if (hitCount >= 2 || (hitCount >= 1 && allKeywordsLower.length <= 2)) {
        semanticScore += 40;
        matchType = 'exact_product';
        reasons.push(`产品记录匹配：${displayName}`);
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
    for (const kw of allKeywordsLower) {
      if (kw.length >= 2 && svText.includes(kw)) {
        const sName = sv.service_name || sv.service_category || '';
        if (sName && !matchedServices.includes(sName)) matchedServices.push(sName);
        semanticScore += 18;
        if (matchType === 'profile_match') matchType = 'service_match';
        reasons.push(`服务匹配：${sName}`);
        break;
      }
    }
  }

  // ── Category match ────────────────────────────────────────────────────────
  if (intent.category) {
    const catLower = intent.category.toLowerCase();
    for (const cat of cats) {
      if (cat.toLowerCase() === catLower || cat.toLowerCase().includes(catLower) || catLower.includes(cat.toLowerCase())) {
        matchedCategories.push(cat);
        semanticScore += 25;
        if (matchType === 'profile_match') matchType = 'category_only';
        reasons.push(`品类：${cat}`);
      }
    }
  } else {
    // Keyword-based category scan
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

  // ── Certification match ───────────────────────────────────────────────────
  if (intent.certificationKeyword) {
    const certLower = intent.certificationKeyword.toLowerCase();
    for (const c of certs) {
      if ((c.certification_type ?? '').toLowerCase().includes(certLower)) {
        semanticScore += 30;
        if (matchType === 'profile_match') matchType = 'certification_match';
        reasons.push(`认证：${c.certification_type}`);
        break;
      }
    }
  }

  // ── Supplier name / notes keyword match ───────────────────────────────────
  if (allKeywordsLower.length > 0) {
    for (const kw of allKeywordsLower) {
      if (kw.length >= 2 && nameFull.includes(kw)) {
        semanticScore += 10;
        reasons.push(`名称匹配：${kw}`);
      }
      if (kw.length >= 2 && strengthNotes.includes(kw)) {
        semanticScore += 8;
        reasons.push(`优势描述：${kw}`);
      }
    }
  }

  // ── Country match (additive boost, not a standalone semantic qualifier) ───
  if (intent.country && s.country === intent.country) {
    countryScore = 12;
    reasons.push(`国家：${s.country}`);
  }

  // ── Semantic intent guard ─────────────────────────────────────────────────
  // When the query has a category/cert/keyword intent, a supplier must have at
  // least one semantic match to be included. Country match alone is not enough.
  const hasSemanticIntent = intent.keywords.length > 0 || intent.category || intent.certificationKeyword;
  if (hasSemanticIntent && semanticScore === 0) {
    // Zero out completely — this supplier will be filtered by the caller
    return { score: 0, matchType: 'profile_match', matchReason: '', matchedProducts: [], matchedServices: [], matchedCategories: [] };
  }

  // ── Bonus factors (ranking only, not for inclusion) ───────────────────────
  let bonusScore = 0;
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
    return { score: 0, matchType: 'profile_match', matchReason: '', matchedProducts: [], matchedServices: [], matchedCategories: [] };
  }

  const score = Math.min(100, Math.round(semanticScore + countryScore + bonusScore));
  const matchReason = reasons.slice(0, 3).join('，') || (intent.requiresContact ? '有联系方式' : '档案匹配');

  return { score, matchType, matchReason, matchedProducts, matchedServices, matchedCategories };
}

// ── Completeness score (same 9-item rule as cleanup-summary) ──────────────────
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
    // Extract intent from query
    const intent = extractIntent(query);
    // Allow client-side filter overrides
    if (clientFilters.country) intent.country = clientFilters.country;
    if (clientFilters.category) intent.category = clientFilters.category;
    if (clientFilters.certification) intent.certificationKeyword = clientFilters.certification;
    if (clientFilters.preferredOnly) intent.preferredOnly = true;

    // Build supplier query — active only, required: no archived
    let supplierUrl = '/rest/v1/suppliers?status=eq.active&select=id,supplier_name_display,name_cn,name_en,short_code,supplier_type,country,city,product_categories,is_preferred,current_rating,strength_notes,website&limit=500';
    if (intent.preferredOnly) supplierUrl += '&is_preferred=eq.true';
    if (intent.country) supplierUrl += `&country=eq.${encodeURIComponent(intent.country)}`;

    // Fetch all required data in parallel
    const [suppliers, contacts, certs, quotes, products, services, documents] = await Promise.all([
      supaGet(supplierUrl),
      supaGet('/rest/v1/supplier_contacts?select=supplier_id,full_name,whatsapp,email,is_primary&limit=2000'),
      supaGet('/rest/v1/supplier_certifications?select=supplier_id,certification_type,status,expire_date&limit=2000'),
      supaGet('/rest/v1/supplier_quotes?select=supplier_id,supplier_quote_no,quote_date,currency,total_cost,valid_until,status&limit=1000'),
      supaGet('/rest/v1/supplier_products?select=supplier_id,product_name_cn,product_name_en,specification,material,model,category&status=eq.active&limit=2000').catch(() => []),
      supaGet('/rest/v1/supplier_services?select=supplier_id,service_name,service_category,service_description,coverage_countries&limit=1000').catch(() => []),
      supaGet('/rest/v1/supplier_documents?select=supplier_id,document_type&limit=2000'),
    ]);

    const notes: string[] = [];
    if (!Array.isArray(products) || products.length === 0) {
      notes.push('supplier_products 表暂无产品记录，仅按品类标签、档案信息和关键词匹配。如需精准产品搜索，请在供应商详情中添加产品目录。');
    }

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

    // Score all suppliers
    const scored: any[] = [];
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

      const { score, matchType, matchReason, matchedProducts, matchedServices, matchedCategories } = scoreSupplier(
        s, supContacts, supCerts, supQuotes, supProducts, supServices, intent,
      );

      // If no keywords / filters and no category intent, show all active with minimal scoring
      const hasAnyIntent = intent.keywords.length > 0 || intent.country || intent.category || intent.certificationKeyword || intent.preferredOnly || intent.requiresContact;
      if (hasAnyIntent && score === 0) continue;  // skip zero-score when searching

      const latestQuote = supQuotes.length > 0
        ? supQuotes.sort((a: any, b: any) => (b.quote_date ?? '').localeCompare(a.quote_date ?? ''))[0]
        : null;

      const completeness = calcCompleteness(s, supContacts.length > 0, hasContactMethod, hasBizLicense, hasCatalog, hasCert || hasQuote);

      // Build warnings (safety — no sensitive data)
      const warnings: string[] = [];
      const cats: string[] = Array.isArray(s.product_categories) ? s.product_categories : [];
      if (matchType === 'category_only' && matchedProducts.length === 0) {
        warnings.push('仅按品类标签匹配，暂无具体产品记录，请联系供应商确认是否有该产品');
      }
      if (!primary) warnings.push('暂无联系人，请在供应商档案中补充');
      if (hasCert && supCerts.some((c: any) => c.expire_date && c.expire_date < today)) {
        warnings.push('存在已过期认证，请核实');
      }
      if (cats.length === 0) warnings.push('品类信息未完善，搜索准确度可能受影响');

      scored.push({
        supplierId: s.id,
        supplierName: s.supplier_name_display,
        shortCode: s.short_code,
        matchScore: score,
        matchType,
        matchReason,
        matchedProducts,
        matchedServices,
        matchedCategories,
        country: s.country ?? null,
        city: s.city ?? null,
        supplierType: s.supplier_type ?? null,
        isPreferred: !!s.is_preferred,
        currentRating: s.current_rating ?? null,
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
        detailLink: `/suppliers/${s.id}`,
      });
    }

    // Sort: score DESC, then preferred, then rating
    scored.sort((a, b) => {
      if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
      if (a.isPreferred !== b.isPreferred) return a.isPreferred ? -1 : 1;
      const ratingOrder: Record<string, number> = { A: 4, B: 3, C: 2, D: 1 };
      return (ratingOrder[b.currentRating ?? ''] ?? 0) - (ratingOrder[a.currentRating ?? ''] ?? 0);
    });

    return json({
      ok: true,
      query,
      extractedIntent: intent,
      total: scored.length,
      results: scored,
      notes,
    });

  } catch (err: any) {
    return json({ ok: false, error: err.message ?? 'Unknown error' }, 500);
  }
}
