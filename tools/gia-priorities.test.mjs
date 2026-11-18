// GIA P5 step 2 — deterministic priority ranking for the daily overview.
// Run from the repo root:  node --test tools/gia-priorities.test.mjs
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { rolldown } from 'rolldown';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let P;
before(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gci-prio-'));
  const out = path.join(dir, 'p.mjs');
  const b = await rolldown({ input: path.join(ROOT, 'api/gia/_priorities.ts'), platform: 'node' });
  await b.write({ file: out, format: 'esm' });
  P = await import(pathToFileURL(out).href);
});

const TODAY = '2026-11-18';
// Shaped like production on 2026-11-18.
const consRecs = [
  { soNo: 'SO-20260522-1674', customerName: 'Hong gourmet hypermarket L.L.C', soldQty: 1, remainingQty: 0, unitPrice: 3.67, receivedAmount: 3.85, settlementStatus: 'PARTIAL', createdAt: '2026-05-22T05:26:41Z' },
  { soNo: 'SO-20260529-3738', customerName: 'Hong gourmet hypermarket L.L.C', soldQty: 0, remainingQty: 574, unitPrice: 9.8, receivedAmount: 0, settlementStatus: 'UNSETTLED', createdAt: '2026-05-29T08:47:32Z' },
];
const REAL = () => ({
  daily_brief: { ok: true, quotations: { pendingCount: 1, overdueCount: 0, allPending: [{ quoteNo: 'GCI-20261114-001', customerName: '—', grandTotal: 123.02, daysAgo: 4, overdue: false }] },
    sales: { monthlyCount: 0 }, receivables: { voided: { orderCount: 10, paymentAmount: 2947.25 } } },
  receivables_summary: { ok: true, orderReceivables: { total: 0, customerCount: 0, orderCount: 0, overdueCount: 0, customers: [], voided: { orderCount: 10, paymentAmount: 2947.25 } },
    consignmentReceivables: { total: 5903.68, customerCount: 1, soCount: 27 }, invoiceReceivables: { total: 0, invoiceCount: 0, overdueCount: 0, invoices: [] } },
  crm_followups: { ok: true, counts: { dueToday: 0, overdue: 4, urgent: 3 }, items: [
    { customer: 'DHCN', urgent: true, overdueDays: 10, owner: null }, { customer: '中东中建二局', urgent: true, overdueDays: 10, owner: null },
    { customer: '海汀顿 Hotington', urgent: true, overdueDays: 10, owner: null }, { customer: '兵团', urgent: false, overdueDays: 10, owner: null }] },
  bank_balances: { ok: true, totalsByCurrency: [{ currency: 'AED', companyTotal: 3.85 }, { currency: 'USD', companyTotal: 0 }], accounts: [
    { accountName: 'ADIB Corporate', scope: 'company_bank', currency: 'AED', balance: 0, lastTransactionDate: null },
    { accountName: 'Cash', scope: 'company_cash', currency: 'AED', balance: 0, lastTransactionDate: '2026-07-07' },
    { accountName: 'WIO AED', scope: 'company_bank', currency: 'AED', balance: 3.85, lastTransactionDate: '2026-05-28' },
    { accountName: 'WIO Personal AED', scope: 'personal', currency: 'AED', balance: 0, lastTransactionDate: '2026-11-01' }] },
  payables_due: { ok: true, overdue: { count: 0, amount: 0 }, dueIn7Days: { count: 0, amount: 0 }, payables: [] },
  pending_vouchers: { ok: true, pendingCount: 0, pendingAmount: 0 },
  bank_reconciliation_status: { ok: true, importCount: 0 },
  inventory_table_alerts: { ok: true, totalRows: 40, outOfStockCount: 10, lowStockCount: 0, alertItems: [{ productName: '云感78抽面巾纸', updatedAt: '2026-08-31T06:08:00Z' }] },
  consignment_summary: { ok: true, records: structuredClone(consRecs) },
  internal_tasks: { ok: true, counts: { activeWithoutDueDate: 1, activeWithoutOwner: 0 }, tasks: [{ title: '展厅物品清理', overdue: false, dueAt: null, owner: '本人' }] },
  company_documents: { ok: true, licences: { expired: [], expiringIn90Days: [], renewedOldVersionsStillReminding: ['Trade License · old.pdf（2026-10-02）'] } },
});

test('real-data shape: order is stable and follows the score', () => {
  const r = P.rankPriorities(REAL(), TODAY);
  const keys = r.map((c) => c.key);
  assert.deepEqual(keys.slice(0, 3), ['consignment_unsold', 'crm_followups', 'bank_book_unverified']);
  for (let i = 1; i < r.length; i++) assert.ok(r[i - 1].score >= r[i].score);
  assert.deepEqual(r.map((c) => c.rank), r.map((_, i) => i + 1));
  // Same input → identical output, every time.
  for (let i = 0; i < 5; i++) assert.deepEqual(P.rankPriorities(REAL(), TODAY), r);
});

