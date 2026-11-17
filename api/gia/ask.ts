// POST /api/gia/ask  { question: string }
//
// GIA P2 phase 1 — natural-language business questions over the P0 read-only
// tools. Read-only: no tool writes anything, and nothing here writes either.
//   1. requireUser — the caller's own Supabase session (401 without one).
//   2. The model only sees the tools canUseTool allows for this caller.
//   3. Model → JSON plan of up to MAX_CALLS tool calls (extra calls dropped).
//   4. Every call is re-checked (known tool, canUseTool, validateArgs) and run
//      through the same in-process P0 handler with ONLY the caller's own
//      Authorization — identical to /api/gia/dispatch. Calls run in parallel,
//      each with a timeout.
//   5. Model writes the answer from the real tool results only, citing the
//      source tool for every figure; numbers not found in any result are
//      reported back as `unverifiedNumbers`.
// Any model failure / no usable tool → { ok: false, fallback: true }, and the
// Home GIA box continues with its existing routing. Tokens are never logged.
import { requireUser } from '../_lib/auth';
import { GIA_TOOLS, canUseTool, validateArgs, buildUpstreamRequest, type GiaTool } from './_registry';
import { GIA_HANDLERS } from './_handlers';
import { callGiaModel } from './_model';

export const config = { runtime: 'edge' };

export const MAX_CALLS = 4;
export const PLAN_TIMEOUT_MS = 15000;
export const TOOL_TIMEOUT_MS = 12000;
export const ANSWER_TIMEOUT_MS = 20000;
const MAX_QUESTION_LEN = 500;
const MAX_RESULT_CHARS = 8000;
const TRUNCATED = '…(truncated)';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

