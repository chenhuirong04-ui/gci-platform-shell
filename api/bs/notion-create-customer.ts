// Vercel Edge Runtime — Create a service customer page in GCI Service Customers Notion DB
// Env vars required: NOTION_TOKEN, NOTION_SERVICE_CUSTOMERS_DB_ID
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
  NEW_REQUIREMENT: '新需求',
  REQUIREMENT_CONFIRMING: '需求确认中',
  SOLUTION_PREPARING: '方案准备中',
  SOLUTION_SENT: '已发方案',
  QUOTED: '已报价',
  CONTRACT_PENDING: '合同待签',
  IN_PROGRESS: '执行中',
  MONTHLY_SERVICE: '月度服务中',
  ON_HOLD: '暂缓',
  COMPLETED: '已完成',
  LOST: '未成交',
};

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const token = process.env.NOTION_TOKEN;
  const dbId  = process.env.NOTION_SERVICE_CUSTOMERS_DB_ID;

  if (!token || !dbId) {
    // Not an error — Notion integration simply not configured yet
    return json({ skipped: true, reason: 'NOTION_SERVICE_CUSTOMERS_DB_ID not configured' });
  }

  let customer: any;
  try { customer = await req.json(); }
  catch { return json({ error: 'Invalid JSON' }, 400); }

  const statusLabel = STATUS_ZH[customer.status || ''] || customer.status || '新需求';

  const body = {
    parent: { database_id: dbId },
    properties: {
      '客户名称': { title: [{ text: { content: customer.customer_name || 'Unnamed' } }] },
      '客户编号': { rich_text: [{ text: { content: customer.customer_number || '' } }] },
      '公司名称': { rich_text: [{ text: { content: customer.company_name || '' } }] },
      '联系人':   { rich_text: [{ text: { content: customer.contact_name || '' } }] },
      'WhatsApp': customer.whatsapp ? { phone_number: customer.whatsapp } : undefined,
      '邮箱':     customer.email    ? { email: customer.email }            : undefined,
      '国家':     { rich_text: [{ text: { content: customer.country || '' } }] },
      '城市':     { rich_text: [{ text: { content: customer.city    || '' } }] },
      '主要服务分类': { rich_text: [{ text: { content: customer.primary_service_type || '' } }] },
      '客户需求': { rich_text: [{ text: { content: customer.requirement_summary || '' } }] },
      '当前状态': { select: { name: statusLabel } },
      '优先级':   { select: { name: customer.priority || 'B' } },
      '负责人':   { rich_text: [{ text: { content: customer.owner || '' } }] },
      '是否月度服务': { checkbox: !!customer.requires_monthly_service },
      'Supabase Customer ID': { rich_text: [{ text: { content: customer.id || '' } }] },
      ...(customer.follow_up_date
        ? { '跟进日期': { date: { start: customer.follow_up_date } } }
        : {}),
    },
  };

  // Strip undefined properties (Notion API rejects them)
  const cleanProps: Record<string, any> = {};
  for (const [k, v] of Object.entries(body.properties)) {
    if (v !== undefined) cleanProps[k] = v;
  }

  const res = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    },
    body: JSON.stringify({ ...body, properties: cleanProps }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    console.error('[bs/notion-create-customer] Notion error:', txt);
    return json({ error: txt }, 500);
  }

  const data: any = await res.json();
  return json({ notion_page_id: data.id });
}
