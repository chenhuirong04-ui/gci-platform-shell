// Vercel Edge Runtime — Create a new page in Notion Follow-up Log database
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

export interface NotionCreatePayload {
  clientName: string;          // → title property
  tradeStatus?: string;        // → 行动状态 (select), default 新询盘
  businessType?: string;       // → 业务类型 (select), default 贸易型
  followUpNotes?: string;      // → Follow-up Notes (rich_text)
  nextAction?: string;         // → 下次行动内容 (rich_text)
  nextFollowUpAt?: string;     // → Next Follow-up (date YYYY-MM-DD)
  followUpDate?: string;       // → Follow-up Date (date YYYY-MM-DD)
  followUpMethod?: string;     // → Follow-up Method (select)
  owner?: string;              // → Follow-up Owner (select)
  source?: string;             // appended to followUpNotes as [来源: xxx]
}

// Exact field names from Follow-up Log跟进记录 database (full-width brackets)
const TITLE_PROP = 'Customer（客户）'; // Customer（客户）

// Map followUpMethod to Notion's actual select option values (all lowercase)
function mapMethod(method?: string): string {
  if (!method) return 'whatsapp';
  const m = method.toLowerCase();
  if (m === 'whatsapp' || m === 'whats app') return 'whatsapp';
  if (m.includes('email') || m.includes('邮件')) return 'email';
  if (m.includes('wechat') || m.includes('微信')) return 'wechat';
  if (m.includes('call') || m.includes('电话')) return 'call';
  if (m.includes('face') || m.includes('当面')) return 'face to face';
  return 'whatsapp';
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const token = process.env.NOTION_TOKEN;
  const dbId  = process.env.NOTION_FOLLOWUP_DB_ID;
  if (!token || !dbId) {
    console.error('[notion-create] Missing env vars: NOTION_TOKEN or NOTION_FOLLOWUP_DB_ID');
    return json({ error: 'Missing NOTION_TOKEN or NOTION_FOLLOWUP_DB_ID' }, 500);
  }

  let payload: NotionCreatePayload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  if (!payload.clientName?.trim()) return json({ error: 'clientName is required' }, 400);

  const today    = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  const notes = [
    payload.source ? `[来源: ${payload.source}]` : '',
    payload.followUpNotes || '',
  ].filter(Boolean).join('\n').slice(0, 2000);

  // Build properties using exact Notion field names (full-width brackets)
  const properties: Record<string, any> = {
    [TITLE_PROP]:                     { title: [{ type: 'text', text: { content: payload.clientName.trim() } }] },
    '行动状态':       { select: { name: payload.tradeStatus || '新询盘' } },
    '业务类型':       { select: { name: payload.businessType || '贸易型' } },
    'Follow-up Date（跟进日期）': { date: { start: payload.followUpDate || today } },
    'Next Follow-up（下次跟进）': { date: { start: payload.nextFollowUpAt || tomorrow } },
    'Follow-up Method（跟进方式）': { select: { name: mapMethod(payload.followUpMethod) } },
  };
  if (notes)
    properties['Follow-up Notes（跟进内容'] = { rich_text: [{ type: 'text', text: { content: notes } }] };
  if (payload.nextAction)
    properties['下次行动内容'] = { rich_text: [{ type: 'text', text: { content: payload.nextAction.slice(0, 2000) } }] };
  if (payload.owner)
    properties['Follow-up Owner（负责人）'] = { select: { name: payload.owner } };

  console.log('[notion-create] writing to dbId:', dbId?.slice(0, 8), 'props:', Object.keys(properties).join(', '));

  const res = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ parent: { database_id: dbId }, properties }),
  });

  const resBody = await res.json().catch(() => ({}));
  console.log('[notion-create] Notion response:', res.status, JSON.stringify(resBody).slice(0, 300));

  if (res.ok) {
    return json({ ok: true, pageId: (resBody as any).id });
  }
  return json({ error: `Notion API error ${res.status}`, detail: resBody }, res.status);
}
