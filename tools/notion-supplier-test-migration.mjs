/**
 * GCI Platform — Notion Supplier Test Migration
 * -----------------------------------------------
 * 从 Notion 供应商库批量迁移 18 条测试数据到 Supabase suppliers 表。
 *
 * 用法：
 *   node tools/notion-supplier-test-migration.mjs --dry-run
 *   node tools/notion-supplier-test-migration.mjs
 *   node tools/notion-supplier-test-migration.mjs --whitelist=360d0b13...,2c0d0b13...
 *   node tools/notion-supplier-test-migration.mjs --on-duplicate=update
 */

import { createClient } from '@supabase/supabase-js';

// ── Config ────────────────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://efrkvwhzpgahjgfukjth.supabase.co';
const SUPABASE_KEY = 'sb_publishable_0IBQM1t4AVWpTRG1NL0JXQ_ATqn9vhV';
const IMPORT_SOURCE = 'notion_test';
const STORAGE_BUCKET_PUBLIC = 'suppliers-public';
const STORAGE_BUCKET_PRIVATE = 'suppliers-private';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const ON_DUPLICATE = args.find(a => a.startsWith('--on-duplicate='))?.split('=')[1] ?? 'skip';
const WHITELIST_OVERRIDE = args.find(a => a.startsWith('--whitelist='))?.split('=')[1]?.split(',');

if (DRY_RUN) console.log('\n🔍 [DRY-RUN MODE] — 不写入数据库，仅输出计划\n');

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Country / City parser ────────────────────────────────────────────────────
const COUNTRY_MAP = {
  '阿联酋': 'UAE', 'uae': 'UAE', 'UAE': 'UAE',
  '迪拜': 'UAE', 'Dubai': 'UAE', 'dubai': 'UAE',
  '中国': 'China', 'china': 'China', '福建': 'China', '广东': 'China',
  '菲律宾': 'Philippines', '印尼': 'Indonesia', '马来西亚': 'Malaysia',
  '泰国': 'Thailand', '韩国': 'South Korea', '越南': 'Vietnam',
  '沙特': 'Saudi Arabia', '埃及': 'Egypt', '肯尼亚': 'Kenya',
  '埃塞尔比亚': 'Ethiopia', '埃塞俄比亚': 'Ethiopia', '坦桑尼亚': 'Tanzania',
  '印度': 'India', '日本': 'Japan', '美国': 'USA', '法国': 'France',
  '新加坡': 'Singapore', '阿尔及利亚': 'Algeria',
};

function parseCountryCity(raw = '', notionCode = '') {
  if (!raw || !raw.trim()) {
    // Infer from Notion code prefix
    if (notionCode.startsWith('SUP-CHN-') || notionCode.startsWith('CN-')) return { country: 'China', city: '' };
    if (notionCode.startsWith('SUP-UAE-') || notionCode.startsWith('AE-')) return { country: 'UAE', city: '' };
    if (notionCode.startsWith('SUP-IDN-')) return { country: 'Indonesia', city: '' };
    if (notionCode.startsWith('SUP-KSA-')) return { country: 'Saudi Arabia', city: '' };
    if (notionCode.startsWith('SUP-KEN-')) return { country: 'Kenya', city: '' };
    return { country: '', city: '' };
  }

  const s = raw.trim();

  // Multi-segment comma: "厦门, 福建, 中国" or "Ajman, UAE"
  // — first segment = city, last segment matching COUNTRY_MAP = country
  if (s.includes(',')) {
    const parts = s.split(',').map(p => p.replace(/[\(\)]/g, '').trim());
    const city = parts[0];
    // Walk segments right-to-left looking for a country match
    for (let i = parts.length - 1; i >= 1; i--) {
      const mapped = COUNTRY_MAP[parts[i]];
      if (mapped) return { country: mapped, city };
    }
    // Fallback: search the whole string
    for (const [k, v] of Object.entries(COUNTRY_MAP)) {
      if (s.includes(k)) return { country: v, city };
    }
    return { country: parts[parts.length - 1], city };
  }

  // Single Chinese city like "迪拜" / "福建 " / "广东"
  const trimmed = s.trim();
  if (COUNTRY_MAP[trimmed]) {
    if (trimmed === '迪拜') return { country: 'UAE', city: 'Dubai' };
    if (trimmed === '沙特') return { country: 'Saudi Arabia', city: '' };
    if (['福建', '广东', '中国'].includes(trimmed)) return { country: 'China', city: trimmed === '中国' ? '' : trimmed };
    return { country: COUNTRY_MAP[trimmed], city: '' };
  }

  return { country: s, city: '' };
}

