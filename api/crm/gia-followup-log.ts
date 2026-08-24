// /api/crm/gia-followup-log
// POST — GIA's own natural-language follow-up logger. Writes ONE new page to
// the existing Follow-up Log跟进记录 database — never touches SB Pool (unlike
// notion-write-lead.ts), never requires a pre-existing CRM/SB customer (a
// bare contact/inquiry name is enough), never creates a second Notion
// database, never touches schema. Read-only for everything else — the
// existing Notion → Telegram reminder automation is untouched by this file.
export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

export interface GiaFollowupLogPayload {
  customerName: string;
  followUpDateToday: string; // YYYY-MM-DD
  method?: string | null;
  notes: string;
  status?: string | null;
  businessType?: string | null;
  nextFollowUpAt?: string | null; // YYYY-MM-DD
  nextAction?: string | null;
  owner?: string | null;
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const token = process.env.NOTION_TOKEN;
  const followupDbId = process.env.NOTION_FOLLOWUP_DB_ID;
  if (!token || !followupDbId) {
    const missing = [!token && 'NOTION_TOKEN', !followupDbId && 'NOTION_FOLLOWUP_DB_ID'].filter(Boolean).join(', ');
    return json({ error: `Missing env vars: ${missing}` }, 500);
  }

  let payload: GiaFollowupLogPayload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  if (!payload.customerName?.trim() || !payload.followUpDateToday || !payload.notes?.trim()) {
    return json({ error: 'customerName, followUpDateToday and notes are required' }, 400);
  }

  const properties: Record<string, any> = {
    'Customer（客户）': { title: [{ type: 'text', text: { content: payload.customerName.trim().slice(0, 200) } }] },
    'Follow-up Date（跟进日期）': { date: { start: payload.followUpDateToday } },
    'Follow-up Notes（跟进内容）': { rich_text: [{ type: 'text', text: { content: payload.notes.slice(0, 2000) } }] },
  };
  if (payload.nextFollowUpAt) properties['Next Follow-up（下次跟进）'] = { date: { start: payload.nextFollowUpAt } };
  if (payload.nextAction) properties['下次行动内容'] = { rich_text: [{ type: 'text', text: { content: payload.nextAction.slice(0, 2000) } }] };
  if (payload.method) properties['Follow-up Method（跟进方式）'] = { select: { name: payload.method } };
  if (payload.status) properties['行动状态'] = { select: { name: payload.status } };
  if (payload.businessType) properties['业务类型'] = { select: { name: payload.businessType } };
  if (payload.owner) properties['Follow-up Owner（负责人）'] = { select: { name: payload.owner } };

  const write = (props: Record<string, any>) =>
    fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
      body: JSON.stringify({ parent: { database_id: followupDbId }, properties: props }),
    });

  const res = await write(properties);
  if (res.ok) {
    const page = await res.json() as any;
    console.log(`[gia-followup-log] OK — pageId: ${page.id}`);
    return json({ ok: true, pageId: page.id });
  }

  const errBody = await res.json().catch(() => ({}));
  const errMsg = `Notion ${res.status}: ${(errBody as any)?.message || JSON.stringify(errBody).slice(0, 300)}`;
  console.error('[gia-followup-log] FAILED:', errMsg);

  // Retry with only the always-safe fields (title + date + notes) — same
  // resilience pattern as notion-create-followup-only.ts / notion-write-lead.ts:
  // a select option name that doesn't exactly match the DB's real options
  // must never block the whole record from landing in Follow-up Log.
  const minimal: Record<string, any> = {
    'Customer（客户）': properties['Customer（客户）'],
    'Follow-up Date（跟进日期）': properties['Follow-up Date（跟进日期）'],
    'Follow-up Notes（跟进内容）': properties['Follow-up Notes（跟进内容）'],
  };
  if (properties['Next Follow-up（下次跟进）']) minimal['Next Follow-up（下次跟进）'] = properties['Next Follow-up（下次跟进）'];
  if (properties['下次行动内容']) minimal['下次行动内容'] = properties['下次行动内容'];

  const retry = await write(minimal);
  if (!retry.ok) {
    const retryErr = await retry.json().catch(() => ({}));
    const retryErrMsg = `Notion ${retry.status}: ${(retryErr as any)?.message || JSON.stringify(retryErr).slice(0, 300)}`;
    console.error('[gia-followup-log] Retry also FAILED:', retryErrMsg);
    return json({ ok: false, error: retryErrMsg, firstError: errMsg });
  }
  const retryPage = await retry.json() as any;
  console.log(`[gia-followup-log] Retry OK (minimal fields) — pageId: ${retryPage.id}`);
  return json({ ok: true, pageId: retryPage.id, minimal: true });
}
