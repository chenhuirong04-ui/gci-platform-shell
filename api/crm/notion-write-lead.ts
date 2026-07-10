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
  contactPerson?: string;   // 联系人姓名
  lastContext?: string;     // → notes + Follow-up Notes
  goal?: string;            // → 下次行动内容
  nextFollowUpAt?: string;  // YYYY-MM-DD
  followUpMethod?: string;
  owner?: string;
  source?: string;          // WhatsApp | FB | 展厅 | 其他
  categories?: string;      // customer_quote_record | customer_inquiry | boq | supplier_quote
  driveUrls?: Array<{ name: string; url: string }>; // uploaded Drive file links
  businessType?: string;    // TRADE | PROJECT
  tradeStatus?: string;     // 行动状态: 新询盘 | 需求整理中 | 待报价 | 已报价待确认 | 合同待签 | 执行中 | 暂缓
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

// Find existing SB Pool entry by client name (case-insensitive exact match).
// Returns the EARLIEST entry (lowest SB number) when duplicates exist.
function findExistingClient(pages: any[], name: string): { sbId: string; pageId: string } | null {
  const target = name.trim().toLowerCase();
  let best: { sbId: string; pageId: string; num: number } | null = null;
  for (const page of pages) {
    const titleText = getText(page.properties?.['客户名称']).trim().toLowerCase();
    const idText    = getText(page.properties?.['客户ID']).trim();
    if (titleText === target && /^SB\d+$/i.test(idText)) {
      const num = parseInt(idText.replace(/^SB/i, ''), 10);
      if (!best || num < best.num) {
        best = { sbId: idText.toUpperCase(), pageId: page.id, num };
      }
    }
  }
  return best ? { sbId: best.sbId, pageId: best.pageId } : null;
}

