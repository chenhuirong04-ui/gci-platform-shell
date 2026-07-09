// /api/ai/quotation-history
// Reads quotation_records (flat schema, no payload wrapper).
// Supports ?customer= fuzzy filter with company-suffix alias generation.
// Default: latest 20 records across all statuses.
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

const STATUS_ZH: Record<string, string> = {
  DRAFT:         '草稿',
  GENERATED:     '已发出 / 待回复',
  SENT_TO_TRADE: '已转 Trade PI',
};

// Strip common trailing Chinese particles from an extracted customer name
function cleanCustomer(raw: string): string {
  return raw
    .replace(/\s*(?:的|这个客户|这个|客户)\s*$/, '')
    .replace(/["""''「」]/g, '')
    .trim();
}

// Generate search aliases from a customer name (handles LLC / L.L.C / LLE / FZ variants)
function generateSearchTerms(customer: string): string[] {
  const s = cleanCustomer(customer);
  if (!s) return [];

  const terms = new Set<string>();
  terms.add(s);

  // Strip company suffixes to get core name
  const SUFFIX_RE = /\s+(?:FZ[-\s]?LLC|FZ[-\s]?LLE|FZ[-\s]?L\.?L\.?C|FZ-LLC|FZ LLC|LLC|L\.L\.C|LLE|L\.LC|FZCO|Ltd\.?|Co\.|Inc\.?|FZE|EST|Establishment|Trading|Group|Corp)\s*$/i;
  const core = s.replace(SUFFIX_RE, '').trim();
  if (core && core !== s && core.length >= 2) terms.add(core);

  // LLC / LLE / L.L.C interoperability
  if (/LLE\b/i.test(s)) {
    terms.add(s.replace(/LLE\b/i, 'LLC'));
    terms.add(s.replace(/LLE\b/i, 'L.L.C'));
  }
  if (/\bLLC\b/i.test(s)) {
    terms.add(s.replace(/\bLLC\b/i, 'LLE'));
    terms.add(s.replace(/\bLLC\b/i, 'L.L.C'));
  }
  if (/L\.L\.C/i.test(s)) {
    terms.add(s.replace(/L\.L\.C/i, 'LLC'));
    terms.add(s.replace(/L\.L\.C/i, 'LLE'));
  }

  return [...terms].filter(t => t.length >= 2);
}

// Detect items that are image formulas or completely empty/zero
function isInvalidItem(ir: any): boolean {
  const name = (ir.item_name || '').trim();
  if (/^=DISPIMG/i.test(name)) return true;
  if (/^=IMAGE/i.test(name)) return true;
  if (!name && !(ir.description || '').trim()) return true;
  return false;
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS });
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key         = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !key) return json({ ok: false, error: 'Supabase not configured' }, 500);

  const reqUrl           = new URL(request.url);
  const rawCustomer      = reqUrl.searchParams.get('customer')?.trim() || '';
  const normalizedCustomer = rawCustomer ? cleanCustomer(rawCustomer) : '';
  const searchTerms        = normalizedCustomer ? generateSearchTerms(normalizedCustomer) : [];

  const selectCols = 'id,quote_no,customer_name,project_name,grand_total,status,created_at,quote_date,salesperson,quote_type,margin_percent,vat_amount,selling_total';

  let queryUrl = `${supabaseUrl}/rest/v1/quotation_records`
    + `?select=${selectCols}`
    + `&order=created_at.desc`
    + `&limit=20`;

  if (searchTerms.length === 1) {
    queryUrl += `&customer_name=ilike.*${encodeURIComponent(searchTerms[0])}*`;
  } else if (searchTerms.length > 1) {
    const orParts = searchTerms
      .map(t => `customer_name.ilike.*${encodeURIComponent(t)}*`)
      .join(',');
    queryUrl += `&or=(${orParts})`;
  }

  const res = await fetch(queryUrl, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    return json({ ok: false, error: `Supabase ${res.status}`, detail: errText });
  }

  const rows: any[] = await res.json();

  // Fetch quotation_items for all returned records in one query
  const recordIds: string[] = rows.map((r: any) => r.id).filter(Boolean);
  const itemsMap: Record<string, { valid: any[]; hiddenCount: number }> = {};

  if (recordIds.length > 0) {
    const itemsUrl = `${supabaseUrl}/rest/v1/quotation_items`
      + `?quotation_id=in.(${recordIds.join(',')})`
      + `&select=quotation_id,item_name,description,qty,unit,selling_price,line_total,currency,item_notes,sort_order`
      + `&order=sort_order.asc`;
    const itemsRes = await fetch(itemsUrl, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    });
    if (itemsRes.ok) {
      const itemRows: any[] = await itemsRes.json().catch(() => []);
      for (const ir of itemRows) {
        if (!itemsMap[ir.quotation_id]) itemsMap[ir.quotation_id] = { valid: [], hiddenCount: 0 };
        if (isInvalidItem(ir)) {
          itemsMap[ir.quotation_id].hiddenCount++;
          continue;
        }
        itemsMap[ir.quotation_id].valid.push({
          item_name:     (ir.item_name || '').trim(),
          description:   ir.description   || '',
          qty:           Number(ir.qty)   || 0,
          unit:          ir.unit          || '件',
          selling_price: Number(ir.selling_price) || 0,
          line_total:    Number(ir.line_total)    || 0,
          currency:      ir.currency      || 'AED',
          item_notes:    ir.item_notes    || '',
        });
      }
    }
  }

  // Determine which search term actually matched (for display)
  let matchedBy: string | null = null;
  if (normalizedCustomer && rows.length > 0) {
    const firstCustomer = (rows[0].customer_name || '').toLowerCase();
    for (const t of searchTerms) {
      if (firstCustomer.includes(t.toLowerCase())) { matchedBy = t; break; }
    }
    if (!matchedBy) matchedBy = normalizedCustomer;
  }

  const quotes = rows.map(q => ({
    id:           q.id,
    quoteNo:      q.quote_no      || '—',
    customerName: q.customer_name || '—',
    projectName:  q.project_name  || '',
    grandTotal:   Number(q.grand_total)  || 0,
    sellingTotal: Number(q.selling_total) || 0,
    vatAmount:    Number(q.vat_amount)   || 0,
    margin:       Number(q.margin_percent) || 0,
    currency:     'AED',
    status:       q.status || 'DRAFT',
    statusZh:     STATUS_ZH[q.status] || q.status,
    quoteType:    q.quote_type || 'CUSTOM',
    salesperson:  q.salesperson || '',
    quoteDate:    q.quote_date || q.created_at || '',
    createdAt:    q.created_at || '',
    items:        itemsMap[q.id]?.valid       || [],
    hiddenInvalidItemsCount: itemsMap[q.id]?.hiddenCount || 0,
  }));

  const totalAmount   = quotes.reduce((s, q) => s + q.grandTotal, 0);
  const statusSummary = quotes.reduce<Record<string, number>>((acc, q) => {
    acc[q.statusZh] = (acc[q.statusZh] || 0) + 1;
    return acc;
  }, {});

  return json({
    ok:                 true,
    total:              quotes.length,
    customerFilter:     rawCustomer || null,
    normalizedCustomer: normalizedCustomer || null,
    searchTerms:        searchTerms.length > 0 ? searchTerms : undefined,
    matchedBy:          matchedBy || undefined,
    totalAmount,
    statusSummary,
    quotes,
    source:             'quotation_records',
    asOf:               new Date().toISOString(),
  });
}
