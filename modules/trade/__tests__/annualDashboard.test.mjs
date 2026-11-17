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
  o('SO-A', '2026-05-21T08:00:00Z', 449.22, 449, { status: 'PAID', outstandingAmount: 0.22 }),
  o('SO-B', '2026-05-30T08:00:00Z', 100, 40),
  o('SO-C', '2026-07-07T08:00:00Z', 814.8, 814.8, { status: 'VOIDED' }),               // excluded
  o('SO-D', '2026-05-29T08:00:00Z', 2612.1, 0, { transactionMode: 'Consignment', status: 'CONSIGNMENT' }), // excluded
  o('ADJ-1', '2026-05-22T08:00:00Z', -3.85, 0, { order_type: 'ADJUSTMENT' }),          // excluded
  o('SO-E', '2025-12-31T20:00:00Z', 50, 50),                                           // other year
];
const PAYMENTS = [
  { id: 'p1', orderId: 'SO-A', date: '2026-05-21', amount: 449, method: 'CASH' },
  { id: 'p2', orderId: 'SO-B', date: '2026-06-02', amount: 40, method: 'BANK' },     // May order, paid in June
  { id: 'p2', orderId: 'SO-B', date: '2026-06-02', amount: 40, method: 'BANK' },     // duplicate row → counted once
  { id: 'p3', orderId: 'SO-C', date: '2026-07-07', amount: 814.8, method: 'CASH' },  // voided order → excluded
  { id: 'p4', orderId: 'SO-E', date: '2026-01-03', amount: 50, method: 'CASH' },     // 2025 order paid in 2026
  { id: 'p5', orderId: 'SO-X', date: '2026-08-01', amount: 10, method: 'CASH' },     // unknown order → excluded
];

test('same revenue-order rule as the existing monthly KPIs', () => {
  const kept = ORDERS.filter(lib.isRevenueOrder).map((x) => x.id);
  assert.deepEqual(kept, ['SO-A', 'SO-B', 'SO-E']);
});

test('always 12 months; months without business are 0 (nothing invented)', () => {
  const v = lib.buildAnnualView(ORDERS, PAYMENTS, 2026);
  assert.equal(v.months.length, 12);
  assert.deepEqual(v.months.map((m) => m.key), Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`));
  for (const m of v.months.filter((m) => ![1, 5, 6].includes(m.month))) {
    assert.deepEqual([m.revenue, m.collected, m.outstanding, m.orderCount, m.orders.length, m.payments.length], [0, 0, 0, 0, 0, 0], m.key);
  }
});

test('营业额 by order creation month; 已收款 by real payment date', () => {
  const v = lib.buildAnnualView(ORDERS, PAYMENTS, 2026);
  const [jan, may, jun] = [v.months[0], v.months[4], v.months[5]];
  assert.deepEqual([may.revenue, may.collected, may.outstanding, may.orderCount], [549.22, 449, 60.22, 2]);
  assert.deepEqual(may.orders.map((x) => x.id), ['SO-B', 'SO-A']);
  assert.deepEqual(may.payments.map((p) => p.id), ['p1']);
  assert.deepEqual([jun.revenue, jun.collected, jun.orderCount], [0, 40, 0]);
  assert.deepEqual(jun.payments.map((p) => p.id), ['p2']);   // duplicate counted once
  assert.deepEqual([jan.revenue, jan.collected], [0, 50]);   // prior-year order paid in January
});

test('annual totals = sum of the 12 months; excluded payments reported, never counted', () => {
  const v = lib.buildAnnualView(ORDERS, PAYMENTS, 2026);
  assert.deepEqual(v.totals, { revenue: 549.22, collected: 539, orderCount: 2 });
  assert.equal(v.totals.collected, v.months.reduce((s, m) => s + m.collected, 0));
  assert.deepEqual(v.excludedPayments, { count: 2, amount: 824.8 });
  assert.deepEqual(lib.buildAnnualView(ORDERS, PAYMENTS, 2025).totals, { revenue: 50, collected: 0, orderCount: 1 });
  assert.deepEqual(lib.buildAnnualView([], [], 2024).totals, { revenue: 0, collected: 0, orderCount: 0 });
});

test('order paidAmount / status untouched (0.22 rounding difference stays)', () => {
  const snapshot = JSON.stringify(ORDERS) + JSON.stringify(PAYMENTS);
  lib.buildAnnualView(ORDERS, PAYMENTS, 2026);
  assert.equal(JSON.stringify(ORDERS) + JSON.stringify(PAYMENTS), snapshot);
  assert.deepEqual([ORDERS[0].status, ORDERS[0].paidAmount, ORDERS[0].outstandingAmount], ['PAID', 449, 0.22]);
});

test('year options: years with orders or payments + current year, newest first', () => {
  assert.deepEqual(lib.availableYears(ORDERS, 2026), [2026, 2025]);
  assert.deepEqual(lib.availableYears([], 2026, [{ id: 'x', orderId: 'y', date: '2024-03-01', amount: 1 }]), [2026, 2024]);
  assert.deepEqual(lib.availableYears([], 2027), [2027]);
});

test('SalesDashboard keeps its monthly KPIs and uses the shared rule (no second definition)', () => {
  const src = fs.readFileSync(path.join(HERE, '../components/SalesDashboard.tsx'), 'utf8');
  assert.match(src, /orders\.filter\(isRevenueOrder\)/);
  for (const label of ['本月营业额', '本月已收款', '应收账款总额', '本月订单数', '本月经营拆解',
    '全年营业额', '全年已收款', '当前应收余额', '全年订单数', '按付款日期']) assert.ok(src.includes(label), label);
});
