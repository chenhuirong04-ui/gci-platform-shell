// GIA P0 dispatch (api/gia/*) — permission policy, routing and isolation.
// Run from the repo root:  node --test tools/gia-dispatch.test.mjs
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { rolldown } from 'rolldown';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GIA = path.join(ROOT, 'api/gia');

// Auth + handlers are stubbed: auth reads globalThis.__giaAuth, every
// wrapped handler records the Request it got and answers 200.
const stubs = {
  name: 'gia-stubs',
  resolveId(id) {
    if (id === '../_lib/auth') return '\0auth';
    if (id === './_handlers') return '\0handlers';
    return null;
  },
  load(id) {
    if (id === '\0auth') return `
      const fail = (status, error) => ({ ok: false, status, body: { ok: false, error } });
      export async function requireUser() {
        const a = globalThis.__giaAuth;
        if (!a) return fail(401, 'Missing Authorization header');
        return { ok: true, ctx: { userId: 'u1', token: 't', roleLabel: a.isAdmin ? 'Admin' : 'Staff', modules: a.modules, isAdmin: a.isAdmin } };
      }`;
    if (id === '\0handlers') return `
      const ids = ${JSON.stringify(['resolve_product', 'check_inventory', 'inventory_table_alerts', 'product_overview', 'quotation_history', 'check_quotation_followups', 'customer_360', 'consignment_summary', 'receivables_summary', 'sales_summary', 'invoice_pending_summary', 'supplier_search', 'daily_brief'])};
      export const GIA_HANDLERS = Object.fromEntries(ids.map((id) => [id, async (req) => {
        globalThis.__giaCalls.push({ id, req, body: req.method === 'POST' ? await req.text() : null });
        return new Response(JSON.stringify({ ok: true, from: id }), { status: 200 });
      }]));`;
    return null;
  },
};

let registry, dispatch, tools;
const bundle = async (name, dir) => {
  const out = path.join(dir, name + '.mjs');
  const b = await rolldown({ input: path.join(GIA, name + '.ts'), platform: 'node', plugins: [stubs] });
  await b.write({ file: out, format: 'esm' });
  return import(pathToFileURL(out).href);
};
before(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gci-gia-dispatch-'));
  registry = await bundle('_registry', dir);
  dispatch = (await bundle('dispatch', dir)).default;
  tools = (await bundle('tools', dir)).default;
});

const as = (auth) => { globalThis.__giaAuth = auth; globalThis.__giaCalls = []; };
const post = (body) => dispatch(new Request('https://preview.example/api/gia/dispatch', {
  method: 'POST', headers: { authorization: 'Bearer user-token', cookie: 'secret=1', 'content-type': 'application/json' }, body: JSON.stringify(body),
}));
const list = async () => (await (await tools(new Request('https://preview.example/api/gia/tools', { headers: { authorization: 'Bearer user-token' } }))).json());

// Owner (Chris) and LILI both hold every module key (incl. finance) in
// user_profiles.modules (data fact noted at apps/shell/src/pages/Home.tsx:42).
const FULL = ['crm', 'trade', 'quotation', 'finance', 'warehouse'];
const ALL = ['check_inventory', 'check_quotation_followups', 'consignment_summary', 'customer_360', 'daily_brief', 'inventory_table_alerts',
  'invoice_pending_summary', 'product_overview', 'quotation_history', 'receivables_summary', 'resolve_product', 'sales_summary', 'supplier_search'];
const ARGS = { customer_360: { customer: 'MAG' }, product_overview: { product: 'M' }, resolve_product: { q: '纸尿裤' }, supplier_search: { query: '劳工' } };

test('no session → 401 on both endpoints', async () => {
  as(null);
  assert.equal((await post({ tool: 'check_inventory' })).status, 401);
  assert.equal((await tools(new Request('https://preview.example/api/gia/tools'))).status, 401);
  assert.equal(globalThis.__giaCalls.length, 0);
});

