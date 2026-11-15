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

test('quote → PI: qty / rate / rounding never change line or total amounts', async () => {
  const lib2 = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gci-cu2-')), 'cu.mjs');
  const b = await rolldown({ input: path.join(ROOT, 'modules/trade/services/currencyUtils.ts'), platform: 'node' });
  await b.write({ file: lib2, format: 'esm' });
  const cu = await import(pathToFileURL(lib2).href);
  // Reported case: line 64.45, qty 3 → locked to 21.48 × 3 = 64.44 before it ever reaches the PI.
  assert.equal(lib.lockLineToUnit(64.45, 3), 64.44);
  assert.equal(lib.lockLineToUnit(18.62, 1), 18.62);   // qty 1 unchanged
  assert.equal(lib.lockLineToUnit(43450, 50), 43450);
  assert.equal(lib.lockLineToUnit(10, 0), 10);
  let seed = 42; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const rates = [1, 3.6725, 0.505, 0.2723];
  for (let run = 0; run < 200; run++) {
    const rows = Array.from({ length: 1 + Math.floor(rnd() * 100) }, () => {
      const qty = 1 + Math.floor(rnd() * 999);
      const unitCost = Number((Math.round(rnd() * 100000) / 1000 * rates[Math.floor(rnd() * 4)]).toFixed(4)); // handleConfirmRate keeps 4 dp
      const supplierTotal = unitCost * qty;
      const pct = Math.floor(rnd() * 1000) / 10;
      const line = lib.lockLineToUnit(supplierTotal * (1 + pct / 100), qty);           // markup path
      const typed = lib.lockLineToUnit(Math.round(rnd() * 1e7) / 100, qty);            // typed + blur path
      return { qty, cost: supplierTotal, line: rnd() < 0.5 ? line : typed };
    });
    // Quotation Center push payload (unchanged code) → PI recompute (unchanged code).
    const pushed = rows.map(r => ({ unitPrice: Number((r.line / r.qty).toFixed(2)), lineTotal: Number(r.line.toFixed(2)), qty: r.qty }));
    const piItems = pushed.map(p => ({ price: cu.roundTo2(p.unitPrice), qty: p.qty }));
    pushed.forEach((p, i) => assert.equal(cu.roundTo2(p.unitPrice * p.qty), p.lineTotal, `row ${i + 1} PI line = quote line`));
    const pi = cu.calculateTradeTotals(piItems);
    const q = lib.reconcileQuoteAmounts(rows.map(r => ({ cost: r.cost, selling: r.line }))).totals;
    assert.deepEqual([q.totalSelling, q.totalVAT, q.grandTotal], [pi.subtotal, pi.vat, pi.total]);
  }
});

test('regression: qty 3, typed 64.45 → difference shown, never changed silently', () => {
  assert.deepEqual(lib.lineUnitMismatch(64.45, 3), { entered: 64.45, unit: 21.48, adjusted: 64.44, diff: -0.01 });
  assert.equal(lib.lineUnitMismatch(64.44, 3), null);   // after the user confirms
  assert.equal(lib.lineUnitMismatch(18.62, 1), null);   // qty 1 never flagged
  assert.equal(lib.lineUnitMismatch(43450, 50), null);
  assert.equal(lib.lineUnitMismatch(0, 3), null);
  assert.deepEqual(lib.lineUnitMismatch(10, 3), { entered: 10, unit: 3.33, adjusted: 9.99, diff: -0.01 });
  // typed input: onChange stores exactly what was typed; no blur/auto adjust anywhere.
  assert.match(SRC, /onChange=\{e => handleSellChange\(Number\(e\.target\.value\) \|\| 0\)\}\n\s+className="w-full text-right bg-\[#C9A84C\]\/8/);
  assert.ok(!/handleSellCommit|onBlur=\{handleSell/.test(SRC), 'silent blur adjustment is back');
  // difference + reason shown with an explicit confirm button
  assert.match(SRC, /data-testid="sq-unit-mismatch"/);
  assert.match(SRC, /onClick=\{\(\) => handleSellChange\(unitMismatch\.adjusted\)\}/);
  // nothing inconsistent can be generated (auto-save), saved or pushed before confirmation
  const MSG = "Some line totals differ from the PI unit price calculation. Please confirm each adjustment first.";
  const gen = SRC.slice(SRC.indexOf("if (totalSelling <= 0) { alert(t('Please enter selling prices first')); return; }"), SRC.indexOf('// Auto-save to cloud on generate'));
  assert.ok(gen.includes('if (unitMismatchCount > 0)') && gen.indexOf('unitMismatchCount') < gen.indexOf('setQuoteGenerated(true)'));
  const push = SRC.slice(SRC.indexOf('const handleSendTradeToTrade = () => {'), SRC.indexOf('const payload = {', SRC.indexOf('const handleSendTradeToTrade = () => {')));
  assert.ok(push.includes('if (unitMismatchCount > 0)') && push.includes(MSG));
  const save = SRC.slice(SRC.indexOf('const handleSaveToCloud = async'), SRC.indexOf("setCloudSaveStatus('saving');", SRC.indexOf('const handleSaveToCloud = async')));
  assert.ok(save.includes('lineUnitMismatch(sellingPrices[it.id] || 0, it.quantity)') && save.includes(MSG));
  const tr = fs.readFileSync(path.join(ROOT, 'modules/quotation/translations.ts'), 'utf8');
  assert.ok(tr.includes("'Adjust to {a}': '确认调整为 {a}',"));
});

test('markup path still produces PI-reproducible lines; history restore and PI push code untouched', () => {
  assert.match(SRC, /setSellingPrices\(prev => \(\{ \.\.\.prev, \[item\.id\]: lockLineToUnit\(supplierTotal \* \(1 \+ pct \/ 100\), item\.quantity\) \}\)\);/);
  assert.match(SRC, /newSelling\[draft\.id\] = src\.selling_price;/); // saved history amounts are restored as-is
  assert.match(SRC, /unitPrice: it\.quantity > 0 \? Number\(\(\(sellingPrices\[it\.id\] \|\| 0\) \/ it\.quantity\)\.toFixed\(2\)\) : 0,/);
  assert.equal((SRC.match(/setSellingPrices\(prev =>/g) || []).length, 2, 'new selling-line writer added without lock');
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
