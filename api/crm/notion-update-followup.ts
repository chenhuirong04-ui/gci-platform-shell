// /api/crm/notion-update-followup
// PATCH an existing Follow-up Log page with updated fields from CRM edit.
// Only touches Follow-up Log. Never creates new pages or touches SB Pool.
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

// Map local status → Notion 行动状态 select value
// Notion real options (confirmed 2026-07-09):
//   合同待签 | 新询盘 | 需求整理中 | 待报价 | 已报价待确认 | 执行中 | 暂缓
const VALID_STATUS_SET = new Set([
  '合同待签', '新询盘', '需求整理中', '待报价', '已报价待确认', '执行中', '暂缓',
]);
const LEGACY_STATUS_MAP: Record<string, string> = {
  '已报价':       '已报价待确认',
  '等待客户回复': '已报价待确认',
  '待签合同':     '合同待签',
  '已成交':       '执行中',
  '已完成':       '暂缓',
  '新建':         '新询盘',
  // English / internal names
  'pending':      '新询盘',
  'todo':         '新询盘',
  'in_progress':  '执行中',
  'completed':    '暂缓',
  'paused':       '暂缓',
  'archived':     '暂缓',
};
function mapStatus(status?: string): string | null {
  if (!status) return null;
  if (VALID_STATUS_SET.has(status)) return status;
  return LEGACY_STATUS_MAP[status] ?? LEGACY_STATUS_MAP[status.toLowerCase()] ?? null;
}

// Map local businessType → Notion 业务类型 select value
function mapBusinessType(bt?: string): string | null {
  if (!bt) return null;
  const b = bt.toUpperCase();
  if (b === 'TRADE' || bt === '贸易询盘') return '贸易型';
  if (b === 'PROJECT' || bt === '项目推进') return '项目型';
  if (b === 'LOG_ONLY' || bt === '仅记录') return '仅记录';
  if (b === 'INTERNAL' || bt === '内部事项') return '内部';
  return null;
}

export interface UpdateFollowupPayload {
  pageId: string;
  nextFollowUpAt?: string;   // YYYY-MM-DD or ISO string
  lastNote?: string;         // Follow-up Notes
  inquirySummary?: string;   // 下次行动内容
  owner?: string;            // Follow-up Owner
  status?: string;           // → 行动状态
  businessType?: string;     // → 业务类型
  followUpDate?: string;     // Follow-up Date (today), optional
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const token = process.env.NOTION_TOKEN;
  if (!token) return json({ error: 'NOTION_TOKEN not configured' }, 500);

  let payload: UpdateFollowupPayload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { pageId } = payload;

  if (!pageId || typeof pageId !== 'string' || pageId.length < 10) {
    return json({ error: 'pageId is required and must be a valid Notion page ID' }, 400);
  }

  // Reject local-only IDs
  if (/^(LEAD_|HIST_|SYNTH_|INT_|NOTION-)/i.test(pageId)) {
    return json({
      ok: false,
      noNotionPage: true,
      error: 'pageId is a local-only ID — no Notion page exists for this record',
    }, 422);
  }

  const properties: Record<string, any> = {};

  // Next Follow-up date
  if (payload.nextFollowUpAt) {
    const dateStr = payload.nextFollowUpAt.slice(0, 10);
    properties['Next Follow-up（下次跟进）'] = { date: { start: dateStr } };
  }

  // Follow-up Date (optional — when caller wants to stamp today)
  if (payload.followUpDate) {
    properties['Follow-up Date（跟进日期）'] = { date: { start: payload.followUpDate.slice(0, 10) } };
  }

  // Follow-up Notes (same truncated key as notion-write-lead)
  if (payload.lastNote) {
    properties['Follow-up Notes（跟进内容）'] = {
      rich_text: [{ type: 'text', text: { content: payload.lastNote.slice(0, 2000) } }],
    };
  }

  // 下次行动内容
  if (payload.inquirySummary) {
    properties['下次行动内容'] = {
      rich_text: [{ type: 'text', text: { content: payload.inquirySummary.slice(0, 2000) } }],
    };
  }

  // Follow-up Owner
  if (payload.owner) {
    properties['Follow-up Owner（负责人）'] = { select: { name: payload.owner } };
  }

  // 行动状态
  const statusVal = mapStatus(payload.status);
  if (statusVal) {
    properties['行动状态'] = { select: { name: statusVal } };
  }

  // 业务类型
  const btVal = mapBusinessType(payload.businessType);
  if (btVal) {
    properties['业务类型'] = { select: { name: btVal } };
  }

  if (Object.keys(properties).length === 0) {
    return json({ ok: true, pageId, updated: 0, message: 'No fields to update' });
  }

  const notionRes = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ properties }),
  });

  if (!notionRes.ok) {
    const errBody = await notionRes.json().catch(() => ({}));
    console.error('[notion-update-followup] PATCH failed:', notionRes.status, errBody);
    return json(
      { ok: false, error: `Notion API error ${notionRes.status}`, detail: errBody },
      notionRes.status,
    );
  }

  const updatedPage = await notionRes.json() as any;
  console.log(`[notion-update-followup] OK — pageId=${pageId}, fields=${Object.keys(properties).join(', ')}`);

  return json({
    ok: true,
    pageId,
    updatedAt: updatedPage.last_edited_time || new Date().toISOString(),
    updatedFields: Object.keys(properties),
  });
}
