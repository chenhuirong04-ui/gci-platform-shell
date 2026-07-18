// api/suppliers/notion-import-execute.ts
// Imports a batch of up to 5 Notion supplier pages into Supabase.
// Re-fetches each page from Notion server-side; does NOT trust frontend field values.
// Returns per-record results for the frontend to merge into a running report.
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

// ── Shared helpers (duplicated from preview to keep Edge bundle independent) ─

const COUNTRY_ALIASES: Record<string, string> = {
  '中国': 'China', '中国大陆': 'China', 'china': 'China', 'cn': 'China', 'prc': 'China',
  'uae': 'UAE', '阿联酋': 'UAE', 'united arab emirates': 'UAE', 'emirates': 'UAE',
  '香港': 'Hong Kong', 'hong kong': 'Hong Kong', 'hk': 'Hong Kong',
  '台湾': 'Taiwan', 'taiwan': 'Taiwan', 'tw': 'Taiwan',
  'india': 'India', '印度': 'India',
  'pakistan': 'Pakistan', '巴基斯坦': 'Pakistan',
  'turkey': 'Turkey', '土耳其': 'Turkey',
  'vietnam': 'Vietnam', 'viet nam': 'Vietnam', '越南': 'Vietnam',
  'malaysia': 'Malaysia', '马来西亚': 'Malaysia',
  'italy': 'Italy', '意大利': 'Italy',
  'germany': 'Germany', '德国': 'Germany',
  'usa': 'USA', 'us': 'USA', 'united states': 'USA', '美国': 'USA',
  'uk': 'UK', 'united kingdom': 'UK', 'england': 'UK', '英国': 'UK',
  'saudi': 'Saudi Arabia', 'saudi arabia': 'Saudi Arabia', '沙特': 'Saudi Arabia', 'ksa': 'Saudi Arabia',
  'qatar': 'Qatar', '卡塔尔': 'Qatar',
  'kuwait': 'Kuwait', '科威特': 'Kuwait',
  'bahrain': 'Bahrain', '巴林': 'Bahrain',
  'oman': 'Oman', '阿曼': 'Oman',
  'jordan': 'Jordan', '约旦': 'Jordan',
  'egypt': 'Egypt', '埃及': 'Egypt',
  'indonesia': 'Indonesia', '印尼': 'Indonesia',
  'thailand': 'Thailand', '泰国': 'Thailand',
  'korea': 'South Korea', 'south korea': 'South Korea', '韩国': 'South Korea',
  'japan': 'Japan', '日本': 'Japan',
  'singapore': 'Singapore', '新加坡': 'Singapore',
  'spain': 'Spain', '西班牙': 'Spain',
  'france': 'France', '法国': 'France',
  'portugal': 'Portugal', '葡萄牙': 'Portugal',
  'netherlands': 'Netherlands', 'holland': 'Netherlands', '荷兰': 'Netherlands',
};

const CN_PROVINCES = new Set([
  '广东', '浙江', '江苏', '福建', '山东', '湖南', '湖北', '河南', '四川', '辽宁',
  '北京', '上海', '天津', '重庆', '广州', '深圳', '东莞', '佛山', '义乌', '宁波',
  '苏州', '杭州', '厦门', '泉州', '温州', '青岛', '武汉', '成都', '郑州',
]);

