// Vercel Edge Runtime — GIA Action Planner V3.
// Standalone endpoint, NOT wired into BusinessAssistant.tsx's routing, NOT
// imported by anything. V1 (plan.ts) and V2 (plan-v2.ts) both asked the LLM
// to output the FINAL action type directly and scored unreliably (V1 ~1/8).
// V3 splits responsibility: the LLM (Phase A) does ONLY semantic
// understanding — goal, subjects, facts, verbatim time expressions, context
// references, requested operations. Deterministic TypeScript code (Phase B,
// mapUnderstandingToActions) maps that understanding onto the fixed action
// vocabulary and resolves dates itself — the model is never trusted to
// compute a real date or to pick the final action string. No DB writes, no
// email/WhatsApp send, no execution-function calls anywhere in this file —
// understand and plan only, same guarantee as plan.ts/plan-v2.ts.
export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

// ---------------------------------------------------------------------------
// Ported from apps/shell/src/ai/crmAskGciParsers.ts (parseRelativeDateZh).
// Copied rather than imported: no api/* file in this repo imports from
// apps/shell/* — edge functions here are intentionally dependency-free,
// matching plan.ts/plan-v2.ts/classify-capture.ts.
// ---------------------------------------------------------------------------
const WEEKDAY_MAP: Record<string, number> = { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };

function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function mondayBasedIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}

function startOfWeekMonday(d: Date): Date {
  const monday = new Date(d);
  monday.setDate(d.getDate() - mondayBasedIndex(d));
  return monday;
}

function parseRelativeDateZh(text: string, ref: Date): string | null {
  const s = text.trim();
  const today = new Date(ref);
  today.setHours(0, 0, 0, 0);

  if (/明天/.test(s)) { const d = new Date(today); d.setDate(d.getDate() + 1); return fmtDate(d); }
  if (/后天/.test(s)) { const d = new Date(today); d.setDate(d.getDate() + 2); return fmtDate(d); }
  if (/今天/.test(s)) return fmtDate(today);

  const nextWeekM = s.match(/下\s*(?:个)?\s*周([一二三四五六日天])/);
  if (nextWeekM) {
    const monBasedTarget = (WEEKDAY_MAP[nextWeekM[1]] + 6) % 7;
    const monday = startOfWeekMonday(today);
    const d = new Date(monday);
    d.setDate(monday.getDate() + 7 + monBasedTarget);
    return fmtDate(d);
  }

  const thisWeekM = s.match(/(?:本|这)\s*(?:个)?\s*周([一二三四五六日天])/);
  if (thisWeekM) {
    const monBasedTarget = (WEEKDAY_MAP[thisWeekM[1]] + 6) % 7;
    const monday = startOfWeekMonday(today);
    const d = new Date(monday);
    d.setDate(monday.getDate() + monBasedTarget);
    return fmtDate(d);
  }

  const nextOccurrenceM = s.match(/下一个\s*周([一二三四五六日天])/);
  if (nextOccurrenceM) {
    const target = WEEKDAY_MAP[nextOccurrenceM[1]];
    const d = new Date(today);
    const cur = d.getDay();
    let diff = (target - cur + 7) % 7;
    if (diff === 0) diff = 7;
    d.setDate(d.getDate() + diff);
    return fmtDate(d);
  }

  const bareWeekM = s.match(/周([一二三四五六日天])/);
  if (bareWeekM) {
    const target = WEEKDAY_MAP[bareWeekM[1]];
    const d = new Date(today);
    const cur = d.getDay();
    let diff = (target - cur + 7) % 7;
    if (diff === 0) diff = 7;
    d.setDate(d.getDate() + diff);
    return fmtDate(d);
  }

  const daysLaterM = s.match(/(\d+)\s*天(?:之)?后/);
  if (daysLaterM) { const d = new Date(today); d.setDate(d.getDate() + Number(daysLaterM[1])); return fmtDate(d); }

  const isoM = s.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoM) return `${isoM[1]}-${isoM[2].padStart(2, '0')}-${isoM[3].padStart(2, '0')}`;

  return null; // unrecognized phrase — caller marks date_unresolved, never guesses.
}

// Dubai has no DST — a flat UTC+4 shift is safe and is the same trick
// plan-v2.ts already uses (dubaiToday()).
function dubaiNow(): Date {
  return new Date(Date.now() + 4 * 3600 * 1000);
}