test('consignment: sold-and-unpaid is separate from unsold stock; settled-over (received > sold) is not owed', () => {
  const r = P.rankPriorities(REAL(), TODAY);
  assert.ok(!r.some((c) => c.key === 'consignment_sold_unpaid'), 'received 3.85 ≥ sold 1 × 3.67 → nothing owed now');
  const u = r.find((c) => c.key === 'consignment_unsold');
  assert.match(u.facts.join(' '), /不是正式应收/);
  assert.equal(u.breakdown.confidence, '中');
  const d = REAL(); d.consignment_summary.records[1].soldQty = 100; d.consignment_summary.records[1].remainingQty = 474;
  const s = P.rankPriorities(d, TODAY).find((c) => c.key === 'consignment_sold_unpaid');
  assert.ok(s && /980\.00/.test(s.facts[0]));
});

test('bank: book balance flagged as not available cash when stale / no statements; personal accounts excluded', () => {
  const b = P.rankPriorities(REAL(), TODAY).find((c) => c.key === 'bank_book_unverified');
  assert.match(b.facts.join(' '), /2026-07-07/); // newest COMPANY account txn, not the personal one (2026-11-01)
  assert.ok(!b.involves.includes('Personal'));
  assert.match(b.title, /不能代表|无法代表/);
  const fresh = REAL();
  fresh.bank_balances.accounts[2].lastTransactionDate = '2026-11-15';
  fresh.bank_reconciliation_status.importCount = 3;
  assert.ok(!P.rankPriorities(fresh, TODAY).some((c) => c.key === 'bank_book_unverified'));
});

test('payables due beyond company book balance outrank everything else', () => {
  const d = REAL();
  d.payables_due = { ok: true, overdue: { count: 2, amount: 12000 }, dueIn7Days: { count: 1, amount: 3000 }, payables: [{ supplierName: 'ABC Supplies' }] };
  const r = P.rankPriorities(d, TODAY);
  assert.equal(r[0].key, 'payables_cash');
  assert.match(r[0].title, /超过/);
  assert.equal(r[0].breakdown.confidence, '中'); // stale bank data lowers confidence
});

test('formal receivables use effective orders only; overdue days from due dates; voided never scored', () => {
  const d = REAL();
  d.receivables_summary.orderReceivables = { total: 20000, customerCount: 1, orderCount: 2, overdueCount: 1,
    customers: [{ customerName: 'MAG', orders: [{ overdue: true, dueDate: '2026-10-19' }, { overdue: false, dueDate: '2026-12-01' }] }] };
  const r = P.rankPriorities(d, TODAY);
  const o = r.find((c) => c.key === 'order_receivables');
  assert.equal(r[0].key, 'order_receivables');
  assert.match(o.facts.join(' '), /最长逾期 30 天/);
  assert.equal(o.breakdown.money, 32);
  assert.ok(!JSON.stringify(r).includes('2947.25'), 'voided amount never appears as an issue');
});

test('not hard-coded: an expired current licence or overdue P1 task can reach the top three', () => {
  const d = REAL();
  d.company_documents.licences.expired = ['Trakhees Permit'];
  d.internal_tasks.tasks.push({ title: 'VAT filing', overdue: true, dueAt: '2026-10-01T00:00:00Z', priority: 'P1', owner: 'LILI' });
  const top = P.rankPriorities(d, TODAY).slice(0, 3).map((c) => c.key);
  assert.ok(top.includes('licence_expired:Trakhees Permit'));
  assert.ok(top.includes('tasks_overdue'));
});

test('stale stock table and no sales → low confidence, low rank; old licence reminder is cleanup only', () => {
  const r = P.rankPriorities(REAL(), TODAY);
  const s = r.find((c) => c.key === 'stock_shortage');
  assert.equal(s.breakdown.confidence, '低');
  assert.ok(s.score < P.PRIORITY_MIN_SCORE);
  const l = r.find((c) => c.key === 'licence_old_reminder');
  assert.ok(l.score < P.PRIORITY_MIN_SCORE && /不是证照过期/.test(l.facts[0]));
});

test('missing / failed tools are skipped, never invented', () => {
  assert.deepEqual(P.rankPriorities({}, TODAY), []);
  assert.deepEqual(P.rankPriorities({ receivables_summary: { ok: false } }, TODAY), []);
});

test('score scales', () => {
  assert.deepEqual([0, 50, 100, 1000, 5000, 10000, 50000].map(P.moneyScore), [0, 5, 10, 18, 26, 32, 40]);
  assert.deepEqual([0, 1, 3, 7, 14, 30].map(P.overdueScore), [0, 6, 12, 18, 24, 30]);
});
