// Quotation Center fixes: blank Excel header cell crash + supplier search terms.
// Run from the repo root:  node --test modules/quotation/__tests__/blankHeaderAndSupplierSearch.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const require = createRequire(path.join(ROOT, 'package.json'));
const XLSX = require('xlsx');
const SRC = fs.readFileSync(path.join(ROOT, 'modules/quotation/QuotationModule.tsx'), 'utf8').replace(/\r\n/g, '\n');
const SUP = fs.readFileSync(path.join(ROOT, 'modules/suppliers/lib/suppliersCloud.ts'), 'utf8').replace(/\r\n/g, '\n');

test('blank header cell: SheetJS leaves a hole; Array.from turns it into "" (no crash)', () => {
  const csv = 'No,,Product Name,Specification,Qty,Unit Price (USD)\n1,,Test Cream,50ml,10,3.9\n';
  const wb = XLSX.read(new TextEncoder().encode(csv), { type: 'array' });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
  assert.ok(!(1 in rows[0]), 'header row has a hole at the blank cell');
  const old = rows[0].map(h => String(h || '').toLowerCase().trim());
  assert.throws(() => old.findIndex(h => h.toLowerCase().includes('product')), /toLowerCase/); // the reported error
  const headers = Array.from(rows[0], h => String(h || '').toLowerCase().trim());
  assert.deepEqual(headers, ['no', '', 'product name', 'specification', 'qty', 'unit price (usd)']);
  assert.equal(headers.findIndex(h => h.includes('product')), 2);
});

test('parser builds headers with Array.from (wiring)', () => {
  assert.match(SRC, /const headers: string\[\] = Array\.from\(\n\s+\(bestHeaderRowIndex !== -1 \? jsonData\[bestHeaderRowIndex\] : jsonData\[0\]\) \|\| \[\],/);
  assert.ok(!/jsonData\[bestHeaderRowIndex\]\.map\(\(h: any\)/.test(SRC), 'sparse .map header build is back');
});

test('supplier search pattern: brackets / commas dropped, words joined with *', () => {
  const fnSrc = SUP.slice(SUP.indexOf('export function supplierSearchPattern'), SUP.indexOf('export async function searchSuppliers('));
  const body = fnSrc.slice(fnSrc.indexOf('{') + 1, fnSrc.lastIndexOf('}'));
  const supplierSearchPattern = new Function('q', body);
  assert.equal(supplierSearchPattern('海汀顿 (Heddington)'), `${encodeURIComponent('海汀顿')}*Heddington`);
  assert.equal(supplierSearchPattern('  Coolhome '), 'Coolhome');
  assert.equal(supplierSearchPattern('cool home'), 'cool*home');
  assert.equal(supplierSearchPattern('Al Noor, LLC'), 'Al*Noor*LLC');
  assert.equal(supplierSearchPattern('L.L.C-FZ'), 'L.L.C-FZ');
  assert.equal(supplierSearchPattern('(),*'), '');
  // the request uses the pattern, never the raw text
  assert.match(SUP, /const encoded = supplierSearchPattern\(q\);\n\s+if \(!encoded\) return \[\];/);
});
