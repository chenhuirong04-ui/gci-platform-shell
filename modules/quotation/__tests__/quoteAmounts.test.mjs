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

async function loadCu() {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gci-cu2-')), 'cu.mjs');
  const b = await rolldown({ input: path.join(ROOT, 'modules/trade/services/currencyUtils.ts'), platform: 'node' });
  await b.write({ file: out, format: 'esm' });
  return import(pathToFileURL(out).href);
}

test('unit price first: line = roundTo2(unit × qty), identical to Trade / PI', async () => {
  const cu = await loadCu();
  assert.equal(lib.lineFromUnit(21.48, 3), 64.44);   // qty 3 × 21.48 — no line ÷ qty anywhere
  assert.equal(lib.lineFromUnit(21.485, 3), 64.47);  // unit is taken at 2 dp first (21.49), like the PI
  assert.equal(lib.lineFromUnit(18.62, 1), 18.62);
  assert.equal(lib.lineFromUnit(790, 50), 39500);
  assert.equal(lib.lineFromUnit(0, 3), 0);
  for (const [u, q] of [[21.48, 3], [6.21, 3], [1.72, 999], [3.33, 7], [0.01, 1]])
    assert.equal(lib.lineFromUnit(u, q), cu.roundTo2(cu.roundTo2(u) * q)); // QuoteManager.tsx lineTotal rule
});

test('quote → PI: qty / rate / rounding never change unit, line or total amounts', async () => {
  const cu = await loadCu();
  let seed = 42; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const rates = [1, 3.6725, 0.505, 0.2723];
  for (let run = 0; run < 200; run++) {
    const rows = Array.from({ length: 1 + Math.floor(rnd() * 100) }, () => {
      const qty = 1 + Math.floor(rnd() * 999);
      const unitCost = Number((Math.round(rnd() * 100000) / 1000 * rates[Math.floor(rnd() * 4)]).toFixed(4)); // handleConfirmRate keeps 4 dp
      const pct = Math.floor(rnd() * 1000) / 10;
      const unit = rnd() < 0.5 ? cu.roundTo2(unitCost * (1 + pct / 100))   // markup path
                               : Math.round(rnd() * 1e6) / 100;            // typed unit price
      return { qty, unitCost, unit };
    });
    // Quote side (screen / PDF / push): calculateTradeTotals over unit × qty; save side: reconcileQuoteAmounts.
    const quoteTotals = cu.calculateTradeTotals(rows.map(r => ({ price: cu.roundTo2(r.unit), qty: r.qty })));
    const saved = lib.reconcileQuoteAmounts(rows.map(r => ({ cost: r.unitCost * r.qty, selling: lib.lineFromUnit(r.unit, r.qty) })));
    // Push payload (unchanged shape) → PI inbound parse → PI recompute (QuoteManager, unchanged).
    const pushed = rows.map(r => ({ unitPrice: cu.roundTo2(r.unit), lineTotal: lib.lineFromUnit(r.unit, r.qty), qty: r.qty }));
    const piItems = pushed.map(p => ({ unit_price: cu.roundTo2(Number(p.unitPrice) || 0), qty: p.qty }));
    piItems.forEach((it, i) => assert.equal(cu.roundTo2(it.unit_price * it.qty), pushed[i].lineTotal, `row ${i + 1}`));
    const pi = cu.calculateTradeTotals(piItems.map(i => ({ price: i.unit_price, qty: i.qty })));
    assert.deepEqual([quoteTotals.subtotal, quoteTotals.vat, quoteTotals.total], [pi.subtotal, pi.vat, pi.total]);
    assert.deepEqual([saved.totals.totalSelling, saved.totals.totalVAT, saved.totals.grandTotal], [pi.subtotal, pi.vat, pi.total]);
  }
});

test('regression: qty 3, unit 21.48 → line 64.44 on screen, PDF, push, save and PI', async () => {
  const cu = await loadCu();
  const unit = 21.48, qty = 3;
  assert.equal(lib.lineFromUnit(unit, qty), 64.44);
  const piLine = cu.roundTo2(cu.roundTo2(unit) * qty);
  assert.equal(piLine, 64.44);
  const saved = lib.reconcileQuoteAmounts([{ cost: 14.32275 * qty, selling: lib.lineFromUnit(unit, qty) }]);
  assert.equal(saved.lines[0].selling, 64.44);
  assert.equal(saved.totals.grandTotal, cu.calculateTradeTotals([{ price: unit, qty }]).total); // 67.66
  assert.equal(saved.totals.grandTotal, 67.66);
});

