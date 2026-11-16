// Home GIA → /api/gia/ask gate (lib/giaAsk.ts) and its place in go().
// Run from the repo root:  node --test apps/shell/src/lib/__tests__/giaAsk.test.mjs
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { rolldown } from 'rolldown';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../../..');
const SHELL_SRC = path.join(ROOT, 'apps/shell/src');
const ENTRY_SRC = fs.readFileSync(path.join(SHELL_SRC, 'components/BusinessAssistantEntry.tsx'), 'utf8').replace(/\r\n/g, '\n');

const stubSupabase = {
  name: 'stub-supabase',
  resolveId(id) { return /(^|\/)supabase$/.test(id) && id.startsWith('.') ? '\0stub-supabase' : null; },
  load(id) { return id === '\0stub-supabase' ? 'export const supabase = {};' : null; },
};

let lib, fwd;
before(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gci-gia-ask-client-'));
  const build = async (name) => {
    const out = path.join(dir, name + '.mjs');
    const b = await rolldown({ input: path.join(SHELL_SRC, `lib/${name}.ts`), platform: 'node', plugins: [stubSupabase] });
    await b.write({ file: out, format: 'esm' });
    return import(pathToFileURL(out).href);
  };
  lib = await build('giaAsk');
  fwd = await build('giaAiForward');
});

test('free-text business questions go to the LLM path', () => {
  for (const q of ['有几个劳务供应商', 'MAG 现在什么情况、欠多少钱、上次报价多少', '今天有什么要处理的', 'SHADI 欠多少钱？', '迪拜今天天气怎么样']) {
    assert.equal(lib.giaAskEligible(q), true, q);
  }
});

test('diaper inventory still takes the existing /ai forward first (unchanged)', () => {
  assert.ok(fwd.giaAiForwardPath('现在有多少纸尿裤库存'));
  const go = ENTRY_SRC.slice(ENTRY_SRC.indexOf('async function go()'));
  assert.ok(go.indexOf('giaAiForwardPath(v)') < go.indexOf('giaAskEligible(v)'));
});

test('pure customer names keep the customer card flow', () => {
  for (const name of ['SHADI', 'MAG', 'TestCorpMAG16', 'Ray', '王总']) assert.equal(lib.giaAskEligible(name), false, name);
});

test('explicit commands never reach the LLM', () => {
  for (const cmd of [
    '记录跟进：SHADI 问了纸尿裤库存',               // follow-up note
    '记录跟进 SHADI 问了纸尿裤库存吗',
    '在谷歌云新建一个文件夹 库存资料',               // Drive
    '找MAG的方案',                                  // file seek
    '进入我的待办：明天问 MAG 欠多少钱',             // explicit destination
    '进入CRM，查询客户 MAG 什么情况',
    '问MAG欠款这件事完成了',                        // task lifecycle
    '问MAG欠款这个事情取消了',
    '问MAG欠款延期到下周一',                        // task reschedule
    '',
  ]) assert.equal(lib.giaAskEligible(cmd), false, cmd);
});

test("GIA's existing read-only answers keep their questions", () => {
  for (const q of ['Chanya今天有多少新用户？', '今天 WhatsApp 有什么要处理？', 'Highway 劳务怎么算？', '帮我给这个客户准备劳工报价']) {
    assert.equal(lib.giaAskEligible(q), false, q);
  }
});

test('askGia: answer on ok, null (→ existing flow) on fallback / HTTP error / network error', async () => {
  const reply = (status, body) => async () => new Response(JSON.stringify(body), { status });
  const ok = await lib.askGia('今天有什么要处理的', reply(200, { ok: true, answer: 'A [daily_brief]', sources: ['daily_brief'], toolsUsed: [{ tool: 'daily_brief', args: {}, status: 200 }], unverifiedNumbers: [], capped: false }));
  assert.equal(ok.answer, 'A [daily_brief]');
  assert.deepEqual(ok.sources, ['daily_brief']);
  assert.equal(await lib.askGia('x', reply(200, { ok: false, fallback: true, reason: 'model_failed' })), null);
  assert.equal(await lib.askGia('x', reply(500, { ok: false })), null);
  assert.equal(await lib.askGia('x', reply(401, { ok: false })), null);
  assert.equal(await lib.askGia('x', async () => { throw new Error('offline'); }), null);
});

test('Home go(): order = follow-up → file → folder name → /ai forward → LLM ask → router → customer lookup', () => {
  const go = ENTRY_SRC.slice(ENTRY_SRC.indexOf('async function go()'));
  const at = (s) => { const i = go.indexOf(s); assert.ok(i >= 0, 'missing in go(): ' + s); return i; };
  const order = [
    'looksLikeNotionFollowupCommand(v)',
    'if (selectedFile)',
    'pendingDriveFolderCreate && !pendingDriveFolderCreate.folderName',
    'giaAiForwardPath(v)',
    'giaAskEligible(v)',
    'runGiaTopRouter(v, state)',
    '/business-assistant?customer=',
  ].map(at);
  for (let i = 1; i < order.length; i++) assert.ok(order[i - 1] < order[i], `step ${i} out of order`);
  // Inside the LLM block the existing service/labour-rate answer runs first; with
  // neither a service reply nor an LLM answer it falls through to the router.
  const block = go.slice(at('giaAskEligible(v)'), at('runGiaTopRouter(v, state)'));
  assert.ok(block.indexOf('answerServiceKnowledgeQuery(v') < block.indexOf('askGia(v)'));
  assert.equal((block.match(/return;/g) || []).length, 2);
  assert.match(block, /if \(serviceReply\) \{[^}]*return;\s*\}/);
  assert.match(block, /if \(answer\) \{[\s\S]*return;\s*\}/);
});

test('answer card text: Markdown bold/bullets become plain text, numbers and [source] tags kept', () => {
  const md = '今天待处理事项：\n\n*   **待收款**：共 7 张订单，未收 AED 4,156.85 [daily_brief]。\n    *   主要欠款客户：BINGOMART 1+1\n- 无数据';
  assert.equal(lib.giaPlainText(md),
    '今天待处理事项：\n\n• 待收款：共 7 张订单，未收 AED 4,156.85 [daily_brief]。\n   • 主要欠款客户：BINGOMART 1+1\n• 无数据');
  assert.equal(lib.giaPlainText('共有 11 个 [supplier_search]'), '共有 11 个 [supplier_search]');
});
