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

// Map UI action status to Notion 行动状态 select value.
// Notion real options (confirmed 2026-07-09):
//   合同待签 | 新询盘 | 需求整理中 | 待报价 | 已报价待确认 | 执行中 | 暂缓
function mapTradeStatus(status?: string): string {
  if (!status) return '新询盘';
  const MAP: Record<string, string> = {
    '新询盘':       '新询盘',
    '需求整理中':   '需求整理中',
    '待报价':       '待报价',
    '已报价待确认': '已报价待确认',
    '合同待签':     '合同待签',
    '执行中':       '执行中',
    '暂缓':         '暂缓',
    // Legacy values → nearest Notion equivalent
    '已报价':       '已报价待确认',
    '等待客户回复': '已报价待确认',
    '待签合同':     '合同待签',
    '已成交':       '执行中',
    '已完成':       '已归档',
    '新建':         '新询盘',
  };
  return MAP[status] ?? '新询盘';
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
  // Skip countryCity if it's the placeholder 'Unknown' — adds no value to the project description
  if (payload.countryCity && payload.countryCity !== 'Unknown') contextParts.push(`地区：${payload.countryCity}`);
  if (payload.categories === 'customer_quote_record') contextParts.push('【客户报价留底】');
  else if (payload.categories === 'customer_inquiry') contextParts.push('【客户询价清单】');
  else if (payload.categories === 'boq')              contextParts.push('【BOQ/工程清单】');
  if (payload.driveUrls?.length) {
    payload.driveUrls.forEach(f => f.url && contextParts.push(`附件：${f.name} → ${f.url}`));
  }
  if (payload.lastContext) contextParts.push(payload.lastContext);
  const enrichedContext = contextParts.join('\n').slice(0, 4000);

  // ── Step 1: Write to Business Master (🏗️ Business Master) ──────────────────
  // Real schema confirmed 2026-07-10 via Notion MCP:
  //   项目名称 (title), 客户名 (text), 项目类型 (select), 项目阶段 (select),
  //   项目情况 (text), 城市 (text), 联系电话 (phone_number), 联系邮件 (email),
  //   联系人 (text), 负责人 (select: Chris/lili/novie), 下次跟进日期 (date)
  // Fields that DO NOT exist: 客户名称, 业务类型, 电话, WhatsApp, Email, 备注
  // Use goal (nextAction) as title suffix — it's a short action summary, not the full context
  const goalSnippet = (payload.goal || payload.lastContext || '').trim().slice(0, 50);
  const projectTitle = goalSnippet
    ? `${payload.clientName.trim()} — ${goalSnippet}`
    : payload.clientName.trim();
  const projectProperties: Record<string, any> = {
    '项目名称': { title: [{ type: 'text', text: { content: projectTitle } }] },
    '客户名':   { rich_text: [{ type: 'text', text: { content: payload.clientName.trim() } }] },
    '项目阶段': { select: { name: '询盘' } },
    '项目类型': { select: { name: '贸易采购类' } },
  };
  if (payload.phone || payload.whatsapp) {
    const phone = (payload.whatsapp || payload.phone || '').trim();
    if (phone) projectProperties['联系电话'] = { phone_number: phone };
  }
  if (payload.countryCity) {
    projectProperties['城市'] = { rich_text: [{ type: 'text', text: { content: payload.countryCity } }] };
  }
  if (payload.email) {
    projectProperties['联系邮件'] = { email: payload.email.trim() };
  }
  if (payload.contactPerson) {
    projectProperties['联系人'] = { rich_text: [{ type: 'text', text: { content: payload.contactPerson } }] };
  }
  if (enrichedContext) {
    projectProperties['项目情况'] = { rich_text: [{ type: 'text', text: { content: enrichedContext } }] };
  }
  // 负责人 select must be one of: Chris, lili, novie
  const ownerVal = (payload.owner === 'lili' || payload.owner === 'novie') ? payload.owner : 'Chris';
  projectProperties['负责人'] = { select: { name: ownerVal } };
  if (followUpDate) {
    projectProperties['下次跟进日期'] = { date: { start: followUpDate } };
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
  if (payload.countryCity && payload.countryCity !== 'Unknown') noteParts.push(`地区：${payload.countryCity}`);
  if (payload.categories === 'customer_quote_record') noteParts.push('【客户报价留底】');
  else if (payload.categories === 'customer_inquiry') noteParts.push('【客户询价清单】');
  else if (payload.categories === 'boq')              noteParts.push('【BOQ/工程清单】');
  if (payload.driveUrls?.length) {
    payload.driveUrls.forEach(f => f.url && noteParts.push(`附件：${f.name} → ${f.url}`));
  }
  if (payload.lastContext) noteParts.push(payload.lastContext);
  const followupNotes = noteParts.join('\n').slice(0, 4000);

  // 项目背景 = the full project context (same as 项目情况 in Business Master)
  // Use enrichedContext so both databases get the same content.
  const projectBackground = enrichedContext || followupNotes;

  console.log('[notion-write-project] Step 2 debug:',
    'followupNotes.len=', followupNotes.length,
    '| projectBackground.len=', projectBackground.length,
    '| goal=', payload.goal?.slice(0, 80));

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
  if (projectBackground) {
    followupProperties['项目背景'] = { rich_text: [{ type: 'text', text: { content: projectBackground } }] };
  }
  if (payload.goal) {
    followupProperties['下次行动内容'] = { rich_text: [{ type: 'text', text: { content: payload.goal.slice(0, 2000) } }] };
  }
  // Follow-up Owner: must be one of Chris / lili / novie (Notion select)
  const validOwners = new Set(['Chris', 'lili', 'novie']);
  const ownerForLog = validOwners.has(payload.owner ?? '') ? payload.owner! : 'Chris';
  followupProperties['Follow-up Owner（负责人）'] = { select: { name: ownerForLog } };

  const writeFollowup = (props: Record<string, any>) =>
    fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: notionHeaders(token),
      body: JSON.stringify({ parent: { database_id: followupDbId }, properties: props }),
    });

  console.log('[notion-write-project] Step 2: writing to Follow-up Log...');
  let followupRes = await writeFollowup(followupProperties);

  if (!followupRes.ok) {
    const firstErr = await followupRes.json().catch(() => ({}));
    console.warn('[notion-write-project] Step 2 full write failed, retrying minimal fields:',
      followupRes.status, JSON.stringify(firstErr).slice(0, 200));

    const minimalProps: Record<string, any> = {
      'Customer（客户）': followupProperties['Customer（客户）'],
      'Follow-up Date（跟进日期）': followupProperties['Follow-up Date（跟进日期）'],
      'Next Follow-up（下次跟进）': followupProperties['Next Follow-up（下次跟进）'],
    };
    if (followupProperties['Follow-up Notes（跟进内容）']) {
      minimalProps['Follow-up Notes（跟进内容）'] = followupProperties['Follow-up Notes（跟进内容）'];
    }
    if (followupProperties['项目背景']) {
      minimalProps['项目背景'] = followupProperties['项目背景'];
    }
    if (followupProperties['下次行动内容']) {
      minimalProps['下次行动内容'] = followupProperties['下次行动内容'];
    }

    followupRes = await writeFollowup(minimalProps);

    if (!followupRes.ok) {
      const err2 = await followupRes.json().catch(() => ({}));
      const followupError = `Follow-up Log ${followupRes.status}: ${(err2 as any)?.message || JSON.stringify(err2).slice(0, 200)}`;
      console.error('[notion-write-project] Step 2 FAILED even with minimal fields:', followupError);
      return json({
        ok: true,
        partial: true,
        projectPageId: projectPage.id,
        followupCreated: false,
        followupError,
      });
    }
    console.log('[notion-write-project] Step 2 retry OK (minimal fields)');
  }

  const followupPage = await followupRes.json() as any;
  console.log('[notion-write-project] Step 2 OK — followupPageId:', followupPage.id);

  return json({
    ok: true,
    partial: false,
    projectPageId: projectPage.id,
    followupPageId: followupPage.id,
    followupCreated: true,
  });
}
