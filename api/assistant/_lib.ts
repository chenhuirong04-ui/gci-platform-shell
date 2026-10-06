const EXPECTED_SUPABASE_ORIGIN = 'https://efrkvwhzpgahjgfukjth.supabase.co';
const CUSTOMER_FIELDS = [
  'id', 'customer_name', 'customer_type', 'business_type', 'customer_primary_type',
  'country', 'city', 'owner', 'status', 'priority', 'source', 'last_follow_up_at',
  'next_follow_up_at', 'follow_up_notes', 'next_action', 'project_stage',
  'project_situation', 'is_active', 'created_at', 'updated_at',
].join(',');
const CONTACT_FIELDS = 'id,customer_id,contact_name,phone,whatsapp,email,is_primary,created_at,updated_at';
const FOLLOWUP_FIELDS = 'id,customer_id,follow_up_date,next_follow_up_at,method,notes,next_action,status_after,owner,source,created_at';
const CLOSED_STATUSES = new Set(['已关闭', '已完成', 'closed', 'done']);
export const SAFE_STATUSES = new Set(['新询盘', '需求整理中', '待报价', '已报价待确认', '合同待签', '执行中', '暂缓', '已成交']);
export const SAFE_PRIORITIES = new Set(['A', 'B', 'C']);

export type AssistantContext = { supabaseUrl: string; serviceKey: string; actor: string };
type AuthResult = { ok: true; ctx: AssistantContext } | { ok: false; response: Response };
export type AssistantActionAuthResult =
  | { ok: true; ctx: AssistantContext; credential: 'assistant' | 'claude-mcp' }
  | { ok: false; response: Response };

export const CLAUDE_MCP_ACTION_CENTER_ACTIONS = new Set([
  'update_task_status',
  'update_task_due_date',
  'complete_commitment',
  'close_decision',
  'mark_decision_duplicate',
  'update_asset_review_status',
  'update_decision_execution_status',
]);

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store, private' },
  });
}

function bearer(request: Request): string {
  return (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
}

async function secretMatches(received: string, expected: string): Promise<boolean> {
  if (!received || !expected) return false;
  const encoder = new TextEncoder();
  const [aHash, bHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(received)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  const a = new Uint8Array(aHash);
  const b = new Uint8Array(bHash);
  let different = a.length ^ b.length;
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) different |= a[i] ^ b[i];
  return different === 0;
}

export async function authenticateAssistantSecret(request: Request): Promise<boolean> {
  return secretMatches(bearer(request), process.env.GCI_ASSISTANT_API_SECRET || '');
}

export async function authenticateMcpSecret(request: Request): Promise<boolean> {
  const received = bearer(request);
  const [assistantSecretMatches, claudeSecretMatches] = await Promise.all([
    secretMatches(received, process.env.GCI_ASSISTANT_API_SECRET || ''),
    secretMatches(received, process.env.GCI_CLAUDE_MCP_SECRET || ''),
  ]);
  return assistantSecretMatches || claudeSecretMatches;
}

function serverContext(actor: string): AssistantContext | null {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return supabaseUrl === EXPECTED_SUPABASE_ORIGIN && serviceKey
    ? { supabaseUrl, serviceKey, actor }
    : null;
}

export async function authenticateAssistantAction(request: Request): Promise<AssistantActionAuthResult> {
  const received = bearer(request);
  const [assistantSecretMatches, claudeSecretMatches] = await Promise.all([
    secretMatches(received, process.env.GCI_ASSISTANT_API_SECRET || ''),
    secretMatches(received, process.env.GCI_CLAUDE_MCP_SECRET || ''),
  ]);
  if (!assistantSecretMatches && !claudeSecretMatches) {
    return { ok: false, response: json({ ok: false, error: 'unauthorized' }, 401) };
  }
  const credential = assistantSecretMatches ? 'assistant' : 'claude-mcp';
  const ctx = serverContext(credential === 'assistant' ? 'gci-executive-assistant' : 'gci-claude-mcp');
  if (!ctx) return { ok: false, response: json({ ok: false, error: 'server_config_missing' }, 500) };
  return { ok: true, ctx, credential };
}

export function authorizeAssistantAction(
  auth: Extract<AssistantActionAuthResult, { ok: true }>,
  action: string,
): Response | null {
  if (auth.credential === 'claude-mcp' && !CLAUDE_MCP_ACTION_CENTER_ACTIONS.has(action)) {
    return json({ ok: false, error: 'forbidden_action' }, 403);
  }
  return null;
}

export async function authenticateAssistant(request: Request): Promise<AuthResult> {
  if (!(await authenticateAssistantSecret(request))) {
    return { ok: false, response: json({ ok: false, error: 'unauthorized' }, 401) };
  }

  const ctx = serverContext('gci-executive-assistant');
  if (!ctx) {
    return { ok: false, response: json({ ok: false, error: 'server_config_missing' }, 500) };
  }
  return { ok: true, ctx };
}

function restHeaders(ctx: AssistantContext): Record<string, string> {
  return {
    apikey: ctx.serviceKey,
    Authorization: `Bearer ${ctx.serviceKey}`,
    'Content-Type': 'application/json',
  };
}

export async function restGet<T>(ctx: AssistantContext, path: string): Promise<{ ok: true; data: T } | { ok: false; response: Response }> {
  let response: Response;
  try {
    response = await fetch(`${ctx.supabaseUrl}/rest/v1/${path}`, { headers: restHeaders(ctx) });
  } catch {
    return { ok: false, response: json({ ok: false, error: 'crm_unreachable' }, 502) };
  }
  if (!response.ok) {
    console.error('[assistant-api] CRM read failed:', response.status);
    return { ok: false, response: json({ ok: false, error: `crm_query_${response.status}` }, 502) };
  }
  const data = await response.json().catch(() => null) as T | null;
  if (data === null) return { ok: false, response: json({ ok: false, error: 'crm_response_invalid' }, 502) };
  return { ok: true, data };
}

export function dubaiDate(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

export function customerIdFromUrl(request: Request): string {
  const parts = new URL(request.url).pathname.split('/').filter(Boolean);
  const index = parts.indexOf('customers');
  return index >= 0 ? parts[index + 1] || '' : '';
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export async function readBody(request: Request): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; response: Response }> {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, response: json({ ok: false, error: 'invalid_json_body' }, 400) };
  }
  return { ok: true, body: body as Record<string, unknown> };
}

