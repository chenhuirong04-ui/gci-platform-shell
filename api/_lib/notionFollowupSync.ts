const NOTION_VERSION = '2022-06-28';
const FOLLOWUP_NOTES_PROP = 'Follow-up Notes（跟进内容）';
const VALID_STATUSES = new Set([
  '已成交',
  '合同待签',
  '新询盘',
  '需求整理中',
  '待报价',
  '已报价待确认',
  '执行中',
  '暂缓',
]);

interface CrmCustomer {
  id: string;
  customer_name: string;
  status: string | null;
  source: string | null;
  source_detail: string | null;
  next_follow_up_at: string | null;
  next_action: string | null;
  promoted_at: string | null;
  external_refs: Record<string, unknown> | null;
}

export type NotionFollowupSyncResult =
  | { status: 'created' | 'existing'; pageId: string; syncKey: string }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; reason: string };

function notionHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  };
}

function notionError(prefix: string, status: number, body: any): Error {
  const code = typeof body?.code === 'string' ? body.code : 'unknown';
  const message = typeof body?.message === 'string' ? body.message.replace(/\s+/g, ' ').slice(0, 240) : 'no_message';
  return new Error(`${prefix}_${status}:${code}:${message}`);
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function readCustomer(
  supabaseUrl: string,
  serviceKey: string,
  customerId: string,
): Promise<CrmCustomer> {
  const fields = [
    'id', 'customer_name', 'status', 'source', 'source_detail', 'next_follow_up_at',
    'next_action', 'promoted_at', 'external_refs',
  ].join(',');
  const response = await fetch(
    `${supabaseUrl}/rest/v1/crm_customers?id=eq.${encodeURIComponent(customerId)}&select=${encodeURIComponent(fields)}`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
  );
  const rows = await response.json().catch(() => null) as CrmCustomer[] | null;
  if (!response.ok) throw new Error(`crm_customer_read_${response.status}`);
  if (!Array.isArray(rows) || !rows[0]) throw new Error('crm_customer_not_found');
  return rows[0];
}

function existingPageId(customer: CrmCustomer, syncKey: string): string | null {
  const refs = customer.external_refs as any;
  const value = refs?.notion_followup_syncs?.[syncKey]?.page_id;
  return typeof value === 'string' && value ? value : null;
}

async function findNotionPage(token: string, databaseId: string, marker: string): Promise<string | null> {
  const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
    method: 'POST',
    headers: notionHeaders(token),
    body: JSON.stringify({
      page_size: 2,
      filter: { property: FOLLOWUP_NOTES_PROP, rich_text: { contains: marker } },
    }),
  });
  const body = await response.json().catch(() => null) as any;
  if (!response.ok) throw notionError('notion_query', response.status, body);
  return Array.isArray(body?.results) && body.results[0]?.id ? body.results[0].id : null;
}

async function createNotionPage(
  token: string,
  databaseId: string,
  customer: CrmCustomer,
  marker: string,
): Promise<string> {
  const status = VALID_STATUSES.has(customer.status || '') ? customer.status : '新询盘';
  const followupDate = customer.promoted_at?.slice(0, 10) || customer.next_follow_up_at;
  const response = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: notionHeaders(token),
    body: JSON.stringify({
      parent: { database_id: databaseId },
      properties: {
        'Customer（客户）': { title: [{ type: 'text', text: { content: customer.customer_name.trim() } }] },
        'Next Follow-up（下次跟进）': { date: { start: customer.next_follow_up_at } },
        '下次行动内容': { rich_text: [{ type: 'text', text: { content: customer.next_action!.trim().slice(0, 2000) } }] },
        '行动状态': { select: { name: status } },
        'Follow-up Date（跟进日期）': { date: { start: followupDate } },
        [FOLLOWUP_NOTES_PROP]: {
          rich_text: [{ type: 'text', text: { content: `[来源: MIA / AI Sales Agent]\n${marker}` } }],
        },
      },
    }),
  });
  const body = await response.json().catch(() => null) as any;
  if (!response.ok || !body?.id) {
    const identityResponse = await fetch('https://api.notion.com/v1/users/me', {
      headers: notionHeaders(token),
    });
    const identity = await identityResponse.json().catch(() => null) as any;
    const integrationName = typeof identity?.name === 'string'
      ? identity.name.replace(/\s+/g, ' ').slice(0, 80)
      : 'unknown_integration';
    const error = notionError('notion_create', response.status, body);
    throw new Error(`${error.message}:integration=${integrationName}`);
  }
  return body.id;
}

async function persistSyncReference(
  supabaseUrl: string,
  serviceKey: string,
  customer: CrmCustomer,
  syncKey: string,
  pageId: string,
): Promise<void> {
  const refs = customer.external_refs || {};
  const existingSyncs = (refs as any).notion_followup_syncs || {};
  const externalRefs = {
    ...refs,
    notion_followup_syncs: {
      ...existingSyncs,
      [syncKey]: {
        page_id: pageId,
        next_follow_up_at: customer.next_follow_up_at,
        action_hash: syncKey.split(':').pop(),
        synced_at: new Date().toISOString(),
      },
    },
  };
  const response = await fetch(
    `${supabaseUrl}/rest/v1/crm_customers?id=eq.${encodeURIComponent(customer.id)}`,
    {
      method: 'PATCH',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ external_refs: externalRefs }),
    },
  );
  if (!response.ok) throw new Error(`crm_sync_reference_${response.status}`);
}

export async function syncMiaPromotionFollowup(input: {
  supabaseUrl: string;
  serviceKey: string;
  notionToken?: string;
  notionDatabaseId?: string;
  customerId: string;
}): Promise<NotionFollowupSyncResult> {
  if (!input.notionToken || !input.notionDatabaseId) {
    return { status: 'failed', reason: 'notion_server_config_missing' };
  }

  try {
    const customer = await readCustomer(input.supabaseUrl, input.serviceKey, input.customerId);
    if (customer.source !== 'MIA' || customer.source_detail !== 'AI Sales Agent') {
      return { status: 'skipped', reason: 'not_mia_promotion' };
    }
    if (!customer.next_follow_up_at || !customer.next_action?.trim()) {
      return { status: 'skipped', reason: 'followup_fields_missing' };
    }

    const normalizedAction = customer.next_action.trim().replace(/\s+/g, ' ');
    const actionHash = (await sha256(normalizedAction)).slice(0, 24);
    const syncKey = `gci-mia-followup:${customer.id}:${customer.next_follow_up_at}:${actionHash}`;
    const marker = `[GCI external_ref: ${syncKey}]`;

    const storedPageId = existingPageId(customer, syncKey);
    if (storedPageId) return { status: 'existing', pageId: storedPageId, syncKey };

    const foundPageId = await findNotionPage(input.notionToken, input.notionDatabaseId, marker);
    const pageId = foundPageId || await createNotionPage(input.notionToken, input.notionDatabaseId, customer, marker);
    await persistSyncReference(input.supabaseUrl, input.serviceKey, customer, syncKey, pageId);
    return { status: foundPageId ? 'existing' : 'created', pageId, syncKey };
  } catch (error) {
    return { status: 'failed', reason: error instanceof Error ? error.message : String(error) };
  }
}
