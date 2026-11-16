// GIA P2 phase 1 — POST /api/gia/ask (LLM picks P0 read-only tools).
// Model, auth and the wrapped endpoint handlers are stubbed.
// Run from the repo root:  node --test tools/gia-ask.test.mjs
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { rolldown } from 'rolldown';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GIA = path.join(ROOT, 'api/gia');
const IDS = ['resolve_product', 'check_inventory', 'inventory_table_alerts', 'product_overview', 'quotation_history', 'check_quotation_followups',
  'customer_360', 'consignment_summary', 'receivables_summary', 'sales_summary', 'invoice_pending_summary', 'supplier_search', 'daily_brief'];

const stubs = {
  name: 'gia-ask-stubs',
  resolveId(id) {
    if (id === '../_lib/auth') return '\0auth';
    if (id === './_handlers') return '\0handlers';
    if (id === './_model') return '\0model';
    return null;
  },
  load(id) {
    if (id === '\0auth') return `
      const fail = (status, error) => ({ ok: false, status, body: { ok: false, error } });
      export async function requireUser() {
        const a = globalThis.__auth;
        if (!a) return fail(401, 'Missing Authorization header');
        return { ok: true, ctx: { userId: 'u1', token: 't', roleLabel: a.isAdmin ? 'Admin' : 'Staff', modules: a.modules, isAdmin: a.isAdmin } };
      }`;
    if (id === '\0handlers') return `
      const ids = ${JSON.stringify(IDS)};
      export const GIA_HANDLERS = Object.fromEntries(ids.map((id) => [id, async (req) => {
        const call = { id, url: req.url, auth: req.headers.get('authorization'), cookie: req.headers.get('cookie'), method: req.method, start: Date.now() };
        globalThis.__calls.push(call);
        const behaviour = (globalThis.__toolBehaviour || {})[id];
        if (behaviour === 'throw') throw new Error('boom');
        await new Promise((r) => setTimeout(r, globalThis.__toolDelay || 0));
        call.end = Date.now();
        const data = behaviour === 'empty' ? { ok: true, rows: [] } : { ok: true, from: id, total: 4321 };
        return new Response(JSON.stringify(data), { status: 200 });
      }]));`;
    if (id === '\0model') return `
      export const GIA_MODEL = 'stub-model';
      export async function callGiaModel(baseUrl, authorization, call) {
        globalThis.__modelCalls.push({ baseUrl, authorization, ...call });
        return globalThis.__model(call, globalThis.__modelCalls.length);
      }`;
    return null;
  },
};

let ask, mod;
before(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gci-gia-ask-'));
  const out = path.join(dir, 'ask.mjs');
  const b = await rolldown({ input: path.join(GIA, 'ask.ts'), platform: 'node', plugins: [stubs] });
  await b.write({ file: out, format: 'esm' });
  mod = await import(pathToFileURL(out).href);
  ask = mod.default;
});

const FULL = ['crm', 'trade', 'quotation', 'finance', 'warehouse'];
const plan = (calls) => JSON.stringify({ calls: calls.map(([tool, args = {}]) => ({ tool, args: Object.entries(args).map(([name, value]) => ({ name, value })) })) });

function setup({ auth = { isAdmin: true, modules: FULL }, planCalls = [], answer = '回复 4321 [daily_brief]', toolBehaviour = {}, toolDelay = 0, model } = {}) {
  globalThis.__auth = auth;
  globalThis.__calls = [];
  globalThis.__modelCalls = [];
  globalThis.__toolBehaviour = toolBehaviour;
  globalThis.__toolDelay = toolDelay;
  globalThis.__model = model || (async (call, n) => (n === 1 ? plan(planCalls) : answer));
}
const post = async (question) => {
  const r = await ask(new Request('https://preview.example/api/gia/ask', {
    method: 'POST', headers: { authorization: 'Bearer user-token', cookie: 'sb=secret', 'content-type': 'application/json' }, body: JSON.stringify({ question }),
  }));
  return { status: r.status, body: await r.json() };
};
const plannerToolIds = () => JSON.parse(globalThis.__modelCalls[0].prompt.match(/Tools:\n(.*)\n/)[1]).map((t) => t.tool).sort();