function parseCountryCity(raw: string | null | undefined) {
  if (!raw?.trim()) return { country: null, city: null, country_city_raw: raw ?? '' };
  const original = raw.trim();

  const wholeClean = original.toLowerCase().replace(/[()（）]/g, '').trim();
  if (COUNTRY_ALIASES[wholeClean]) return { country: COUNTRY_ALIASES[wholeClean], city: null, country_city_raw: original };

  const stripped = original.replace(/\s*\([^)]*\)/g, '').trim();
  const parts = stripped.split(/\s*[,，、\/]\s*/).map(p => p.trim()).filter(Boolean);

  let matchedCountry: string | null = null;
  let matchedIdx = -1;

  for (let i = parts.length - 1; i >= 0; i--) {
    const candidate = parts[i].toLowerCase().replace(/[^a-z一-鿿]/g, '');
    if (COUNTRY_ALIASES[candidate] || COUNTRY_ALIASES[parts[i].toLowerCase()]) {
      matchedCountry = COUNTRY_ALIASES[candidate] ?? COUNTRY_ALIASES[parts[i].toLowerCase()];
      matchedIdx = i;
      break;
    }
  }

  if (!matchedCountry) {
    for (let i = parts.length - 1; i >= 0; i--) {
      if (parts[i] === '中国' || parts[i].toLowerCase() === 'china') {
        matchedCountry = 'China'; matchedIdx = i; break;
      }
    }
  }

  if (!matchedCountry) {
    if (parts.length === 1 && CN_PROVINCES.has(parts[0])) {
      return { country: 'China', city: parts[0], country_city_raw: original };
    }
    return { country: null, city: null, country_city_raw: original };
  }

  const nonCountryParts = parts.filter((_, i) => i !== matchedIdx);
  return { country: matchedCountry, city: nonCountryParts[0] ?? null, country_city_raw: original };
}

function splitWhatsAppWeChat(raw: string | null | undefined) {
  if (!raw?.trim()) return { whatsapp: null, wechat: null };
  const val = raw.trim();
  if (/微信|wechat|wx[:：\s]/i.test(val) && !/whatsapp|wa[:：\s]|\+\d/i.test(val)) {
    return { whatsapp: null, wechat: val.replace(/微信[:：\s]?|wechat[:：\s]?|wx[:：\s]?/i, '').trim() };
  }
  if (/whatsapp|wa[:：\s]|\+\d/i.test(val) && !/微信|wechat|wx[:：\s]/i.test(val)) {
    return { whatsapp: val.replace(/whatsapp[:：\s]?|wa[:：\s]?/i, '').trim(), wechat: null };
  }
  if (val.startsWith('+')) return { whatsapp: val, wechat: null };
  if (/[a-zA-Z]/.test(val) && /\d/.test(val) && !val.startsWith('+')) return { whatsapp: null, wechat: val };
  return { whatsapp: val, wechat: null };
}

function getRichText(prop: any): string {
  return prop?.rich_text?.map((r: any) => r.plain_text).join('') ?? '';
}
function getTitle(prop: any): string {
  return prop?.title?.map((r: any) => r.plain_text).join('') ?? '';
}
function getSelect(prop: any): string {
  return prop?.select?.name ?? prop?.status?.name ?? '';
}
function getMultiSelect(prop: any): string[] {
  return prop?.multi_select?.map((s: any) => s.name) ?? [];
}
function getCheckbox(prop: any): boolean {
  return prop?.checkbox ?? false;
}
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

// ── Supabase helpers ─────────────────────────────────────────────────────────
const SUPA_URL = 'https://efrkvwhzpgahjgfukjth.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVmcmt2d2h6cGdhaGpnZnVranRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNTUwNDgsImV4cCI6MjA5NDkzMTA0OH0.i8TGQneIZHTWeJzuzVv-JBiBppaOjYkPbs4E5K73clU';