// Map source string to SB Pool 来源 select option
// Map any legacy / UI status value to the exact Notion 行动状态 select option.
// Notion real options (confirmed 2026-07-09):
//   合同待签 | 新询盘 | 需求整理中 | 待报价 | 已报价待确认 | 执行中 | 暂缓
function mapTradeStatus(status?: string): string {
  if (!status) return '新询盘';
  const MAP: Record<string, string> = {
    '新询盘':     '新询盘',
    '需求整理中': '需求整理中',
    '待报价':     '待报价',
    '已报价待确认': '已报价待确认',
    '合同待签':   '合同待签',
    '执行中':     '执行中',
    '暂缓':       '暂缓',
    // Legacy values → nearest Notion equivalent
    '已报价':       '已报价待确认',
    '等待客户回复': '已报价待确认',
    '待签合同':     '合同待签',
    '已成交':       '执行中',
    '已完成':       '暂缓',
    '新建':         '新询盘',
  };
  return MAP[status] ?? '新询盘';
}

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

  // ── Duplicate check: reuse existing SB entry if same client name exists ────
  const existingClient = findExistingClient(sbPages, payload.clientName);
  let newSBId: string;
  let sbPageId: string | null = null;
  let sbWriteError: string | null = null;
  let sbWasReused = false;

  if (existingClient) {
    newSBId     = existingClient.sbId;
    sbPageId    = existingClient.pageId;
    sbWasReused = true;
    console.log(`[notion-write-lead] ♻️ Reusing existing SB entry: ${newSBId} (pageId: ${sbPageId})`);
  } else {
    const maxFromPool    = maxSBFromPool(sbPages);
    const maxFromFollowup = maxSBFromFollowup(followupPages);
    const maxSB          = Math.max(maxFromPool, maxFromFollowup);
    newSBId = formatSBId(maxSB + 1);
    console.log(`[notion-write-lead] SB Pool max=${maxFromPool}, FollowupLog max=${maxFromFollowup} → newId=${newSBId}`);
  }

  // ── Step 1: Write to 小B/C客户池 (skipped if reusing existing) ──────────────
  // Build enriched context note: prepend contact person + location + categories
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

  // Only include fields that are safe (title + rich_text). Select fields like
  // 需求等级/下一步动作/来源 are skipped — their exact option names vary per DB
  // and a mismatch causes a 400 that blocks the whole write.
  const sbProperties: Record<string, any> = {
    '客户名称': { title: [{ type: 'text', text: { content: payload.clientName.trim() } }] },
    '客户ID':   { rich_text: [{ type: 'text', text: { content: newSBId } }] },
  };
  if (payload.phone || payload.whatsapp) {
    sbProperties['电话/WhatsApp'] = { phone_number: (payload.whatsapp || payload.phone || '').trim() };
  }
  if (enrichedContext) {
    sbProperties['最后沟通内容'] = { rich_text: [{ type: 'text', text: { content: enrichedContext } }] };
  }
  if (followUpDate) {
    sbProperties['下次跟进日期'] = { date: { start: followUpDate } };
  }

  // Step 1 is NON-FATAL. Skipped entirely if reusing an existing SB entry.
  console.log(`[notion-write-lead] Step 1: ${sbWasReused ? `skipped (reusing ${newSBId})` : `writing ${newSBId} to SB Pool...`}`);
  if (!sbWasReused) {
    try {
      const sbRes = await fetch('https://api.notion.com/v1/pages', {
        method: 'POST',
        headers: notionHeaders(token),
        body: JSON.stringify({ parent: { database_id: sbDbId }, properties: sbProperties }),
      });
      if (sbRes.ok) {
        const sbPage = await sbRes.json() as any;
        sbPageId = sbPage.id;
        console.log(`[notion-write-lead] Step 1 OK — SB Pool pageId: ${sbPage.id}`);
      } else {
        const sbErr = await sbRes.json().catch(() => ({}));
        sbWriteError = `SB Pool ${sbRes.status}: ${JSON.stringify(sbErr).slice(0, 200)}`;
        console.error('[notion-write-lead] Step 1 FAILED (non-fatal):', sbWriteError);
      }
    } catch (e: any) {
      sbWriteError = `SB Pool exception: ${e?.message}`;
      console.error('[notion-write-lead] Step 1 exception (non-fatal):', sbWriteError);
    }
  }

  // ── Step 2: Write to Follow-up Log (always runs, even if Step 1 failed) ────
  const followupTitle = sbPageId
    ? `${newSBId} | ${payload.clientName.trim()}`
    : payload.clientName.trim();
  const bizTypeLabel = payload.businessType === 'PROJECT' ? '项目型' : '贸易型';

  // Build Follow-up Notes: rich context for anyone reading
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

  // Map user-selected status (incl. legacy values) → exact Notion select option
  const statusLabel = mapTradeStatus(payload.tradeStatus);

  const followupProperties: Record<string, any> = {
    'Customer（客户）': { title: [{ type: 'text', text: { content: followupTitle } }] },
    '行动状态':  { select: { name: statusLabel } },
    '业务类型':  { select: { name: bizTypeLabel } },
    'Follow-up Date（跟进日期）':  { date: { start: today } },
    'Next Follow-up（下次跟进）':  { date: { start: followUpDate } },
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

  // ── Follow-up Log write with auto-fallback ──────────────────────────────────
  // Some Notion DBs have strict select options. If the full write fails (e.g.
  // 行动状态/业务类型 value not in DB), retry with only safe fields so the
  // customer record always lands in Follow-up Log.
  const writeFollowup = async (properties: Record<string, any>) =>
    fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: notionHeaders(token),
      body: JSON.stringify({ parent: { database_id: followupDbId }, properties }),
    });

  console.log(`[notion-write-lead] Step 2: writing "${followupTitle}" to Follow-up Log...`);
  let followupRes = await writeFollowup(followupProperties);

  // If full write failed, retry with minimal safe properties (title + dates + notes only)
  if (!followupRes.ok) {
    const firstErr = await followupRes.json().catch(() => ({}));
    console.warn('[notion-write-lead] Step 2 full write failed, retrying with minimal fields:',
      followupRes.status, JSON.stringify(firstErr).slice(0, 300));

    const minimalProperties: Record<string, any> = {
      'Customer（客户）': followupProperties['Customer（客户）'],
      'Follow-up Date（跟进日期）':  followupProperties['Follow-up Date（跟进日期）'],
      'Next Follow-up（下次跟进）':  followupProperties['Next Follow-up（下次跟进）'],
    };
    if (followupProperties['Follow-up Notes（跟进内容）']) {
      minimalProperties['Follow-up Notes（跟进内容）'] = followupProperties['Follow-up Notes（跟进内容）'];
    }
    if (followupProperties['下次行动内容']) {
      minimalProperties['下次行动内容'] = followupProperties['下次行动内容'];
    }

    followupRes = await writeFollowup(minimalProperties);

    if (!followupRes.ok) {
      const followupErr = await followupRes.json().catch(() => ({}));
      const followupErrMsg = `Follow-up Log ${followupRes.status}: ${(followupErr as any)?.message || JSON.stringify(followupErr).slice(0, 200)}`;
      console.error('[notion-write-lead] Step 2 FAILED even with minimal fields:', followupErrMsg);
      // Return partial success (200) so frontend can still save the local record
      // and backfill sbId. followupCreated: false signals the UI to show a retry option.
      return json({
        ok: true,
        partial: true,
        sbId: sbPageId ? newSBId : null,
        sbPageId,
        followupCreated: false,
        followupError: followupErrMsg,
        sbWarning: sbWriteError,
        sbReused: sbWasReused,
      });
    }
    console.log('[notion-write-lead] Step 2 retry OK with minimal fields');
  }

  const followupPage = await followupRes.json() as any;
  console.log(`[notion-write-lead] Step 2 OK — Follow-up Log pageId: ${followupPage.id}`);
  console.log(`[notion-write-lead] SUCCESS — ${payload.clientName.trim()}${sbPageId ? ` · ${newSBId}` : ' (SB Pool skipped)'}`);

  return json({
    ok: true,
    partial: false,
    sbId: sbPageId ? newSBId : null,
    sbPageId,
    followupPageId: followupPage.id,
    followupCreated: true,
    sbWarning: sbWriteError,
    sbReused: sbWasReused,
  });
}