// ── Short-code generator ─────────────────────────────────────────────────────
async function generateShortCode() {
  const { data } = await supabase
    .from('suppliers')
    .select('short_code')
    .like('short_code', 'SUP-AUTO-%')
    .order('short_code', { ascending: false })
    .limit(1);
  const last = data?.[0]?.short_code;
  const n = last ? parseInt(last.split('-').pop(), 10) + 1 : 1;
  return `SUP-AUTO-${String(n).padStart(6, '0')}`;
}

// ── 18 Test Suppliers (hardcoded from Notion fetch 2026-07-17) ───────────────
const TEST_SUPPLIERS = [
  // ── UAE Suppliers ──────────────────────────────────────────────────────────
  {
    notion_page_id: '360d0b13-b3b9-8140-8f38-f98f22e0e880',
    notion_page_url: 'https://app.notion.com/p/360d0b13b3b981408f38f98f22e0e880',
    supplier_name_display: 'Vision Carpets F.Z.E',
    supplier_type: 'Trading',
    country_city_raw: 'Ajman, UAE',
    notion_code: 'AE-CP-001',
    product_categories: ['carpet'],
    is_preferred: true,
    status_raw: null,
    notes: '地毯专营，China Mall Ajman，Gate 11，铺位 F029。',
    contact_name: 'Mudeer',
    contact_email: 'ghafoor.agha873@gmail.com',
    whatsapp: 971522348250,
    certificates: [],
    attachments: [],
  },
  {
    notion_page_id: '360d0b13-b3b9-812f-a1e5-decc6681757d',
    notion_page_url: 'https://app.notion.com/p/360d0b13b3b9812fa1e5decc6681757d',
    supplier_name_display: 'DMT International F.Z.E',
    supplier_type: 'Integrated',
    country_city_raw: 'Ajman, UAE',
    notion_code: 'AE-TS-001',
    product_categories: ['tiles & stone', 'FITTING'],
    is_preferred: true,
    status_raw: null,
    notes: '瓷砖/石材/卫浴安装，China Mall Ajman，Shop DA056。供货+安装一体。',
    contact_name: 'Widad Osman',
    contact_email: '',
    whatsapp: 971525169796,
    certificates: [],
    attachments: [],
  },
  {
    notion_page_id: '34dd0b13-b3b9-81a2-b244-ec55ad1ac2ad',
    notion_page_url: 'https://app.notion.com/p/34dd0b13b3b981a2b244ec55ad1ac2ad',
    supplier_name_display: 'Multi Industries FZC (Multipack)',
    supplier_type: 'Integrated',
    country_city_raw: 'Sharjah, UAE',
    notion_code: '',
    product_categories: ['industry'],
    is_preferred: true,
    status_raw: null,
    notes: 'Senior Sales Executive; Tel: +971 6 557 0135; P.O. Box 7852, M4-18 SAIF Zone, Sharjah, UAE; www.multitradegroup.com',
    contact_name: 'Thaajuddeen NM',
    contact_email: 'thajuddeen@multitradegroup.com',
    whatsapp: 971559801491,
    certificates: [],
    attachments: [],
  },
  {
    notion_page_id: '360d0b13-b3b9-8149-b0a9-f4eaacff0228',
    notion_page_url: 'https://app.notion.com/p/360d0b13b3b98149b0a9f4eaacff0228',
    supplier_name_display: 'Fitout Seven',
    supplier_type: 'Service',
    country_city_raw: 'Dubai, UAE',
    notion_code: 'AE-FO-001',
    product_categories: ['renovation', 'FITTING'],
    is_preferred: true,
    status_raw: null,
    notes: '室内装修施工，Dubai。WhatsApp: +971557092666',
    contact_name: '',
    contact_email: '',
    whatsapp: 971557092666,
    certificates: [],
    attachments: [],
  },
  {
    notion_page_id: '360d0b13-b3b9-8149-b16e-d75a5068b729',
    notion_page_url: 'https://app.notion.com/p/360d0b13b3b98149b16ed75a5068b729',
    supplier_name_display: 'Coolhome',
    supplier_type: 'Trading',
    country_city_raw: 'Dubai, UAE',
    notion_code: 'AE-FF-001',
    product_categories: ['furniture', 'service'],
    is_preferred: true,
    status_raw: null,
    notes: '家居软装及家具，本地华人供应商，Dubai。',
    contact_name: '王旭',
    contact_email: '',
    whatsapp: 971585953666,
    certificates: [],
    attachments: [],
  },
  {
    // Source Time — HAS 2 Google Drive attachments (cannot direct-download, mark pending_reupload)
    notion_page_id: '34ed0b13-b3b9-812d-939c-fee54a0ad93b',
    notion_page_url: 'https://app.notion.com/p/34ed0b13b3b9812d939cfee54a0ad93b',
    supplier_name_display: 'Source Time',
    supplier_type: 'Trading',
    country_city_raw: 'Dubai, UAE',
    notion_code: '',
    product_categories: ['building materials', 'renovation'],
    is_preferred: true,
    status_raw: null,
    notes: '建材装修；室内装修设计及材料供应，Dubai。',
    contact_name: '王庆华',
    contact_email: '',
    whatsapp: 971525623858,
    certificates: [],
    attachments: [
      { name: '供应商资料表 (1)', url: 'https://docs.google.com/spreadsheets/d/1fpMx3CV43wMpOj3oI82qEdc96bPbeR4J/edit?usp=drive_link', type: '产品目录' },
      { name: '供应商资料表 (2)', url: 'https://docs.google.com/spreadsheets/d/1_HMsnVBkcv9D9lmXE_d9vi7wZHsMT5rF/edit?usp=drive_link', type: '产品目录' },
    ],
  },

  // ── China Preferred Suppliers ──────────────────────────────────────────────
  {
    notion_page_id: '2c0d0b13-b3b9-8153-9337-e694e6ae81fe',
    notion_page_url: 'https://app.notion.com/p/2c0d0b13b3b981539337e694e6ae81fe',
    supplier_name_display: '中山市卓见灯饰有限公司',
    name_en: 'Zhongshan Zhuojian Lighting Co., Ltd.',
    supplier_type: 'Unknown',
    country_city_raw: '广东',
    notion_code: 'SUP-CHN-LGT-0257',
    product_categories: ['lighting'],
    is_preferred: true,
    status_raw: null,
    notes: '成立于1985年，IS09001-2000认证，TUV/GS认证；ODM/OEM为主；月产能10万套',
    contact_name: '梁小姐',
    contact_email: '',
    whatsapp: 0,
    certificates: [],
    attachments: [],
  },
  {
    notion_page_id: '2c0d0b13-b3b9-81ef-ab8b-cdc9c35ac227',
    notion_page_url: 'https://app.notion.com/p/2c0d0b13b3b981efab8bcdc9c35ac227',
    supplier_name_display: '福建恒安集团有限公司',
    name_en: "Heng'an Group",
    supplier_type: 'Unknown',
    country_city_raw: '福建 ',
    notion_code: 'SUP-CHN-HYG-0248',
    product_categories: ['hygiene'],
    is_preferred: true,
    status_raw: null,
    notes: '恒安集团，1985年创立，港交所上市，主营卫生巾/纸尿裤/生活用纸',
    contact_name: '',  // 无联系人
    contact_email: '',
    whatsapp: 0,
    certificates: [],
    attachments: [],
  },
  {
    notion_page_id: '2c0d0b13-b3b9-81fb-979b-f8e1faf7ce9f',
    notion_page_url: 'https://app.notion.com/p/2c0d0b13b3b981fb979bf8e1faf7ce9f',
    supplier_name_display: '达森特（福建）生活用品有限公司',
    supplier_type: 'Unknown',
    country_city_raw: '福建 ',
    notion_code: 'SUP-CHN-WIP-0240',
    product_categories: ['hygiene'],
    is_preferred: true,
    status_raw: null,
    notes: '生产纸杯/纸巾/棉柔巾/消毒湿巾/口罩等；2020年成立',
    contact_name: '张春林',
    contact_email: '',
    whatsapp: 0,
    certificates: [],
    attachments: [],
  },
  {
    notion_page_id: '2c0d0b13-b3b9-81a0-9465-f9ae358d9fba',
    notion_page_url: 'https://app.notion.com/p/2c0d0b13b3b981a09465f9ae358d9fba',
    supplier_name_display: '厦门和牧贸易有限公司',
    supplier_type: 'Trading',
    country_city_raw: '福建 ',
    notion_code: 'SUP-CHN-GEN-0251',
    product_categories: ['trade'],
    is_preferred: true,
    status_raw: null,
    notes: '曾用名：厦门禾鹏贸易有限公司，2007年成立，批发业为主',
    contact_name: '许锦峰',
    contact_email: '',
    whatsapp: 0,
    certificates: [],
    attachments: [],
  },
  {
    // HAS 1 Google Drive attachment → pending_reupload
    notion_page_id: '2c0d0b13-b3b9-81c3-a06a-c523c213ce53',
    notion_page_url: 'https://app.notion.com/p/2c0d0b13b3b981c3a06ac523c213ce53',
    supplier_name_display: '福建省陶的优品科技有限公司',
    supplier_type: 'Unknown',
    country_city_raw: '福建 ',
    notion_code: 'SUP-CHN-HYG-0255',
    product_categories: ['sanitary fittings'],
    is_preferred: true,
    status_raw: null,
    notes: '主营建筑装饰/水暖管道/卫生陶瓷/五金产品/灯具',
    contact_name: '鲁永茂',
    contact_email: '',
    whatsapp: 0,
    certificates: [],
    attachments: [
      { name: '公司简介/产品目录', url: 'https://drive.google.com/file/d/1IJ5_pVP2-lLc5sHoaANZuF0kcuQf_6w_/view?usp=drive_link', type: '产品目录' },
    ],
  },
  {
    notion_page_id: '2c0d0b13-b3b9-81ee-9e00-e55b63f40c58',
    notion_page_url: 'https://app.notion.com/p/2c0d0b13b3b981ee9e00e55b63f40c58',
    supplier_name_display: '蜡笔小新（福建）食品工业有限公司',
    name_en: 'Crayon Shin-chan (Fujian) Food Industry Co., Ltd.',
    supplier_type: 'Unknown',
    country_city_raw: '福建 ',
    notion_code: 'SUP-CHN-SNK-0163',
    product_categories: ['food'],
    is_preferred: true,
    status_raw: null,
    notes: '2000年成立，主营果冻/布丁/糖果/饮料等，出口30+国家，港交所上市(01262)',
    contact_name: '郑东方',
    contact_email: '',
    whatsapp: 0,
    certificates: [],
    attachments: [],
  },

  // ── Other Countries ────────────────────────────────────────────────────────
  {
    notion_page_id: '2c0d0b13-b3b9-818b-94ae-ef3a92533c42',
    notion_page_url: 'https://app.notion.com/p/2c0d0b13b3b9818b94aeef3a92533c42',
    supplier_name_display: 'Republic Biscuit Corporation',
    supplier_type: 'Unknown',
    country_city_raw: '菲律宾',
    notion_code: 'SUP-OTH-SNK-0299',
    product_categories: ['food'],
    is_preferred: false,
    status_raw: null,
    notes: '主营蛋糕/糖果/饼干类；网站 Rebisco.com.ph',
    contact_name: 'Donnel Dy',
    contact_email: '',
    whatsapp: 0,
    certificates: [],
    attachments: [],
  },
  {
    // DUPLICATE TEST #1 — 埃塞尔比亚 spelling (newer record 0311)
    notion_page_id: '2c0d0b13-b3b9-81a3-a16f-c3ba1f81b582',
    notion_page_url: 'https://app.notion.com/p/2c0d0b13b3b981a3a16fc3ba1f81b582',
    supplier_name_display: 'AMASKO ETHIOPIAN COFFEE',
    supplier_type: 'Unknown',
    country_city_raw: '埃塞尔比亚',
    notion_code: 'SUP-OTH-CAF-0311',
    product_categories: ['food'],
    is_preferred: false,
    status_raw: null,
    notes: '主营：咖啡；入驻时间: 2025-04-30；对接人: Khalid Mussa',
    contact_name: 'Khalid Mussa',
    contact_email: '',
    whatsapp: 0,
    certificates: [],
    attachments: [],
    _test_note: 'DUPLICATE_TEST_1 — same name as 0287, different page_id, test idempotency',
  },
  {
    // DUPLICATE TEST #2 — 埃塞俄比亚 spelling (older record 0287)
    notion_page_id: '2c0d0b13-b3b9-81ee-817c-e2891340d12e',
    notion_page_url: 'https://app.notion.com/p/2c0d0b13b3b981ee817ce2891340d12e',
    supplier_name_display: 'AMASKO ETHIOPIAN COFFEE',
    supplier_type: 'Unknown',
    country_city_raw: '埃塞俄比亚',
    notion_code: 'SUP-OTH-CAF-0287',
    product_categories: ['food'],
    is_preferred: false,
    status_raw: null,
    notes: '主营：咖啡豆；入驻时间: 2024-12-10；对接人: Khalid Mussa',
    contact_name: 'Khalid Mussa',
    contact_email: '',
    whatsapp: 0,
    certificates: [],
    attachments: [],
    _test_note: 'DUPLICATE_TEST_2 — same supplier name as 0311, different page_id → should import as separate record (page_id is the dedup key)',
  },
  {
    // INCOMPLETE DATA: no country/city in Notion (blank field)
    notion_page_id: '2c0d0b13-b3b9-810c-8f58-c6bd08fb5d0e',
    notion_page_url: 'https://app.notion.com/p/2c0d0b13b3b9810c8f58c6bd08fb5d0e',
    supplier_name_display: '泉州联合纸业有限公司',
    supplier_type: 'Unknown',
    country_city_raw: '',  // ← blank in Notion, infer from code
    notion_code: 'SUP-CHN-HYG-0250',
    product_categories: ['hygiene'],
    is_preferred: false,
    status_raw: null,
    notes: '纸尿裤/卫生巾/无纺织物制品；2011年成立；注册资本1000万',
    contact_name: '王素华',
    contact_email: '',
    whatsapp: 0,
    certificates: [],
    attachments: [],
    _test_note: 'INCOMPLETE — no country/city in Notion, must infer from SUP-CHN- code',
  },
  {
    notion_page_id: '2c0d0b13-b3b9-81a4-8750-eb5068f52814',
    notion_page_url: 'https://app.notion.com/p/2c0d0b13b3b981a48750eb5068f52814',
    supplier_name_display: 'PT. TATA GLOBAL SENTOSA TASEN',
    supplier_type: 'Unknown',
    country_city_raw: '印尼',
    notion_code: 'SUP-IDN-BDP-0265',
    product_categories: ['hygiene'],
    is_preferred: false,
    status_raw: null,
    notes: '2010年成立，专业生产婴儿纸尿裤；网站 pttasen.com',
    contact_name: 'Ananta',
    contact_email: '',
    whatsapp: 0,
    certificates: [],
    attachments: [],
  },
  {
    notion_page_id: '360d0b13-b3b9-8110-ae32-c580c91ffed9',
    notion_page_url: 'https://app.notion.com/p/360d0b13b3b98110ae32c580c91ffed9',
    supplier_name_display: '厦门广泰石材',
    supplier_type: 'Factory',
    country_city_raw: '厦门, 福建, 中国',
    notion_code: 'CN-ST-001',
    product_categories: ['tiles & stone'],
    is_preferred: true,
    status_raw: null,
    notes: '大理石/花岗岩/石材工厂，厦门',
    contact_name: '林学艺',
    contact_email: '',
    whatsapp: 0,
    certificates: [],
    attachments: [],
  },
];

