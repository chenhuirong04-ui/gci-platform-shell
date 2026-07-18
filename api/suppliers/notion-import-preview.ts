// api/suppliers/notion-import-preview.ts
// Reads full Notion supplier database (with pagination) and compares against Supabase
// to classify each record as: new | exists | duplicate_suspect
// Returns preview data only — does NOT write anything.
export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// ── Country / City parser ────────────────────────────────────────────────────
// Uses a country dictionary with aliases; prefers matching from the end of the string.
const COUNTRY_ALIASES: Record<string, string> = {
  // China
  '中国': 'China', '中国大陆': 'China', 'china': 'China', 'cn': 'China', 'prc': 'China',
  // UAE
  'uae': 'UAE', '阿联酋': 'UAE', 'united arab emirates': 'UAE', 'emirates': 'UAE',
  // Hong Kong
  '香港': 'Hong Kong', 'hong kong': 'Hong Kong', 'hk': 'Hong Kong',
  // Taiwan
  '台湾': 'Taiwan', 'taiwan': 'Taiwan', 'tw': 'Taiwan',
  // India
   'india': 'India', '印度': 'India',
  // Pakistan
  'pakistan': 'Pakistan', '巴基斯坦': 'Pakistan',
  // Turkey
  'turkey': 'Turkey', '土耳其': 'Turkey',
  // Vietnam
  'vietnam': 'Vietnam', 'viet nam': 'Vietnam', '越南': 'Vietnam',
  // Malaysia
  'malaysia': 'Malaysia', '马来西亚': 'Malaysia',
  // Italy
  'italy': 'Italy', '意大利': 'Italy',
  // Germany
  'germany': 'Germany', '德国': 'Germany',
  // USA
  'usa': 'USA', 'us': 'USA', 'united states': 'USA', '美国': 'USA',
  // UK
  'uk': 'UK', 'united kingdom': 'UK', 'england': 'UK', '英国': 'UK',
  // Saudi Arabia
  'saudi': 'Saudi Arabia', 'saudi arabia': 'Saudi Arabia', '沙特': 'Saudi Arabia', 'ksa': 'Saudi Arabia',
  // Qatar
  'qatar': 'Qatar', '卡塔尔': 'Qatar',
  // Kuwait
  'kuwait': 'Kuwait', '科威特': 'Kuwait',
  // Bahrain
  'bahrain': 'Bahrain', '巴林': 'Bahrain',
  // Oman
  'oman': 'Oman', '阿曼': 'Oman',
  // Jordan
  'jordan': 'Jordan', '约旦': 'Jordan',
  // Egypt
  'egypt': 'Egypt', '埃及': 'Egypt',
  // Indonesia
  'indonesia': 'Indonesia', '印尼': 'Indonesia',
  // Thailand
  'thailand': 'Thailand', '泰国': 'Thailand',
  // Korea
  'korea': 'South Korea', 'south korea': 'South Korea', '韩国': 'South Korea',
  // Japan
  'japan': 'Japan', '日本': 'Japan',
  // Singapore
  'singapore': 'Singapore', '新加坡': 'Singapore',
  // Spain
  'spain': 'Spain', '西班牙': 'Spain',
  // France
  'france': 'France', '法国': 'France',
  // Portugal
  'portugal': 'Portugal', '葡萄牙': 'Portugal',
  // Netherlands
  'netherlands': 'Netherlands', 'holland': 'Netherlands', '荷兰': 'Netherlands',
};

// Chinese provinces/regions (not countries, not cities to promote)
const CN_PROVINCES = new Set([
  '广东', '浙江', '江苏', '福建', '山东', '湖南', '湖北', '河南', '四川', '辽宁',
  '北京', '上海', '天津', '重庆', '广州', '深圳', '东莞', '佛山', '义乌', '宁波',
  '苏州', '杭州', '厦门', '泉州', '温州', '青岛', '武汉', '成都', '郑州',
]);

interface ParsedLocation {
  country: string | null;
  city: string | null;
  country_city_raw: string;
}

