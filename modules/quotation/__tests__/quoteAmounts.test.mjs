// Quotation Center — customer-quote amount reconciliation (lines add up exactly to the header).
// Run from the repo root:  node --test modules/quotation/__tests__/quoteAmounts.test.mjs
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { rolldown } from 'rolldown';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const SRC = fs.readFileSync(path.join(ROOT, 'modules/quotation/QuotationModule.tsx'), 'utf8').replace(/\r\n/g, '\n');
const c = x => Math.round(x * 100);                 // AED → fils for exact comparisons
const sumC = (arr, k) => arr.reduce((s, l) => s + c(l[k]), 0);
const r2 = x => Math.round(x * 100) / 100;

let lib;
before(async () => {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gci-amt-')), 'quoteAmounts.mjs');
  const b = await rolldown({ input: path.join(ROOT, 'modules/quotation/lib/quoteAmounts.ts'), platform: 'node' });
  await b.write({ file: out, format: 'esm' });
  lib = await import(pathToFileURL(out).href);
});

function assertConsistent(res, input) {
  const { lines, totals } = res;
  assert.equal(lines.length, input.length);
  assert.equal(sumC(lines, 'selling'), c(totals.totalSelling), 'selling');
  assert.equal(sumC(lines, 'vat'), c(totals.totalVAT), 'vat');
  assert.equal(sumC(lines, 'lineTotal'), c(totals.grandTotal), 'line_total vs grand_total');
  assert.equal(sumC(lines, 'cost'), c(totals.totalSupplierCost), 'cost');
  assert.equal(sumC(lines, 'profit'), c(totals.totalProfit), 'profit');
  assert.equal(c(totals.totalSelling) + c(totals.totalVAT), c(totals.grandTotal));
  assert.equal(c(totals.totalSelling) - c(totals.totalSupplierCost), c(totals.totalProfit));
  // Unchanged rules: customer line prices, whole-quote VAT, rounded exact cost total.
  input.forEach((l, i) => {
    assert.equal(c(lines[i].selling), c(r2(l.selling)), `row ${i + 1} selling unchanged`);
    assert.ok(Math.abs(lines[i].vat - l.selling * 0.05) < 0.01 + 1e-9, `row ${i + 1} vat within 0.01`);
    assert.ok(Math.abs(lines[i].cost - l.cost) < 0.01 + 1e-9, `row ${i + 1} cost within 0.01`);
    assert.equal(c(lines[i].lineTotal), c(lines[i].selling) + c(lines[i].vat));
  });
  assert.equal(c(totals.totalVAT), Math.round(c(totals.totalSelling) * 0.05));
  assert.equal(c(totals.totalSupplierCost), Math.round(input.reduce((s, l) => s + l.cost, 0) * 100));
}

test('GCI-20261114-001 (14 rows): header unchanged, lines now add up exactly', () => {
  const R = 3.6725, usd = [3.9, 3.9, 4.5, 4.5, 4.5, ...Array(9).fill(0.36)];
  const input = usd.map(u => { const cost = u * R; return { cost, selling: Number((cost * 1.3).toFixed(2)) }; });
  assert.deepEqual(input.map(l => l.selling), [18.62, 18.62, 21.48, 21.48, 21.48, ...Array(9).fill(1.72)]);
  const res = lib.reconcileQuoteAmounts(input);
  assert.deepEqual(res.totals, {
    totalSupplierCost: 90.12, totalSelling: 117.16, totalProfit: 27.04,
    overallMargin: 30, totalVAT: 5.86, grandTotal: 123.02,
  });
  assertConsistent(res, input);
});

test('100 rows (mixed qty, markups, currencies converted to AED) stay consistent', () => {
  let seed = 20261115; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let run = 0; run < 50; run++) {
    const rates = [1, 3.6725, 0.505];
    const input = Array.from({ length: 100 }, () => {
      const qty = 1 + Math.floor(rnd() * 500);
      const unit = Math.round(rnd() * 5000) / 100 * rates[Math.floor(rnd() * 3)];
      const cost = unit * qty;
      return { cost, selling: Number((cost * (1 + Math.floor(rnd() * 80) / 100)).toFixed(2)) };
    });
    assertConsistent(lib.reconcileQuoteAmounts(input), input);
  }
});

