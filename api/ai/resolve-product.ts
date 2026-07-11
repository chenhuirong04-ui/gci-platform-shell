// /api/ai/resolve-product
// Server-side product resolver: fetches compact catalog from Notion + Supabase,
// then asks OpenAI to map a natural-language query to exact product names in the DB.
// Returns matched product names (exact strings from the DB) for deterministic filtering.
// Never returns prices, costs, or financial data to OpenAI.
export const config = { runtime: 'edge' };

const NOTION_INVENTORY_DB = '2c6d0b13b3b9806db227fc01f723bc40';
const NOTION_BASE = 'https://api.notion.com/v1';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

interface CatalogItem {
  name: string;
  sku?: string;
  category?: string;
  source: 'notion' | 'consignment';
}

export interface ResolveResult {
  ok: boolean;
  queryType: 'full_inventory' | 'specific_product';
  matchedProducts: string[];
  brand?: string | null;
  category?: string | null;
  size?: string | null;
  sku?: string | null;
  keywords: string[];
  confidence: number;
  ambiguous: boolean;
  error?: string;
}

// ── Notion catalog fetch ────────────────────────────────────────────────────
// Fetches product identity fields only (name, SKU, category). No qty/price.
async function fetchNotionCatalog(token: string): Promise<CatalogItem[]> {
  const headers = {
    Authorization: `Bearer ${token}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
  };

  // Fetch schema to detect field names
  const schemaRes = await fetch(`${NOTION_BASE}/databases/${NOTION_INVENTORY_DB}`, { headers });
  if (!schemaRes.ok) return [];
  const schema = await schemaRes.json();
  const props: Record<string, any> = schema.properties || {};

  const findField = (cands: string[]) => {
    for (const c of cands) if (props[c] !== undefined) return c;
    return null;
  };

  const nameField = findField(['名称', '产品名称', 'Name', 'Product Name', '品名']);
  const skuField  = findField(['SKU', 'sku', '货号', '编号', '型号', 'Item Code']);
  const catField  = findField(['分类', '类别', '品类', 'Category', '产品分类']);

  // Paginate pages — up to 200 products
  const items: CatalogItem[] = [];
  let cursor: string | undefined;
  let loops = 0;
  do {
    const body: any = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const res = await fetch(`${NOTION_BASE}/databases/${NOTION_INVENTORY_DB}/query`, {
      method: 'POST', headers, body: JSON.stringify(body),
    });
    if (!res.ok) break;
    const data = await res.json();
    for (const page of data.results || []) {
      const np = page.properties;
      // Extract title
      const titleProp = nameField && np[nameField];
      const name = titleProp?.type === 'title'
        ? (titleProp.title || []).map((t: any) => t.plain_text || '').join('').trim()
        : '';
      if (!name) continue;
      // Extract SKU
      const skuProp = skuField && np[skuField];
      const sku = skuProp
        ? (skuProp.rich_text || []).map((t: any) => t.plain_text || '').join('').trim() || undefined
        : undefined;
      // Extract category
      const catProp = catField && np[catField];
      const category = catProp?.type === 'select'
        ? (catProp.select?.name || undefined)
        : catProp?.type === 'multi_select'
        ? (catProp.multi_select || []).map((s: any) => s.name).join(', ') || undefined
        : undefined;
      items.push({ name, sku: sku || undefined, category: category || undefined, source: 'notion' });
    }
    cursor = data.has_more ? data.next_cursor : undefined;
    loops++;
    if (loops >= 2) break; // max 200 rows for catalog
  } while (cursor);

  return items;
}

// ── Supabase consignment catalog fetch ─────────────────────────────────────
async function fetchConsignmentCatalog(supaUrl: string, supaKey: string): Promise<CatalogItem[]> {
  const url = `${supaUrl}/rest/v1/consignment_stock?select=payload&state=eq.active&limit=300`;
  const res = await fetch(url, {
    headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) return [];
  const rows: { payload: { productName?: string } }[] = await res.json();
  const seen = new Set<string>();
  const items: CatalogItem[] = [];
  for (const r of rows) {
    const name = r.payload?.productName?.trim();
    if (name && !seen.has(name)) {
      seen.add(name);
      items.push({ name, source: 'consignment' });
    }
  }
  return items;
}

// ── Merge catalogs, deduplicate by name ────────────────────────────────────
function mergeCatalogs(a: CatalogItem[], b: CatalogItem[]): CatalogItem[] {
  const seen = new Set<string>();
  const result: CatalogItem[] = [];
  for (const item of [...a, ...b]) {
    const key = item.name.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}

// ── OpenAI product resolution ───────────────────────────────────────────────
interface AIParseResult {
  queryType: 'full_inventory' | 'specific_product';
  brand: string | null;
  category: string | null;
  size: string | null;
  sku: string | null;
  keywords: string[];
  matchedProductIndices: number[]; // 1-indexed into catalog list
  confidence: number;
}

async function callOpenAI(query: string, catalog: CatalogItem[], apiKey: string): Promise<AIParseResult | null> {
  const catalogLines = catalog
    .map((p, i) => {
      let line = `${i + 1}. ${p.name}`;
      if (p.sku) line += ` [${p.sku}]`;
      if (p.category) line += ` (${p.category})`;
      return line;
    })
    .join('\n');

  const systemPrompt = `You are a product identifier for a B2B inventory system.
You will be given a list of products in our inventory database and a user query in Chinese, English, or mixed.
Your job is to identify which product(s) the user is asking about.

Return ONLY valid JSON, no markdown, no explanations.`;

  const userPrompt = `Available inventory products:
${catalogLines}

User query: "${query}"

Analyze and return JSON:
{
  "queryType": "full_inventory" or "specific_product",
  "brand": "brand name or null",
  "category": "product category or null",
  "size": "size code like M/L/XL/S/XXL or null",
  "sku": "exact SKU if mentioned or null",
  "keywords": ["keyword1", "keyword2"],
  "matchedProductIndices": [1, 2],
  "confidence": 0.0
}

Rules:
- queryType="full_inventory" ONLY when user asks for all stock with NO specific product (e.g. "查库存" / "现在有多少库存" / "库存情况")
- queryType="specific_product" when user mentions any product, brand, size, or SKU
- matchedProductIndices: 1-indexed positions from the list above. Include all products that match the query.
- Treat "monihappy" / "MoniHappy" / "Moni Happy" as the same brand
- Treat "纸尿裤" and "婴儿纸尿裤" as the same product category
- Size "M码" = "M", "L码" = "L"
- If SKU is explicitly mentioned (e.g. HHS-HYG-0010), set sku field and match by SKU
- confidence: 0.9+ if you found clear matches, 0.6-0.89 if unsure, below 0.5 if no match
- If no product matches, set matchedProductIndices=[] and confidence<0.5
- keywords should help identify the product (brand + category + size), not instruction words`;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 400,
        temperature: 0,
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) return null;
    const data = await res.json() as any;
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return null;
    return JSON.parse(content) as AIParseResult;
  } catch {
    return null;
  }
}

// ── Regex-based fallback (no OpenAI) ───────────────────────────────────────
// Used when OPENAI_API_KEY is not set.
function regexFallback(query: string, catalog: CatalogItem[]): ResolveResult {
  // Check if this is a full-inventory query (no specific product mentioned)
  const FULL_INV_RE = /^(?:查|看|查看|查询|查一下)?(?:一下\s*)?(?:当前|现在|目前|所有|全部)?\s*(?:的)?\s*库存(?:情况|列表|数量|水位)?$/;
  if (FULL_INV_RE.test(query.trim().replace(/[？?。！!，,]/g, ''))) {
    return { ok: true, queryType: 'full_inventory', matchedProducts: [], keywords: [], confidence: 1, ambiguous: false };
  }

  // Strip noise words to get product keywords
  let s = query
    .replace(/[？?。！!，,、；;：:""''「」【】]/g, ' ')
    .replace(/^(?:帮我|请帮我|帮|请)\s*/u, '')
    .replace(/^(?:查询|查看|查一下|查|看一下|看|搜索|搜)\s*/u, '')
    .replace(/^(?:现在|目前|今天|最近|当前)\s*/u, '');

  for (let i = 0; i < 2; i++) {
    s = s
      .replace(/\s*(?:还有多少|剩多少|有多少|有没有货|是否有货|能不能出货|有货吗|有多少货|还有货)\s*$/u, '')
      .replace(/\s*(?:库存多少|库存怎么样|库存如何|库存情况|库存数量|的库存|库存|stock|inventory)\s*$/iu, '')
      .trim();
  }

  s = s.replace(/\bmonihappy\b/gi, 'Moni Happy')
       .replace(/([A-Za-z0-9])([一-鿿])/g, '$1 $2')
       .replace(/([一-鿿])([A-Za-z0-9])/g, '$1 $2')
       .replace(/\s+/g, ' ').trim();

  if (!s) return { ok: true, queryType: 'full_inventory', matchedProducts: [], keywords: [], confidence: 1, ambiguous: false };

  const tokens = s.toLowerCase().split(/\s+/).filter(t => t.length >= 1);
  const matched = catalog.filter(p => {
    const text = [p.name, p.sku, p.category].filter(Boolean).join(' ').toLowerCase();
    return tokens.every(t => text.includes(t));
  }).map(p => p.name);

  return {
    ok: true,
    queryType: 'specific_product',
    matchedProducts: matched,
    keywords: tokens,
    confidence: matched.length > 0 ? 0.7 : 0.3,
    ambiguous: matched.length > 3,
  };
}

// ── Handler ─────────────────────────────────────────────────────────────────
export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS });
  if (request.method !== 'GET') return json({ ok: false, error: 'method_not_allowed' }, 405);

  const q = new URL(request.url).searchParams.get('q')?.trim();
  if (!q) return json({ ok: false, error: 'Missing required parameter: q' }, 400);

  const openaiKey  = process.env.OPENAI_API_KEY;
  const notionToken = process.env.NOTION_TOKEN;
  const supaUrl    = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supaKey    = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  // Fetch compact catalog from both sources in parallel
  const [notionCatalog, supabaseCatalog] = await Promise.allSettled([
    notionToken ? fetchNotionCatalog(notionToken) : Promise.resolve([] as CatalogItem[]),
    (supaUrl && supaKey) ? fetchConsignmentCatalog(supaUrl, supaKey) : Promise.resolve([] as CatalogItem[]),
  ]);

  const catalog = mergeCatalogs(
    notionCatalog.status === 'fulfilled' ? notionCatalog.value : [],
    supabaseCatalog.status === 'fulfilled' ? supabaseCatalog.value : [],
  );

  // No OpenAI key → regex fallback
  if (!openaiKey) {
    return json(regexFallback(q, catalog));
  }

  // AI resolution
  const aiResult = await callOpenAI(q, catalog, openaiKey);

  if (!aiResult) {
    // OpenAI failed — fall back to regex
    return json(regexFallback(q, catalog));
  }

  if (aiResult.queryType === 'full_inventory') {
    return json<ResolveResult>({
      ok: true,
      queryType: 'full_inventory',
      matchedProducts: [],
      keywords: aiResult.keywords || [],
      confidence: 1,
      ambiguous: false,
    });
  }

  // Map matched indices back to exact product names
  const matched: string[] = [];
  const indices: number[] = Array.isArray(aiResult.matchedProductIndices) ? aiResult.matchedProductIndices : [];
  for (const idx of indices) {
    const item = catalog[idx - 1]; // 1-indexed
    if (item) matched.push(item.name);
  }

  // If AI found no index matches but gave keywords, try keyword matching as fallback
  if (matched.length === 0 && aiResult.keywords?.length > 0) {
    const tokens = aiResult.keywords.map(k => k.toLowerCase());
    for (const item of catalog) {
      const text = [item.name, item.sku, item.category].filter(Boolean).join(' ').toLowerCase();
      if (tokens.every(t => text.includes(t))) {
        matched.push(item.name);
      }
    }
  }

  // SKU exact match
  if (matched.length === 0 && aiResult.sku) {
    const skuLower = aiResult.sku.toLowerCase();
    for (const item of catalog) {
      if (item.sku?.toLowerCase() === skuLower) matched.push(item.name);
    }
  }

  return json<ResolveResult>({
    ok: true,
    queryType: 'specific_product',
    matchedProducts: matched,
    brand: aiResult.brand ?? null,
    category: aiResult.category ?? null,
    size: aiResult.size ?? null,
    sku: aiResult.sku ?? null,
    keywords: aiResult.keywords || [],
    confidence: aiResult.confidence ?? 0.5,
    ambiguous: matched.length > 3,
  });
}
