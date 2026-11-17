// 经营看板 annual view — calculations (modules/trade/services/annualDashboard.ts).
// Run from the repo root:  node --test modules/trade/__tests__/annualDashboard.test.mjs
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { rolldown } from 'rolldown';

const HERE = path.dirname(fileURLToPath(import.meta.url));
let lib;

before(async () => {
  const b = await rolldown({ input: path.join(HERE, '../services/annualDashboard.ts'), platform: 'node' });
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gci-annual-')), 'annual.mjs');
  await b.write({ file: out, format: 'esm' });
  lib = await import(pathToFileURL(out).href);
});

const o = (id, createdAt, grandTotal, paidAmount, extra = {}) =>
  ({ id, createdAt, customerName: 'C', grandTotal, paidAmount, outstandingAmount: Math.round((grandTotal - paidAmount) * 100) / 100, status: paidAmount >= grandTotal ? 'PAID' : paidAmount > 0 ? 'PARTIAL' : 'PENDING', ...extra });

const ORDERS = [
  o('SO-A', '2026-05-21T08:00:00Z', 449.22, 449),
  o('SO-B', '2026-05-30T08:00:00Z', 100, 40),
  o('SO-C', '2026-07-07T08:00:00Z', 814.8, 814.8, { status: 'VOIDED' }),               // excluded
  o('SO-D', '2026-05-29T08:00:00Z', 2612.1, 0, { transactionMode: 'Consignment', status: 'CONSIGNMENT' }), // excluded
  o('ADJ-1', '2026-05-22T08:00:00Z', -3.85, 0, { order_type: 'ADJUSTMENT' }),          // excluded
  o('SO-E', '2025-12-31T20:00:00Z', 50, 50),                                           // other year
];
const PAYMENTS = [
  { id: 'p1', orderId: 'SO-A', date: '2026-05-21', amount: 449, method: 'CASH' },
  { id: 'p2', orderId: 'SO-B', date: '2026-06-02', amount: 40, method: 'BANK' },
  { id: 'p3', orderId: 'SO-C', date: '2026-07-07', amount: 814.8, method: 'CASH' },     // voided order → not shown
];

test('same revenue-order rule as the existing monthly KPIs', () => {
  const kept = ORDERS.filter(lib.isRevenueOrder).map((x) => x.id);
  assert.deepEqual(kept, ['SO-A', 'SO-B', 'SO-E']);
});

test('always 12 months; months without business are 0 (nothing invented)', () => {
  const v = lib.buildAnnualView(ORDERS, PAYMENTS, 2026);
  assert.equal(v.months.length, 12);
  assert.deepEqual(v.months.map((m) => m.key), Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`));
  for (const m of v.months.filter((m) => m.month !== 5)) {
    assert.deepEqual([m.revenue, m.collected, m.outstanding, m.orderCount, m.orders.length, m.payments.length], [0, 0, 0, 0, 0, 0], m.key);
  }
});

test('month figures: revenue = Σ grandTotal, collected = Σ paidAmount of orders created that month', () => {
  const may = lib.buildAnnualView(ORDERS, PAYMENTS, 2026).months[4];
  assert.equal(may.revenue, 549.22);
  assert.equal(may.collected, 489);
  assert.equal(may.outstanding, 60.22);
  assert.equal(may.orderCount, 2);
  assert.deepEqual(may.orders.map((x) => x.id), ['SO-B', 'SO-A']); // newest first
  assert.deepEqual(may.payments.map((p) => p.id), ['p2', 'p1']);   // payment detail of that month's orders
});

test('annual totals = sum of the 12 months; other years and excluded orders never counted', () => {
  const v = lib.buildAnnualView(ORDERS, PAYMENTS, 2026);
  assert.deepEqual(v.totals, { revenue: 549.22, collected: 489, orderCount: 2 });
  assert.deepEqual(lib.buildAnnualView(ORDERS, PAYMENTS, 2025).totals, { revenue: 50, collected: 50, orderCount: 1 });
  assert.deepEqual(lib.buildAnnualView([], [], 2024).totals, { revenue: 0, collected: 0, orderCount: 0 });
});

test('year options: years with orders + current year, newest first', () => {
  assert.deepEqual(lib.availableYears(ORDERS, 2026), [2026, 2025]);
  assert.deepEqual(lib.availableYears([], 2027), [2027]);
});

test('SalesDashboard keeps its monthly KPIs and uses the shared rule (no second definition)', () => {
  const src = fs.readFileSync(path.join(HERE, '../components/SalesDashboard.tsx'), 'utf8');
  assert.match(src, /orders\.filter\(isRevenueOrder\)/);
  for (const label of ['本月营业额', '本月已收款', '应收账款总额', '本月订单数', '本月经营拆解',
    '全年营业额', '全年已收款', '当前应收余额', '全年订单数']) assert.ok(src.includes(label), label);
});
