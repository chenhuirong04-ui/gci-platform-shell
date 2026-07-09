// Vercel Edge Runtime — Write a new PROJECT customer to:
//   Step 1: 项目客户库 / Business Master (NOTION_PROJECTS_DB_ID)
//   Step 2: Follow-up Log (NOTION_FOLLOWUP_DB_ID)
// If Step 1 fails → abort, return error
// If Step 2 fails → return partial error (project record exists)
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

export interface WriteProjectPayload {
  clientName: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  countryCity?: string;
  contactPerson?: string;
  lastContext?: string;
  goal?: string;
  nextFollowUpAt?: string;   // YYYY-MM-DD
  followUpMethod?: string;
  owner?: string;
  source?: string;
  tradeStatus?: string;      // 行动状态 sent by UI
  categories?: string;
  driveUrls?: Array<{ name: string; url: string }>;
}

function notionHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
  };
}

function mapMethod(method?: string): string {
  if (!method) return 'whatsapp';
  const m = method.toLowerCase();
  if (m.includes('whatsapp')) return 'whatsapp';
  if (m.includes('email') || m.includes('邮件')) return 'email';
  if (m.includes('wechat') || m.includes('微信')) return 'wechat';
  if (m.includes('call') || m.includes('电话')) return 'call';
  if (m.includes('face') || m.includes('当面')) return 'face to face';
  return 'whatsapp';
}