test('no unit price is derived from a line total anywhere in the customer quote', () => {
  assert.ok(!/\/ (item|it)\.quantity/.test(SRC), 'line ÷ qty is back');
  assert.ok(!/lockLineToUnit|lineUnitMismatch|sq-unit-mismatch/.test(SRC), 'old line-total workaround is back');
  // pricing row: input is the unit price; markup sets a 2-dp unit price from the unit cost
  assert.match(SRC, /\{t\('Selling Unit Price ✎'\)\}/);
  assert.match(SRC, /setSellingPrices\(prev => \(\{ \.\.\.prev, \[item\.id\]: roundTo2\(supplierUnit \* \(1 \+ pct \/ 100\)\) \}\)\);/);
  assert.match(SRC, /const lineSellingTotal = lineFromUnit\(sellPrice, item\.quantity\);/);
  // totals = Trade / PI rule
  assert.match(SRC, /const piTotals = calculateTradeTotals\(confirmed\.map\(it => \(\{ price: roundTo2\(sellingPrices\[it\.id\] \|\| 0\), qty: it\.quantity \}\)\)\);/);
  // PDF + push use the unit price directly
  assert.match(SRC, /const unitSellPrice = roundTo2\(sellingPrices\[item\.id\] \|\| 0\);/);
  assert.match(SRC, /const lineTot = lineFromUnit\(unitSellPrice, item\.quantity\);/);
  assert.match(SRC, /unitPrice: roundTo2\(sellingPrices\[it\.id\] \|\| 0\),\n\s+lineTotal: lineFromUnit\(sellingPrices\[it\.id\] \|\| 0, it\.quantity\),/);
  // history: selling_price is a unit price, restored as-is; markup = unit / unit cost
  assert.match(SRC, /newSelling\[draft\.id\] = src\.selling_price;/);
  assert.match(SRC, /src\.selling_price \/ src\.supplier_cost - 1/);
  assert.equal((SRC.match(/setSellingPrices\(prev =>/g) || []).length, 2);
});

test('cloud save: selling_price = unit price, reconciled line / header amounts', () => {
  const fn = SRC.slice(SRC.indexOf('const buildCloudPayload = '), SRC.indexOf('const handleSaveToCloud = async'));
  assert.match(fn, /selling: lineFromUnit\(sellingPrices\[item\.id\] \|\| 0, item\.quantity\),/);
  for (const k of ['supplier_cost_total: sums.totalSupplierCost', 'selling_total: sums.totalSelling', 'profit_total: sums.totalProfit',
    'margin_percent: sums.overallMargin', 'vat_amount: sums.totalVAT', 'grand_total: sums.grandTotal',
    'selling_price: roundTo2(sellingPrices[item.id] || 0)', 'profit_amount: a.profit', 'margin_percent: a.margin', 'vat_amount: a.vat', 'line_total: a.lineTotal'])
    assert.ok(fn.includes(k), k);
  assert.ok(!/sub \* 0\.05/.test(fn), 'per-line VAT rounding is back');
  assert.match(fn, /supplier_cost: Number\(item\.targetUnitPrice\.toFixed\(2\)\)/); // unit cost column unchanged
});

test('reopened GCI-20261114-001: saved cost total 90.12 is kept until a cost line changes', () => {
  // As restored from quotation_items (supplier_cost is numeric(14,2)) + quotation_records.supplier_cost_total.
  const restored = [14.32, 14.32, 16.53, 16.53, 16.53, ...Array(9).fill(1.32)].map(u => ({ targetUnitPrice: u, quantity: 1 }));
  const sell = [18.62, 18.62, 21.48, 21.48, 21.48, ...Array(9).fill(1.72)];
  const baseline = { total: 90.12, fingerprint: lib.costFingerprint(restored) };
  // Old behaviour: rebuilt from 2-dp unit costs.
  assert.equal(lib.supplierCostTotal(restored, null), 90.11);
  // Unchanged: page and re-save use the saved total; profit stays 27.04; lines still add up.
  assert.equal(lib.supplierCostTotal(restored, baseline), 90.12);
  const lines = restored.map((it, i) => ({ cost: it.targetUnitPrice * it.quantity, selling: lib.lineFromUnit(sell[i], it.quantity) }));
  const resaved = lib.reconcileQuoteAmounts(lines, lib.supplierCostTotal(restored, baseline));
  assert.deepEqual(resaved.totals, { totalSupplierCost: 90.12, totalSelling: 117.16, totalProfit: 27.04, overallMargin: 30, totalVAT: 5.86, grandTotal: 123.02 });
  assert.equal(sumC(resaved.lines, 'cost'), 9012);
  assert.equal(sumC(resaved.lines, 'profit'), 2704);
  assert.equal(sumC(resaved.lines, 'lineTotal'), 12302);
  // Selling-price edits alone keep the saved cost total.
  assert.equal(lib.supplierCostTotal(restored, baseline), 90.12);
  // A cost or qty change (or removed row) recalculates from the current lines.
  const qty3 = restored.map((it, i) => (i === 0 ? { ...it, quantity: 3 } : it));
  assert.equal(lib.supplierCostTotal(qty3, baseline), 118.75);
  const cost = restored.map((it, i) => (i === 0 ? { ...it, targetUnitPrice: 14.5 } : it));
  assert.equal(lib.supplierCostTotal(cost, baseline), 90.29);
  assert.equal(lib.supplierCostTotal(restored.slice(1), baseline), 75.79);
  // New quotes (no baseline) keep the exact-cost rule.
  assert.equal(lib.supplierCostTotal([{ targetUnitPrice: 14.32275, quantity: 2 }], null), 28.65);
});

test('baseline wiring: set on history restore, cleared on new quote, used by page / summary / save', () => {
  assert.match(SRC, /setSavedCostBaseline\(typeof record\.supplier_cost_total === 'number'\n\s+\? \{ total: Number\(record\.supplier_cost_total\), fingerprint: costFingerprint\(restoredDraftItems\) \} : null\);/);
  assert.equal((SRC.match(/setSellingPrices\(\{\}\);\n\s+setSavedCostBaseline\(null\);/g) || []).length, 3);
  assert.match(SRC, /const totalSupplierCost = supplierCostTotal\(confirmed, savedCostBaseline\);/);
  assert.match(SRC, /const sumCost = supplierCostTotal\(confirmedSummary, savedCostBaseline\);/);
  const fn = SRC.slice(SRC.indexOf('const buildCloudPayload = '), SRC.indexOf('const handleSaveToCloud = async'));
  assert.match(fn, /\}\)\), supplierCostTotal\(confirmed, savedCostBaseline\)\);/);
});

