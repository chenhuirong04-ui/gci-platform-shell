// Home GIA → /ai?q= hand-off for read-only business queries (lib/giaAiForward.ts).
// Run from the repo root:  node --test apps/shell/src/lib/__tests__/giaAiForward.test.mjs
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

// lib/supabase.ts throws at import time without VITE_* env; the decision
// function never touches the client, so a stub is enough.
const stubSupabase = {
  name: 'stub-supabase',
  resolveId(id) { return /(^|\/)supabase$/.test(id) && id.startsWith('.') ? '\0stub-supabase' : null; },
  load(id) { return id === '\0stub-supabase' ? 'export const supabase = {};' : null; },
};

let lib;
let bare;
before(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gci-gia-fwd-'));
  const out = path.join(dir, 'giaAiForward.mjs');
  const b = await rolldown({ input: path.join(SHELL_SRC, 'lib/giaAiForward.ts'), platform: 'node', plugins: [stubSupabase] });
  await b.write({ file: out, format: 'esm' });
  lib = await import(pathToFileURL(out).href);
  // The existing GIA customer-name rule, read from source (unchanged by this fix).
  const m = fs.readFileSync(path.join(SHELL_SRC, 'lib/giaRouter.ts'), 'utf8').match(/const BARE_NAME_RE = (\/.+\/u);/);
  assert.ok(m, 'BARE_NAME_RE not found in giaRouter.ts');
  bare = eval(m[1]);
});

test('inventory question forwards to /ai?q= (was the customer= bug)', () => {
  const q = '现在有多少纸尿裤库存';
  assert.equal(bare.test(q), true, 'precondition: GIA router treats it as a bare name');
  assert.equal(lib.giaAiForwardPath(q), `/ai?q=${encodeURIComponent(q)}`);
  assert.equal(lib.giaAiForwardPath('现在有多少纸尿裤库存？'), `/ai?q=${encodeURIComponent('现在有多少纸尿裤库存？')}`);
  assert.equal(lib.giaAiForwardPath('check stock'), `/ai?q=${encodeURIComponent('check stock')}`);
});

test('other allow-listed read-only intents forward', () => {
  assert.ok(lib.giaAiForwardPath('这个纸尿裤单价是多少'));        // product_overview
  assert.ok(lib.giaAiForwardPath('哪些报价没有回复'));            // check_quotation_followups
});

test('allow-list is exactly the read-only intents', () => {
  assert.deepEqual([...lib.GIA_AI_FORWARD_INTENTS].sort(), ['check_inventory', 'check_quotation_followups', 'product_overview']);
});

test('pure customer name keeps the existing customer flow', () => {
  for (const name of ['SHADI', 'MAG', 'TestCorpMAG16', 'Ray']) assert.equal(lib.giaAiForwardPath(name), null, name);
});

test('follow-up instruction keeps the existing follow-up flow', () => {
  assert.equal(lib.giaAiForwardPath('记录跟进 SHADI 问了纸尿裤库存'), null);
});

test('file / Drive instructions keep the existing file flow', () => {
  assert.equal(lib.giaAiForwardPath('帮我找一下纸尿裤库存报价'), null); // check_inventory, but a file search
  assert.equal(lib.giaAiForwardPath('在谷歌云新建一个文件夹 库存资料'), null);
});

test('generic / write questions keep the existing flow', () => {
  assert.equal(lib.giaAiForwardPath('今天天气怎么样'), null);
  assert.equal(lib.giaAiForwardPath('帮我做一张发票'), null);        // create_invoice_draft (write)
  assert.equal(lib.giaAiForwardPath('帮我报价给SHADI'), null);       // create_quotation_draft (write)
  assert.equal(lib.giaAiForwardPath(''), null);
});

test('Home go(): follow-up, file and folder-name checks still run before the forward; router after it', () => {
  const go = ENTRY_SRC.slice(ENTRY_SRC.indexOf('async function go()'));
  const at = (s) => { const i = go.indexOf(s); assert.ok(i >= 0, 'missing in go(): ' + s); return i; };
  const followup = at('looksLikeNotionFollowupCommand(v)');
  const file = at('if (selectedFile)');
  const folder = at('pendingDriveFolderCreate && !pendingDriveFolderCreate.folderName');
  const forward = at('giaAiForwardPath(v)');
  const router = at('runGiaTopRouter(v, state)');
  const customer = at('/business-assistant?customer=');
  assert.ok(followup < file && file < folder && folder < forward && forward < router && router < customer);
});