export function validateKeys(body: Record<string, unknown>, allowed: string[]): Response | null {
  const unknown = Object.keys(body).filter((key) => !allowed.includes(key));
  if (unknown.length) return json({ ok: false, error: 'unsupported_fields', fields: unknown }, 422);
  if (!Object.keys(body).length) return json({ ok: false, error: 'empty_update' }, 422);
  return null;
}

export function validateText(value: unknown, max: number, nullable = true): boolean {
  return (nullable && value === null) || (typeof value === 'string' && value.length <= max);
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, stable(v)]));
  }
  return value;
}

export async function actionRequestHash(action: string, targetId: string | null, payload: Record<string, unknown>): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(stable({ action, targetId, payload })));
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(hash, (value) => value.toString(16).padStart(2, '0')).join('');
}

async function requestHash(action: string, customerId: string, payload: Record<string, unknown>): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(stable({ action, customerId, payload })));
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(hash, (value) => value.toString(16).padStart(2, '0')).join('');
}

export async function callRpc<T>(
  ctx: AssistantContext,
  rpc: string,
  body: Record<string, unknown>,
): Promise<{ ok: true; data: T } | { ok: false; status: number; detail: string }> {
  try {
    const response = await fetch(`${ctx.supabaseUrl}/rest/v1/rpc/${rpc}`, {
      method: 'POST',
      headers: restHeaders(ctx),
      body: JSON.stringify(body),
    });
    const parsed = await response.json().catch(() => null) as any;
    if (!response.ok) {
      return { ok: false, status: response.status, detail: String(parsed?.message || parsed?.code || '') };
    }
    return { ok: true, data: parsed as T };
  } catch {
    return { ok: false, status: 502, detail: 'crm_unreachable' };
  }
}

export function idempotencyKey(request: Request): string | null {
  const key = (request.headers.get('idempotency-key') || '').trim();
  return /^[A-Za-z0-9._:-]{8,200}$/.test(key) ? key : null;
}

