// Vercel Edge Runtime — Close a Follow-up Log record (write back to Notion)
// SAFETY: Only updates Follow-up Log pages. Never touches Projects DB or SB Pool.
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

type Action = 'close_followup' | 'restore_followup' | 'update_status';

interface UpdatePayload {
  pageId: string;          // Notion page ID of the Follow-up Log record
  action: Action;
  tradeStatus?: string;    // defaults to '暂缓' for close / '跟进中' for restore; required for update_status
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const token = process.env.NOTION_TOKEN;
  if (!token) return json({ error: 'NOTION_TOKEN not configured' }, 500);

  let payload: UpdatePayload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { pageId, action, tradeStatus = '暂缓' } = payload;

  if (!pageId || typeof pageId !== 'string' || pageId.length < 10) {
    return json({ error: 'pageId is required and must be a valid Notion page ID' }, 400);
  }

  // Reject local-only IDs (LEAD_xxx, HIST_xxx) that have no Notion page
  if (/^(LEAD_|HIST_|SYNTH_|INT_)/i.test(pageId)) {
    return json({ error: 'pageId is a local-only ID — no Notion page exists for this record' }, 422);
  }

  if (action !== 'close_followup' && action !== 'restore_followup' && action !== 'update_status') {
    return json({ error: `Unknown action: ${action}. Supported: close_followup, restore_followup, update_status.` }, 400);
  }

  // Determine what to write to 行动状态
  let statusToWrite: string;
  if (action === 'restore_followup') {
    statusToWrite = '跟进中';
  } else if (action === 'update_status') {
    // Caller supplies target status directly; validate it's non-empty
    if (!tradeStatus || typeof tradeStatus !== 'string') {
      return json({ error: 'tradeStatus is required for update_status action' }, 400);
    }
    statusToWrite = tradeStatus;
  } else {
    // close_followup: only allow known closed statuses
    const ALLOWED_CLOSED = ['暂缓', '已归档', '已成交', '已关闭'];
    statusToWrite = ALLOWED_CLOSED.includes(tradeStatus) ? tradeStatus : '暂缓';
  }

  // PATCH only Follow-up Log — we trust the caller's pageId comes from task.leadId
  // which originates from notion-sync.ts (Follow-up Log only).
  const notionRes = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        // Only update 行动状态. Nothing else. Projects DB / SB Pool untouched.
        '行动状态': { select: { name: statusToWrite } },
      },
    }),
  });

  if (!notionRes.ok) {
    const errBody = await notionRes.json().catch(() => ({}));
    console.error('[notion-update] PATCH failed:', notionRes.status, errBody);
    return json(
      { error: `Notion API error ${notionRes.status}`, detail: errBody },
      notionRes.status
    );
  }

  console.log(`[notion-update] ${action}: pageId=${pageId}, status=${statusToWrite}`);
  return json({
    ok: true,
    pageId,
    action,
    updatedField: '行动状态',
    updatedValue: statusToWrite,
    database: 'Follow-up Log only',
  });
}
