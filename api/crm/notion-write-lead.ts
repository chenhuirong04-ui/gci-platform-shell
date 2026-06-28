// Vercel Edge Runtime — Write a new TRADE lead to:
//   Step 1: 小B/C客户池 (SB Pool) → get new SB ID
//   Step 2: Follow-up Log → create entry with that SB ID in title
// If Step 1 fails → abort, return error
// If Step 2 fails → log clearly, return partial error (SB record exists)
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

export interface WriteLeadPayload {
  clientName: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  countryCity?: string;
  lastContext?: string;   // → notes + Follow-up Notes
  goal?: string;          // → 下次行动内容
  nextFollowUpAt?: string; // YYYY-MM-DD
  followUpMethod?: string;
  owner?: string;
  source?: string;        // WhatsApp | FB | 展厅 | 其他
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function notionHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
  };
}

// Query an entire Notion database (paginated, up to 300 records)
async function queryAll(dbId: string, token: string): Promise<any[]> {
  const results: any[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 3; page++) {
    const body: any = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method: 'POST',
      headers: notionHeaders(token),
      body: JSON.stringify(body),
    });
    if (!res.ok) break;
    const data: any = await res.json();
    results.push(...(data.results ?? []));
    if (!data.has_more) break;
    cursor = data.next_cursor;
  }
  return results;
}

// Extract text from rich_text or title property
function getText(prop: any): string {
  if (!prop) return '';
  const arr = prop.rich_text ?? prop.title ?? [];
  return Array.isArray(arr) ? arr.map((t: any) => t.plain_text ?? '').join('') : '';
}