function parseCountryCity(raw: string | null | undefined): ParsedLocation {
  if (!raw || !raw.trim()) {
    return { country: null, city: null, country_city_raw: raw ?? '' };
  }
  const original = raw.trim();
  // Split on common separators
  const parts = original.split(/\s*[,，、\/]\s*/).map(p => p.trim()).filter(Boolean);

  // Try to find a country match in parts, scanning from the end
  let matchedCountry: string | null = null;
  let matchedIdx = -1;
  for (let i = parts.length - 1; i >= 0; i--) {
    const candidate = parts[i].toLowerCase();
    if (COUNTRY_ALIASES[candidate]) {
      matchedCountry = COUNTRY_ALIASES[candidate];
      matchedIdx = i;
      break;
    }
    // Try Chinese province as country hint for China
    if (CN_PROVINCES.has(parts[i])) {
      // Could be a city in China — don't mark as country here, continue looking
    }
  }

  // Also try the entire string (for cases like just "UAE" or "China")
  if (!matchedCountry) {
    const whole = original.toLowerCase().trim();
    if (COUNTRY_ALIASES[whole]) {
      matchedCountry = COUNTRY_ALIASES[whole];
      return { country: matchedCountry, city: null, country_city_raw: original };
    }
  }

  if (!matchedCountry) {
    // Cannot reliably determine; check if only one part and it's a known CN city
    if (parts.length === 1 && CN_PROVINCES.has(parts[0])) {
      return { country: 'China', city: parts[0], country_city_raw: original };
    }
    // Give up — don't guess
    return { country: null, city: null, country_city_raw: original };
  }

  // Build city from remaining parts (excluding the matched country part)
  const cityParts = parts.filter((_, i) => i !== matchedIdx);

  // Special: if matchedCountry is China and there are city parts, use first non-province city
  let city: string | null = null;
  if (cityParts.length > 0) {
    // For China: prefer the most specific part (often first)
    city = cityParts[0];
  }

  // Special case: Dubai → UAE auto-map (Dubai, UAE = country UAE, city Dubai)
  // Already handled by split logic above

  return { country: matchedCountry, city: city || null, country_city_raw: original };
}

// ── WhatsApp / WeChat splitter ───────────────────────────────────────────────
interface ParsedContact {
  whatsapp: string | null;
  wechat: string | null;
}

function splitWhatsAppWeChat(raw: string | null | undefined): ParsedContact {
  if (!raw || !raw.trim()) return { whatsapp: null, wechat: null };
  const val = raw.trim();

  // If contains obvious WeChat patterns
  const wechatPatterns = /微信|wechat|wx[:：\s]/i;
  const whatsappPatterns = /whatsapp|wa[:：\s]|\+\d/i;

  if (wechatPatterns.test(val) && !whatsappPatterns.test(val)) {
    return { whatsapp: null, wechat: val.replace(/微信[:：\s]?|wechat[:：\s]?|wx[:：\s]?/i, '').trim() };
  }
  if (whatsappPatterns.test(val) && !wechatPatterns.test(val)) {
    return { whatsapp: val.replace(/whatsapp[:：\s]?|wa[:：\s]?/i, '').trim(), wechat: null };
  }

  // Starts with + → probably international phone → WhatsApp
  if (val.startsWith('+')) {
    return { whatsapp: val, wechat: null };
  }

  // Pure digits (no spaces, no +) → ambiguous; could be either
  if (/^\d+$/.test(val.replace(/[\s\-]/g, ''))) {
    return { whatsapp: val, wechat: null }; // default to WhatsApp, log raw
  }

  // Contains letters mixed with digits (likely WeChat ID)
  if (/[a-zA-Z]/.test(val) && /\d/.test(val) && !val.startsWith('+')) {
    return { whatsapp: null, wechat: val };
  }

  // Default: treat as WhatsApp
  return { whatsapp: val, wechat: null };
}

// ── Notion helpers ────────────────────────────────────────────────────────────
function getRichText(prop: any): string {
  return prop?.rich_text?.map((r: any) => r.plain_text).join('') ?? '';
}
function getTitle(prop: any): string {
  return prop?.title?.map((r: any) => r.plain_text).join('') ?? '';
}
function getSelect(prop: any): string {
  // status type uses different structure
  return prop?.select?.name ?? prop?.status?.name ?? '';
}
function getMultiSelect(prop: any): string[] {
  return prop?.multi_select?.map((s: any) => s.name) ?? [];
}
function getCheckbox(prop: any): boolean {
  return prop?.checkbox ?? false;
}
// WhatsApp/WeChat field is stored as number in Notion
function getNumber(prop: any): string {
  if (prop?.number == null) return '';
  return String(prop.number);
}
function getFiles(prop: any): Array<{ name: string; url: string }> {
  if (!prop?.files) return [];
  return prop.files.map((f: any) => ({
    name: f.name ?? '',
    url: f.file?.url ?? f.external?.url ?? '',
  }));
}