test('no session → 401, model never called', async () => {
  setup({ auth: null });
  const r = await post('今天有什么要处理的');
  assert.equal(r.status, 401);
  assert.equal(globalThis.__modelCalls.length, 0);
});

test('Owner / LILI (all 5 modules): the model sees all 13 tools', async () => {
  for (const isAdmin of [true, false]) {
    setup({ auth: { isAdmin, modules: FULL }, planCalls: [['daily_brief']] });
    await post('今天有什么要处理的');
    assert.deepEqual(plannerToolIds(), [...IDS].sort());
  }
});

test('模拟验证: tool list given to the model = exactly canUseTool for the caller', async () => {
  setup({ auth: { isAdmin: false, modules: ['crm'] }, planCalls: [['customer_360', { customer: 'MAG' }]] });
  await post('MAG 什么情况');
  const seen = plannerToolIds();
  for (const hidden of ['check_inventory', 'inventory_table_alerts', 'consignment_summary', 'receivables_summary', 'sales_summary', 'invoice_pending_summary', 'daily_brief']) {
    assert.ok(!seen.includes(hidden), hidden);
  }
  assert.ok(seen.includes('customer_360') && seen.includes('supplier_search'));
});

test('模拟验证: a tool the model picks but the caller may not use is never executed', async () => {
  setup({ auth: { isAdmin: false, modules: ['crm'] }, planCalls: [['receivables_summary'], ['check_inventory'], ['drop_tables']] });
  const r = await post('欠多少钱');
  assert.equal(r.body.ok, false);
  assert.equal(r.body.fallback, true);
  assert.equal(r.body.reason, 'no_tool_selected');
  assert.deepEqual(r.body.dropped.sort(), ['check_inventory', 'drop_tables', 'receivables_summary']);
  assert.equal(globalThis.__calls.length, 0);
});

test('multi-tool plan: all run in parallel with the caller token only; answer + sources returned', async () => {
  setup({
    planCalls: [['customer_360', { customer: 'MAG' }], ['receivables_summary'], ['quotation_history', { customer: 'MAG' }]],
    answer: 'MAG 欠款 4321 [customer_360]',
    toolDelay: 80,
  });
  const r = await post('MAG 现在什么情况、欠多少钱、上次报价多少');
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  assert.equal(r.body.answer, 'MAG 欠款 4321 [customer_360]');
  assert.deepEqual(r.body.toolsUsed.map((u) => u.tool), ['customer_360', 'receivables_summary', 'quotation_history']);
  assert.deepEqual(r.body.toolsUsed[0].args, { customer: 'MAG' });
  assert.deepEqual(r.body.sources, ['customer_360', 'receivables_summary', 'quotation_history']);
  assert.deepEqual(r.body.unverifiedNumbers, []);
  assert.equal(globalThis.__calls.length, 3);
  for (const c of globalThis.__calls) {
    assert.equal(c.auth, 'Bearer user-token');
    assert.equal(c.cookie, null);
    assert.equal(new URL(c.url).origin, 'https://preview.example');
  }
  assert.equal(new URL(globalThis.__calls[0].url).searchParams.get('customer'), 'MAG');
  // Parallel: every call started before the first one finished.
  const firstEnd = Math.min(...globalThis.__calls.map((c) => c.end));
  assert.ok(globalThis.__calls.every((c) => c.start <= firstEnd));
  // The answer model got the real tool results and the no-invention rules.
  const answerCall = globalThis.__modelCalls[1];
  assert.match(answerCall.prompt, /"from":"customer_360"/);
  assert.match(answerCall.systemInstruction, /无数据/);
  assert.match(answerCall.systemInstruction, /Never estimate/);
  assert.equal(answerCall.authorization, 'Bearer user-token');
});

test(`cap: at most ${4} tool calls per question, the rest are not executed`, async () => {
  setup({ planCalls: [['daily_brief'], ['receivables_summary'], ['sales_summary'], ['invoice_pending_summary'], ['check_inventory'], ['check_quotation_followups']] });
  const r = await post('今天有什么要处理的');
  assert.equal(mod.MAX_CALLS, 4);
  assert.equal(r.body.ok, true);
  assert.equal(r.body.capped, true);
  assert.equal(globalThis.__calls.length, 4);
  assert.deepEqual(r.body.toolsUsed.map((u) => u.tool), ['daily_brief', 'receivables_summary', 'sales_summary', 'invoice_pending_summary']);
});

