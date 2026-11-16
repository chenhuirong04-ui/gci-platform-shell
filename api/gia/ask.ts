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
      'for that part. Do not suggest that you changed any data; you cannot write anything.',
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

interface ToolRun { tool: string; args: Record<string, string>; status: number | 'timeout' | 'error' | 'forbidden'; dataText?: string; data?: unknown }

async function runCall(c: PlannedCall, auth: { modules: string[] }, baseUrl: string, authorization: string): Promise<ToolRun> {
  const base = { tool: c.tool.id, args: c.values };
  // Re-check at execution time, exactly like /api/gia/dispatch.
  if (!canUseTool(auth, c.tool)) return { ...base, status: 'forbidden' };
  const run = GIA_HANDLERS[c.tool.id];
  if (!run) return { ...base, status: 'error' };
  try {
    const res = await withTimeout(run(buildUpstreamRequest(c.tool, c.values, baseUrl, authorization)), TOOL_TIMEOUT_MS, 'tool');
    const data = await res.json().catch(() => null);
    const text = JSON.stringify(data);
    return { ...base, status: res.status, data, dataText: text.length > MAX_RESULT_CHARS ? text.slice(0, MAX_RESULT_CHARS) + TRUNCATED : text };
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
  for (const r of runs) if (r.dataText) addNums(r.dataText);
  addNums(today());
  const out: string[] = [];
  for (const m of answer.replace(/(\d),(?=\d{3})/g, '$1').match(/\d+(?:\.\d+)?/g) || []) {
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
  const { calls, dropped, capped } = sanitizePlan(plan, allowed);
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
