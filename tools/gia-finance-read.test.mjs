// GIA P3 step 2 — read-only Finance Center endpoints: /api/finance/{bank-balances,
// payables-due,pending-vouchers,reconciliation-status}.
// Run from the repo root:  node --test tools/gia-finance-read.test.mjs
// Auth + Supabase stubbed; no network, no data written.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { rolldown } from 'rolldown';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NAMES = ['bank-balances', 'payables-due', 'pending-vouchers', 'reconciliation-status', 'profitability'];

const ACCOUNTS = [
  { id: 'a1', account_name: 'ENBD Corporate', account_type: 'Corporate', bank_name: 'ENBD', currency: 'AED', opening_balance: 1000, is_active: true, iban: 'AE00SECRET' },
  { id: 'a2', account_name: 'Cash Box', account_type: 'Cash', currency: 'AED', opening_balance: 50, is_active: true },
];
const TXNS = [
  { id: 't1', date: '2026-11-01', type: 'in', amount: 500, bank_account_id: 'a1', payment_method: 'BANK_TRANSFER' },
  { id: 't2', date: '2026-11-02', type: 'out', amount: 200.5, bank_account_id: 'a1', payment_method: 'BANK_TRANSFER' },
  { id: 't3', date: '2026-11-03', type: 'in', amount: 999, bank_account_id: 'a1', payment_method: 'CHEQUE', cheque_status: 'PENDING' },   // not counted
  { id: 't4', date: '2026-11-04', type: 'in', amount: 300, bank_account_id: 'a1', payment_method: 'CHEQUE', cheque_status: 'CLEARED' },   // counted
  { id: 't5', date: '2026-11-05', type: 'out', amount: 20, bank_account_id: 'a2', payment_method: 'CASH' },
  { id: 't6', date: '2026-11-06', type: 'out', amount: 75, payment_method: 'CHEQUE', cheque_status: 'PENDING' },                            // outgoing pending
];
const PAYABLES = [
  { supplier_name: 'Alpha Paper', reference_no: 'AP-1', amount: 1000, paid_amount: 400, outstanding_amount: 600, due_date: '2026-11-10', status: 'PARTIAL' },  // overdue
  { supplier_name: 'Beta Logistics', invoice_no: 'INV-9', amount: 300, paid_amount: 0, outstanding_amount: 300, due_date: '2026-11-20', status: 'UNPAID' },  // due in 3 days
  { supplier_name: 'Gamma', amount: 200, paid_amount: 0, outstanding_amount: 200, due_date: '2026-12-31', status: 'UNPAID' },                              // later
  { supplier_name: 'Delta', amount: 90, paid_amount: 0, outstanding_amount: 90, due_date: null, status: 'UNPAID' },                                      // no due date
  { supplier_name: 'Paid Co', amount: 50, paid_amount: 50, outstanding_amount: 0, due_date: '2026-11-01', status: 'PAID' },
  { supplier_name: 'Void Co', amount: 70, paid_amount: 0, outstanding_amount: 70, due_date: '2026-11-01', status: 'CANCELLED' },
];
const SUPPLIER_CHEQUES = [{ supplier_name: 'Alpha Paper', amount: 100, cheque_amount: 100, cheque_date: '2026-11-25', cheque_number: '0001', cheque_bank: 'ENBD' }];
const VOUCHERS = [
  { status: 'pending', payment_context: 'CASH', ai_date: '2026-11-02', ai_amount: 120.5, ai_counterparty: 'Shop A', ai_description: 'taxi', created_at: '2026-11-03T10:00:00Z', storage_path: 'SECRET/path.pdf' },
  { status: 'pending', payment_context: 'BANK_TRANSFER', ai_date: '2026-11-01', ai_amount: 80, ai_counterparty: 'Shop B', created_at: '2026-11-02T10:00:00Z' },
  { status: 'confirmed', ai_amount: 999, created_at: '2026-10-01T00:00:00Z' },
];
const IMPORTS = [
  { id: 'i1', bank_account_id: 'a1', file_name: 'nov.pdf', status: 'reviewing', created_at: '2026-11-15T00:00:00Z' },
  { id: 'i0', bank_account_id: 'a1', file_name: 'oct.pdf', status: 'completed', created_at: '2026-10-31T00:00:00Z' },
];
const LINES = [
  { import_id: 'i1', bank_account_id: 'a1', status: 'pending', amount: 40, direction: 'in' },
  { import_id: 'i1', bank_account_id: 'a1', status: 'pending', amount: 10, direction: 'out' },
  { import_id: 'i1', bank_account_id: 'a1', status: 'confirmed', amount: 5, direction: 'out' },
  { import_id: 'i0', bank_account_id: 'a1', status: 'matched', amount: 7, direction: 'in' },
  { import_id: 'i0', bank_account_id: 'a1', status: 'ignored', amount: 1, direction: 'out' },
];