// ---------------------------------------------------------------------------
// Phase A — LLM understanding-only contract.
// ---------------------------------------------------------------------------
const OPERATIONS = ['CREATE', 'UPDATE', 'QUERY', 'STORE', 'REMEMBER', 'PREPARE', 'SUPPORT'] as const;
const OBJECTS = ['CUSTOMER', 'PROJECT', 'FOLLOWUP', 'TASK', 'DOCUMENT', 'BUSINESS_MEMORY', 'QUOTE', 'SUPPORT_TICKET'] as const;
type Operation = typeof OPERATIONS[number];
type ObjectType = typeof OBJECTS[number];

const SYSTEM_PROMPT = `You are the semantic understanding layer for GIA (GCI's business assistant, Dubai trading/workforce company). Chris (the boss) dictates business updates in Chinese or English free text.

Your ONLY job is UNDERSTANDING. You never decide the final action type yourself — that is computed by deterministic code from what you extract. You never invent facts. You never compute an actual calendar date — keep every time expression VERBATIM exactly as written (e.g. "下周一" stays "下周一", never turn it into a date). You never merge two distinct asks into one, and you never drop one — one message can contain MULTIPLE requested_operations; list every one.

operation (per requested_operation): ${OPERATIONS.join(' | ')}
object (per requested_operation): ${OBJECTS.join(' | ')}

context_reference: an object with exactly three keys — points_to_current_customer (boolean, true when the text uses a pronoun/reference like "这个客户"/"他"/"该客户" instead of naming someone explicitly), points_to_current_task (boolean, true when it uses "这件事"/"这个事"/"那件事" instead of naming a task explicitly), and reference_phrase (the exact phrase that triggered it, or null). Do not rename these three keys and do not add others.

is_completion: true only when a TASK-related requested_operation is reporting something as already done/finished ("完成了"/"办完了"/"搞定了"/"done").

STORE+DOCUMENT when a link is present — if the message contains an actual http(s):// link AND asks to store/save/register/收好/登记/存 it, this is ALWAYS operation STORE, object DOCUMENT (put the literal URL in entities.url) — never CREATE+TASK, even though it also sounds like "something to do." Do not turn a link-storage request into a to-do reminder.

CREATE+CUSTOMER vs CREATE+FOLLOWUP — this is the most common mistake, read carefully: only use CREATE+CUSTOMER when the text explicitly asks to add/register a brand-new customer ("新建客户"/"新增客户"/"帮我建个客户"/"add a new customer"). A message that says someone TALKED/MET/COMMUNICATED with a person or company ("跟X聊了"/"跟X沟通了"/"见了X"/"talked to X") is reporting on an ONGOING relationship, not creating one — that is always CREATE+FOLLOWUP, never CREATE+CUSTOMER, even if X has never been mentioned before in this conversation and even if the sentence also happens to describe X's business. Do not default to CREATE+CUSTOMER just because a name and a business topic are both present.

Examples (Chinese business messages):

"新建客户 SHADI，做咖啡机器人" ->
{"user_goal":"新建客户SHADI并记录其业务","subjects":["SHADI"],"facts":[],"time_expressions":[],"context_reference":{"points_to_current_customer":false,"points_to_current_task":false,"reference_phrase":null},"requested_operations":[{"operation":"CREATE","object":"CUSTOMER","entities":{"customer_name":"SHADI","business_topic":"咖啡机器人"},"time_expression":null,"is_completion":false,"confidence":0.9}]}

"今天跟SHADI聊了咖啡机器人，下周一提醒我" ->
{"user_goal":"记录跟SHADI的沟通并设置下周一的提醒","subjects":["SHADI"],"facts":[],"time_expressions":["今天","下周一"],"context_reference":{"points_to_current_customer":false,"points_to_current_task":false,"reference_phrase":null},"requested_operations":[{"operation":"CREATE","object":"FOLLOWUP","entities":{"customer_name":"SHADI","business_topic":"咖啡机器人"},"time_expression":null,"is_completion":false,"confidence":0.85},{"operation":"CREATE","object":"TASK","entities":{"customer_name":"SHADI","business_topic":"咖啡机器人"},"time_expression":"下周一","is_completion":false,"confidence":0.85}]}

"帮我建一个中国港湾的项目承包/劳工需求项目" ->
{"user_goal":"新建中国港湾的项目承包/劳工需求项目","subjects":["中国港湾"],"facts":[],"time_expressions":[],"context_reference":{"points_to_current_customer":false,"points_to_current_task":false,"reference_phrase":null},"requested_operations":[{"operation":"CREATE","object":"PROJECT","entities":{"company":"中国港湾","business_lines":"项目承包/劳工需求"},"time_expression":null,"is_completion":false,"confidence":0.9}]}

"这几个合同我这周要处理，帮我收好" ->
{"user_goal":"收好这几个合同并在本周处理","subjects":[],"facts":[],"time_expressions":["这周"],"context_reference":{"points_to_current_customer":false,"points_to_current_task":false,"reference_phrase":null},"requested_operations":[{"operation":"STORE","object":"DOCUMENT","entities":{"document_topic":"合同"},"time_expression":null,"is_completion":false,"confidence":0.8},{"operation":"CREATE","object":"TASK","entities":{"business_topic":"处理合同"},"time_expression":"这周","is_completion":false,"confidence":0.8}]}

"把这个链接里的PDF存到公司资料 https://example.com/x.pdf" ->
{"user_goal":"把链接里的文件存到公司资料","subjects":[],"facts":[],"time_expressions":[],"context_reference":{"points_to_current_customer":false,"points_to_current_task":false,"reference_phrase":null},"requested_operations":[{"operation":"STORE","object":"DOCUMENT","entities":{"document_topic":"公司资料","url":"https://example.com/x.pdf"},"time_expression":null,"is_completion":false,"confidence":0.9}]}

"把这个Google Drive文件登记一下 https://drive.google.com/file/d/abc123/view" ->
{"user_goal":"登记这个已有的Drive文件","subjects":[],"facts":[],"time_expressions":[],"context_reference":{"points_to_current_customer":false,"points_to_current_task":false,"reference_phrase":null},"requested_operations":[{"operation":"STORE","object":"DOCUMENT","entities":{"document_topic":"文件登记","url":"https://drive.google.com/file/d/abc123/view"},"time_expression":null,"is_completion":false,"confidence":0.9}]}

"记住，以后 Highway 劳务按26天每天10小时算" ->
{"user_goal":"记住Highway劳务的计算规则","subjects":["Highway"],"facts":["Highway劳务按26天每天10小时算"],"time_expressions":[],"context_reference":{"points_to_current_customer":false,"points_to_current_task":false,"reference_phrase":null},"requested_operations":[{"operation":"REMEMBER","object":"BUSINESS_MEMORY","entities":{"company":"Highway","rule":"劳务按26天每天10小时算"},"time_expression":null,"is_completion":false,"confidence":0.9}]}

"Highway 劳务怎么算？" ->
{"user_goal":"查询Highway劳务的计算规则","subjects":["Highway"],"facts":[],"time_expressions":[],"context_reference":{"points_to_current_customer":false,"points_to_current_task":false,"reference_phrase":null},"requested_operations":[{"operation":"QUERY","object":"BUSINESS_MEMORY","entities":{"company":"Highway","topic":"劳务"},"time_expression":null,"is_completion":false,"confidence":0.9}]}

"找 GCI 最新营业执照" ->
{"user_goal":"查找GCI最新的营业执照文件","subjects":["GCI"],"facts":[],"time_expressions":[],"context_reference":{"points_to_current_customer":false,"points_to_current_task":false,"reference_phrase":null},"requested_operations":[{"operation":"QUERY","object":"DOCUMENT","entities":{"company":"GCI","document_type":"营业执照"},"time_expression":null,"is_completion":false,"confidence":0.9}]}

"这件事完成了" ->
{"user_goal":"把这件事标记为已完成","subjects":[],"facts":[],"time_expressions":[],"context_reference":{"points_to_current_customer":false,"points_to_current_task":true,"reference_phrase":"这件事"},"requested_operations":[{"operation":"UPDATE","object":"TASK","entities":{},"time_expression":null,"is_completion":true,"confidence":0.85}]}

"帮我给这个客户准备劳工报价" ->
{"user_goal":"给当前客户准备劳工报价","subjects":[],"facts":[],"time_expressions":[],"context_reference":{"points_to_current_customer":true,"points_to_current_task":false,"reference_phrase":"这个客户"},"requested_operations":[{"operation":"PREPARE","object":"QUOTE","entities":{"quote_type":"劳工报价"},"time_expression":null,"is_completion":false,"confidence":0.85}]}

Output ONLY this JSON shape, nothing else:
{"user_goal":"...","subjects":[],"facts":[],"time_expressions":[],"context_reference":{"points_to_current_customer":false,"points_to_current_task":false,"reference_phrase":null},"requested_operations":[{"operation":"...","object":"...","entities":{},"time_expression":null,"is_completion":false,"confidence":0.0}]}`;

