// Vercel Edge Runtime — Notion → DEAL live sync
export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function extractRichText(prop: any): string {
  try {
    if (!prop) return '';
    const arr = prop.rich_text ?? prop.title ?? [];
    return Array.isArray(arr) ? arr.map((t: any) => t.plain_text ?? '').join('') : '';
  } catch {
    return '';
  }
}

function extractSelect(prop: any): string {
  try {
    return prop?.select?.name ?? '';
  } catch {
    return '';
  }
}

function extractDate(prop: any): string {
  try {
    return prop?.date?.start ?? '';
  } catch {
    return '';
  }
}

function parseCustomerTitle(title: string): { businessId: string; clientName: string } {
  const match = title.match(/^([\w-]+)\s*\|\s*(.+)$/);
  if (match) {
    return { businessId: match[1].trim(), clientName: match[2].trim() };
  }
  return { businessId: '', clientName: title.trim() };
}

function toTaskId(pageId: string): string {
  // Use full 32-char ID — same-database pages share a long prefix, slicing causes collisions
  return 'NOTION-' + pageId.replace(/-/g, '');
}

// Find the title property dynamically — don't depend on knowing its name in advance
function extractTitleProperty(props: Record<string, any>): string {
  // 1. Try known common names first (fast path)
  const knownNames = ['Customer (客户)', 'Customer', '客户', 'Name', '名称', '客户名称', 'Title', '项目名称'];
  for (const name of knownNames) {
    if (props[name]) {
      const val = extractRichText(props[name]);
      if (val) return val;
    }
  }
  // 2. Scan all properties for type === 'title' (works regardless of property name)
  for (const prop of Object.values(props)) {
    if ((prop as any)?.type === 'title') {
      const val = extractRichText(prop);
      if (val) return val;
    }
  }
  return '';
}

// ── Notion paginated query (max 3 pages = 300 records) ─────────────────────────

async function queryDatabase(
  dbId: string,
  token: string,
  sorts?: Array<{ property: string; direction: 'ascending' | 'descending' }>
): Promise<any[]> {
  const results: any[] = [];
  let cursor: string | undefined = undefined;
  let page = 0;

  while (page < 3) {
    const body: any = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    if (sorts) body.sorts = sorts;

    const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.error(`[notion-sync] DB ${dbId} query failed: ${res.status}`);
      break;
    }

    const data = await res.json();
    results.push(...(data.results ?? []));
    if (!data.has_more) break;
    cursor = data.next_cursor;
    page++;
  }

  return results;
}

// ── Map businessType string from Notion ───────────────────────────────────────

function mapBusinessType(val: string): 'TRADE' | 'PROJECT' | 'LOG_ONLY' {
  const v = val.trim();
  if (v === '项目型' || v.toLowerCase() === 'project') return 'PROJECT';
  if (v === '贸易型' || v.toLowerCase() === 'trade') return 'TRADE';
  return 'TRADE'; // default
}

// ── Map priority ──────────────────────────────────────────────────────────────

function mapPriority(val: string): 'A' | 'B' | 'C' {
  const v = (val || '').trim().toUpperCase();
  if (v === 'A') return 'A';
  if (v === 'C') return 'C';
  return 'B';
}

// ── Build a FollowUpTask-shaped object from a Follow-up Log page ──────────────

