// /api/crm/notion-create-followup-only
// POST — Create a Follow-up Log entry for an EXISTING SB Pool client.
// Used to backfill Follow-up Log when notion-write-lead returned partial:true.
// Never creates or modifies SB Pool entries.
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

export interface CreateFollowupOnlyPayload {
  sbId: string;           // e.g. "SB009"
  customerName: string;   // e.g. "RAY"
  tradeStatus?: string;
  businessType?: string;
  owner?: string;
  notes?: string;
  goal?: string;
  nextFollowUpAt?: string; // YYYY-MM-DD
  phone?: string;
  whatsapp?: string;
  driveUrls?: Array<{ name: string; url: string }>;
  source?: string;
}

const VALID_STATUS_SET = new Set([
  '合同待签', '新询盘', '需求整理中', '待报价', '已报价待确认', '执行中', '暂缓',
]);
const LEGACY_STATUS_MAP: Record<string, string> = {
  '已报价': '已报价待确认',
  '等待客户回复': '已报价待确认',
  '待签合同': '合同待签',
  '已成交': '执行中',
  '已完成': '暂缓',
  '新建': '新询盘',
  'pending': '新询盘',
  'todo': '新询盘',
  'in_progress': '执行中',
  'completed': '暂缓',
  'paused': '暂缓',
};
function mapTradeStatus(status?: string): string {
  if (!status) return '新询盘';
  if (VALID_STATUS_SET.has(status)) return status;
  return LEGACY_STATUS_MAP[status] ?? LEGACY_STATUS_MAP[status.toLowerCase()] ?? '新询盘';
}

function mapBusinessType(bt?: string): string {
  if (!bt) return '贸易型';
  const b = bt.toUpperCase();
  if (b === 'PROJECT' || bt === '项目型') return '项目型';
  if (b === 'INTERNAL' || bt === '内部') return '内部';
  return '贸易型';
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const token = process.env.NOTION_TOKEN;
  const followupDbId = process.env.NOTION_FOLLOWUP_DB_ID;

  if (!token || !followupDbId) {
    const missing = [!token && 'NOTION_TOKEN', !followupDbId && 'NOTION_FOLLOWUP_DB_ID']
      .filter(Boolean).join(', ');
    return json({ error: `Missing env vars: ${missing}` }, 500);
  }

  let payload: CreateFollowupOnlyPayload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  if (!payload.sbId?.trim() || !payload.customerName?.trim()) {
    return json({ error: 'sbId and customerName are required' }, 400);
  }

  const today    = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const followUpDate = payload.nextFollowUpAt?.slice(0, 10) || tomorrow;
  const title = `${payload.sbId.toUpperCase()} | ${payload.customerName.trim()}`;

  // Build notes
  const noteParts: string[] = [];
  if (payload.source) noteParts.push(`[来源: ${payload.source}]`);
  if (payload.driveUrls?.length) {
    payload.driveUrls.forEach(f => f.url && noteParts.push(`附件：${f.name} → ${f.url}`));
  }
  if (payload.notes) noteParts.push(payload.notes);
  const followupNotes = noteParts.join('\n').slice(0, 2000);

  const properties: Record<string, any> = {
    'Customer（客户）': { title: [{ type: 'text', text: { content: title } }] },
    '行动状态': { select: { name: mapTradeStatus(payload.tradeStatus) } },
    '业务类型': { select: { name: mapBusinessType(payload.businessType) } },
    'Follow-up Date（跟进日期）': { date: { start: today } },
    'Next Follow-up（下次跟进）': { date: { start: followUpDate } },
  };
  if (followupNotes) {
    properties['Follow-up Notes（跟进内容）'] = {
      rich_text: [{ type: 'text', text: { content: followupNotes } }],
    };
  }
  if (payload.goal) {
    properties['下次行动内容'] = {
      rich_text: [{ type: 'text', text: { content: payload.goal.slice(0, 2000) } }],
    };
  }
  if (payload.owner) {
    properties['Follow-up Owner（负责人）'] = { select: { name: payload.owner } };
  }

  console.log(`[notion-create-followup-only] Creating Follow-up Log for "${title}"...`);

  const notionRes = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ parent: { database_id: followupDbId }, properties }),
  });

  if (!notionRes.ok) {
    const errBody = await notionRes.json().catch(() => ({}));
    const errMsg = `Notion ${notionRes.status}: ${(errBody as any)?.message || JSON.stringify(errBody).slice(0, 300)}`;
    console.error('[notion-create-followup-only] FAILED:', errMsg);

    // Retry with minimal safe fields (title + dates only)
    const minimalProps: Record<string, any> = {
      'Customer（客户）': properties['Customer（客户）'],
      'Follow-up Date（跟进日期）': properties['Follow-up Date（跟进日期）'],
      'Next Follow-up（下次跟进）': properties['Next Follow-up（下次跟进）'],
    };
    if (properties['Follow-up Notes（跟进内容）']) {
      minimalProps['Follow-up Notes（跟进内容）'] = properties['Follow-up Notes（跟进内容）'];
    }

    const retryRes = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ parent: { database_id: followupDbId }, properties: minimalProps }),
    });

    if (!retryRes.ok) {
      const retryErr = await retryRes.json().catch(() => ({}));
      const retryErrMsg = `Notion ${retryRes.status}: ${(retryErr as any)?.message || JSON.stringify(retryErr).slice(0, 300)}`;
      console.error('[notion-create-followup-only] Retry also FAILED:', retryErrMsg);
      return json({ ok: false, error: retryErrMsg, firstError: errMsg });
    }

    const retryPage = await retryRes.json() as any;
    console.log(`[notion-create-followup-only] Retry OK (minimal fields) — pageId: ${retryPage.id}`);
    return json({ ok: true, followupPageId: retryPage.id, minimal: true });
  }

  const page = await notionRes.json() as any;
  console.log(`[notion-create-followup-only] OK — pageId: ${page.id}`);
  return json({ ok: true, followupPageId: page.id });
}