// ── Report structure ─────────────────────────────────────────────────────────
const report = {
  run_at: new Date().toISOString(),
  dry_run: DRY_RUN,
  on_duplicate: ON_DUPLICATE,
  selected_suppliers: TEST_SUPPLIERS.length,
  imported: 0,
  skipped: 0,
  failed: 0,
  auto_codes_generated: [],
  duplicate_codes: [],
  invalid_contacts: [],
  country_city_warnings: [],
  attachments_migrated: [],
  attachments_pending_reupload: [],
  certifications_migrated: [],
  records: [],
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatWhatsApp(n) {
  if (!n || n === 0) return '';
  return `+${String(Math.round(n))}`;
}

function isValidContact(name) {
  return name && name.trim() && name.trim() !== '—';
}

// ── Main migration logic ──────────────────────────────────────────────────────
async function migrateSupplier(s, codeCounter) {
  const rec = {
    notion_page_id: s.notion_page_id,
    notion_page_url: s.notion_page_url,
    supplier_name_display: s.supplier_name_display,
    action: null,
    new_supplier_id: null,
    short_code: null,
    legacy_short_code: s.notion_code || null,
    contacts_created: 0,
    certs_created: 0,
    attachments_ok: [],
    attachments_failed: [],
    warnings: [],
    error: null,
    test_note: s._test_note,
  };

  try {
    // 1. Idempotency check
    const { data: existing } = await supabase
      .from('suppliers')
      .select('id, short_code')
      .eq('notion_page_id', s.notion_page_id)
      .maybeSingle();

    if (existing) {
      if (ON_DUPLICATE === 'skip') {
        rec.action = 'skip';
        rec.new_supplier_id = existing.id;
        rec.short_code = existing.short_code;
        report.skipped++;
        console.log(`  ⏭  SKIP  ${s.supplier_name_display} (already exists: ${existing.id})`);
        report.records.push(rec);
        return;
      }
    }

    // 2. Parse country/city
    const { country, city } = parseCountryCity(s.country_city_raw, s.notion_code);
    if (!country) {
      rec.warnings.push(`Country blank after parse (raw="${s.country_city_raw}", code="${s.notion_code}")`);
      report.country_city_warnings.push({ supplier: s.supplier_name_display, raw: s.country_city_raw });
    }

    // 3. Generate short code
    const autoCode = `SUP-AUTO-${String(codeCounter.value).padStart(6, '0')}`;
    codeCounter.value++;
    rec.short_code = autoCode;
    report.auto_codes_generated.push({ name: s.supplier_name_display, code: autoCode, legacy: s.notion_code });

    // 4. Map supplier_type
    const typeMap = { Factory:'Factory', Trading:'Trading', Integrated:'Integrated', Service:'Service', Agent:'Agent' };
    const supplierType = typeMap[s.supplier_type] ?? 'Unknown';

    // 5. Status
    const status = s.status_raw === '封存' ? 'inactive' : 'active';

    // 6. Build supplier payload
    const payload = {
      supplier_name_display: s.supplier_name_display,
      name_en: s.name_en ?? null,
      short_code: autoCode,
      legacy_short_code: s.notion_code || null,
      supplier_type: supplierType,
      product_categories: s.product_categories,
      country,
      city,
      is_preferred: s.is_preferred,
      status,
      notes: s.notes || null,
      import_source: IMPORT_SOURCE,
      notion_page_id: s.notion_page_id,
      notion_page_url: s.notion_page_url,
      imported_at: new Date().toISOString(),
      code_needs_review: false,
    };

    if (DRY_RUN) {
      console.log(`  ✔ DRY   ${s.supplier_name_display}`);
      console.log(`         → code: ${autoCode}  legacy: ${s.notion_code || '(none)'}  country: ${country}  city: ${city}`);
      rec.action = 'dry_run';
      rec.new_supplier_id = '(dry-run)';
    } else {
      const { data: inserted, error: insertErr } = existing && ON_DUPLICATE === 'update'
        ? await supabase.from('suppliers').update(payload).eq('id', existing.id).select('id').single()
        : await supabase.from('suppliers').insert(payload).select('id').single();

      if (insertErr) throw insertErr;
      rec.new_supplier_id = inserted.id;
      rec.action = existing ? 'update' : 'insert';
      console.log(`  ✔ ${rec.action.toUpperCase()}  ${s.supplier_name_display}  [${autoCode}]  → ${inserted.id}`);

      const supplierId = inserted.id;

      // 7. Create contact
      if (isValidContact(s.contact_name)) {
        const wa = formatWhatsApp(s.whatsapp);
        const contactPayload = {
          supplier_id: supplierId,
          full_name: s.contact_name.trim(),
          email: s.contact_email || null,
          whatsapp: wa || null,
          is_primary: true,
          status: 'active',
        };
        const { error: cErr } = await supabase.from('supplier_contacts').insert(contactPayload);
        if (cErr) {
          rec.warnings.push(`Contact insert failed: ${cErr.message}`);
        } else {
          rec.contacts_created++;
        }
      } else if (!s.contact_name) {
        report.invalid_contacts.push({ supplier: s.supplier_name_display, raw: '(empty)' });
      }

      // 8. Add WhatsApp-only contact (when no name but has phone)
      if (!isValidContact(s.contact_name) && s.whatsapp) {
        const wa = formatWhatsApp(s.whatsapp);
        const contactPayload = {
          supplier_id: supplierId,
          full_name: '(WhatsApp contact)',
          whatsapp: wa,
          is_primary: true,
          status: 'active',
        };
        const { error: cErr } = await supabase.from('supplier_contacts').insert(contactPayload);
        if (!cErr) rec.contacts_created++;
      }

      // 9. Create certifications
      for (const cert of s.certificates) {
        const certPayload = {
          supplier_id: supplierId,
          certification_name: cert,
          certification_type: cert,
          status: 'pending_verification',
        };
        const { error: certErr } = await supabase.from('supplier_certifications').insert(certPayload);
        if (certErr) {
          rec.warnings.push(`Cert insert failed (${cert}): ${certErr.message}`);
        } else {
          rec.certs_created++;
          report.certifications_migrated.push({ supplier: s.supplier_name_display, cert });
        }
      }

      // 10. Create document records for attachments
      for (const att of s.attachments.slice(0, 3)) {
        const isPrivate = ['营业执照','公司注册文件','VAT文件','税务文件','合同','NDA','银行资料'].includes(att.type);
        const docPayload = {
          supplier_id: supplierId,
          document_type: att.type,
          document_name: att.name,
          file_url: att.url,  // external URL (Google Drive) — cannot auto-upload
          storage_bucket: isPrivate ? STORAGE_BUCKET_PRIVATE : STORAGE_BUCKET_PUBLIC,
          storage_path: null,  // not uploaded to Supabase storage
          verification_status: 'pending_reupload',
          notes: 'Notion 附件为 Google Drive 链接，需手动下载后重新上传至 Supabase Storage',
        };
        const { error: docErr } = await supabase.from('supplier_documents').insert(docPayload);
        if (docErr) {
          rec.warnings.push(`Doc insert failed: ${docErr.message}`);
          rec.attachments_failed.push(att.name);
          report.attachments_pending_reupload.push({ supplier: s.supplier_name_display, file: att.name, url: att.url });
        } else {
          rec.attachments_ok.push(att.name);
          report.attachments_pending_reupload.push({ supplier: s.supplier_name_display, file: att.name, url: att.url, reason: 'Google Drive — 需手动上传' });
        }
      }
    }

    report.imported++;
    report.records.push(rec);

  } catch (err) {
    rec.action = 'error';
    rec.error = err.message;
    report.failed++;
    report.records.push(rec);
    console.error(`  ✖ ERROR  ${s.supplier_name_display}: ${err.message}`);
  }
}

// ── Run ───────────────────────────────────────────────────────────────────────
async function run() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  GCI Platform — Notion Supplier Test Migration');
  console.log(`  Mode: ${DRY_RUN ? 'DRY-RUN' : 'WRITE'}  |  on_duplicate: ${ON_DUPLICATE}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  // Get next auto code start
  let codeStart = 1;
  if (!DRY_RUN) {
    const { data } = await supabase
      .from('suppliers')
      .select('short_code')
      .like('short_code', 'SUP-AUTO-%')
      .order('short_code', { ascending: false })
      .limit(1);
    const last = data?.[0]?.short_code;
    if (last) codeStart = parseInt(last.split('-').pop(), 10) + 1;
  }
  const codeCounter = { value: codeStart };

  // Filter whitelist if provided
  let suppliers = WHITELIST_OVERRIDE
    ? TEST_SUPPLIERS.filter(s => WHITELIST_OVERRIDE.some(id => s.notion_page_id.includes(id)))
    : TEST_SUPPLIERS;

  console.log(`Selected ${suppliers.length} suppliers for migration\n`);

  for (const s of suppliers) {
    await migrateSupplier(s, codeCounter);
    // Small delay to avoid rate limits
    if (!DRY_RUN) await new Promise(r => setTimeout(r, 150));
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Total selected : ${report.selected_suppliers}`);
  console.log(`  Imported       : ${report.imported}`);
  console.log(`  Skipped        : ${report.skipped}`);
  console.log(`  Failed         : ${report.failed}`);
  console.log(`  Auto codes     : ${report.auto_codes_generated.length}`);
  console.log(`  Contacts       : ${report.records.reduce((s,r) => s + r.contacts_created, 0)}`);
  console.log(`  Certifications : ${report.certifications_migrated.length}`);
  console.log(`  Attachments (pending reupload): ${report.attachments_pending_reupload.length}`);
  if (report.country_city_warnings.length) {
    console.log(`  ⚠  Country/City warnings: ${report.country_city_warnings.length}`);
    report.country_city_warnings.forEach(w => console.log(`     - ${w.supplier}: "${w.raw}"`));
  }
  if (report.failed > 0) {
    console.log('  ✖  Failed records:');
    report.records.filter(r => r.action === 'error').forEach(r => console.log(`     - ${r.supplier_name_display}: ${r.error}`));
  }

  // ── Write report ──────────────────────────────────────────────────────────
  const reportPath = 'tools/notion-supplier-test-report.json';
  const { writeFileSync } = await import('fs');
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`\n  Report saved: ${reportPath}`);
  console.log('═══════════════════════════════════════════════════════════\n');
}

run().catch(err => { console.error('FATAL:', err); process.exit(1); });