interface RequestedOperation {
  operation: Operation;
  object: ObjectType;
  entities: Record<string, unknown>;
  time_expression: string | null;
  is_completion: boolean;
  confidence: number;
}

interface Understanding {
  user_goal: string;
  subjects: string[];
  facts: string[];
  time_expressions: string[];
  context_reference: {
    points_to_current_customer: boolean;
    points_to_current_task: boolean;
    reference_phrase: string | null;
  };
  requested_operations: RequestedOperation[];
}

function nullifyStringLiteral<T>(v: T): T | null {
  // json_object mode occasionally emits the STRING "null" instead of the
  // JSON literal null — normalize before validating (same bug plan-v2.ts
  // already found and fixed for its own nullable fields).
  return (v as unknown) === 'null' ? null : v;
}

function validateOperation(raw: any): RequestedOperation | null {
  if (!raw || typeof raw !== 'object') return null;
  if (!OPERATIONS.includes(raw.operation)) return null;
  if (!OBJECTS.includes(raw.object)) return null;
  if (typeof raw.entities !== 'object' || raw.entities === null || Array.isArray(raw.entities)) return null;
  const timeExpr = nullifyStringLiteral(raw.time_expression);
  if (timeExpr !== null && typeof timeExpr !== 'string') return null;
  if (typeof raw.is_completion !== 'boolean') return null;
  if (typeof raw.confidence !== 'number' || raw.confidence < 0 || raw.confidence > 1) return null;
  return { operation: raw.operation, object: raw.object, entities: raw.entities, time_expression: timeExpr, is_completion: raw.is_completion, confidence: raw.confidence };
}

