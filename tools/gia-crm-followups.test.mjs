// GIA P5 — /api/crm/followups-due (CRM follow-ups due today + overdue, Home workbench rule).
// Run from the repo root:  node --test tools/gia-crm-followups.test.mjs
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { rolldown } from 'rolldown';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let mod;
before(async () => {
  process.env.SUPABASE_URL = 'https://stub.supabase.co';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gci-crm-fu-'));
  const b = await rolldown({
    input: path.join(ROOT, 'api/crm/followups-due.ts'), platform: 'node',
    plugins: [{
      name: 'stubs',
      resolveId(id) { return id === '../_lib/auth' ? '\0auth' : id === '../ai/gemini-generate' ? '\0gem' : null; },
      load(id) {
        if (id === '\0auth') return `export async function requireModule(req, mods) {
          globalThis.__mods = mods;
          if (!req.headers.get('authorization')) return { ok: false, response: new Response('{}', { status: 401 }) };
          return { ok: true, ctx: { token: 'user-token' } };
        }
        export function userRestHeaders(ctx) { return { apikey: 'anon', Authorization: 'Bearer ' + ctx.token }; }`;
        if (id === '\0gem') return 'export default async function () { throw new Error("not used"); }';
        return null;
      },
    }],
  });
  const out = path.join(dir, 'fu.mjs');
  await b.write({ file: out, format: 'esm' });
  mod = await import(pathToFileURL(out).href);
});

const ROWS = [
  { id: '1', customer_name: 'Alpha', status: '已报价待确认', priority: 'B', owner: 'lili', next_follow_up_at: '2026-11-10', next_action: 'Call back' },
  { id: '2', customer_name: 'Beta', status: '跟进中', priority: '重点客户', owner: null, next_follow_up_at: '2026-11-17' },
  { id: '3', customer_name: 'Gamma', status: '已关闭', priority: 'A', next_follow_up_at: '2026-11-01' },
  { id: '4', customer_name: 'Delta', status: '已报价待确认', priority: 'C', next_follow_up_at: '2026-11-16' },
  { id: '5', customer_name: 'Eps', status: '跟进中', priority: 'C', next_follow_up_at: '2026-11-20' },
];

test('today + overdue, closed excluded, future excluded; urgent = Home workbench rule', () => {
  const r = mod.buildFollowups(ROWS, '2026-11-17');
  assert.deepEqual(r.items.map((i) => i.customer), ['Alpha', 'Beta', 'Delta']);
  const by = Object.fromEntries(r.items.map((i) => [i.customer, i]));
  assert.equal(by.Alpha.overdueDays, 7); assert.equal(by.Alpha.urgent, true); // 已报价待确认 ≥ 3 days
  assert.equal(by.Beta.overdueDays, 0); assert.equal(by.Beta.urgent, true); assert.equal(by.Beta.priority, 'A'); // 重点 → A
  assert.equal(by.Delta.overdueDays, 1); assert.equal(by.Delta.urgent, false);
  assert.deepEqual(r.counts, { dueToday: 1, overdue: 2, overdueOver3Days: 1, urgent: 2 });
});

test('dubaiToday is UTC+4', () => {
  assert.equal(mod.dubaiToday(Date.parse('2026-11-17T21:00:00Z')), '2026-11-18');
});

test('handler: crm module required, read as the caller, GET only, nothing written', async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init }); return new Response(JSON.stringify(ROWS), { status: 200 }); };
  assert.equal((await mod.default(new Request('https://x/api/crm/followups-due'))).status, 401);
  const r = await mod.default(new Request('https://x/api/crm/followups-due', { headers: { authorization: 'Bearer u' } }));
  assert.deepEqual(globalThis.__mods, ['crm']);
  const body = await r.json();
  assert.equal(body.ok, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /crm_customers\?.*is_active=eq\.true.*next_follow_up_at=lte\./);
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer user-token');
  assert.equal((await mod.default(new Request('https://x/api/crm/followups-due', { method: 'POST', headers: { authorization: 'Bearer u' } }))).status, 405);
});
