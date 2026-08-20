// Vercel Edge Runtime — GIA Action Planner V2.
// Standalone endpoint, NOT wired into BusinessAssistant.tsx's routing.
// V1 (plan.ts) used one flat 15-value intent enum and scored 1/8 on real
// test cases, defaulting to OTHER far too often. V2 replaces that with a
// two-layer operation x object classification plus an actions[]-first,
// multi-action contract, and a short few-shot prompt instead of a long
// rules essay. Still: no DB writes, no email/WhatsApp send, no execution-
// function calls — understand and plan only.
export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

const OPERATIONS = ['CREATE', 'UPDATE', 'QUERY', 'STORE', 'REMEMBER', 'COMPLETE', 'OTHER'] as const;
const OBJECTS = ['CUSTOMER', 'PROJECT', 'FOLLOWUP', 'TASK', 'DOCUMENT', 'BUSINESS_MEMORY', 'QUOTE', 'EMAIL', 'SUPPORT'] as const;
const ACTION_TYPES = [
  'CREATE_CUSTOMER', 'UPDATE_CUSTOMER', 'CREATE_PROJECT', 'CREATE_FOLLOWUP', 'CREATE_TASK',
  'UPDATE_TASK', 'COMPLETE_TASK', 'STORE_DOCUMENT', 'QUERY_DOCUMENT',
  'BUSINESS_MEMORY_WRITE', 'BUSINESS_MEMORY_QUERY', 'PREPARE_QUOTE', 'EMAIL_ACTION', 'SUPPORT_ACTION',
  'QUERY', 'OTHER',
] as const;

const SYSTEM_PROMPT = `You plan GIA actions for GCI (Dubai trading/workforce company). Output JSON only.

operation: ${OPERATIONS.join(' | ')}
object: ${OBJECTS.join(' | ')} | null
action.type: ${ACTION_TYPES.join(' | ')}

One message can need multiple actions — list every one in actions[], never collapse to one. Never invent facts not in the message. Keep dates and business subjects VERBATIM (e.g. "下周一" stays "下周一", "咖啡机器人" stays "咖啡机器人" — never paraphrase or drop them, never compute an actual date yourself). Put anything unclear in missing_fields instead of guessing. Classify confidently when the message clearly matches a pattern — do not default to OTHER just to be cautious.

Examples (Chinese business messages, today's date given separately):

"帮我建一个项目，跟中国港湾的项目承包/劳工需求项目" ->
{"operation":"CREATE","object":"PROJECT","actions":[{"type":"CREATE_PROJECT","entities":{"company":"中国港湾","business_lines":["项目承包","劳工需求"]},"due_date_expression":null,"missing_fields":[]}],"requires_confirmation":true,"confidence":0.9}

"新建客户 SHADI，做咖啡机器人" ->
{"operation":"CREATE","object":"CUSTOMER","actions":[{"type":"CREATE_CUSTOMER","entities":{"customer_name":"SHADI","business_topic":"咖啡机器人"},"due_date_expression":null,"missing_fields":[]}],"requires_confirmation":true,"confidence":0.9}

"今天跟SHADI聊了咖啡机器人，下周一提醒我" ->
{"operation":"CREATE","object":"FOLLOWUP","actions":[{"type":"CREATE_FOLLOWUP","entities":{"customer_name":"SHADI","business_topic":"咖啡机器人"},"due_date_expression":null,"missing_fields":[]},{"type":"CREATE_TASK","entities":{"customer_name":"SHADI","business_topic":"咖啡机器人"},"due_date_expression":"下周一","missing_fields":[]}],"requires_confirmation":true,"confidence":0.85}

"这个合同我这周要处理，帮我收好" ->
{"operation":"STORE","object":"DOCUMENT","actions":[{"type":"STORE_DOCUMENT","entities":{"document_topic":"合同"},"due_date_expression":null,"missing_fields":["没有附件文件"]},{"type":"CREATE_TASK","entities":{"business_topic":"处理合同"},"due_date_expression":"这周","missing_fields":[]}],"requires_confirmation":true,"confidence":0.8}

"记住，以后Highway劳务按26天每天10小时算" ->
{"operation":"REMEMBER","object":"BUSINESS_MEMORY","actions":[{"type":"BUSINESS_MEMORY_WRITE","entities":{"company":"Highway","rule":"劳务按26天每天10小时算"},"due_date_expression":null,"missing_fields":[]}],"requires_confirmation":true,"confidence":0.9}

"Highway劳务怎么算？" ->
{"operation":"QUERY","object":"BUSINESS_MEMORY","actions":[{"type":"BUSINESS_MEMORY_QUERY","entities":{"company":"Highway","topic":"劳务"},"due_date_expression":null,"missing_fields":[]}],"requires_confirmation":false,"confidence":0.9}

"找Highway最新营业执照" ->
{"operation":"QUERY","object":"DOCUMENT","actions":[{"type":"QUERY_DOCUMENT","entities":{"company":"Highway","document_type":"营业执照"},"due_date_expression":null,"missing_fields":[]}],"requires_confirmation":false,"confidence":0.9}

"这件事完成了" (with recent_context naming an open task) ->
{"operation":"COMPLETE","object":"TASK","actions":[{"type":"COMPLETE_TASK","entities":{"task_reference":"<from recent_context>"},"due_date_expression":null,"missing_fields":[]}],"requires_confirmation":true,"confidence":0.8}

Output ONLY this shape:
{"operation":"...","object":"...","actions":[{"type":"...","entities":{},"due_date_expression":null,"missing_fields":[]}],"requires_confirmation":true,"confidence":0.0}`;

