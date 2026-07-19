// api/suppliers/cleanup-summary.ts
// Read-only server-side aggregation for the supplier cleanup dashboard.
// Never returns private file URLs, contract content, or bank details.
export const config = { runtime: 'edge' };

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

// Normalise supplier name for duplicate detection
function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9一-鿿]/g, '');
}

// Completeness score: 9 items, each worth 1 point
function calcCompleteness(s: {
  country: string | null;
  city: string | null;
  product_categories: string[] | null;
  website: string | null;
}, hasContact: boolean, hasContactMethod: boolean, hasBizLicense: boolean, hasCatalog: boolean, hasCertOrQuote: boolean): number {
  let score = 0;
  if (s.country) score++;
  if (s.city) score++;
  if (s.product_categories && s.product_categories.length > 0) score++;
  if (hasContact) score++;
  if (hasContactMethod) score++;
  if (s.website) score++;
  if (hasBizLicense) score++;
  if (hasCatalog) score++;
  if (hasCertOrQuote) score++;
  return Math.round((score / 9) * 100);
}

function completenessLabel(pct: number): string {
  if (pct >= 80) return '资料较完整';
  if (pct >= 50) return '待补充';
  return '资料缺失较多';
}

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'GET') return json({ ok: false, error: 'Method not allowed' }, 405);

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return json({ ok: false, error: 'Server configuration error: Supabase credentials not set' }, 500);
  }

  async function supaGet(path: string) {
    const res = await fetch(`${supabaseUrl}${path}`, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    });
    if (!res.ok) throw new Error(`Supabase error ${res.status}: ${await res.text()}`);
    return res.json();
  }

  try {
    // ── 1. Fetch all required tables ──────────────────────────────────────
    const [suppliers, contacts, documents, certifications, quotes] = await Promise.all([
      supaGet('/rest/v1/suppliers?select=id,supplier_name_display,short_code,country,city,website,product_categories,is_preferred,import_source,notion_page_id,status,notes,created_at&limit=1000'),
      supaGet('/rest/v1/supplier_contacts?select=supplier_id,full_name,whatsapp,email&limit=2000'),
      supaGet('/rest/v1/supplier_documents?select=supplier_id,document_type&limit=2000'),
      supaGet('/rest/v1/supplier_certifications?select=supplier_id&limit=2000'),
      supaGet('/rest/v1/supplier_quotes?select=supplier_id&limit=2000').catch(() => [] as any[]),
    ]);

    // ── 2. Build lookup maps ──────────────────────────────────────────────
    const contactsBySup = new Map<string, Array<{ contact_name: string; whatsapp: string; email: string }>>();
    for (const c of contacts) {
      if (!contactsBySup.has(c.supplier_id)) contactsBySup.set(c.supplier_id, []);
      contactsBySup.get(c.supplier_id)!.push({ ...c, contact_name: c.full_name });
    }

    const docsBySup = new Map<string, Set<string>>();
    for (const d of documents) {
      if (!docsBySup.has(d.supplier_id)) docsBySup.set(d.supplier_id, new Set());
      docsBySup.get(d.supplier_id)!.add(d.document_type);
    }

    const certSupSet = new Set<string>(certifications.map((c: any) => c.supplier_id));
    const quoteSupSet = new Set<string>((quotes as any[]).map((q: any) => q.supplier_id));

    // ── 3. Per-supplier data enrichment ──────────────────────────────────
    type EnrichedSupplier = {
      id: string;
      supplier_name_display: string;
      short_code: string;
      country: string | null;
      city: string | null;
      website: string | null;
      product_categories: string[];
      is_preferred: boolean;
      import_source: string;
      notion_page_id: string | null;
      status: string;
      notes: string | null;
      created_at: string;
      primaryContact: { name: string | null; whatsapp: string | null; email: string | null } | null;
      completeness: number;
      completenessLabel: string;
      missingFields: string[];
      flags: {
        missingCountry: boolean;
        missingCity: boolean;
        missingCategory: boolean;
        missingContact: boolean;
        missingContactMethod: boolean;
        missingWebsite: boolean;
        missingBizLicense: boolean;
        missingCatalog: boolean;
        missingQuotation: boolean;
        missingCertification: boolean;
      };
    };

    const enriched: EnrichedSupplier[] = suppliers.map((s: any) => {
      const cats: string[] = Array.isArray(s.product_categories) ? s.product_categories : [];
      const supContacts = contactsBySup.get(s.id) ?? [];
      const supDocs = docsBySup.get(s.id) ?? new Set<string>();
      const hasBizLicense = supDocs.has('business_license');
      const hasCatalog = supDocs.has('product_catalog');
      const hasCert = certSupSet.has(s.id);
      const hasQuote = quoteSupSet.has(s.id);
      const hasContact = supContacts.length > 0;
      const primaryContact = supContacts[0] ?? null;
      const hasContactMethod = !!primaryContact && (!!primaryContact.whatsapp || !!primaryContact.email);

      const completeness = calcCompleteness(
        { country: s.country, city: s.city, product_categories: cats, website: s.website },
        hasContact, hasContactMethod, hasBizLicense, hasCatalog, hasCert || hasQuote
      );

      const missingFields: string[] = [];
      if (!s.country) missingFields.push('国家');
      if (!s.city) missingFields.push('城市');
      if (cats.length === 0) missingFields.push('产品类别');
      if (!hasContact) missingFields.push('联系人');
      if (!hasContactMethod) missingFields.push('联系方式');
      if (!s.website) missingFields.push('网站');
      if (!hasBizLicense) missingFields.push('营业执照');
      if (!hasCatalog) missingFields.push('产品目录');
      if (!hasCert && !hasQuote) missingFields.push('认证/报价');

      return {
        id: s.id,
        supplier_name_display: s.supplier_name_display,
        short_code: s.short_code,
        country: s.country ?? null,
        city: s.city ?? null,
        website: s.website ?? null,
        product_categories: cats,
        is_preferred: !!s.is_preferred,
        import_source: s.import_source ?? '',
        notion_page_id: s.notion_page_id ?? null,
        status: s.status ?? 'active',
        notes: s.notes ?? null,
        created_at: s.created_at,
        primaryContact: primaryContact
          ? { name: primaryContact.contact_name ?? null, whatsapp: primaryContact.whatsapp ?? null, email: primaryContact.email ?? null }
          : null,
        completeness,
        completenessLabel: completenessLabel(completeness),
        missingFields,
        flags: {
          missingCountry: !s.country,
          missingCity: !s.city,
          missingCategory: cats.length === 0,
          missingContact: !hasContact,
          missingContactMethod: !hasContactMethod,
          missingWebsite: !s.website,
          missingBizLicense: !hasBizLicense,
          missingCatalog: !hasCatalog,
          missingQuotation: !hasQuote,
          missingCertification: !hasCert,
        },
      };
    });

    const activeSuppliers = enriched.filter(s => s.status !== 'archived');

    // ── 4. Core stats ─────────────────────────────────────────────────────
    const stats = {
      total: activeSuppliers.length,
      preferred: activeSuppliers.filter(s => s.is_preferred).length,
      missingCountry: activeSuppliers.filter(s => s.flags.missingCountry).length,
      missingCategory: activeSuppliers.filter(s => s.flags.missingCategory).length,
      missingContact: activeSuppliers.filter(s => s.flags.missingContact).length,
      duplicateGroups: 0, // calculated below
    };

    // ── 5. Country distribution ───────────────────────────────────────────
    const countryMap = new Map<string, number>();
    let noCountryCount = 0;
    for (const s of activeSuppliers) {
      if (!s.country) { noCountryCount++; continue; }
      countryMap.set(s.country, (countryMap.get(s.country) ?? 0) + 1);
    }
    const MAJOR_THRESHOLD = 3;
    const sortedCountries = [...countryMap.entries()].sort((a, b) => b[1] - a[1]);
    const majorCountries = sortedCountries.filter(([, c]) => c >= MAJOR_THRESHOLD);
    const otherCountries = sortedCountries.filter(([, c]) => c < MAJOR_THRESHOLD);
    const otherTotal = otherCountries.reduce((acc, [, c]) => acc + c, 0);

    const countryBars = [
      ...majorCountries.map(([country, count]) => ({ country, count, isBlank: false, isOther: false, detail: null })),
      ...(otherTotal > 0 ? [{
        country: '其他',
        count: otherTotal,
        isBlank: false,
        isOther: true,
        detail: otherCountries.map(([country, count]) => ({ country, count })),
      }] : []),
      { country: '未填写', count: noCountryCount, isBlank: true, isOther: false, detail: null },
    ].sort((a, b) => {
      // Keep "未填写" last
      if (a.isBlank) return 1;
      if (b.isBlank) return -1;
      return b.count - a.count;
    });

    const countryDistribution = {
      hasCountryCount: activeSuppliers.length - noCountryCount,
      noCountryCount,
      countryCount: countryMap.size,
      bars: countryBars,
    };

    // ── 6. Category distribution ──────────────────────────────────────────
    const catMap = new Map<string, number>();
    let noCatCount = 0;
    for (const s of activeSuppliers) {
      if (!s.product_categories.length) { noCatCount++; continue; }
      for (const cat of s.product_categories) {
        if (cat) catMap.set(cat, (catMap.get(cat) ?? 0) + 1);
      }
    }
    const sortedCats = [...catMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
    const categoryBars = [
      ...sortedCats.map(([category, count]) => ({ category, count, isUnclassified: false })),
      { category: '未分类', count: noCatCount, isUnclassified: true },
    ];

    const categoryDistribution = { noCategory: noCatCount, bars: categoryBars };

    // ── 7. Duplicate groups ───────────────────────────────────────────────
    const nameGroups = new Map<string, EnrichedSupplier[]>();
    for (const s of activeSuppliers) {
      const key = normalizeName(s.supplier_name_display);
      if (!nameGroups.has(key)) nameGroups.set(key, []);
      nameGroups.get(key)!.push(s);
    }
    const duplicates = [...nameGroups.entries()]
      .filter(([, group]) => group.length > 1)
      .map(([key, group]) => ({
        groupId: key,
        reason: '名称完全相同',
        records: group.map(s => ({
          id: s.id,
          supplier_name_display: s.supplier_name_display,
          short_code: s.short_code,
          country: s.country,
          city: s.city,
          import_source: s.import_source,
          notion_page_id: s.notion_page_id,
          status: s.status,
          created_at: s.created_at,
          hasContact: !!s.primaryContact,
          contactName: s.primaryContact?.name ?? null,
          categories: s.product_categories,
          notes: s.notes,
        })),
      }));

    stats.duplicateGroups = duplicates.length;

    // ── 8. Pending cleanup list (sorted: preferred first, then by completeness ASC) ─
    const pendingCleanup = activeSuppliers
      .slice()
      .sort((a, b) => {
        if (a.is_preferred !== b.is_preferred) return a.is_preferred ? -1 : 1;
        return a.completeness - b.completeness;
      });

    // ── 9. Country analysis table ─────────────────────────────────────────────
    const ctyMap = new Map<string, {
      supplierCount: number; preferredCount: number; contactCount: number;
      missingCategoryCount: number; missingBizLicenseCount: number; missingCatalogCount: number;
    }>();
    for (const s of activeSuppliers) {
      const key = s.country ?? '未填写';
      if (!ctyMap.has(key)) ctyMap.set(key, { supplierCount: 0, preferredCount: 0, contactCount: 0, missingCategoryCount: 0, missingBizLicenseCount: 0, missingCatalogCount: 0 });
      const e = ctyMap.get(key)!;
      e.supplierCount++;
      if (s.is_preferred) e.preferredCount++;
      if (s.primaryContact) e.contactCount++;
      if (s.flags.missingCategory) e.missingCategoryCount++;
      if (s.flags.missingBizLicense) e.missingBizLicenseCount++;
      if (s.flags.missingCatalog) e.missingCatalogCount++;
    }
    const totalActive = activeSuppliers.length;
    const countryTable = [...ctyMap.entries()]
      .map(([country, d]) => ({
        country,
        supplierCount: d.supplierCount,
        percentage: totalActive > 0 ? Math.round((d.supplierCount / totalActive) * 100) : 0,
        preferredCount: d.preferredCount,
        contactCount: d.contactCount,
        missingCategoryCount: d.missingCategoryCount,
        missingBizLicenseCount: d.missingBizLicenseCount,
        missingCatalogCount: d.missingCatalogCount,
      }))
      .sort((a, b) => {
        if (a.country === '未填写') return 1;
        if (b.country === '未填写') return -1;
        return b.supplierCount - a.supplierCount;
      });

    // ── 10. Category analysis table ───────────────────────────────────────────
    const catAnalMap = new Map<string, {
      supplierCount: number; preferredCount: number; contactCount: number;
      catalogCount: number; certificationCount: number; missingCountryCount: number;
    }>();
    for (const s of activeSuppliers) {
      for (const cat of s.product_categories) {
        if (!cat) continue;
        if (!catAnalMap.has(cat)) catAnalMap.set(cat, { supplierCount: 0, preferredCount: 0, contactCount: 0, catalogCount: 0, certificationCount: 0, missingCountryCount: 0 });
        const e = catAnalMap.get(cat)!;
        e.supplierCount++;
        if (s.is_preferred) e.preferredCount++;
        if (s.primaryContact) e.contactCount++;
        if (!s.flags.missingCatalog) e.catalogCount++;
        if (!s.flags.missingCertification) e.certificationCount++;
        if (s.flags.missingCountry) e.missingCountryCount++;
      }
    }
    const categoryTable = [...catAnalMap.entries()]
      .map(([category, d]) => ({ category, ...d }))
      .sort((a, b) => b.supplierCount - a.supplierCount);

    return json({
      ok: true,
      stats,
      countryDistribution,
      categoryDistribution,
      duplicates,
      pendingCleanup,
      countryTable,
      categoryTable,
    });

  } catch (err: any) {
    return json({ ok: false, error: err.message ?? 'Unknown error' }, 500);
  }
}