// Find max SB number from SB Pool (reads 客户ID field)
function maxSBFromPool(pages: any[]): number {
  let max = 0;
  for (const page of pages) {
    const idField = page.properties?.['客户ID'];
    const val = getText(idField).trim();
    const m = val.match(/^SB(\d+)$/i);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max;
}

// Find max SB number from Follow-up Log (reads title like "SB007 | ClientName")
function maxSBFromFollowup(pages: any[]): number {
  let max = 0;
  for (const page of pages) {
    const props = page.properties ?? {};
    // Find title property dynamically
    const titleProp = Object.values(props).find((p: any) => p.type === 'title') as any;
    const title = getText(titleProp).trim();
    const m = title.match(/^SB(\d+)\s*\|/i);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max;
}

// Format SB ID: SB007 (always 3 digits)
function formatSBId(n: number): string {
  return 'SB' + String(n).padStart(3, '0');
}

// Map source string to SB Pool 来源 select option
function mapSource(source?: string): string {
  if (!source) return '其他';
  const s = source.toLowerCase();
  if (s.includes('whatsapp') || s.includes('wa')) return 'WhatsApp';
  if (s.includes('facebook') || s.includes('fb') || s.includes('marketplace')) return 'FB Marketplace';
  if (s.includes('instagram') || s.includes('ig')) return 'Instagram';
  if (s.includes('展厅') || s.includes('showroom')) return '展厅到访';
  if (s.includes('icare')) return 'iCare Dubai';
  return '其他';
}

// Map followUpMethod to Follow-up Log 跟进方式 options (all lowercase)
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

// ── Main handler ─────────────────────────────────────────────────────────────

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const token       = process.env.NOTION_TOKEN;
  const sbDbId      = process.env.NOTION_SB_DB_ID;
  const followupDbId = process.env.NOTION_FOLLOWUP_DB_ID;

  if (!token || !sbDbId || !followupDbId) {
    const missing = [!token && 'NOTION_TOKEN', !sbDbId && 'NOTION_SB_DB_ID', !followupDbId && 'NOTION_FOLLOWUP_DB_ID']
      .filter(Boolean).join(', ');
    console.error('[notion-write-lead] Missing env vars:', missing);
    return json({ error: `Missing env vars: ${missing}` }, 500);
  }

  let payload: WriteLeadPayload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  if (!payload.clientName?.trim()) {
    return json({ error: 'clientName is required' }, 400);
  }

  const today    = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const followUpDate = payload.nextFollowUpAt?.slice(0, 10) || tomorrow;

  // ── Step 0: Generate next SB ID ─────────────────────────────────────────────
  console.log('[notion-write-lead] querying SB Pool and Follow-up Log for max SB number...');

  const [sbPages, followupPages] = await Promise.all([
    queryAll(sbDbId, token),
    queryAll(followupDbId, token),
  ]);

  const maxFromPool    = maxSBFromPool(sbPages);
  const maxFromFollowup = maxSBFromFollowup(followupPages);
  const maxSB          = Math.max(maxFromPool, maxFromFollowup);
  const newSBId        = formatSBId(maxSB + 1);

  console.log(`[notion-write-lead] SB Pool max=${maxFromPool}, FollowupLog max=${maxFromFollowup} → newId=${newSBId}`);

  // ── Step 1: Write to 小B/C客户池 ────────────────────────────────────────────
  const sbProperties: Record<string, any> = {
    '客户名称': { title: [{ type: 'text', text: { content: payload.clientName.trim() } }] },
    '客户ID':   { rich_text: [{ type: 'text', text: { content: newSBId } }] },
    '当前状态': { select: { name: '新询价' } },
    '需求等级': { select: { name: 'B — 正常询价' } },
    '下一步动作': { select: { name: '二次跟进' } },
    '来源':     { select: { name: mapSource(payload.source || payload.followUpMethod) } },
  };
  if (payload.phone || payload.whatsapp) {
    sbProperties['电话/WhatsApp'] = { phone_number: (payload.whatsapp || payload.phone || '').trim() };
  }
  if (payload.lastContext) {
    sbProperties['最后沟通内容'] = { rich_text: [{ type: 'text', text: { content: payload.lastContext.slice(0, 2000) } }] };
  }
  if (followUpDate) {
    sbProperties['下次跟进日期'] = { date: { start: followUpDate } };
  }

  console.log(`[notion-write-lead] Step 1: writing ${newSBId} to SB Pool...`);
  const sbRes = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: notionHeaders(token),
    body: JSON.stringify({ parent: { database_id: sbDbId }, properties: sbProperties }),
  });

  if (!sbRes.ok) {
    const sbErr = await sbRes.json().catch(() => ({}));
    console.error('[notion-write-lead] Step 1 FAILED — SB Pool write error:', sbRes.status, JSON.stringify(sbErr).slice(0, 500));
    return json({ error: `SB Pool write failed (${sbRes.status})`, detail: sbErr, step: 1 }, sbRes.status);
  }

  const sbPage = await sbRes.json() as any;
  console.log(`[notion-write-lead] Step 1 OK — SB Pool pageId: ${sbPage.id}`);

  // ── Step 2: Write to Follow-up Log ──────────────────────────────────────────
  const followupTitle = `${newSBId} | ${payload.clientName.trim()}`;
  const notes = [
    payload.source ? `[来源: ${payload.source}]` : '',
    payload.lastContext || '',
  ].filter(Boolean).join('\n').slice(0, 2000);

  const followupProperties: Record<string, any> = {
    'Customer（客户）': { title: [{ type: 'text', text: { content: followupTitle } }] },
    '行动状态':  { select: { name: '新询盘' } },
    '业务类型':  { select: { name: '贸易型' } },
    'Follow-up Date（跟进日期）':  { date: { start: today } },
    'Next Follow-up（下次跟进）':  { date: { start: followUpDate } },
    'Follow-up Method（跟进方式）': { select: { name: mapMethod(payload.followUpMethod) } },
  };
  if (notes) {
    followupProperties['Follow-up Notes（跟进内容'] = { rich_text: [{ type: 'text', text: { content: notes } }] };
  }
  if (payload.goal) {
    followupProperties['下次行动内容'] = { rich_text: [{ type: 'text', text: { content: payload.goal.slice(0, 2000) } }] };
  }
  if (payload.owner) {
    followupProperties['Follow-up Owner（负责人）'] = { select: { name: payload.owner } };
  }

  console.log(`[notion-write-lead] Step 2: writing "${followupTitle}" to Follow-up Log...`);
  const followupRes = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: notionHeaders(token),
    body: JSON.stringify({ parent: { database_id: followupDbId }, properties: followupProperties }),
  });

  if (!followupRes.ok) {
    const followupErr = await followupRes.json().catch(() => ({}));
    console.error('[notion-write-lead] Step 2 FAILED — Follow-up Log write error:',
      followupRes.status, JSON.stringify(followupErr).slice(0, 500));
    // SB Pool was already written — return partial failure with sbId so caller knows
    return json({
      error: `Follow-up Log write failed (${followupRes.status})`,
      detail: followupErr,
      step: 2,
      sbId: newSBId,
      sbPageId: sbPage.id,
    }, followupRes.status);
  }

  const followupPage = await followupRes.json() as any;
  console.log(`[notion-write-lead] Step 2 OK — Follow-up Log pageId: ${followupPage.id}`);
  console.log(`[notion-write-lead] SUCCESS — created ${newSBId} | ${payload.clientName.trim()}`);

  return json({
    ok: true,
    sbId: newSBId,
    sbPageId: sbPage.id,
    followupPageId: followupPage.id,
  });
}