for (const [who, isAdmin] of [['Owner / LILI (Admin)', true], ['same modules, non-Admin role', false]]) {
  test(`${who} with every module sees and can call all 13 tools`, async () => {
    as({ isAdmin, modules: FULL });
    assert.deepEqual((await list()).tools.map((t) => t.id).sort(), ALL);
    for (const tool of ALL) assert.equal((await post({ tool, args: ARGS[tool] })).status, 200, tool);
    assert.equal(globalThis.__giaCalls.length, ALL.length);
  });
}

const FINANCE_ONLY = ['daily_brief', 'invoice_pending_summary', 'receivables_summary', 'sales_summary'];

test('9 tools allow exactly what their endpoint allows; the 4 finance tools require finance — every module combination', async () => {
  // Endpoint rule parsed from the endpoint source, not from the registry.
  const endpointModules = Object.fromEntries(registry.GIA_TOOLS.map((t) => {
    const src = fs.readFileSync(path.join(ROOT, t.endpoint.replace(/^\//, '') + '.ts'), 'utf8');
    return [t.id, JSON.parse(src.match(/requireModule\(\w+, (\[[^\]]*\])\)/)[1].replace(/'/g, '"'))];
  }));
  for (let mask = 0; mask < 1 << FULL.length; mask++) {
    const modules = FULL.filter((_, i) => mask & (1 << i));
    for (const isAdmin of [false, true]) {
      as({ isAdmin, modules });
      const expected = ALL.filter((id) => FINANCE_ONLY.includes(id)
        ? modules.includes('finance')
        : endpointModules[id].some((m) => modules.includes(m)));
      assert.deepEqual((await list()).tools.map((t) => t.id).sort(), expected, JSON.stringify({ modules, isAdmin }));
    }
  }
});

test('模拟验证 (simulated): finance tools — trade-only / crm-only → not listed + 403; finance user passes', async () => {
  for (const modules of [['trade'], ['crm'], ['crm', 'trade', 'quotation', 'warehouse']]) {
    for (const isAdmin of [false, true]) {
      as({ isAdmin, modules });
      const ids = (await list()).tools.map((t) => t.id);
      for (const tool of FINANCE_ONLY) {
        assert.ok(!ids.includes(tool), `${tool} listed for ${modules}`);
        assert.equal((await post({ tool })).status, 403, `${tool} for ${modules}`);
      }
      assert.equal(globalThis.__giaCalls.length, 0);
    }
  }
  as({ isAdmin: false, modules: ['finance'] });
  const ids = (await list()).tools.map((t) => t.id);
  for (const tool of FINANCE_ONLY) {
    assert.ok(ids.includes(tool), tool);
    assert.equal((await post({ tool })).status, 200, tool);
  }
  assert.equal(globalThis.__giaCalls.length, FINANCE_ONLY.length);
});

test('finance exception lives in the registry only: exactly those 4 tools set giaModules=[finance]', () => {
  const withGia = registry.GIA_TOOLS.filter((t) => t.giaModules).map((t) => t.id).sort();
  assert.deepEqual(withGia, FINANCE_ONLY);
  for (const t of registry.GIA_TOOLS.filter((t) => t.giaModules)) assert.deepEqual(t.giaModules, ['finance']);
});

test('模拟验证 (simulated): staff without the module → not listed, 403, endpoint never called', async () => {
  as({ isAdmin: false, modules: ['crm'] });
  const ids = (await list()).tools.map((t) => t.id);
  assert.ok(!ids.includes('check_inventory') && !ids.includes('inventory_table_alerts') && !ids.includes('consignment_summary'));
  assert.equal((await post({ tool: 'check_inventory' })).status, 403);
  assert.equal(globalThis.__giaCalls.length, 0);
});

test('模拟验证 (simulated): a role label alone grants nothing — Editor/Admin with no modules see no tools', async () => {
  for (const isAdmin of [false, true]) {
    as({ isAdmin, modules: [] });
    assert.deepEqual((await list()).tools, []);
    assert.equal((await post({ tool: 'resolve_product', args: { q: 'x' } })).status, 403);
  }
});

test('sensitive is a label only and is exposed in the tool list', async () => {
  as({ isAdmin: false, modules: FULL });
  const sensitive = (await list()).tools.filter((t) => t.sensitive).map((t) => t.id).sort();
  assert.deepEqual(sensitive, ALL.filter((id) => !['check_inventory', 'inventory_table_alerts', 'resolve_product'].includes(id)));
});

test('unknown tool → 400; bad args → 400', async () => {
  as({ isAdmin: true, modules: FULL });
  assert.equal((await post({ tool: 'drop_tables' })).status, 400);
  assert.equal((await post({})).status, 400);
  assert.equal((await post({ tool: 'resolve_product' })).status, 400);                         // missing q
  assert.equal((await post({ tool: 'check_inventory', args: { sku: 'x' } })).status, 400);     // unknown arg
  assert.equal((await post({ tool: 'check_inventory', args: { product: 5 } })).status, 400);   // non-string
  assert.equal(globalThis.__giaCalls.length, 0);
});

test('GET call forwards only the caller token, same origin, args as query', async () => {
  as({ isAdmin: false, modules: ['trade'] });
  const r = await post({ tool: 'check_inventory', args: { product: ' Moni Happy M ' } });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.deepEqual(body, { ok: true, tool: 'check_inventory', upstreamStatus: 200, data: { ok: true, from: 'check_inventory' } });
  const { req } = globalThis.__giaCalls[0];
  const url = new URL(req.url);
  assert.equal(url.origin, 'https://preview.example');
  assert.equal(url.pathname, '/api/trade/check-inventory');
  assert.equal(url.searchParams.get('product'), 'Moni Happy M');
  assert.equal(req.headers.get('authorization'), 'Bearer user-token');
  assert.equal(req.headers.get('cookie'), null);
});

test('POST tool (supplier_search) forwards a JSON body', async () => {
  as({ isAdmin: false, modules: ['crm'] });
  assert.equal((await post({ tool: 'supplier_search', args: { query: '劳工' } })).status, 200);
  const call = globalThis.__giaCalls[0];
  assert.equal(new URL(call.req.url).pathname, '/api/suppliers/search');
  assert.deepEqual(JSON.parse(call.body), { query: '劳工' });
});

test('upstream status is passed through', async () => {
  as({ isAdmin: true, modules: FULL });
  const r = await post({ tool: 'daily_brief' });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('X-GIA-Tool'), 'daily_brief');
});

test('dispatch sources never use the service-role key or the assistant/MCP layer', () => {
  for (const f of fs.readdirSync(GIA)) {
    const src = fs.readFileSync(path.join(GIA, f), 'utf8');
    assert.doesNotMatch(src, /service[_-]?role/i, f);
    assert.doesNotMatch(src, /api\/assistant|\.\.\/assistant\//, f);
    assert.doesNotMatch(src, /mcp/i, f);
    assert.doesNotMatch(src, /legacyTradeAnonHeaders|userRestHeaders|rest\/v1/, f);
  }
});

test('registry matches the real endpoints: file exists, handler wired, module list identical', () => {
  const handlersSrc = fs.readFileSync(path.join(GIA, '_handlers.ts'), 'utf8');
  for (const t of registry.GIA_TOOLS) {
    const file = path.join(ROOT, t.endpoint.replace(/^\//, '') + '.ts');
    assert.ok(fs.existsSync(file), t.endpoint);
    const src = fs.readFileSync(file, 'utf8');
    const m = src.match(/requireModule\(\w+, (\[[^\]]*\])\)/);
    assert.ok(m, 'no requireModule in ' + t.endpoint);
    assert.deepEqual(JSON.parse(m[1].replace(/'/g, '"')), t.modules, t.id);
    assert.match(src, new RegExp(`method !== '${t.method}'`), t.id + ' method');
    assert.match(handlersSrc, new RegExp(`\\b${t.id}: \\w+`), t.id + ' handler');
  }
});
