// AIPage inventory query → the q sent to /api/ai/resolve-product.
// Run from the repo root:  node --test apps/shell/src/pages/__tests__/inventoryQuery.test.mjs
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { rolldown } from 'rolldown';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(HERE, '../AIPage.tsx'), 'utf8').replace(/\r\n/g, '\n');
const between = (s, a, b) => { const i = s.indexOf(a); assert.ok(i >= 0, 'missing: ' + a); const j = s.indexOf(b, i + a.length); assert.ok(j >= 0, 'missing: ' + b); return s.slice(i, j); };

let lib;
before(async () => {
  // The two helpers live inside AIPage.tsx (not exported); compile just them.
  const code = between(SRC, 'function normalizeInventoryQuery(', '// ── AI-assisted inventory resolver');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gci-inv-q-'));
  fs.writeFileSync(path.join(dir, 'inv.ts'), code + '\nexport { normalizeInventoryQuery, inventoryResolveQuery };\n');
  const b = await rolldown({ input: path.join(dir, 'inv.ts'), platform: 'node' });
  await b.write({ file: path.join(dir, 'inv.mjs'), format: 'esm' });
  lib = await import(pathToFileURL(path.join(dir, 'inv.mjs')).href);
});

test('resolve-product receives the product term, not the whole question', () => {
  assert.equal(lib.inventoryResolveQuery('现在有多少纸尿裤库存'), '纸尿裤');
  assert.equal(lib.inventoryResolveQuery('现在有多少纸尿裤库存？'), '纸尿裤');
  assert.equal(lib.inventoryResolveQuery('纸尿裤还有多少'), '纸尿裤');
});

test('full-inventory asks still send the original text (API answers full_inventory)', () => {
  for (const q of ['现在有多少库存', '查库存', '库存情况', '所有库存', '全部库存']) {
    assert.equal(lib.normalizeInventoryQuery(q), null, q);
    assert.equal(lib.inventoryResolveQuery(q), q, q);
  }
});

test('existing product-name cases are unchanged', () => {
  assert.equal(lib.inventoryResolveQuery('查，恒安七度空间卫生巾库存'), '恒安七度空间卫生巾');
  assert.equal(lib.inventoryResolveQuery('现在有多少咖啡库存'), '咖啡');
  assert.equal(lib.inventoryResolveQuery('帮我查一下 Palmjoy M 库存'), 'Palmjoy M');
  assert.equal(lib.inventoryResolveQuery('查询纸巾库存'), '纸巾');
  assert.equal(lib.inventoryResolveQuery('monihappy纸尿裤库存'), 'Moni Happy 纸尿裤');
});

test('resolveInventoryProduct sends inventoryResolveQuery(rawQuery) to resolve-product', () => {
  const fn = between(SRC, 'async function resolveInventoryProduct(', '// ── Consignment visibility gate');
  assert.match(fn, /resolve-product\?q=\$\{encodeURIComponent\(inventoryResolveQuery\(rawQuery\)\)\}/);
});