// Map UI action status to Notion 行动状态 select value
function mapTradeStatus(status?: string): string {
  if (!status) return '新建';
  const MAP: Record<string, string> = {
    '新询盘': '新询盘', '待报价': '待报价', '已报价': '已报价',
    '等待客户回复': '等待客户回复', '待签合同': '待签合同', '合同待签': '合同待签',
    '已成交': '已成交', '已完成': '已完成', '暂缓': '暂缓', '新建': '新建',
  };
  return MAP[status] || status;
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const token        = process.env.NOTION_TOKEN;
  const projectsDbId = process.env.NOTION_PROJECTS_DB_ID;
  const followupDbId = process.env.NOTION_FOLLOWUP_DB_ID;

  if (!token || !projectsDbId || !followupDbId) {
    const missing = [
      !token        && 'NOTION_TOKEN',
      !projectsDbId && 'NOTION_PROJECTS_DB_ID',
      !followupDbId && 'NOTION_FOLLOWUP_DB_ID',
    ].filter(Boolean).join(', ');
    console.error('[notion-write-project] Missing env vars:', missing);
    return json({ error: `Missing env vars: ${missing}` }, 500);
  }

  let payload: WriteProjectPayload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  if (!payload.clientName?.trim()) return json({ error: 'clientName is required' }, 400);

  const today    = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const followUpDate = payload.nextFollowUpAt?.slice(0, 10) || tomorrow;

  // ── Build enriched context string ────────────────────────────────────────────
  const contextParts: string[] = [];
  if (payload.contactPerson) contextParts.push(`联系人：${payload.contactPerson}`);
  if (payload.countryCity)   contextParts.push(`地区：${payload.countryCity}`);
  if (payload.categories === 'customer_quote_record') contextParts.push('【客户报价留底】');
  else if (payload.categories === 'customer_inquiry') contextParts.push('【客户询价清单】');
  else if (payload.categories === 'boq')              contextParts.push('【BOQ/工程清单】');
  if (payload.driveUrls?.length) {
    payload.driveUrls.forEach(f => f.url && contextParts.push(`附件：${f.name} → ${f.url}`));
  }
  if (payload.lastContext) contextParts.push(payload.lastContext);
  const enrichedContext = contextParts.join('\n').slice(0, 2000);

  // ── Step 1: Write to 项目客户库 ──────────────────────────────────────────────
  // Field names based on what notion-sync.ts reads from this DB
  const projectProperties: Record<string, any> = {
    // Title field — try 客户名称 (most common in GCI's Chinese Notion setup)
    '客户名称': { title: [{ type: 'text', text: { content: payload.clientName.trim() } }] },
    '业务类型': { select: { name: '项目型' } },
  };
  if (payload.phone || payload.whatsapp) {
    const phone = (payload.whatsapp || payload.phone || '').trim();
    if (phone) projectProperties['电话'] = { phone_number: phone };
    if (payload.whatsapp) projectProperties['WhatsApp'] = { phone_number: payload.whatsapp.trim() };
  }
  if (payload.countryCity) {
    projectProperties['城市'] = { rich_text: [{ type: 'text', text: { content: payload.countryCity } }] };
  }
  if (payload.email) {
    projectProperties['Email'] = { email: payload.email.trim() };
  }
  if (enrichedContext) {
    projectProperties['备注'] = { rich_text: [{ type: 'text', text: { content: enrichedContext } }] };
  }

  console.log('[notion-write-project] Step 1: writing to projects DB...');
  const projectRes = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: notionHeaders(token),
    body: JSON.stringify({ parent: { database_id: projectsDbId }, properties: projectProperties }),
  });

  if (!projectRes.ok) {
    const err = await projectRes.json().catch(() => ({}));
    console.error('[notion-write-project] Step 1 FAILED:', projectRes.status, JSON.stringify(err).slice(0, 500));
    return json({ error: `项目客户表写入失败 (${projectRes.status})`, detail: err, step: 1 }, projectRes.status);
  }

  const projectPage = await projectRes.json() as any;
  console.log('[notion-write-project] Step 1 OK — projectPageId:', projectPage.id);

  // ── Step 2: Write to Follow-up Log ──────────────────────────────────────────
  const statusLabel = mapTradeStatus(payload.tradeStatus);
  const followupTitle = payload.clientName.trim();

  const noteParts: string[] = [];
  if (payload.source)        noteParts.push(`[来源: ${payload.source}]`);
  if (payload.contactPerson) noteParts.push(`联系人：${payload.contactPerson}`);
  if (payload.countryCity)   noteParts.push(`地区：${payload.countryCity}`);
  if (payload.categories === 'customer_quote_record') noteParts.push('【客户报价留底】');
  else if (payload.categories === 'customer_inquiry') noteParts.push('【客户询价清单】');
  else if (payload.categories === 'boq')              noteParts.push('【BOQ/工程清单】');
  if (payload.driveUrls?.length) {
    payload.driveUrls.forEach(f => f.url && noteParts.push(`附件：${f.name} → ${f.url}`));
  }
  if (payload.lastContext) noteParts.push(payload.lastContext);
  const followupNotes = noteParts.join('\n').slice(0, 2000);

  const followupProperties: Record<string, any> = {
    'Customer（客户）': { title: [{ type: 'text', text: { content: followupTitle } }] },
    '行动状态':  { select: { name: statusLabel } },
    '业务类型':  { select: { name: '项目型' } },
    'Follow-up Date（跟进日期）':   { date: { start: today } },
    'Next Follow-up（下次跟进）':   { date: { start: followUpDate } },
    'Follow-up Method（跟进方式）': { select: { name: mapMethod(payload.followUpMethod) } },
  };
  if (followupNotes) {
    followupProperties['Follow-up Notes（跟进内容）'] = { rich_text: [{ type: 'text', text: { content: followupNotes } }] };
  }
  if (payload.goal) {
    followupProperties['下次行动内容'] = { rich_text: [{ type: 'text', text: { content: payload.goal.slice(0, 2000) } }] };
  }
  if (payload.owner) {
    followupProperties['Follow-up Owner（负责人）'] = { select: { name: payload.owner } };
  }

  console.log('[notion-write-project] Step 2: writing to Follow-up Log...');
  const followupRes = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: notionHeaders(token),
    body: JSON.stringify({ parent: { database_id: followupDbId }, properties: followupProperties }),
  });

  if (!followupRes.ok) {
    const err = await followupRes.json().catch(() => ({}));
    console.error('[notion-write-project] Step 2 FAILED:', followupRes.status, JSON.stringify(err).slice(0, 500));
    return json({
      error: `Follow-up Log 写入失败 (${followupRes.status})`,
      detail: err, step: 2,
      projectPageId: projectPage.id,
    }, followupRes.status);
  }

  const followupPage = await followupRes.json() as any;
  console.log('[notion-write-project] Step 2 OK — followupPageId:', followupPage.id);

  return json({
    ok: true,
    projectPageId: projectPage.id,
    followupPageId: followupPage.id,
  });
}