export async function executeWrite(
  request: Request,
  ctx: AssistantContext,
  action: 'customer_update' | 'followup_create' | 'contact_upsert',
  customerId: string,
  payload: Record<string, unknown>,
): Promise<Response> {
  const key = idempotencyKey(request);
  if (!key) return json({ ok: false, error: 'valid_idempotency_key_required' }, 400);
  const hash = await requestHash(action, customerId, payload);
  let response: Response;
  try {
    response = await fetch(`${ctx.supabaseUrl}/rest/v1/rpc/assistant_execute_crm_action`, {
      method: 'POST',
      headers: restHeaders(ctx),
      body: JSON.stringify({
        p_action: action,
        p_customer_id: customerId,
        p_payload: payload,
        p_idempotency_key: key,
        p_request_hash: hash,
        p_actor: ctx.actor,
      }),
    });
  } catch {
    return json({ ok: false, error: 'crm_unreachable' }, 502);
  }
  const result = await response.json().catch(() => null) as any;
  if (!response.ok) {
    const message = String(result?.message || '');
    const known: Record<string, [number, string]> = {
      assistant_idempotency_conflict: [409, 'idempotency_conflict'],
      assistant_customer_not_found: [404, 'customer_not_found'],
      assistant_contact_not_found: [404, 'contact_not_found'],
      assistant_unsafe_status: [422, 'unsafe_status'],
      assistant_invalid_priority: [422, 'invalid_priority'],
      assistant_invalid_payload: [422, 'invalid_payload'],
    };
    const match = Object.entries(known).find(([needle]) => message.includes(needle));
    if (match) return json({ ok: false, error: match[1][1] }, match[1][0]);
    console.error('[assistant-api] CRM action failed:', response.status, result?.code || 'unknown');
    return json({ ok: false, error: `crm_action_${response.status}` }, 502);
  }
  return json(result);
}

export async function searchCustomers(request: Request, ctx: AssistantContext): Promise<Response> {
  const query = (new URL(request.url).searchParams.get('q') || '').trim();
  if (!query || query.length > 100) return json({ ok: false, error: 'q_required_max_100' }, 400);

  const exactParams = new URLSearchParams({ select: CUSTOMER_FIELDS, customer_name: `ilike.${query}`, limit: '10' });
  const exact = await restGet<any[]>(ctx, `crm_customers?${exactParams}`);
  if (!exact.ok) return exact.response;
  if (exact.data.length) return json({ ok: true, query, match: 'exact', customers: exact.data });

  const containsParams = new URLSearchParams({
    select: CUSTOMER_FIELDS,
    customer_name: `ilike.*${query}*`,
    is_active: 'eq.true',
    order: 'customer_name.asc',
    limit: '20',
  });
  const contains = await restGet<any[]>(ctx, `crm_customers?${containsParams}`);
  if (!contains.ok) return contains.response;
  return json({ ok: true, query, match: 'contains', customers: contains.data });
}

export async function getCustomerDetail(customerId: string, ctx: AssistantContext): Promise<Response> {
  const customerParams = new URLSearchParams({ select: CUSTOMER_FIELDS, id: `eq.${customerId}`, limit: '1' });
  const contactParams = new URLSearchParams({ select: CONTACT_FIELDS, customer_id: `eq.${customerId}`, order: 'is_primary.desc,created_at.asc' });
  const followupParams = new URLSearchParams({ select: FOLLOWUP_FIELDS, customer_id: `eq.${customerId}`, order: 'follow_up_date.desc,created_at.desc', limit: '20' });
  const [customer, contacts, followups] = await Promise.all([
    restGet<any[]>(ctx, `crm_customers?${customerParams}`),
    restGet<any[]>(ctx, `crm_contacts?${contactParams}`),
    restGet<any[]>(ctx, `crm_followups?${followupParams}`),
  ]);
  if (!customer.ok) return customer.response;
  if (!contacts.ok) return contacts.response;
  if (!followups.ok) return followups.response;
  if (!customer.data[0]) return json({ ok: false, error: 'customer_not_found' }, 404);
  return json({ ok: true, customer: customer.data[0], contacts: contacts.data, followups: followups.data });
}

export async function getTodayAndOverdue(ctx: AssistantContext): Promise<Response> {
  const date = dubaiDate();
  const params = new URLSearchParams({
    select: `${CUSTOMER_FIELDS},crm_contacts(id,contact_name,phone,whatsapp,email,is_primary)`,
    is_active: 'eq.true',
    next_follow_up_at: `lte.${date}`,
    order: 'next_follow_up_at.asc,customer_name.asc',
    limit: '1000',
  });
  const result = await restGet<any[]>(ctx, `crm_customers?${params}`);
  if (!result.ok) return result.response;
  const eligible = result.data.filter((row) => row.next_follow_up_at && !CLOSED_STATUSES.has(String(row.status || '').trim().toLowerCase()));
  return json({
    ok: true,
    date,
    today: eligible.filter((row) => row.next_follow_up_at === date),
    overdue: eligible.filter((row) => row.next_follow_up_at < date),
  });
}