test('model failure on planning → fallback, no tool run', async () => {
  setup({ model: async () => { throw new Error('model_failed_502'); } });
  const r = await post('今天有什么要处理的');
  assert.equal(r.status, 200);
  assert.deepEqual([r.body.ok, r.body.fallback, r.body.reason], [false, true, 'model_failed']);
  assert.equal(globalThis.__calls.length, 0);
});

test('model returns non-JSON plan → fallback', async () => {
  setup({ model: async () => 'sure! I will call daily_brief' });
  const r = await post('今天有什么要处理的');
  assert.deepEqual([r.body.fallback, r.body.reason], [true, 'model_failed']);
});

test('model failure on answering → fallback (tools ran, no half answer)', async () => {
  setup({ planCalls: [['daily_brief']], model: async (call, n) => { if (n === 1) return plan([['daily_brief']]); throw new Error('x'); } });
  const r = await post('今天有什么要处理的');
  assert.deepEqual([r.body.ok, r.body.fallback, r.body.reason], [false, true, 'model_failed']);
});

test('unrelated question: model picks no tool → fallback to existing GIA flow', async () => {
  setup({ planCalls: [] });
  const r = await post('迪拜今天天气怎么样');
  assert.deepEqual([r.body.ok, r.body.fallback, r.body.reason], [false, true, 'no_tool_selected']);
  assert.equal(globalThis.__calls.length, 0);
});

test('a failing tool is reported with its status and is not a source; empty result passes through', async () => {
  setup({ planCalls: [['check_inventory', { product: '纸尿裤' }], ['inventory_table_alerts', { product: '纸尿裤' }]], toolBehaviour: { check_inventory: 'throw', inventory_table_alerts: 'empty' }, answer: '无数据 [inventory_table_alerts]' });
  const r = await post('纸尿裤库存多少');
  assert.equal(r.body.ok, true);
  assert.deepEqual(r.body.toolsUsed.map((u) => u.status), ['error', 200]);
  assert.deepEqual(r.body.sources, ['inventory_table_alerts']);
  assert.match(globalThis.__modelCalls[1].prompt, /"rows":\[\]/);
});

test('numbers in the answer that appear in no tool result are flagged', async () => {
  setup({ planCalls: [['daily_brief']], answer: '销售 4,321 [daily_brief]，应收 98765 [daily_brief]' });
  const r = await post('今天有什么要处理的');
  assert.deepEqual(r.body.unverifiedNumbers, ['98765']);
});

test('plan args: unknown args dropped, bad/missing required arg drops the call, duplicates removed', async () => {
  setup({ planCalls: [['check_inventory', { product: 'M', sku: 'x' }], ['check_inventory', { product: 'M' }], ['customer_360', {}]], answer: 'ok' });
  const r = await post('库存多少');
  assert.deepEqual(r.body.toolsUsed, [{ tool: 'check_inventory', args: { product: 'M' }, status: 200 }]);
  assert.deepEqual(r.body.dropped, ['customer_360']);
});

test('read-only + isolation: no service role, no assistant/MCP layer, no direct DB access, no write verbs', () => {
  for (const f of ['ask.ts', '_model.ts']) {
    const src = fs.readFileSync(path.join(GIA, f), 'utf8');
    assert.doesNotMatch(src, /service[_-]?role/i, f);
    assert.doesNotMatch(src, /api\/assistant|\.\.\/assistant\//, f);
    assert.doesNotMatch(src, /mcp/i, f);
    assert.doesNotMatch(src, /rest\/v1|legacyTradeAnonHeaders|userRestHeaders/, f);
    assert.doesNotMatch(src, /method:\s*'(PUT|PATCH|DELETE)'/, f);
    assert.doesNotMatch(src, /console\.\w+\([^)]*(authorization|token)/i, f);
  }
  // Model access reuses the existing Gemini proxy, not a new client/key.
  const model = fs.readFileSync(path.join(GIA, '_model.ts'), 'utf8');
  assert.match(model, /from '\.\.\/ai\/gemini-generate'/);
  assert.doesNotMatch(model, /GEMINI_API_KEY\s*\)|process\.env/);
});