function buildTaskFromFollowUpPage(page: any): any | null {
  try {
    const props = page.properties ?? {};

    // Title: find dynamically (works regardless of exact property name)
    const rawTitle = extractTitleProperty(props);
    if (!rawTitle) return null;

    const { businessId, clientName } = parseCustomerTitle(rawTitle);

    const tradeStatusRaw = extractSelect(props['行动状态']);
    // Normalize Notion select value to canonical APP value.
    // Notion option is '待签合同'; APP code uses '合同待签'. Treat as identical.
    const normalizeTradeStatus = (s: string) => s === '待签合同' ? '合同待签' : s;
    const tradeStatus = normalizeTradeStatus(tradeStatusRaw) || '待人工确认';

    const businessTypeRaw = extractSelect(props['业务类型']);
    const businessType = mapBusinessType(businessTypeRaw);

    const lastFollowUpAt = extractDate(props['Follow-up Date（跟进日期）'] ?? props['Follow-up Date'] ?? null);
    const lastContext = extractRichText(props['Follow-up Notes'] ?? props['Follow-up Note'] ?? null);
    const followUpMethod = extractSelect(props['Follow-up Method'] ?? props['跟进方式'] ?? null);
    const owner = extractSelect(props['Follow-up Owner'] ?? props['Owner'] ?? props['跟进人'] ?? null);
    const nextFollowUpAt = extractDate(props['Next Follow-up'] ?? props['Next Follow-Up'] ?? null);
    const goal = extractRichText(props['下次行动内容'] ?? props['Next Action'] ?? null);
    const businessCreatedAt = extractDate(props['业务创建时间'] ?? props['Created Date'] ?? null);
    const priority = mapPriority(extractSelect(props['优先级'] ?? props['Priority'] ?? null));
    const initialContext = extractRichText(props['项目背景'] ?? props['Background'] ?? null);

    // "项目关联" Relation — the authoritative link to a Business Master
    // (🏗️ 项目客户库) page. Precise page-id match; the businessId/clientName
    // string parsing above is a fallback-only signal, never the primary key.
    const projectRelation = props['项目关联']?.relation;
    const projectRelationPageId = Array.isArray(projectRelation) && projectRelation[0]?.id
      ? projectRelation[0].id
      : '';

    return {
      _pageId: page.id,
      _businessId: businessId,
      _projectRelationPageId: projectRelationPageId,
      clientName,
      tradeStatus,
      businessType,
      lastFollowUpAt,
      lastContext,
      followUpMethod,
      owner,
      nextFollowUpAt: nextFollowUpAt || new Date().toISOString(),
      goal,
      businessCreatedAt,
      priority,
      initialContext,
    };
  } catch (e) {
    console.error('[notion-sync] buildTaskFromFollowUpPage error:', e);
    return null;
  }
}

// ── Extract contact info from project/SB page ─────────────────────────────────

function extractContactFromPage(page: any): any {
  try {
    const props = page.properties ?? {};

    // Try common field name variations
    const getStr = (keys: string[]): string => {
      for (const k of keys) {
        const p = props[k];
        if (!p) continue;
        // phone_number type
        if (p.phone_number) return p.phone_number;
        // rich_text / title type
        const rt = extractRichText(p);
        if (rt) return rt;
        // url type
        if (p.url) return p.url;
        // email type
        if (p.email) return p.email;
      }
      return '';
    };

    const countryCity = getStr(['城市', 'City', 'Country/City', '国家城市', 'Location', 'CountryCity']);
    const phoneE164 = getStr(['电话', 'Phone', 'Phone Number', 'Mobile', '手机']);
    const whatsapp = getStr(['WhatsApp', 'Whatsapp', 'whatsapp', 'WA', '微信/WA']);
    const email = getStr(['Email', 'email', '邮箱', 'E-mail']);
    const businessType = extractSelect(props['业务类型'] ?? props['Type'] ?? null);
    const clientNameRaw = extractRichText(
      props['客户名称'] ?? props['Name'] ?? props['客户'] ?? props['Company'] ?? null
    );

    return { countryCity, phoneE164, whatsapp, email, businessType, clientNameRaw };
  } catch (e) {
    console.error('[notion-sync] extractContactFromPage error:', e);
    return {};
  }
}

// ── Extract full Business Master (🏗️ 项目客户库) structured fields ──────────
// Real schema verified directly via Notion (2026-08): 项目ID, 项目名称(title),
// 客户名, 联系人, 联系电话, 联系邮件, 城市, 国家地区, 项目类型, 项目阶段,
// 项目情况, 优先级, 币种, 负责人, 下次跟进日期, 预计完工日期, 预计签约日期.
// These are DIFFERENT property names than the ones extractContactFromPage
// guesses (which is why Business Master contact fields were always coming
// back empty) — read using the confirmed real names only, no more guessing.
function extractPropertyValue(prop: any): string {
  if (!prop) return '';
  try {
    if (Array.isArray(prop.rich_text)) return prop.rich_text.map((t: any) => t.plain_text ?? '').join('');
    if (Array.isArray(prop.title)) return prop.title.map((t: any) => t.plain_text ?? '').join('');
    if (prop.select?.name) return prop.select.name;
    if (prop.status?.name) return prop.status.name;
    if (prop.formula) {
      if (prop.formula.type === 'string') return prop.formula.string ?? '';
      if (prop.formula.type === 'number') return prop.formula.number != null ? String(prop.formula.number) : '';
      if (prop.formula.type === 'date') return prop.formula.date?.start ?? '';
    }
    if (typeof prop.number === 'number') return String(prop.number);
    if (prop.email) return prop.email;
    if (prop.phone_number) return prop.phone_number;
    if (prop.url) return prop.url;
    if (prop.date?.start) return prop.date.start;
  } catch { /* fall through to '' */ }
  return '';
}

