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

  // Phase 1 — CORE properties only: title/date/rich_text. These property
  // types cannot 400 on an "invalid option" the way select fields can, so
  // Next Follow-up（下次跟进）is guaranteed to land on this very first
  // request, never contingent on whether a guessed select value (method/
  // status/businessType below) happens to match the database's real option
  // list. This is the actual fix for "date computed correctly but missing
  // in Notion" — previously all fields were sent together, so an invalid
  // select option could 400 the whole page, and even though the retry also
  // included Next Follow-up, decoupling it entirely removes any dependency
  // between date fields and select-field correctness.
  const coreProperties: Record<string, any> = {
    'Customer（客户）': { title: [{ type: 'text', text: { content: payload.customerName.trim().slice(0, 200) } }] },
    'Follow-up Date（跟进日期）': { date: { start: payload.followUpDateToday } },
    'Follow-up Notes（跟进内容）': { rich_text: [{ type: 'text', text: { content: payload.notes.slice(0, 2000) } }] },
  };
  if (payload.nextFollowUpAt) coreProperties['Next Follow-up（下次跟进）'] = { date: { start: payload.nextFollowUpAt } };
  if (payload.nextAction) coreProperties['下次行动内容'] = { rich_text: [{ type: 'text', text: { content: payload.nextAction.slice(0, 2000) } }] };

  const createRes = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
    body: JSON.stringify({ parent: { database_id: followupDbId }, properties: coreProperties }),
  });

  if (!createRes.ok) {
    const errBody = await createRes.json().catch(() => ({}));
    const errMsg = `Notion ${createRes.status}: ${(errBody as any)?.message || JSON.stringify(errBody).slice(0, 300)}`;
    console.error('[gia-followup-log] Core write FAILED:', errMsg);
    return json({ ok: false, error: errMsg });
  }

  const page = await createRes.json() as any;
  console.log(`[gia-followup-log] OK — pageId: ${page.id} (Next Follow-up: ${payload.nextFollowUpAt ?? 'not set'})`);

  // Phase 2 — best-effort select fields (method/status/businessType/owner).
  // A wrong/unmatched select option here must never undo Phase 1's already-
  // saved record — this PATCH failing is logged only, the page still exists
  // with its core fields (including Next Follow-up) intact either way.
  const selectProperties: Record<string, any> = {};
  if (payload.method) selectProperties['Follow-up Method（跟进方式）'] = { select: { name: payload.method } };
  if (payload.status) selectProperties['行动状态'] = { select: { name: payload.status } };
  if (payload.businessType) selectProperties['业务类型'] = { select: { name: payload.businessType } };
  if (payload.owner) selectProperties['Follow-up Owner（负责人）'] = { select: { name: payload.owner } };

  if (Object.keys(selectProperties).length > 0) {
    const patchRes = await fetch(`https://api.notion.com/v1/pages/${page.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
      body: JSON.stringify({ properties: selectProperties }),
    });
    if (!patchRes.ok) {
      const patchErr = await patchRes.json().catch(() => ({}));
      console.error('[gia-followup-log] Best-effort select fields FAILED (core record already saved):', patchRes.status, patchErr);
    }
  }

  return json({ ok: true, pageId: page.id });
}