function validateUnderstanding(raw: any): Understanding | null {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.user_goal !== 'string') return null;
  if (!Array.isArray(raw.subjects) || raw.subjects.some((s: any) => typeof s !== 'string')) return null;
  if (!Array.isArray(raw.facts) || raw.facts.some((s: any) => typeof s !== 'string')) return null;
  if (!Array.isArray(raw.time_expressions) || raw.time_expressions.some((s: any) => typeof s !== 'string')) return null;
  const rc = raw.context_reference;
  if (!rc || typeof rc !== 'object') return null;
  if (typeof rc.points_to_current_customer !== 'boolean') return null;
  if (typeof rc.points_to_current_task !== 'boolean') return null;
  const referencePhrase = nullifyStringLiteral(rc.reference_phrase);
  if (referencePhrase !== null && typeof referencePhrase !== 'string') return null;
  if (!Array.isArray(raw.requested_operations)) return null;
  const ops: RequestedOperation[] = [];
  for (const o of raw.requested_operations) {
    const v = validateOperation(o);
    if (!v) return null;
    ops.push(v);
  }
  return {
    user_goal: raw.user_goal,
    subjects: raw.subjects,
    facts: raw.facts,
    time_expressions: raw.time_expressions,
    context_reference: { points_to_current_customer: rc.points_to_current_customer, points_to_current_task: rc.points_to_current_task, reference_phrase: referencePhrase },
    requested_operations: ops,
  };
}