interface BusinessMasterFields {
  projectPageId: string;
  projectId: string;
  projectName: string;
  clientName: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  city: string;
  country: string;
  projectType: string;
  projectStage: string;
  projectSituation: string;
  priority: string;
  currency: string;
  owner: string;
  nextFollowUpAt: string;
  expectedCompletionAt: string;
  expectedSigningAt: string;
}

function extractBusinessMasterFields(page: any): BusinessMasterFields {
  const props = page.properties ?? {};
  return {
    projectPageId: page.id,
    projectId: extractPropertyValue(props['项目ID']),
    projectName: extractPropertyValue(props['项目名称']),
    clientName: extractPropertyValue(props['客户名']),
    contactName: extractPropertyValue(props['联系人']),
    contactPhone: extractPropertyValue(props['联系电话']),
    contactEmail: extractPropertyValue(props['联系邮件']),
    city: extractPropertyValue(props['城市']),
    country: extractPropertyValue(props['国家地区']),
    projectType: extractPropertyValue(props['项目类型']),
    projectStage: extractPropertyValue(props['项目阶段']),
    projectSituation: extractPropertyValue(props['项目情况']),
    priority: extractPropertyValue(props['优先级']),
    currency: extractPropertyValue(props['币种']),
    owner: extractPropertyValue(props['负责人']),
    nextFollowUpAt: extractPropertyValue(props['下次跟进日期']),
    expectedCompletionAt: extractPropertyValue(props['预计完工日期']),
    expectedSigningAt: extractPropertyValue(props['预计签约日期']),
  };
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS });

  const token = process.env.NOTION_TOKEN;
  const followUpDbId = process.env.NOTION_FOLLOWUP_DB_ID;
  const projectsDbId = process.env.NOTION_PROJECTS_DB_ID;
  const sbDbId = process.env.NOTION_SB_DB_ID;

  if (!token || !followUpDbId) {
    return json({ error: 'Missing required Notion env vars: NOTION_TOKEN, NOTION_FOLLOWUP_DB_ID' }, 500);
  }

  try {
    // 1. Fetch databases — projectsDbId and sbDbId are optional (skip if missing)
    // Sort Follow-up Log by date desc in JS (avoids dependency on exact Notion property name for sort)
    const [followUpPagesRaw, projectPages, sbPages] = await Promise.all([
      queryDatabase(followUpDbId, token),
      projectsDbId ? queryDatabase(projectsDbId, token) : Promise.resolve([]),
      sbDbId       ? queryDatabase(sbDbId, token)       : Promise.resolve([]),
    ]);

    // Sort Follow-up Log by Follow-up Date descending (most recent first)
    // Field name in Notion is 'Follow-up Date（跟进日期）' — fall back to bare name for safety
    const getFollowUpDate = (page: any): string =>
      page.properties?.['Follow-up Date（跟进日期）']?.date?.start
      ?? page.properties?.['Follow-up Date']?.date?.start
      ?? '';
    const followUpPages = [...followUpPagesRaw].sort((a, b) => {
      const da = getFollowUpDate(a);
      const db2 = getFollowUpDate(b);
      return db2 < da ? -1 : db2 > da ? 1 : 0;
    });

    // 2. Build Business Master (🏗️ 项目客户库) lookups:
    //    - projectMasterByPageId: keyed by the page's own Notion id — this is
    //      what a Follow-up Log's "项目关联" Relation points to, and is the
    //      AUTHORITATIVE match (see step 5 below).
    //    - projectContactMap: keyed by 项目ID (fallback to title-parsed
    //      businessId/clientName) — used ONLY when a Follow-up Log entry has
    //      no relation set. Same extractBusinessMasterFields() data, just a
    //      weaker/fallback lookup key.
    const projectMasterByPageId = new Map<string, BusinessMasterFields>();
    const projectContactMap = new Map<string, BusinessMasterFields>();
    for (const page of projectPages) {
      try {
        const master = extractBusinessMasterFields(page);
        projectMasterByPageId.set(page.id, master);
        const props = page.properties ?? {};
        const titleRaw = extractTitleProperty(props);
        const { businessId, clientName } = parseCustomerTitle(titleRaw);
        const key = master.projectId || businessId || master.clientName || clientName;
        if (key) projectContactMap.set(key.toLowerCase(), master);
      } catch (e) {
        console.error('[notion-sync] projectPages map error:', e);
      }
    }

    // 3. Build SB contact lookup (force businessType = 'TRADE')
    const sbContactMap = new Map<string, any>();
    for (const page of sbPages) {
      try {
        const contact = extractContactFromPage(page);
        const props = page.properties ?? {};
        const titleRaw = extractTitleProperty(props);
        const { businessId, clientName } = parseCustomerTitle(titleRaw);
        const key = businessId || clientName;
        if (key) {
          sbContactMap.set(key.toLowerCase(), {
            ...contact,
            businessType: 'TRADE', // SB always TRADE
            clientName: contact.clientNameRaw || clientName,
            _pageId: page.id,
          });
        }
      } catch (e) {
        console.error('[notion-sync] sbPages map error:', e);
      }
    }

    // 4. Group Follow-up Log by businessId (already sorted desc by Follow-up Date)
    //    Keep only the MOST RECENT entry per businessId
    const latestByBizId = new Map<string, any>();
    let rawFollowupCount = 0;
    for (const page of followUpPages) {
      const task = buildTaskFromFollowUpPage(page);
      if (!task) continue;
      rawFollowupCount++;
      const key = (task._businessId || task.clientName || '').toLowerCase();
      if (!latestByBizId.has(key)) {
        latestByBizId.set(key, task); // first = most recent (sorted desc)
      }
    }

    // ── Compute today's follow-up count HERE — before orphan records are added ──
    // This is the authoritative todayFollowupCount that the UI stat card must display.
    const todayISO = new Date().toISOString().slice(0, 10);
    // '合同待签' is intentionally excluded from this list — it is active follow-up.
    const EXCLUDED_STATUSES = ['暂缓', '已成交', '已归档', '执行中'];
    const latestFollowupByBusinessIdCount = latestByBizId.size;
    const todayFollowupEntries = Array.from(latestByBizId.values()).filter(entry =>
      !!entry.nextFollowUpAt &&
      entry.nextFollowUpAt.slice(0, 10) <= todayISO &&
      !EXCLUDED_STATUSES.includes(entry.tradeStatus)
    );
    const todayFollowupCount = todayFollowupEntries.length;

    // These logs appear in Vercel runtime logs
    console.log(`[notion-sync debug] rawFollowupCount=${rawFollowupCount}`);
    console.log(`[notion-sync debug] latestFollowupByBusinessIdCount=${latestFollowupByBusinessIdCount}`);
    console.log(`[notion-sync debug] todayFollowupCount=${todayFollowupCount}`);
    console.log(`[notion-sync debug] projectMasterCount=${projectPages.length}`);
    console.log(`[notion-sync debug] sbPoolCount=${sbPages.length}`);

    // 5. Merge and produce final task list
    // ── RULE: Only Follow-up Log records become tasks. ─────────────────────────
    // Business Master (formerly "项目客户库") and SB Pool are LOOKUP-ONLY.
    // They supplement businessId / clientName / businessType / contact info
    // for existing Follow-up Log entries. They NEVER create standalone tasks.
    // A client/business only enters the system if it has a Follow-up Log record.
    const tasks: any[] = [];
    for (const [key, entry] of latestByBizId.entries()) {
      const sbContact = sbContactMap.get(key);

      // Business Master match: the Follow-up Log's "项目关联" Relation is
      // AUTHORITATIVE (precise page-id lookup). The 项目ID/title/clientName
      // key match is a fallback ONLY used when no relation is set — it never
      // overrides a genuine relation match.
      const masterByRelation = entry._projectRelationPageId
        ? projectMasterByPageId.get(entry._projectRelationPageId)
        : undefined;
      const masterByKey = projectContactMap.get(key);
      const master = masterByRelation || masterByKey;

      // Merge contact info: SB overrides Business Master for TRADE (SB pool
      // has WhatsApp; Business Master doesn't — confirmed schema).
      const contact = sbContact ?? (master ? {
        countryCity: [master.city, master.country].filter(Boolean).join(' · '),
        phoneE164: master.contactPhone,
        whatsapp: '',
        email: master.contactEmail,
        clientName: master.clientName,
      } : {});

      // businessType: SB forces TRADE; Business Master has no 业务类型 field
      // (confirmed) so PROJECT customers rely entirely on the Follow-up
      // Log's own 业务类型 field, already captured in entry.businessType.
      let finalBusinessType: 'TRADE' | 'PROJECT' | 'LOG_ONLY' = entry.businessType ?? 'TRADE';
      if (sbContact) finalBusinessType = 'TRADE';

      const pageId = entry._pageId;

      const finalTradeStatus = entry.tradeStatus || '待人工确认';

      // Derive status from tradeStatus so that Notion-closed records don't
      // reappear as active after the next sync overwrites localStorage.
      // '暂缓' / '已归档' / '已成交' / '已关闭' in Notion → archived locally.
      // NOTE: '合同待签' is intentionally NOT in this list — it is an ACTIVE follow-up
      //       status (client confirmed, contract pending). Must remain todo, never archived.
      const CLOSED_TRADE_STATUSES = ['暂缓', '已归档', '已成交', '已关闭'];
      const derivedStatus: 'todo' | 'archived' =
        CLOSED_TRADE_STATUSES.includes(finalTradeStatus) ? 'archived' : 'todo';

      const task = {
        id: toTaskId(pageId),
        leadId: pageId,
        businessId: entry._businessId || '',
        clientName: entry.clientName || contact.clientName || '未命名',
        tradeStatus: finalTradeStatus,
        businessType: finalBusinessType,
        nextFollowUpAt: entry.nextFollowUpAt || new Date().toISOString(),
        lastContext: entry.lastContext || '',
        goal: entry.goal || '',
        owner: entry.owner || '',
        priority: entry.priority || 'B',
        businessCreatedAt: entry.businessCreatedAt || '',
        // contact info from project/SB databases
        countryCity: contact.countryCity || '',
        phoneE164: contact.phoneE164 || '',
        whatsapp: contact.whatsapp || '',
        email: contact.email || '',
        contactKey: (contact.whatsapp || contact.phoneE164 || contact.email || pageId)
          .replace(/[\s+]/g, '').toLowerCase(),
        // required FollowUpTask fields with defaults
        myRole: 'SELLER' as const,
        status: derivedStatus,
        attachments: [],
        history: [],
        importedHistorical: true,
        // extra context
        initialContext: entry.initialContext || '',
        followUpMethod: entry.followUpMethod || '',
        // timestamps
        createdAt: entry.businessCreatedAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        // All records in this loop are Follow-up Log entries.
        // Business Master / SB Pool only enriched the contact fields above.
        notionSource: 'followup' as const,
        // Static project master data from Business Master — undefined when
        // no relation/key match exists (older or unlinked records). Never
        // fabricated; never overwrites the dynamic Follow-up Log fields
        // above (tradeStatus/goal/nextFollowUpAt/owner/priority).
        projectMaster: master ? {
          projectPageId: master.projectPageId,
          projectId: master.projectId,
          projectName: master.projectName,
          clientName: master.clientName,
          contactName: master.contactName,
          contactPhone: master.contactPhone,
          contactEmail: master.contactEmail,
          city: master.city,
          country: master.country,
          projectType: master.projectType,
          projectStage: master.projectStage,
          projectSituation: master.projectSituation,
          priority: master.priority,
          currency: master.currency,
          owner: master.owner,
          nextFollowUpAt: master.nextFollowUpAt,
          expectedCompletionAt: master.expectedCompletionAt,
          expectedSigningAt: master.expectedSigningAt,
        } : undefined,
      };

      tasks.push(task);
    }

    return json({
      tasks,
      syncedAt: new Date().toISOString(),
      stats: {
        followUpCount: followUpPages.length,
        businessMasterCount: projectPages.length,
        sbCount: sbPages.length,
        // Authoritative counts — Follow-up Log only (Business Master & SB Pool are lookup-only)
        rawFollowupCount,
        latestFollowupByBusinessIdCount,
        todayFollowupCount,
        // Kept for backward-compat; same as businessMasterCount
        projectMasterCount: projectPages.length,
        sbPoolCount: sbPages.length,
      },
    });
  } catch (e: any) {
    console.error('[notion-sync] fatal error:', e);
    return json({ error: String(e?.message ?? e) }, 500);
  }
}
