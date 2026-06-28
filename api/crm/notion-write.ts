// Vercel Edge Runtime — Write back to a Notion Follow-up Log page (PATCH)
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

// Whitelist — only these Notion properties may be written
const ALLOWED_FIELDS = new Set([
  '行动状态',
  'Follow-up Notes',
  '下次行动内容',
  'Next Follow-up',
  'Follow-up Date',
  'Follow-up Method',
  'Follow-up Owner',
]);

export interface NotionWritePayload {
  pageId: string;
  fields: {
    tradeStatus?: string;        // → 行动状态 (select)
    followUpNotes?: string;      // → Follow-up Notes (rich_text, overwrite)
    nextAction?: string;         // → 下次行动内容 (rich_text)
    nextFollowUpAt?: string;     // → Next Follow-up (date, YYYY-MM-DD)
    followUpDate?: string;       // → Follow-up Date (date, YYYY-MM-DD)
    followUpMethod?: string;     // → Follow-up Method (select)
    owner?: string;              // → Follow-up Owner (select)
  };
}

function buildProperties(fields: NotionWritePayload['fields']): Record<string, any> {
  const props: Record<string, any> = {};

  if (fields.tradeStatus) {
    props['行动状态'] = { select: { name: fields.tradeStatus } };
  }
  if (fields.followUpNotes !== undefined) {
    // Notion rich_text max 2000 chars per element
    const content = fields.followUpNotes.slice(0, 2000);
    props['Follow-up Notes'] = {
      rich_text: [{ type: 'text', text: { content } }],
    };
  }
  if (fields.nextAction) {
    props['下次行动内容'] = {
      rich_text: [{ type: 'text', text: { content: fields.nextAction.slice(0, 2000) } }],
    };
  }
  if (fields.nextFollowUpAt) {
    props['Next Follow-up'] = { date: { start: fields.nextFollowUpAt } };
  }
  if (fields.followUpDate) {
    props['Follow-up Date'] = { date: { start: fields.followUpDate } };
  }
  if (fields.followUpMethod) {
    props['Follow-up Method'] = { select: { name: fields.followUpMethod } };
  }
  if (fields.owner) {
    props['Follow-up Owner'] = { select: { name: fields.owner } };
  }

  // Safety: strip any key not in whitelist
  for (const key of Object.keys(props)) {
    if (!ALLOWED_FIELDS.has(key)) delete props[key];
  }

  return props;
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const token = process.env.NOTION_TOKEN;
  if (!token) return json({ error: 'NOTION_TOKEN not configured' }, 500);

  let payload: NotionWritePayload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { pageId, fields } = payload;
  if (!pageId || typeof pageId !== 'string') {
    return json({ error: 'pageId is required' }, 400);
  }
  if (!fields || typeof fields !== 'object') {
    return json({ error: 'fields is required' }, 400);
  }

  const properties = buildProperties(fields);
  if (Object.keys(properties).length === 0) {
    return json({ error: 'No valid fields to write' }, 400);
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
    console.error('[notion-write] PATCH failed:', notionRes.status, errBody);
    return json(
      { error: `Notion API error ${notionRes.status}`, detail: errBody },
      notionRes.status
    );
  }

  return json({ ok: true, updatedFields: Object.keys(properties) });
}