// ---------------------------------------------------------------------------
// Phase B — deterministic mapping. No LLM involved past this point.
// ---------------------------------------------------------------------------
const ACTION_MAP: Record<string, string> = {
  'CREATE:CUSTOMER': 'CREATE_CUSTOMER',
  'CREATE:PROJECT': 'CREATE_PROJECT',
  'CREATE:FOLLOWUP': 'CREATE_FOLLOWUP',
  'CREATE:TASK': 'CREATE_TASK',
  'UPDATE:TASK': 'UPDATE_TASK',
  'STORE:DOCUMENT': 'STORE_DOCUMENT',
  'QUERY:DOCUMENT': 'QUERY_DOCUMENT',
  'REMEMBER:BUSINESS_MEMORY': 'BUSINESS_MEMORY_WRITE',
  'QUERY:BUSINESS_MEMORY': 'BUSINESS_MEMORY_QUERY',
  'PREPARE:QUOTE': 'PREPARE_QUOTE',
  'SUPPORT:SUPPORT_TICKET': 'SUPPORT_ACTION',
};

interface PlannedAction {
  action: string;
  entities: Record<string, unknown>;
  resolved_date: string | null;
  date_unresolved: boolean;
  executable: boolean;
  missing_context: string | null;
}

function mapUnderstandingToActions(
  u: Understanding,
  ctx: { hasCurrentCustomer: boolean; hasOpenTask: boolean },
  refDate: Date,
): PlannedAction[] {
  return u.requested_operations.map((op) => {
    const action = ACTION_MAP[`${op.operation}:${op.object}`] || 'UNMAPPED';

    let resolvedDate: string | null = null;
    let dateUnresolved = false;
    if (op.time_expression) {
      resolvedDate = parseRelativeDateZh(op.time_expression, refDate);
      dateUnresolved = resolvedDate === null;
    }

    let executable = true;
    let missingContext: string | null = null;

    // Honesty rule: a text-only message has no attachment mechanism — never
    // claim a file was stored.
    if (action === 'STORE_DOCUMENT') {
      executable = false;
      missingContext = '无法从纯文本消息读取文件附件，需要用户在UI中实际上传文件';
    }

    // Honesty rule: context_reference points at something the caller didn't
    // supply — never guess which customer/task it means.
    if (u.context_reference.points_to_current_customer && !ctx.hasCurrentCustomer && (action === 'PREPARE_QUOTE' || op.object === 'CUSTOMER')) {
      executable = false;
      missingContext = missingContext || '消息引用了"这个客户"但未提供当前客户上下文';
    }
    if (u.context_reference.points_to_current_task && !ctx.hasOpenTask && action === 'UPDATE_TASK') {
      executable = false;
      missingContext = missingContext || '消息引用了"这件事"但未提供当前任务上下文';
    }

    const entities = { ...op.entities };
    if (op.is_completion) entities.is_completion = true;

    return { action, entities, resolved_date: resolvedDate, date_unresolved: dateUnresolved, executable, missing_context: missingContext };
  });
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
interface PlanV3Request {
  user_message?: string;
  currentCustomerName?: string | null;
  openTaskTitle?: string | null;
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS });
  if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return json({ ok: false, error: 'OPENAI_API_KEY not configured' }, 500);

  let body: PlanV3Request;
  try { body = await request.json(); }
  catch { return json({ ok: false, error: 'Invalid JSON body' }, 400); }

  const userMessage = (body.user_message || '').trim();
  if (!userMessage) return json({ ok: false, error: 'user_message is required' }, 400);

  const ref = dubaiNow();
  const contextLines = [
    `Today (Asia/Dubai): ${fmtDate(ref)}`,
    `current_customer_in_view: ${body.currentCustomerName || '(none)'}`,
    `open_task_in_view: ${body.openTaskTitle || '(none)'}`,
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
      return json({ ok: false, error: `OpenAI request failed (${res.status}): ${errText.slice(0, 200)}` }, 200);
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    const usage = data?.usage ?? null;
    if (!content) return json({ ok: false, error: 'Empty response from planner' }, 200);

    let parsedRaw: any;
    try { parsedRaw = JSON.parse(content); }
    catch { return json({ ok: false, error: 'Planner returned invalid JSON' }, 200); }

    const understanding = validateUnderstanding(parsedRaw);
    if (!understanding) return json({ ok: false, error: 'Planner output failed schema validation', raw: parsedRaw }, 200);

    const ctx = { hasCurrentCustomer: !!body.currentCustomerName, hasOpenTask: !!body.openTaskTitle };
    const actions = mapUnderstandingToActions(understanding, ctx, ref);

    return json({ ok: true, understanding, actions, usage }, 200);
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message ?? e) }, 200);
  }
}