// ── Supabase helper ──────────────────────────────────────────────────────────
const SUPA_URL = 'https://efrkvwhzpgahjgfukjth.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVmcmt2d2h6cGdhaGpnZnVranRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNTUwNDgsImV4cCI6MjA5NDkzMTA0OH0.i8TGQneIZHTWeJzuzVv-JBiBppaOjYkPbs4E5K73clU';

async function supaGet(path: string): Promise<any[] | null> {
  try {
    const res = await fetch(`${SUPA_URL}${path}`, {
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// ── Name normalization for duplicate detection ────────────────────────────────
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\s\-_.,()（）【】\[\]]/g, '')
    .replace(/有限公司|co\.?,?\s*ltd\.?|limited|llc|inc\.?/gi, '')
    .trim();
}

// ── Main handler ─────────────────────────────────────────────────────────────
export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS });

  const notionToken = process.env.NOTION_TOKEN;
  const notionDbId = process.env.NOTION_SUPPLIER_DB_ID;
  if (!notionToken || !notionDbId) {
    return json({ ok: false, error: 'NOTION_TOKEN or NOTION_SUPPLIER_DB_ID not configured' }, 500);
  }

  // ── 1. Fetch all existing suppliers from Supabase ─────────────────────────
  const existingRaw = await supaGet('/rest/v1/suppliers?select=id,notion_page_id,supplier_name_display,legacy_short_code,website,country&limit=1000');
  if (!existingRaw) return json({ ok: false, error: 'Failed to fetch existing suppliers from Supabase' }, 500);

  const existingByPageId = new Map<string, any>();
  const existingByNormName = new Map<string, any>();
  const existingByCode = new Map<string, any>();
  const existingByWebsite = new Map<string, any>();

  for (const s of existingRaw) {
    if (s.notion_page_id) existingByPageId.set(s.notion_page_id, s);
    if (s.supplier_name_display) existingByNormName.set(normalizeName(s.supplier_name_display), s);
    if (s.legacy_short_code) existingByCode.set(s.legacy_short_code.toLowerCase(), s);
    if (s.website) existingByWebsite.set(s.website.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, ''), s);
  }

  // ── 2. Fetch all Notion pages (full pagination) ───────────────────────────
  const notionPages: any[] = [];
  let cursor: string | null = null;
  let pageCount = 0;
  const MAX_PAGES = 20; // safety: 20 × 100 = 2000 records

  do {
    const body: any = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;

    let notionRes: Response;
    try {
      notionRes = await fetch(`https://api.notion.com/v1/databases/${notionDbId}/query`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${notionToken}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (e: any) {
      return json({ ok: false, error: `Notion fetch error: ${e?.message}` }, 502);
    }

    if (!notionRes.ok) {
      const errText = await notionRes.text().catch(() => '');
      return json({ ok: false, error: `Notion API error ${notionRes.status}: ${errText.slice(0, 300)}` }, 502);
    }

    const notionData: any = await notionRes.json();
    notionPages.push(...(notionData.results ?? []));
    cursor = notionData.has_more ? notionData.next_cursor : null;
    pageCount++;
  } while (cursor && pageCount < MAX_PAGES);

  // ── 3. Classify each page ─────────────────────────────────────────────────
  const items: any[] = [];

  for (const page of notionPages) {
    const props = page.properties ?? {};
    const pageId = page.id as string;

    const name = getTitle(props['Supplier name'] ?? props['Name'] ?? props['名称'] ?? props['供应商名称']);
    if (!name) continue; // skip nameless records

    const supplierCode = getRichText(props['Supplier Code（供应商编码）'] ?? props['Supplier Code'] ?? props['代码'] ?? props['编码']);
    const countryRaw = getRichText(props['Country / City'] ?? props['Country'] ?? props['国家/城市'] ?? props['国家城市']);
    const loc = parseCountryCity(countryRaw);
    // WhatsApp/WeChat is stored as a number field in this database
    const whatsappNum = getNumber(props['WhatsApp / WeChat']);
    const whatsappRaw = whatsappNum || getRichText(props['WhatsApp / WeChat'] ?? props['WhatsApp'] ?? props['WeChat'] ?? props['联系方式']);
    const contact = splitWhatsAppWeChat(whatsappRaw);
    const supplierType = getSelect(props['Supplier Type（供应商类型）'] ?? props['Supplier Type'] ?? props['类型']);
    const categories = getMultiSelect(props['Product Categories（供应品类）'] ?? props['Product Categories'] ?? props['品类'] ?? props['产品品类']);
    const isPreferred = getCheckbox(props['常用(Yes/No)'] ?? props['常用'] ?? props['Preferred']);
    const status = getSelect(props['状态'] ?? props['Status']) || 'under_review';
    const strengthNotes = getRichText(props['Strength / Notes'] ?? props['优势'] ?? props['备注']);
    const contactPerson = getRichText(props['Contact Person（联系人）'] ?? props['Contact Person'] ?? props['联系人']);
    const email = getRichText(props['电子邮件'] ?? props['Email'] ?? props['邮件']);
    const certifications = getMultiSelect(props['Certificates'] ?? props['认证'] ?? props['证书']);
    const attachments = getFiles(props['简介/产品目录'] ?? props['Attachment'] ?? props['附件'] ?? props['文件']);
    const websiteRaw = getRichText(props['Website'] ?? props['网站']);

    // Idempotency check
    const existingByPage = existingByPageId.get(pageId);
    if (existingByPage) {
      items.push({
        notionPageId: pageId,
        name,
        supplierCode,
        supplierType,
        country: loc.country,
        city: loc.city,
        countryRaw: loc.country_city_raw,
        categories,
        isPreferred,
        status,
        contactName: contactPerson,
        contactRaw: whatsappRaw,
        whatsapp: contact.whatsapp,
        wechat: contact.wechat,
        email,
        website: websiteRaw,
        strengthNotes,
        certificates: certifications,
        attachmentCount: attachments.length,
        // Do not pass attachment URLs to frontend — they are signed/temporary
        importStatus: 'exists' as const,
        existingSupplierId: existingByPage.id,
        duplicateReason: null,
      });
      continue;
    }

    // Duplicate detection
    const normName = normalizeName(name);
    let isDuplicate = false;
    let duplicateReason = '';
    let dupSupplierId: string | undefined;

    if (existingByNormName.has(normName)) {
      isDuplicate = true;
      duplicateReason = '名称相似';
      dupSupplierId = existingByNormName.get(normName)?.id;
    } else if (supplierCode && existingByCode.has(supplierCode.toLowerCase())) {
      isDuplicate = true;
      duplicateReason = '供应商编码相同';
      dupSupplierId = existingByCode.get(supplierCode.toLowerCase())?.id;
    } else if (websiteRaw) {
      const cleanWebsite = websiteRaw.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
      if (existingByWebsite.has(cleanWebsite)) {
        isDuplicate = true;
        duplicateReason = '网站相同';
        dupSupplierId = existingByWebsite.get(cleanWebsite)?.id;
      }
    }

    items.push({
      notionPageId: pageId,
      name,
      supplierCode,
      supplierType,
      country: loc.country,
      city: loc.city,
      countryRaw: loc.country_city_raw,
      categories,
      isPreferred,
      status,
      contactName: contactPerson,
      contactRaw: whatsappRaw,
      whatsapp: contact.whatsapp,
      wechat: contact.wechat,
      email,
      website: websiteRaw,
      strengthNotes,
      certificates: certifications,
      attachmentCount: attachments.length,
      importStatus: isDuplicate ? ('duplicate_suspect' as const) : ('new' as const),
      duplicateReason: isDuplicate ? duplicateReason : null,
      existingSupplierId: dupSupplierId,
    });
  }

  const stats = {
    total: items.length,
    toCreate: items.filter(i => i.importStatus === 'new').length,
    alreadyExists: items.filter(i => i.importStatus === 'exists').length,
    suspectDuplicate: items.filter(i => i.importStatus === 'duplicate_suspect').length,
    missingName: notionPages.length - items.length, // skipped due to missing name
    missingContact: items.filter(i => !i.whatsapp && !i.wechat && !i.email).length,
    missingCategory: items.filter(i => i.categories.length === 0).length,
    hasAttachments: items.filter(i => i.attachmentCount > 0).length,
    hasCertificates: items.filter(i => i.certificates.length > 0).length,
  };

  return json({ ok: true, stats, items, paginationPages: pageCount });
}