test('pricing rows: allocated row costs add up to the header cost (GCI-20261114-001 acceptance)', () => {
  const restored = [14.32, 14.32, 16.53, 16.53, 16.53, ...Array(9).fill(1.32)].map(u => ({ targetUnitPrice: u, quantity: 1 }));
  const unitSell = [18.62, 18.62, 21.48, 21.48, 21.48, ...Array(9).fill(1.72)];
  const baseline = { total: 90.12, fingerprint: lib.costFingerprint(restored) };
  const header = lib.supplierCostTotal(restored, baseline);
  const rows = lib.reconcileQuoteAmounts(restored.map((it, i) => ({ cost: it.targetUnitPrice * it.quantity, selling: lib.lineFromUnit(unitSell[i], it.quantity) })), header);
  assert.equal(sumC(rows.lines, 'cost'), 9012);                 // 90.12
  assert.equal(sumC(rows.lines, 'selling'), 11716);             // 117.16
  assert.equal(sumC(rows.lines, 'profit'), 2704);               // 27.04
  assert.equal(rows.totals.totalVAT, 5.86);
  assert.equal(rows.totals.grandTotal, 123.02);
  rows.lines.forEach((l, i) => assert.ok(Math.abs(l.cost - restored[i].targetUnitPrice) <= 0.01, `row ${i + 1} within 0.01`));
  // unit costs and unit selling prices are inputs only — never rewritten
  assert.deepEqual(restored.map(r => r.targetUnitPrice), [14.32, 14.32, 16.53, 16.53, 16.53, ...Array(9).fill(1.32)]);
  // wiring: row display uses the allocated cost; the unit cost shown (@) stays the original
  assert.match(SRC, /const rowCosts = reconcileQuoteAmounts\(confirmed\.map\(it => \(\{ cost: it\.targetUnitPrice \* it\.quantity, selling: lineFromUnit\(sellingPrices\[it\.id\] \|\| 0, it\.quantity\) \}\)\), totalSupplierCost\)\.lines;/);
  assert.match(SRC, /const supplierUnit = item\.targetUnitPrice;\s+\/\/ original unit cost \(unchanged\)\n\s+const supplierTotal = rowCosts\[idx\]\.cost;/);
  assert.match(SRC, /const lineProfit = lineSellingTotal - supplierTotal;/);
});