test('edge cases: empty, single row, zero prices, loss-making row, many tiny rows', () => {
  assert.deepEqual(lib.reconcileQuoteAmounts([]).totals, { totalSupplierCost: 0, totalSelling: 0, totalProfit: 0, overallMargin: 0, totalVAT: 0, grandTotal: 0 });
  for (const input of [
    [{ cost: 16.52625, selling: 21.48 }],
    [{ cost: 0, selling: 0 }, { cost: 10, selling: 0 }, { cost: 0, selling: 10.01 }],
    [{ cost: 50, selling: 40 }, { cost: 1.3221, selling: 1.72 }],
    Array.from({ length: 300 }, () => ({ cost: 0.0333, selling: 0.03 })),
  ]) assertConsistent(lib.reconcileQuoteAmounts(input), input);
});

test('allocateCents: exact total, each value within 1, deterministic ties', () => {
  assert.deepEqual(lib.allocateCents([0.5, 0.5, 0.5], 2), [1, 1, 0]);
  assert.deepEqual(lib.allocateCents([1.9, 1.9], 3), [2, 1]);
  assert.deepEqual(lib.allocateCents([2.2, 2.2], 5), [3, 2]);
  assert.equal(lib.toCents(1.005), 101);
});

test('header comes from the Trade / PI calculateTradeTotals (one rule for quote and PI)', async () => {
  const lib2 = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gci-cu-')), 'cu.mjs');
  const b = await rolldown({ input: path.join(ROOT, 'modules/trade/services/currencyUtils.ts'), platform: 'node' });
  await b.write({ file: lib2, format: 'esm' });
  const cu = await import(pathToFileURL(lib2).href);
  let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let run = 0; run < 50; run++) {
    // PI-style lines: whole qty, 2-dp unit price (as PI normalises them); the quote stores the same line amounts.
    const pi = Array.from({ length: 1 + Math.floor(rnd() * 100) }, () => ({ qty: 1 + Math.floor(rnd() * 50), price: Math.round(rnd() * 99999) / 100 }));
    const quote = pi.map(it => ({ cost: it.price * it.qty * 0.77, selling: cu.roundTo2(it.price * it.qty) }));
    const piT = cu.calculateTradeTotals(pi);
    const q = lib.reconcileQuoteAmounts(quote).totals;
    assert.equal(q.totalSelling, piT.subtotal); assert.equal(q.totalVAT, piT.vat); assert.equal(q.grandTotal, piT.total);
  }
  const src = fs.readFileSync(path.join(ROOT, 'modules/quotation/lib/quoteAmounts.ts'), 'utf8');
  assert.match(src, /import \{ roundTo2, calculateTradeTotals \} from '\.\.\/\.\.\/trade\/services\/currencyUtils';/);
  assert.match(src, /calculateTradeTotals\(/);
});

test('cloud save uses the reconciled amounts for header and lines', () => {
  const fn = SRC.slice(SRC.indexOf('const buildCloudPayload = '), SRC.indexOf('const handleSaveToCloud = async'));
  assert.match(fn, /const amounts = reconcileQuoteAmounts\(/);
  for (const k of ['supplier_cost_total: sums.totalSupplierCost', 'selling_total: sums.totalSelling', 'profit_total: sums.totalProfit',
    'margin_percent: sums.overallMargin', 'vat_amount: sums.totalVAT', 'grand_total: sums.grandTotal',
    'selling_price: a.selling', 'profit_amount: a.profit', 'margin_percent: a.margin', 'vat_amount: a.vat', 'line_total: a.lineTotal'])
    assert.ok(fn.includes(k), k);
  assert.ok(!/sub \* 0\.05/.test(fn), 'per-line VAT rounding is back');
  assert.match(fn, /supplier_cost: Number\(item\.targetUnitPrice\.toFixed\(2\)\)/); // unit cost column unchanged
});