const mods = {};
const seen = [];

before(async () => {
  process.env.SUPABASE_URL = 'https://stub.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'anon-stub';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gci-fin-read-'));
  for (const name of NAMES) {
    const b = await rolldown({
      input: path.join(ROOT, `api/finance/${name}.ts`),
      platform: 'node',
      plugins: [{
        name: 'stub-auth',
        resolveId(id) { return id === '../_lib/auth' ? '\0auth' : null; },
        load(id) {
          if (id !== '\0auth') return null;
          return `export async function requireModule(req, mods) {
            globalThis.__mods = mods;
            const a = req.headers.get('authorization');
            if (!a) return { ok: false, response: new Response('{}', { status: 401 }) };
            if (a === 'Bearer nofinance') return { ok: false, response: new Response('{}', { status: 403 }) };
            return { ok: true, ctx: { token: 'user-token' } };
          }
          export function userRestHeaders(ctx) { return { apikey: 'anon-stub', Authorization: 'Bearer ' + ctx.token }; }
          export function legacyTradeAnonHeaders() { return { apikey: 'anon-stub', Authorization: 'Bearer anon-stub' }; }`;
        },
      }],
    });
    const out = path.join(dir, `${name}.mjs`);
    await b.write({ file: out, format: 'esm' });
    mods[name] = await import(pathToFileURL(out).href);
  }
  const TABLES = {
    bank_accounts: ACCOUNTS, supplier_payables: PAYABLES, supplier_payments: SUPPLIER_CHEQUES,
    finance_vouchers: VOUCHERS, bank_statement_imports: IMPORTS, bank_statement_lines: LINES,
    crm_projects: [], crm_customers: [],
  };
  globalThis.fetch = async (url, init = {}) => {
    const u = decodeURIComponent(String(url));
    seen.push({ u, method: init.method || 'GET', auth: init.headers?.Authorization });
    const table = u.match(/\/rest\/v1\/([a-z_]+)\?/)[1];
    if (table === 'transactions') return new Response(JSON.stringify(TXNS.map((payload) => ({ payload }))), { status: 200 });
    if (table === 'orders') return new Response(JSON.stringify([]), { status: 200 });
    return new Response(JSON.stringify(TABLES[table] || []), { status: 200 });
  };
});

const call = async (name, qs = '', token = 'u') => {
  seen.length = 0;
  const headers = token ? { authorization: `Bearer ${token}` } : {};
  const res = await mods[name].default(new Request(`https://x/api/finance/${name}?${qs}`, { headers }));
  return { status: res.status, body: res.status === 200 ? await res.json() : null };
};

test('auth: no session → 401, no finance module → 403, nothing read; requires finance only', async () => {
  for (const name of NAMES) {
    assert.equal((await call(name, '', null)).status, 401, name);
    assert.equal(seen.length, 0, name);
    assert.equal((await call(name, '', 'nofinance')).status, 403, name);
    assert.equal(seen.length, 0, name);
    assert.deepEqual(globalThis.__mods, ['finance']);
  }
});