interface PlanRequest {
  user_message?: string;
  current_customer?: string | null;
  current_project?: string | null;
  attached_files?: string[] | null;
  recent_context?: string | null;
}

interface Action {
  type: typeof ACTION_TYPES[number];
  entities: Record<string, unknown>;
  due_date_expression: string | null;
  missing_fields: string[];
}

interface Plan {
  operation: typeof OPERATIONS[number];
  object: typeof OBJECTS[number] | null;
  actions: Action[];
  requires_confirmation: boolean;
  confidence: number;
}

function fallbackPlan(reason: string): Plan & { error: string } {
  return { operation: 'OTHER', object: null, actions: [], requires_confirmation: true, confidence: 0, error: reason };
}

function validateAction(a: any): Action | null {
  if (!a || typeof a !== 'object') return null;
  if (!ACTION_TYPES.includes(a.type)) return null;
  if (typeof a.entities !== 'object' || a.entities === null || Array.isArray(a.entities)) return null;
  if (a.due_date_expression !== null && typeof a.due_date_expression !== 'string') return null;
  if (!Array.isArray(a.missing_fields) || a.missing_fields.some((f: any) => typeof f !== 'string')) return null;
  return { type: a.type, entities: a.entities, due_date_expression: a.due_date_expression, missing_fields: a.missing_fields };
}

function validatePlan(raw: any): Plan | null {
  if (!raw || typeof raw !== 'object') return null;
  if (!OPERATIONS.includes(raw.operation)) return null;
  if (raw.object !== null && !OBJECTS.includes(raw.object)) return null;
  if (!Array.isArray(raw.actions)) return null;
  const actions: Action[] = [];
  for (const a of raw.actions) {
    const v = validateAction(a);
    if (!v) return null;
    actions.push(v);
  }
  if (typeof raw.requires_confirmation !== 'boolean') return null;
  if (typeof raw.confidence !== 'number' || raw.confidence < 0 || raw.confidence > 1) return null;
  return { operation: raw.operation, object: raw.object, actions, requires_confirmation: raw.requires_confirmation, confidence: raw.confidence };
}

function dubaiToday(): string {
  return new Date(Date.now() + 4 * 3600 * 1000).toISOString().slice(0, 10);
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS });
  if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return json({ ok: false, plan: fallbackPlan('OPENAI_API_KEY not configured') }, 200);

  let body: PlanRequest;
  try { body = await request.json(); }
  catch { return json({ ok: false, error: 'Invalid JSON body' }, 400); }

  const userMessage = (body.user_message || '').trim();
  if (!userMessage) return json({ ok: false, error: 'user_message is required' }, 400);

  const contextLines = [
    `Today (Asia/Dubai): ${dubaiToday()}`,
    `current_customer: ${body.current_customer || '(none)'}`,
    `current_project: ${body.current_project || '(none)'}`,
    `attached_files: ${body.attached_files?.length ? body.attached_files.join(', ') : '(none)'}`,
    `recent_context: ${body.recent_context || '(none)'}`,
  ].join('\n');

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `${contextLines}\n\n<<<MESSAGE>>>\n${userMessage}\n<<<END_MESSAGE>>>` },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return json({ ok: false, plan: fallbackPlan(`OpenAI request failed (${res.status}): ${errText.slice(0, 200)}`) }, 200);
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    const usage = data?.usage ?? null;
    if (!content) return json({ ok: false, plan: fallbackPlan('Empty response from planner') }, 200);

    let parsedRaw: any;
    try { parsedRaw = JSON.parse(content); }
    catch { return json({ ok: false, plan: fallbackPlan('Planner returned invalid JSON') }, 200); }

    const plan = validatePlan(parsedRaw);
    if (!plan) return json({ ok: false, plan: fallbackPlan('Planner output failed schema validation'), raw: parsedRaw }, 200);

    return json({ ok: true, plan, usage });
  } catch (e: any) {
    return json({ ok: false, plan: fallbackPlan(String(e?.message ?? e)) }, 200);
  }
}
