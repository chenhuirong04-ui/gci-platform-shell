// Vercel Edge Runtime — Create/update service quote summary in GCI Service Quotations Notion DB
// Env vars required: NOTION_TOKEN, NOTION_SERVICE_QUOTES_DB_ID
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

const STATUS_ZH: Record<string, string> = {
  DRAFT: '草稿', Draft: '草稿',
  FINAL: '正式报价', Final: '正式报价',
  SENT: '已发送',
  REVISION_REQUESTED: '待修改',
  ACCEPTED: '已接受',
  REJECTED: '已拒绝',
  EXPIRED: '已过期',
  CANCELLED: '已取消',
};

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const token = process.env.NOTION_TOKEN;
  const dbId  = process.env.NOTION_SERVICE_QUOTES_DB_ID;

  if (!token || !dbId) {
    return json({ skipped: true, reason: 'NOTION_SERVICE_QUOTES_DB_ID not configured' });
  }

  let quote: any;
  try { quote = await req.json(); }
  catch { return json({ error: 'Invalid JSON' }, 400); }

  const statusLabel = STATUS_ZH[quote.status || ''] || quote.status || '草稿';
  const title = quote.quotation_title || `${quote.customer_name || 'Client'} - ${quote.quote_no}`;

  const body = {
    parent: { database_id: dbId },
    properties: {
      '报价标题':   { title: [{ text: { content: title } }] },
      '报价编号':   { rich_text: [{ text: { content: quote.quote_no || '' } }] },
      '版本':       { number: quote.version || 1 },
      '客户名称':   { rich_text: [{ text: { content: quote.customer_name || '' } }] },
      '一次性费用': { number: quote.subtotal_one_time || 0 },
      '月服务费':   { number: quote.monthly_fee || 0 },
      '年服务费':   { number: quote.annual_recurring_amount || 0 },
      '折扣金额':   { number: quote.discount_amount || 0 },
      '首年合同价值': { number: quote.grand_total || 0 },
      '币种':       { select: { name: quote.currency || 'AED' } },
      '报价状态':   { select: { name: statusLabel } },
      '负责人':     { rich_text: [{ text: { content: quote.owner || '' } }] },
      'Supabase Quote ID': { rich_text: [{ text: { content: quote.id || '' } }] },
      ...(quote.quote_date
        ? { '报价日期': { date: { start: quote.quote_date } } }
        : {}),
      ...(quote.valid_until
        ? { '有效期':  { date: { start: quote.valid_until } } }
        : {}),
    },
  };

  // If quote has a notion_page_id, update; otherwise create
  const existingPageId = quote.notion_page_id;

  let res: Response;
  if (existingPageId) {
    res = await fetch(`https://api.notion.com/v1/pages/${existingPageId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
      },
      body: JSON.stringify({ properties: body.properties }),
    });
  } else {
    res = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
      },
      body: JSON.stringify(body),
    });
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    console.error('[bs/notion-upsert-quote] Notion error:', txt);
    return json({ error: txt }, 500);
  }

  const data: any = await res.json();
  return json({ notion_page_id: data.id });
}