test('read-only: GET only; RLS tables read with the caller token, transactions with the legacy anon read; POST → 405', async () => {
  for (const name of NAMES) {
    await call(name);
    assert.ok(seen.length > 0 && seen.every((s) => s.method === 'GET'), name);
    for (const s of seen) {
      if (/\/rest\/v1\/(transactions|orders)\?/.test(s.u)) assert.equal(s.auth, 'Bearer anon-stub', name);
      else assert.equal(s.auth, 'Bearer user-token', `${name}: ${s.u}`);
    }
    const res = await mods[name].default(new Request(`https://x/api/finance/${name}`, { method: 'POST', headers: { authorization: 'Bearer u' } }));
    assert.equal(res.status, 405, name);
  }
  for (const f of ['_read', ...NAMES]) {
    const src = fs.readFileSync(path.join(ROOT, `api/finance/${f}.ts`), 'utf8');
    assert.doesNotMatch(src, /service_role|SERVICE_ROLE|storage\.from|createSignedUrl|\.download\(/, f);
    assert.doesNotMatch(src, /method:\s*'(POST|PATCH|PUT|DELETE)'/, f);
  }
});

test('bank_balances: opening + Σin − Σout, uncleared cheques excluded; bank vs cash totals; no IBAN / account number', async () => {
  const b = (await call('bank-balances')).body;
  assert.equal(b.accountCount, 2);
  const enbd = b.accounts.find((a) => a.accountName === 'ENBD Corporate');
  assert.equal(enbd.balance, 1599.5);           // 1000 + 500 − 200.5 + 300 (cleared); 999 pending cheque not counted
  assert.equal(enbd.lastTransactionDate, '2026-11-04');
  assert.equal(b.accounts.find((a) => a.type === 'Cash').balance, 30);
  assert.deepEqual(b.totalsByCurrency, [{
    currency: 'AED', companyBank: { accounts: 1, balance: 1599.5 }, companyCash: { accounts: 1, balance: 30 }, companyTotal: 1629.5, personal: null,
  }]);
  assert.equal(b.bankTotal, undefined); // no cross-currency single total any more
  assert.deepEqual(b.pendingCheques.incoming, { count: 1, amount: 999 });
  assert.deepEqual(b.pendingCheques.outgoing, { count: 1, amount: 75 });
  assert.doesNotMatch(JSON.stringify(b), /SECRET|iban|account_number|swift/i);
  assert.ok(seen.find((s) => s.u.includes('/bank_accounts?')).u.includes('is_active=eq.true'));
});

test('bank_balances multi-currency: totals per currency, never added across currencies or converted; personal accounts separate', () => {
  const { buildBankBalances } = mods['bank-balances'];
  const accounts = [
    { id: 'c1', account_name: 'WIO AED', account_type: 'Corporate', currency: 'AED', opening_balance: 3.85 },
    { id: 'c2', account_name: 'WIO USD', account_type: 'Corporate', currency: 'USD', opening_balance: 100 },
    { id: 'p1', account_name: 'WIO Personal AED', account_type: 'Personal', currency: 'AED', opening_balance: 500 },
    { id: 'k1', account_name: 'Cash', account_type: 'Cash', currency: 'AED', opening_balance: 20 },
    { id: 'o1', account_name: 'Other EUR', account_type: 'Other', currency: 'eur', opening_balance: 7 },
  ];
  const b = buildBankBalances(accounts, []);
  assert.deepEqual(b.totalsByCurrency, [
    { currency: 'AED', companyBank: { accounts: 1, balance: 3.85 }, companyCash: { accounts: 1, balance: 20 }, companyTotal: 23.85, personal: { accounts: 1, balance: 500 } },
    { currency: 'EUR', companyBank: { accounts: 1, balance: 7 }, companyCash: null, companyTotal: 7, personal: null },
    { currency: 'USD', companyBank: { accounts: 1, balance: 100 }, companyCash: null, companyTotal: 100, personal: null },
  ]);
  const personal = b.accounts.find((a) => a.accountName === 'WIO Personal AED');
  assert.deepEqual([personal.scope, personal.scopeZh, personal.balance, personal.currency], ['personal', '个人账户（非公司资金）', 500, 'AED']);
  assert.deepEqual(b.accounts.map((a) => [a.accountName, a.currency, a.balance]),
    [['WIO AED', 'AED', 3.85], ['WIO USD', 'USD', 100], ['WIO Personal AED', 'AED', 500], ['Cash', 'AED', 20], ['Other EUR', 'EUR', 7]]);
  assert.doesNotMatch(JSON.stringify(b), /bankTotal|cashTotal|exchange|fx|"rate"/i);
});

test('payables_due: open = not PAID/CANCELLED; overdue / due in 7 days (Dubai date); pending supplier cheques; supplier filter', async () => {
  const { buildPayablesDue } = mods['payables-due'];
  const b = buildPayablesDue(PAYABLES, SUPPLIER_CHEQUES, '2026-11-17');
  assert.deepEqual([b.openCount, b.totalOutstanding], [4, 1190]);
  assert.deepEqual(b.overdue, { count: 1, amount: 600 });
  assert.deepEqual(b.dueIn7Days, { count: 1, amount: 300 });
  assert.deepEqual(b.payables.map((p) => [p.supplier, p.daysUntilDue]), [['Alpha Paper', -7], ['Beta Logistics', 3], ['Gamma', 44], ['Delta', null]]);
  assert.deepEqual([b.pendingSupplierCheques.count, b.pendingSupplierCheques.amount], [1, 100]);
  const f = buildPayablesDue(PAYABLES, SUPPLIER_CHEQUES, '2026-11-17', 'beta');
  assert.deepEqual([f.openCount, f.totalOutstanding, f.pendingSupplierCheques.count], [1, 300, 0]);
  assert.equal((await call('payables-due')).body.openCount, 4);
});

test('pending_vouchers: status pending only, oldest first, AI amount summed; file path never returned or selected', async () => {
  const b = (await call('pending-vouchers')).body;
  assert.deepEqual([b.pendingCount, b.pendingAmount, b.confirmedCount, b.oldestPendingUploadedAt], [2, 200.5, 1, '2026-11-02']);
  assert.deepEqual(b.vouchers.map((v) => v.counterparty), ['Shop B', 'Shop A']);
  assert.doesNotMatch(JSON.stringify(b), /SECRET|storage_path/);
  assert.doesNotMatch(seen[0].u, /storage_path|select=\*/);
});

test('bank_reconciliation_status: line status counts, processed %, pending amounts, per account; statement files never selected', async () => {
  const b = (await call('reconciliation-status')).body;
  assert.deepEqual([b.importCount, b.importsReviewing, b.importsCompleted], [2, 1, 1]);
  assert.deepEqual(b.lines, { total: 5, pending: 2, confirmed: 1, matched: 1, ignored: 1, processedPct: 60 });
  assert.deepEqual(b.pendingAmount, { in: 40, out: 10 });
  assert.equal(b.byAccount.length, 1);
  assert.deepEqual([b.byAccount[0].accountName, b.byAccount[0].lastImportAt, b.byAccount[0].lastImportFile], ['ENBD Corporate', '2026-11-15', 'nov.pdf']);
  for (const s of seen) assert.doesNotMatch(s.u, /storage_path|select=\*/);
});

// ── P3 step 3: 项目与客户利润 — same calculation as FinanceProfitability.tsx ──
const P_TXNS = [
  // Project A: revenue 1000 (order payment) + linked cost 400 (manual expense with project_id)
  { id: 'r1', date: '2026-11-03', type: 'in', amount: 1000, ref_type: 'ORDER_PAYMENT', project_id: 'pA', customer_id: 'cX', payment_method: 'BANK_TRANSFER' },
  { id: 'c1', date: '2026-11-04', type: 'out', amount: 400, category: 'OTHER_EXPENSE', project_id: 'pA', payment_method: 'BANK_TRANSFER' },
  // Project B: revenue 500, NO cost linked → must not be called profit
  { id: 'r2', date: '2026-11-05', type: 'in', amount: 500, ref_type: 'ORDER_PAYMENT', project_id: 'pB', customer_id: 'cY', payment_method: 'CASH' },
  // Unlinked (legacy): sales 300, supplier payment 120
  { id: 'r3', date: '2026-10-20', type: 'in', amount: 300, ref_type: 'ORDER_PAYMENT', customer: 'Walk-in', payment_method: 'CASH' },
  { id: 'c2', date: '2026-11-06', type: 'out', amount: 120, ref_type: 'SUPPLIER_PAYMENT', payment_method: 'BANK_TRANSFER' },
  // Pending cheque on project A — not counted (page rule)
  { id: 'r4', date: '2026-11-07', type: 'in', amount: 9999, ref_type: 'ORDER_PAYMENT', project_id: 'pA', customer_id: 'cX', payment_method: 'CHEQUE', cheque_status: 'PENDING' },
  // Internal transfer — not operating, never revenue
  { id: 'x1', date: '2026-11-08', type: 'in', amount: 777, category: 'INTERNAL_TRANSFER', project_id: 'pA', payment_method: 'BANK_TRANSFER' },
];
const P_ORDERS = [
  { crmProjectId: 'pA', crmCustomerId: 'cX', status: 'PARTIAL', outstandingAmount: 250 },
  { crmProjectId: 'pB', crmCustomerId: 'cY', status: 'VOIDED', outstandingAmount: 80 },   // not AR
];
const P_PROJECTS = [{ id: 'pA', project_name: 'Hotel FF&E', customer_id: 'cX' }, { id: 'pB', project_name: 'Office Fit-out', customer_id: 'cY' }];
const P_CUSTOMERS = [{ id: 'cX', customer_name: 'Alpha Hotels' }, { id: 'cY', customer_name: 'Beta Offices' }];
const NOW = new Date('2026-11-17T08:00:00Z');

test('profitability: project revenue / cost / profit / margin exactly as the page (operating only, cleared only, unlinked separate)', () => {
  const { buildProfitability } = mods['profitability'];
  const b = buildProfitability(P_TXNS, P_ORDERS, P_PROJECTS, P_CUSTOMERS, { period: 'all', now: NOW });
  const a = b.projects.find((p) => p.projectName === 'Hotel FF&E');
  assert.deepEqual([a.revenue, a.directCost, a.grossProfit, a.grossMargin, a.collected, a.outstanding, a.customerName],
    [1000, 400, 600, 60, 1000, 250, 'Alpha Hotels']);
  assert.deepEqual(b.projectTotals.revenue, 1500);
  assert.deepEqual([b.projectTotals.directCost, b.projectTotals.grossProfit, b.projectTotals.grossMargin], [400, 1100, 73.3333]); // page: roundTo2(gp/rev*10000)/100, shown as 73.3%
  assert.deepEqual(b.unlinked && [b.unlinked.revenue, b.unlinked.cost, b.unlinked.net], [300, 120, 180]);
});

test('profitability: missing cost is flagged, never treated as profit; linked cost marked possibly incomplete', () => {
  const { buildProfitability } = mods['profitability'];
  const b = buildProfitability(P_TXNS, P_ORDERS, P_PROJECTS, P_CUSTOMERS, { period: 'all', now: NOW });
  const pB = b.projects.find((p) => p.projectName === 'Office Fit-out');
  assert.deepEqual([pB.costStatus, pB.costRecorded, pB.outstanding], ['missing', false, 0]);
  assert.match(pB.profitNote, /不能视为盈利/);
  const pA = b.projects.find((p) => p.projectName === 'Hotel FF&E');
  assert.deepEqual([pA.costStatus, pA.costRecorded], ['linked_only', true]);
  assert.match(pA.profitNote, /可能不完整/);
  assert.deepEqual([b.projectTotals.projectsMissingCost, b.projectTotals.allCostsRecorded], [1, false]);
  assert.match(b.projectTotals.warning, /不能视为实际盈利/);
});

test('profitability: customers — revenue / AR from the page; no customer-level cost; profit only via projects', () => {
  const { buildProfitability } = mods['profitability'];
  const b = buildProfitability(P_TXNS, P_ORDERS, P_PROJECTS, P_CUSTOMERS, { period: 'all', customer: 'alpha', now: NOW });
  assert.equal(b.customers.length, 1);
  const c = b.customers[0];
  assert.deepEqual([c.customerName, c.revenue, c.currentAR, c.cost], ['Alpha Hotels', 1000, 250, null]);
  assert.deepEqual(c.viaProjects, { projectCount: 1, revenue: 1000, directCost: 400, grossProfit: 600, grossMargin: 60, allCostsRecorded: true });
  assert.deepEqual(b.projects.map((p) => p.projectName), ['Hotel FF&E']);   // customer filter applies to projects too
  const beta = buildProfitability(P_TXNS, P_ORDERS, P_PROJECTS, P_CUSTOMERS, { customer: 'Beta', now: NOW }).customers[0];
  assert.equal(beta.viaProjects.allCostsRecorded, false);
});

test('profitability: periods like the page (this_month / last_month / YYYY-MM / all, UTC month)', () => {
  const { buildProfitability, periodMonth } = mods['profitability'];
  assert.deepEqual(periodMonth('this_month', NOW), { key: 'this_month', month: '2026-11' });
  assert.deepEqual(periodMonth('last_month', NOW), { key: 'last_month', month: '2026-10' });
  assert.deepEqual(periodMonth('2026-09', NOW), { key: '2026-09', month: '2026-09' });
  assert.deepEqual(periodMonth('', NOW), { key: 'all_time', month: null });
  const oct = buildProfitability(P_TXNS, P_ORDERS, P_PROJECTS, P_CUSTOMERS, { period: 'last_month', now: NOW });
  assert.deepEqual([oct.projects.length, oct.unlinked.revenue, oct.unlinked.cost], [0, 300, 0]);
  const empty = buildProfitability([], [], [], [], { now: NOW });
  assert.deepEqual([empty.projectTotals.revenue, empty.projectTotals.grossMargin, empty.projectTotals.warning, empty.unlinked], [0, null, null, null]);
});

test('profitability: a named customer / project with no data → explicit 无数据, no company totals or unlinked block to misread as 0 profit', () => {
  const { buildProfitability } = mods['profitability'];
  const b = buildProfitability(P_TXNS, P_ORDERS, P_PROJECTS, P_CUSTOMERS, { customer: 'Easy4me', now: NOW });
  assert.deepEqual([b.projects.length, b.customers.length, b.projectTotals, b.unlinked], [0, 0, null, null]);
  assert.match(b.selection.message, /Easy4me.*无数据，不是 0 利润/);
  const hit = buildProfitability(P_TXNS, P_ORDERS, P_PROJECTS, P_CUSTOMERS, { project: 'hotel', now: NOW });
  assert.deepEqual([hit.selection.matchedProjects, hit.selection.message, hit.projectTotals], [1, null, null]);
  const none = buildProfitability(P_TXNS, P_ORDERS, P_PROJECTS, P_CUSTOMERS, { now: NOW });
  assert.equal(none.selection, null);
  assert.equal(none.projectTotals.revenue, 1500);
});

test('profitability reuses the page classifier (imported, not copied)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'api/finance/profitability.ts'), 'utf8');
  assert.match(src, /from '\.\.\/\.\.\/modules\/trade\/services\/transactionCategories'/);
  assert.doesNotMatch(src, /function classifyTransaction/);
});