const fallback = (reason: string, extra: Record<string, unknown> = {}) => json({ ok: false, fallback: true, reason, ...extra });

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label}_timeout`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

const PLAN_SCHEMA = {
  type: 'OBJECT',
  properties: {
    calls: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          tool: { type: 'STRING' },
          args: {
            type: 'ARRAY',
            items: { type: 'OBJECT', properties: { name: { type: 'STRING' }, value: { type: 'STRING' } }, required: ['name', 'value'] },
          },
        },
        required: ['tool'],
      },
    },
  },
  required: ['calls'],
};

function today(): string {
  // Business runs on Dubai time (UTC+4).
  return new Date(Date.now() + 4 * 3600 * 1000).toISOString().slice(0, 10);
}

function planPrompt(question: string, tools: GiaTool[]): { systemInstruction: string; prompt: string } {
  const catalog = tools.map((t) => ({
    tool: t.id,
    description: t.description,
    args: t.args.map((a) => `${a.name}${a.required ? ' (required)' : ''}`),
  }));
  return {
    systemInstruction:
      'You are the planner for GIA, the read-only business assistant of GCI (Dubai trading company). ' +
      'Choose which of the listed tools to call to answer the user question. Use ONLY tools from the list, ' +
      `at most ${MAX_CALLS} calls. Arg values are short plain strings taken from the question ` +
      '(customer name, product word such as 纸尿裤, supplier keyword such as 劳务). ' +
      'Product args must be the bare product word without size, pack count or unit (纸尿裤 M 码 → 纸尿裤); ' +
      'the answer step filters sizes from the returned rows. Stock: warehouse / own / current stock quantity (仓库库存, 自有库存, 现有库存, ' +
      'or plain "还有多少库存") → inventory_table_alerts with the product filter (Notion warehouse table, currentQty). ' +
      'Customer consignment stock (寄售, 客户处) → check_inventory. If the question mentions both, call both. ' +
      'Never answer a plain stock question from check_inventory alone. ' +
      'Use resolve_product only when the user asks which catalog products match. ' +
      'Trade documents: PI / 形式发票 / proforma → pi_lookup; 销售订单 / SO / 订单 (amount, paid, unpaid per order) → order_lookup ' +
      '(status UNPAID for 未付清/还欠 orders); 收款 / 付款记录 / 客户付了多少 → payment_list. quotation_history is the Quotation Center ' +
      '(GCI-… quotes), not Trade PIs. 企业服务 / 公司服务 receivables → service_receivables_summary; 企业服务合同状态 → service_contract_status. ' +
      'Finance Center: 银行余额 / 账户余额 / 现金 / 账上有多少钱 → bank_balances; 应付 / 欠供应商 / 到期付款 / 要付的款 → payables_due ' +
      '(supplier arg when a supplier is named); 待处理凭证 / 未入账凭证 → pending_vouchers; 银行对账 / 对账进度 → bank_reconciliation_status. ' +
      '利润 / 毛利 / 利润率 / 赚了多少 / 项目成本 (by project or customer) → project_customer_profit (project / customer arg when named; ' +
      'period this_month|last_month|YYYY-MM, default all). ' +
      'Call every tool the question needs in one plan (e.g. stock + who was quoted → inventory_table_alerts and quotation_history). ' +
      'If no listed tool can answer the question (small talk, weather, general knowledge, writing tasks, ' +
      'or a request to change data), return {"calls": []}.',
    prompt: `Today (Dubai): ${today()}\nTools:\n${JSON.stringify(catalog)}\n\nQuestion: ${question}`,
  };
}

function answerPrompt(question: string, results: ToolRun[]): { systemInstruction: string; prompt: string } {
  const payload = results.map((r) => ({
    tool: r.tool,
    args: r.args,
    status: r.status,
    // Full JSON when it fits; otherwise the truncated text.
    data: r.dataText === undefined ? null : r.dataText.endsWith(TRUNCATED) ? r.dataText : (r.data ?? null),
  }));
  return {
    systemInstruction:
      'You are GIA, GCI\'s read-only business assistant. Answer in concise Chinese, structured for a busy owner. ' +
      'Use ONLY the tool results provided. Every number, amount or count you state must come from those results ' +
      'and must be followed by its source tool in square brackets, e.g. "欠款 AED 12,000 [customer_360]". ' +
      'Never estimate, round up, or invent numbers. If a tool failed or returned no relevant rows, say "无数据" ' +
      'for that part. When a list carries "<key>__total", that is the full row count; only the first rows are shown. ' +
      'If the question names a size or variant, pick the matching rows yourself. ' +
      'Always name the stock scope from "stockScope": consignment_only = "寄售在客户处的库存" (name the customer), ' +
      'warehouse_inventory = "仓库库存"; never call consignment stock plain 库存. ' +
      'inventory_table_alerts with a productFilter lists every matching warehouse row in alertItems (alertType "normal" ' +
      'is not an alert): report currentQty with its unit and warehouse. Report warehouse stock first; if consignment ' +
      'stock is also present, list it separately and never add the two together. ' +
      'Receivables, sales and collections: report the effective figures (totals / total / totalOutstanding / totalAmount). ' +
      'A "voided" block (已作废订单及其收款) or "excluded" block is NOT receivable or revenue: mention it on its own line ' +
      'only if non-empty, and never add it into the effective figures. ' +
      'In receivables_summary, 应收账款 / 当前应收 = orderReceivables.total only (= 经营看板「当前应收余额」). ' +
      'consignmentReceivables (寄售待结算) and invoiceReceivables (发票应收) are different scopes: list each on its own line ' +
      'with its own label, and never add them into one "总计" with the order receivables. ' +
      'bank_balances: report totals per currency from totalsByCurrency (公司银行 / 公司现金 / 公司合计 per currency); ' +
      'never add different currencies together and never convert with an exchange rate. Personal accounts (scope "personal") ' +
      'are NOT company funds: list them on their own line labelled 个人账户（非公司资金）. Always state the currency with each amount. ' +
      'project_customer_profit: it is cash-basis management accounting. For each project give revenue, directCost, ' +
      'grossProfit, grossMargin and its profitNote. If costStatus is "missing", say 成本未录入 and never call it 盈利 or profit; ' +
      'if "linked_only", say the profit is based on cost linked so far and may be incomplete. Repeat projectTotals.warning when present. ' +
      'Customers have no customer-level cost: give revenue / currentAR, and profit only via viaProjects. ' +
      'The "unlinked" block is not any project\'s or customer\'s profit. ' +
      'If selection.message is present, say exactly that (无数据) and give no revenue, cost or profit figures — never report 0 profit for it. ' +
      'Plain text only: no Markdown (no **, no #); use "•" for list items. ' +
      'Do not suggest that you changed any data; you cannot write anything.',
    prompt: `Today (Dubai): ${today()}\nQuestion: ${question}\n\nTool results (JSON):\n${JSON.stringify(payload)}`,
  };
}

export interface PlannedCall { tool: GiaTool; values: Record<string, string> }

/** Model plan → validated calls the caller may run (unknown / forbidden / bad-arg calls dropped, capped). */
export function sanitizePlan(raw: unknown, allowed: GiaTool[]): { calls: PlannedCall[]; dropped: string[]; capped: boolean } {
  const list: any[] = Array.isArray((raw as any)?.calls) ? (raw as any).calls : [];
  const calls: PlannedCall[] = [];
  const dropped: string[] = [];
  const seen = new Set<string>();
  let capped = false;
  for (const c of list) {
    const tool = allowed.find((t) => t.id === c?.tool);
    if (!tool) { dropped.push(String(c?.tool ?? '?')); continue; }
    const argObj: Record<string, string> = {};
    if (Array.isArray(c?.args)) {
      for (const a of c.args) if (a && typeof a.name === 'string') argObj[a.name] = String(a.value ?? '');
    } else if (c?.args && typeof c.args === 'object') {
      Object.assign(argObj, c.args);
    }
    // Drop args the tool doesn't take instead of failing the whole call.
    for (const k of Object.keys(argObj)) if (!tool.args.some((s) => s.name === k)) delete argObj[k];
    const v = validateArgs(tool, argObj);
    if (!v.ok) { dropped.push(tool.id); continue; }
    const key = tool.id + JSON.stringify(v.values);
    if (seen.has(key)) continue;
    seen.add(key);
    if (calls.length >= MAX_CALLS) { capped = true; continue; }
    calls.push({ tool, values: v.values });
  }
  return { calls, dropped, capped };
}

const CONSIGNMENT_ONLY = /寄售|客户处|consign/i;
const WAREHOUSE_WORD = /仓库|自有|现有|warehouse/i;

/**
 * Stock-scope backstop: a stock question answered only from consignment stock (check_inventory)
 * also gets the warehouse table (inventory_table_alerts, same product filter), unless the user
 * asked only about consignment. Warehouse comes first; total stays ≤ MAX_CALLS.
 */
export function ensureWarehouseStock(question: string, calls: PlannedCall[], allowed: GiaTool[]): PlannedCall[] {
  const consign = calls.find((c) => c.tool.id === 'check_inventory');
  if (!consign || calls.some((c) => c.tool.id === 'inventory_table_alerts')) return calls;
  if (CONSIGNMENT_ONLY.test(question) && !WAREHOUSE_WORD.test(question)) return calls;
  const wh = allowed.find((t) => t.id === 'inventory_table_alerts');
  if (!wh) return calls;
  const product = consign.values.product;
  const add: PlannedCall = { tool: wh, values: product ? { product } : {} };
  const rest = calls.length >= MAX_CALLS ? calls.slice(0, MAX_CALLS - 1) : calls;
  return [add, ...rest];
}

interface ToolRun { tool: string; args: Record<string, string>; status: number | 'timeout' | 'error' | 'forbidden'; dataText?: string; data?: unknown; fullText?: string }

/**
 * Shrink a tool result for the model without losing totals: scalar fields are kept at every
 * level; the longest array is halved (its original length recorded as `<key>__total`) and long
 * strings clipped until the JSON fits. Plain truncation used to cut rows mid-list, so the model
 * miscounted (e.g. 10 of 11 labour suppliers).
 */
export function compactForModel(data: unknown, limit = MAX_RESULT_CHARS): unknown {
  const size = (v: unknown) => JSON.stringify(v)?.length ?? 0;
  if (size(data) <= limit) return data;
  const clone = JSON.parse(JSON.stringify(data, (_k, v) => (typeof v === 'string' && v.length > 160 ? v.slice(0, 160) + '…' : v)));
  for (let guard = 0; guard < 200 && size(clone) > limit; guard++) {
    let best: { parent: any; key: string; len: number } | null = null;
    const walk = (node: any) => {
      if (!node || typeof node !== 'object') return;
      for (const [k, v] of Object.entries(node)) {
        if (Array.isArray(v) && v.length > 1) {
          const len = size(v);
          if (!best || len > best.len) best = { parent: node, key: k, len };
        }
        if (v && typeof v === 'object') walk(v);
      }
    };
    walk(clone);
    if (!best) break;
    const { parent, key } = best as { parent: any; key: string };
    const arr = parent[key] as unknown[];
    if (!Array.isArray(parent) && parent[`${key}__total`] === undefined) parent[`${key}__total`] = arr.length;
    parent[key] = arr.slice(0, Math.ceil(arr.length / 2));
  }
  return size(clone) <= limit ? clone : JSON.stringify(clone).slice(0, limit) + TRUNCATED;
}

async function runCall(c: PlannedCall, auth: { modules: string[] }, baseUrl: string, authorization: string): Promise<ToolRun> {
  const base = { tool: c.tool.id, args: c.values };
  // Re-check at execution time, exactly like /api/gia/dispatch.
  if (!canUseTool(auth, c.tool)) return { ...base, status: 'forbidden' };
  const run = GIA_HANDLERS[c.tool.id];
  if (!run) return { ...base, status: 'error' };
  try {
    const res = await withTimeout(run(buildUpstreamRequest(c.tool, c.values, baseUrl, authorization)), TOOL_TIMEOUT_MS, 'tool');
    const data = await res.json().catch(() => null);
    const fullText = JSON.stringify(data);
    const compact = compactForModel(data);
    const dataText = typeof compact === 'string' ? compact : JSON.stringify(compact);
    return { ...base, status: res.status, data: typeof compact === 'string' ? data : compact, dataText, fullText };
  } catch (e) {
    const timeout = e instanceof Error && e.message === 'tool_timeout';
    console.error('[gia-ask] tool failed:', c.tool.id, timeout ? 'timeout' : 'error');
    return { ...base, status: timeout ? 'timeout' : 'error' };
  }
}

/** Numbers (≥ 2 digits) in the answer that appear in no tool result. */
export function findUnverifiedNumbers(answer: string, runs: ToolRun[]): string[] {
  const known = new Set<string>();
  const addNums = (s: string) => {
    for (const m of s.replace(/(\d),(?=\d{3})/g, '$1').match(/\d+(?:\.\d+)?/g) || []) {
      known.add(m);
      const n = Number(m);
      if (Number.isFinite(n)) { known.add(String(n)); known.add(n.toFixed(2)); known.add(String(Math.round(n))); }
    }
  };
  for (const r of runs) { const t = r.fullText ?? r.dataText; if (t) addNums(t); }
  addNums(today());
  const out: string[] = [];
  // Source tags like [customer_360] are not figures.
  for (const m of answer.replace(/\[[a-z0-9_]+\]/gi, '').replace(/(\d),(?=\d{3})/g, '$1').match(/\d+(?:\.\d+)?/g) || []) {
    if (m.replace('.', '').length < 2) continue;
    if (!known.has(m) && !known.has(String(Number(m))) && !out.includes(m)) out.push(m);
  }
  return out;
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);

  const auth = await requireUser(request);
  if (!auth.ok) return json(auth.body, auth.status);

  let body: any;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'Invalid JSON' }, 400); }
  const question = typeof body?.question === 'string' ? body.question.trim() : '';
  if (!question || question.length > MAX_QUESTION_LEN) return json({ ok: false, error: 'invalid_question' }, 400);

  const allowed = GIA_TOOLS.filter((t) => canUseTool(auth.ctx, t));
  if (allowed.length === 0) return fallback('no_tools');

  const authorization = request.headers.get('authorization') || '';

  // 1) Plan.
  let plan: unknown;
  try {
    const p = planPrompt(question, allowed);
    const text = await withTimeout(callGiaModel(request.url, authorization, { ...p, responseSchema: PLAN_SCHEMA, maxOutputTokens: 1024 }), PLAN_TIMEOUT_MS, 'plan');
    plan = JSON.parse(text);
  } catch (e) {
    console.error('[gia-ask] plan failed:', e instanceof Error ? e.message : 'error');
    return fallback('model_failed');
  }
  const { calls: planned, dropped, capped } = sanitizePlan(plan, allowed);
  const calls = ensureWarehouseStock(question, planned, allowed);
  if (calls.length === 0) return fallback('no_tool_selected', { dropped });

  // 2) Run the tools (parallel, read-only, caller's own token).
  const runs = await Promise.all(calls.map((c) => runCall(c, auth.ctx, request.url, authorization)));
  const toolsUsed = runs.map((r) => ({ tool: r.tool, args: r.args, status: r.status }));

  // 3) Answer from the results only.
  let answer: string;
  try {
    const a = answerPrompt(question, runs);
    answer = (await withTimeout(callGiaModel(request.url, authorization, { ...a, maxOutputTokens: 2048 }), ANSWER_TIMEOUT_MS, 'answer')).trim();
  } catch (e) {
    console.error('[gia-ask] answer failed:', e instanceof Error ? e.message : 'error');
    return fallback('model_failed', { toolsUsed });
  }

  const sources = runs.filter((r) => typeof r.status === 'number' && r.status < 400).map((r) => r.tool);
  return json({
    ok: true,
    answer,
    toolsUsed,
    sources: Array.from(new Set(sources)),
    capped,
    dropped,
    unverifiedNumbers: findUnverifiedNumbers(answer, runs),
  });
}