async function supaPost(path: string, body: any): Promise<any | null> {
  try {
    const res = await fetch(`${SUPA_URL}${path}`, {
      method: 'POST',
      headers: {
        apikey: SUPA_KEY,
        Authorization: `Bearer ${SUPA_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.error('[notion-import-execute] supabase error', res.status, txt.slice(0, 200));
      return null;
    }
    const rows = await res.json().catch(() => null);
    return Array.isArray(rows) ? rows[0] : rows;
  } catch (e) {
    console.error('[notion-import-execute] supabase exception', e);
    return null;
  }
}

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

// ── short_code generator with retry on unique conflict ────────────────────────
async function generateShortCode(): Promise<string | null> {
  // Find current max SUP-AUTO-XXXXXX
  const rows = await supaGet(
    `/rest/v1/suppliers?short_code=like.SUP-AUTO-*&select=short_code&order=short_code.desc&limit=1`,
  );
  let seq = 1;
  if (rows && rows.length > 0) {
    const last = rows[0].short_code as string;
    const match = last.match(/SUP-AUTO-(\d+)/);
    if (match) seq = parseInt(match[1], 10) + 1;
  }

  // Try up to 5 increments to handle concurrent inserts
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = `SUP-AUTO-${String(seq + attempt).padStart(6, '0')}`;
    // Check if it already exists
    const check = await supaGet(`/rest/v1/suppliers?short_code=eq.${encodeURIComponent(code)}&select=id&limit=1`);
    if (check && check.length === 0) return code;
  }
  return null;
}

// ── Notion page fetch ────────────────────────────────────────────────────────
async function fetchNotionPage(pageId: string, token: string): Promise<any | null> {
  try {
    const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
      },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// ── Status mapping ────────────────────────────────────────────────────────────
function mapStatus(notionStatus: string): string {
  const map: Record<string, string> = {
    '活跃': 'active', 'active': 'active', '正常': 'active',
    '停用': 'inactive', 'inactive': 'inactive',
    '黑名单': 'blacklisted', 'blacklisted': 'blacklisted',
    '审核中': 'under_review', 'under review': 'under_review', 'under_review': 'under_review',
    '封存': 'archived', 'archived': 'archived',
  };
  return map[notionStatus.toLowerCase()] ?? map[notionStatus] ?? 'under_review';
}

// ── Process one Notion page → write to Supabase ──────────────────────────────
interface ImportItemInput {
  pageId: string;
  duplicateAction: 'create_new' | 'skip';
}

interface ImportResult {
  notionPageId: string;
  supplierName: string;
  supplierId?: string;
  result: 'created' | 'skipped' | 'failed';
  error?: string;
  warnings: string[];
  contactsCreated: number;
  certsCreated: number;
  docsCreated: number;
  docsFailedDownload: number;
}

async function processOnePage(
  item: ImportItemInput,
  token: string,
): Promise<ImportResult> {
  const warnings: string[] = [];
  const result: ImportResult = {
    notionPageId: item.pageId,
    supplierName: '',
    result: 'failed',
    warnings,
    contactsCreated: 0,
    certsCreated: 0,
    docsCreated: 0,
    docsFailedDownload: 0,
  };

  // 1. Re-fetch from Notion (server-side, trusted)
  const page = await fetchNotionPage(item.pageId, token);
  if (!page) {
    result.error = 'Failed to fetch Notion page';
    return result;
  }

  const props = page.properties ?? {};
  const name = getTitle(props['Supplier name'] ?? props['Name'] ?? props['名称'] ?? props['供应商名称']);
  if (!name) {
    result.error = 'Notion page has no supplier name';
    return result;
  }
  result.supplierName = name;

  // 2. Idempotency check (server-side)
  const existCheck = await supaGet(
    `/rest/v1/suppliers?notion_page_id=eq.${encodeURIComponent(item.pageId)}&select=id&limit=1`,
  );
  if (existCheck && existCheck.length > 0) {
    result.result = 'skipped';
    result.supplierId = existCheck[0].id;
    warnings.push('已存在（notion_page_id 匹配），已跳过');
    return result;
  }

  if (item.duplicateAction === 'skip') {
    result.result = 'skipped';
    warnings.push('用户选择跳过疑似重复记录');
    return result;
  }

  // 3. Parse fields
  const supplierCode = getRichText(props['Supplier Code（供应商编码）'] ?? props['Supplier Code'] ?? props['代码'] ?? props['编码']);
  const countryRaw = getRichText(props['Country / City'] ?? props['Country'] ?? props['国家/城市'] ?? props['国家城市']);
  const loc = parseCountryCity(countryRaw);
  const whatsappNum = getNumber(props['WhatsApp / WeChat']);
  const whatsappRaw = whatsappNum || getRichText(props['WhatsApp / WeChat'] ?? props['WhatsApp'] ?? props['WeChat'] ?? props['联系方式']);
  const contactSplit = splitWhatsAppWeChat(whatsappRaw);
  const supplierType = getSelect(props['Supplier Type（供应商类型）'] ?? props['Supplier Type'] ?? props['类型']) || 'Unknown';
  const categories = getMultiSelect(props['Product Categories（供应品类）'] ?? props['Product Categories'] ?? props['品类'] ?? props['产品品类']);
  const isPreferred = getCheckbox(props['常用(Yes/No)'] ?? props['常用'] ?? props['Preferred']);
  const status = mapStatus(getSelect(props['状态'] ?? props['Status']));
  const strengthNotes = getRichText(props['Strength / Notes'] ?? props['优势'] ?? props['备注']);
  const contactPerson = getRichText(props['Contact Person（联系人）'] ?? props['Contact Person'] ?? props['联系人']);
  const email = getRichText(props['电子邮件'] ?? props['Email'] ?? props['邮件']);
  const certifications = getMultiSelect(props['Certificates'] ?? props['认证'] ?? props['证书']);
  const attachments = getFiles(props['简介/产品目录'] ?? props['Attachment'] ?? props['附件'] ?? props['文件']);
  const websiteRaw = getRichText(props['Website'] ?? props['网站']);

  // 4. Generate short_code
  const shortCode = await generateShortCode();
  if (!shortCode) {
    result.error = 'Failed to generate unique short_code';
    return result;
  }

  // 5. Create supplier
  const supplierPayload: any = {
    short_code: shortCode,
    legacy_short_code: supplierCode || null,
    supplier_name_display: name,
    supplier_type: supplierType,
    product_categories: categories.length > 0 ? categories : null,
    country: loc.country,
    city: loc.city,
    country_city_raw: loc.country_city_raw || null,
    is_preferred: isPreferred,
    status,
    website: websiteRaw || null,
    strength_notes: strengthNotes || null,
    import_source: 'notion',
    notion_page_id: item.pageId,
    notion_page_url: page.url ?? null,
    imported_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const supplier = await supaPost('/rest/v1/suppliers', supplierPayload);
  if (!supplier?.id) {
    result.error = 'Failed to insert supplier record';
    return result;
  }
  result.supplierId = supplier.id;

  // 6. Create primary contact (if any contact info exists)
  if (contactPerson || contactSplit.whatsapp || contactSplit.wechat || email) {
    const contactPayload: any = {
      supplier_id: supplier.id,
      full_name: contactPerson || name,
      whatsapp: contactSplit.whatsapp,
      wechat: contactSplit.wechat,
      email: email || null,
      is_primary: true,
      notes: whatsappRaw && !contactSplit.whatsapp && !contactSplit.wechat
        ? `原始联系方式：${whatsappRaw}` : null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const contact = await supaPost('/rest/v1/supplier_contacts', contactPayload);
    if (contact?.id) result.contactsCreated++;
    else warnings.push('联系人记录创建失败');
  }

  // 7. Create certifications
  for (const certName of certifications) {
    const certPayload = {
      supplier_id: supplier.id,
      certification_type: certName,
      status: 'pending_verification',
      verification_status: 'unverified',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const cert = await supaPost('/rest/v1/supplier_certifications', certPayload);
    if (cert?.id) result.certsCreated++;
    else warnings.push(`认证记录创建失败：${certName}`);
  }

  // 8. Create document records for attachments (best-effort; failure does not block)
  for (const att of attachments) {
    const isGoogleDrive = att.url.includes('drive.google.com') || att.url.includes('docs.google.com');
    const isExternal = isGoogleDrive || !att.url.startsWith('https://');

    const docPayload: any = {
      supplier_id: supplier.id,
      document_type: '公司简介',
      document_name: att.name || '附件',
      file_url: isExternal ? att.url : null,
      storage_path: null,
      storage_bucket: null,
      verification_status: isExternal ? 'pending_reupload' : 'unverified',
      notes: isExternal ? `原始链接（Google Drive 或外部）：${att.url}` : null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (!isExternal && att.url) {
      // Attempt to download and upload to Supabase Storage
      try {
        const dlRes = await fetch(att.url, { signal: AbortSignal.timeout(15000) });
        if (dlRes.ok) {
          const buf = await dlRes.arrayBuffer();
          const safeName = att.name.replace(/[^a-zA-Z0-9._-]/g, '_');
          const storagePath = `suppliers/${supplier.id}/${Date.now()}-${safeName}`;
          const uploadRes = await fetch(
            `${SUPA_URL}/storage/v1/object/suppliers-private/${storagePath}`,
            {
              method: 'POST',
              headers: {
                apikey: SUPA_KEY,
                Authorization: `Bearer ${SUPA_KEY}`,
                'Content-Type': dlRes.headers.get('Content-Type') || 'application/octet-stream',
                'x-upsert': 'true',
              },
              body: buf,
            },
          );
          if (uploadRes.ok) {
            docPayload.storage_path = storagePath;
            docPayload.storage_bucket = 'suppliers-private';
            docPayload.file_url = null;
            docPayload.verification_status = 'unverified';
            docPayload.notes = null;
          } else {
            result.docsFailedDownload++;
            docPayload.file_url = att.url;
            docPayload.verification_status = 'pending_reupload';
            docPayload.notes = `上传失败（${uploadRes.status}），已保留原始链接`;
          }
        } else {
          result.docsFailedDownload++;
          docPayload.file_url = att.url;
          docPayload.verification_status = 'pending_reupload';
          docPayload.notes = `下载失败（${dlRes.status}），已保留原始链接`;
        }
      } catch {
        result.docsFailedDownload++;
        docPayload.file_url = att.url;
        docPayload.verification_status = 'pending_reupload';
        docPayload.notes = '下载超时，已保留原始链接';
      }
    } else {
      result.docsFailedDownload++;
    }

    const doc = await supaPost('/rest/v1/supplier_documents', docPayload);
    if (doc?.id) result.docsCreated++;
    else warnings.push(`文件记录创建失败：${att.name}`);
  }

  result.result = 'created';
  return result;
}

// ── Main handler ─────────────────────────────────────────────────────────────
export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);

  const notionToken = process.env.NOTION_TOKEN;
  if (!notionToken) return json({ ok: false, error: 'NOTION_TOKEN not configured' }, 500);

  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, error: 'Invalid JSON' }, 400); }

  const items: ImportItemInput[] = body?.items ?? [];
  if (!Array.isArray(items) || items.length === 0) {
    return json({ ok: false, error: 'items array is required' }, 400);
  }
  if (items.length > 5) {
    return json({ ok: false, error: 'Maximum 5 items per batch' }, 400);
  }

  const results: ImportResult[] = [];
  for (const item of items) {
    if (!item.pageId || typeof item.pageId !== 'string') {
      results.push({
        notionPageId: item.pageId ?? '',
        supplierName: '',
        result: 'failed',
        error: 'Missing or invalid pageId',
        warnings: [],
        contactsCreated: 0,
        certsCreated: 0,
        docsCreated: 0,
        docsFailedDownload: 0,
      });
      continue;
    }
    const r = await processOnePage(item, notionToken);
    results.push(r);
  }

  const summary = {
    created: results.filter(r => r.result === 'created').length,
    skipped: results.filter(r => r.result === 'skipped').length,
    failed: results.filter(r => r.result === 'failed').length,
    contactsCreated: results.reduce((s, r) => s + r.contactsCreated, 0),
    certsCreated: results.reduce((s, r) => s + r.certsCreated, 0),
    docsCreated: results.reduce((s, r) => s + r.docsCreated, 0),
    docsFailedDownload: results.reduce((s, r) => s + r.docsFailedDownload, 0),
  };

  return json({ ok: true, summary, details: results });
}
