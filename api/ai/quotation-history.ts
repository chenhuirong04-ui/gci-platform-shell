// /api/ai/quotation-history
// Reads quotation_records (flat schema, no payload wrapper).
// Supports ?customer= fuzzy filter. Default: latest 20 records across all statuses.
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

// quotation_records status labels (zh)
const STATUS_ZH: Record<string, string> = {
  DRAFT:         '草稿',
  GENERATED:     '已发出 / 待回复',
  SENT_TO_TRADE: '已转 Trade PI',
};

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS });
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key         = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !key) return json({ ok: false, error: 'Supabase not configured' }, 500);

  // Optional customer keyword filter (?customer=IFZA)
  const reqUrl   = new URL(request.url);
  const customer = reqUrl.searchParams.get('customer')?.trim() || '';

  // quotation_records is FLAT (no payload wrapper).
  // Select all statuses — this is a history view, not just pending.
  // customer filter: ilike on customer_name (case-insensitive substring).
  let queryUrl = `${supabaseUrl}/rest/v1/quotation_records`
    + `?select=id,quote_no,customer_name,project_name,grand_total,status,created_at,quote_date,salesperson,quote_type,margin_percent,vat_amount,selling_total`
    + `&order=created_at.desc`
    + `&limit=20`;

  if (customer) {
    queryUrl += `&customer_name=ilike.*${encodeURIComponent(customer)}*`;
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
  }));

  const totalAmount   = quotes.reduce((s, q) => s + q.grandTotal, 0);
  const statusSummary = quotes.reduce<Record<string, number>>((acc, q) => {
    acc[q.statusZh] = (acc[q.statusZh] || 0) + 1;
    return acc;
  }, {});

  return json({
    ok:            true,
    total:         quotes.length,
    customerFilter: customer || null,
    totalAmount,
    statusSummary,
    quotes,
    source:        'quotation_records',
    asOf:          new Date().toISOString(),
  });
}
