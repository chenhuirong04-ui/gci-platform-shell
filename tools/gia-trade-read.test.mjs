// GIA P3 step 1 — read-only Trade endpoints: /api/trade/{pi-lookup,order-lookup,payment-list}.
// Run from the repo root:  node --test tools/gia-trade-read.test.mjs
// Auth + Supabase stubbed; no network, no data written.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { rolldown } from 'rolldown';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const QUOTES = [
  { id: 'PI-002', quoteRef: 'REF-B', createdAt: '2026-11-10T08:00:00Z', customerName: 'BINGOMART 1+1', subtotal: 100, vat: 5, grandTotal: 105, status: 'CONVERTED', convertedOrderId: 'SO-002', costAmount: 60, marginRate: 0.4, profitAmount: 40 },
  { id: 'PI-001', createdAt: '2026-10-01T08:00:00Z', customerName: 'Hong gourmet hypermarket L.L.C', subtotal: 200, vat: 10, grandTotal: 210, status: 'QUOTED', costAmount: 150 },
];
const QUOTE_ITEMS = [
  { quoteId: 'PI-002', desc: 'Diaper M', qty: 2, price: 50, lineTotal: 100 },
  { quoteId: 'PI-001', desc: 'Diaper L', qty: 4, price: 50, lineTotal: 200 },
];
const ORDERS = [
  { id: 'SO-003', createdAt: '2026-11-12T08:00:00Z', customerName: 'BINGOMART 1+1', grandTotal: 500, paidAmount: 0, outstandingAmount: 500, status: 'VOIDED' },
  { id: 'SO-002', quoteId: 'PI-002', createdAt: '2026-11-10T09:00:00Z', customerName: 'BINGOMART 1+1', grandTotal: 105, paidAmount: 50, outstandingAmount: 55, status: 'PARTIAL' },
  { id: 'SO-001', createdAt: '2026-10-02T09:00:00Z', customerName: 'Hong gourmet hypermarket L.L.C', grandTotal: 210, paidAmount: 210, outstandingAmount: 0, status: 'PAID' },
];
const ORDER_ITEMS = [{ orderId: 'SO-002', desc: 'Diaper M', qty: 2, price: 52.5, lineTotal: 105 }];
const PAYMENTS = [
  { id: 'p1', orderId: 'SO-002', date: '2026-11-11', amount: 50, method: 'BANK', note: 'part' },
  { id: 'p2', orderId: 'SO-001', date: '2026-10-05', amount: 210, method: 'CASH' },
  { id: 'p3', orderId: 'SO-003', date: '2026-11-12', amount: 30, method: 'CASH' },   // on a voided order
];
const TABLES = { quotes: QUOTES, quote_items: QUOTE_ITEMS, orders: ORDERS, order_items: ORDER_ITEMS, payments: PAYMENTS };

const mods = {};
const seen = [];

before(async () => {
  process.env.SUPABASE_URL = 'https://stub.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'anon-stub';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gci-trade-read-'));
  for (const name of ['pi-lookup', 'order-lookup', 'payment-list']) {
    const b = await rolldown({
      input: path.join(ROOT, `api/trade/${name}.ts`),
      platform: 'node',
      plugins: [{
        name: 'stub-auth',
        resolveId(id) { return id === '../_lib/auth' ? '\0auth' : null; },
        load(id) {
          if (id !== '\0auth') return null;
          return `export async function requireModule(req, mods) {
            globalThis.__mods = mods;
            if (!req.headers.get('authorization')) return { ok: false, response: new Response('{}', { status: 401 }) };
            return { ok: true, ctx: {} };
          }
          export function legacyTradeAnonHeaders() { return { apikey: 'anon-stub', Authorization: 'Bearer anon-stub' }; }`;
        },
      }],
    });
    const out = path.join(dir, `${name}.mjs`);
    await b.write({ file: out, format: 'esm' });
    mods[name] = await import(pathToFileURL(out).href);
  }
  globalThis.fetch = async (url, init = {}) => {
    const u = decodeURIComponent(String(url));
    seen.push({ u, method: init.method || 'GET' });
    const table = u.match(/\/rest\/v1\/([a-z_]+)\?/)[1];
    let rows = TABLES[table];
    const inF = u.match(/payload->>(\w+)=in\.\(([^)]*)\)/);
    if (inF) { const vals = inF[2].split(',').map((v) => v.replace(/"/g, '')); rows = rows.filter((r) => vals.includes(r[inF[1]])); }
    return new Response(JSON.stringify(rows.map((payload) => ({ payload }))), { status: 200 });
  };
});

const call = async (name, qs = '', auth = true) => {
  seen.length = 0;
  const res = await mods[name].default(new Request(`https://x/api/trade/${name}?${qs}`, { headers: auth ? { authorization: 'Bearer u' } : {} }));
  return { status: res.status, body: res.status === 200 ? await res.json() : null };
};

test('no session → 401 and nothing read; same module list as sales-summary', async () => {
  for (const name of ['pi-lookup', 'order-lookup', 'payment-list']) {
    const r = await call(name, '', false);
    assert.equal(r.status, 401, name);
    assert.equal(seen.length, 0, name);
    assert.deepEqual(globalThis.__mods, ['trade', 'finance', 'crm']);
  }
});

test('read-only: GET only, newest-first read like the Trade app, legacy anon read like sales-summary; POST → 405', async () => {
  await call('payment-list', 'customer=BINGO');
  assert.ok(seen.length > 0 && seen.every((s) => s.method === 'GET' && s.u.includes('order=updated_at.desc')));
  const res = await mods['pi-lookup'].default(new Request('https://x/api/trade/pi-lookup', { method: 'POST', headers: { authorization: 'Bearer u' } }));
  assert.equal(res.status, 405);
  for (const name of ['pi-lookup', 'order-lookup', 'payment-list', '_read']) {
    const src = fs.readFileSync(path.join(ROOT, `api/trade/${name}.ts`), 'utf8');
    assert.doesNotMatch(src, /service[_-]?role|method:\s*'(POST|PATCH|PUT|DELETE)'|\.insert|\.upsert|\.update\(|\.delete\(/i, name);
  }
});

test('pi_lookup: customer filter, items when ≤3 match, never returns cost / margin / profit', async () => {
  const { body } = await call('pi-lookup', 'customer=bingomart');
  assert.equal(body.matchedCount, 1);
  assert.equal(body.totalGrandTotal, 105);
  const pi = body.pis[0];
  assert.equal(pi.piNo, 'PI-002');
  assert.equal(pi.statusZh, '已转订单');
  assert.equal(pi.convertedOrderId, 'SO-002');
  assert.deepEqual(pi.items, [{ desc: 'Diaper M', qty: 2, unitPrice: 50, lineTotal: 100 }]);
  assert.doesNotMatch(JSON.stringify(body), /cost|margin|profit/i);
});

test('pi_lookup: PI number match is case/spacing-insensitive; no filter → all, newest first', async () => {
  assert.equal((await call('pi-lookup', 'pi=pi 001')).body.pis[0].piNo, 'PI-001');
  const all = (await call('pi-lookup')).body;
  assert.equal(all.matchedCount, 2);
  assert.equal(all.totalGrandTotal, 315);
});

test('order_lookup: totals = 有效订单 only, voided listed + reported separately; UNPAID filter; items for ≤3 orders', async () => {
  const b = (await call('order-lookup', 'customer=BINGOMART')).body;
  assert.equal(b.matchedCount, 2);
  assert.equal(b.voidedCount, 1);
  assert.deepEqual(b.totals, { grandTotal: 105, paid: 50, outstanding: 55, currency: 'AED', note: '有效订单口径：不含已作废、寄售、调整单（与经营看板一致）' });
  assert.deepEqual([b.voided.orderIds, b.voided.paymentCount, b.voided.paymentAmount], [['SO-003'], 1, 30]);
  assert.deepEqual(b.orders.map((o) => o.counted), [false, true]);
  assert.equal(b.orders.find((o) => o.orderNo === 'SO-002').items[0].lineTotal, 105);
  const unpaid = (await call('order-lookup', 'status=unpaid')).body;
  assert.deepEqual(unpaid.orders.map((o) => o.orderNo), ['SO-002']);
  assert.equal((await call('order-lookup', 'order=so-001')).body.orders[0].statusZh, '已付清');
});

test('payment_list: joined to orders for the customer; customer + period filters; totals', async () => {
  const b = (await call('payment-list', 'customer=bingomart')).body;
  assert.equal(b.matchedCount, 2);
  assert.equal(b.totalAmount, 50);                       // voided-order payment not counted
  assert.deepEqual(b.excluded, { count: 1, amount: 30, note: '已作废 / 寄售 / 调整单或找不到订单的收款，不计入有效已收款' });
  assert.deepEqual([b.voided.orderIds, b.voided.paymentAmount], [['SO-003'], 30]);
  assert.equal(b.payments[0].counted, false);
  assert.deepEqual(b.payments[1], { date: '2026-11-11', amount: 50, method: 'BANK', methodZh: '银行转账', orderNo: 'SO-002', customerName: 'BINGOMART 1+1', orderStatus: 'PARTIAL', counted: true, note: 'part' });
  const oct = (await call('payment-list', 'period=2026-10')).body;
  assert.deepEqual(oct.payments.map((p) => p.orderNo), ['SO-001']);
  assert.equal((await call('payment-list')).body.totalAmount, 260);
});

test('payment_list periodRange: month / YYYY-MM / all (Dubai time)', () => {
  const { periodRange } = mods['payment-list'];
  const now = new Date('2026-11-17T21:30:00Z'); // 2026-11-18 01:30 Dubai
  assert.deepEqual(periodRange('2026-10', now), { from: '2026-10-01', to: '2026-11-01' });
  assert.deepEqual(periodRange('2026-12', now), { from: '2026-12-01', to: '2027-01-01' });
  assert.deepEqual(periodRange('month', now), { from: '2026-11-01', to: '2026-11-19' });
  assert.deepEqual(periodRange('today', now), { from: '2026-11-18', to: '2026-11-19' });
  assert.deepEqual(periodRange('2026', now), { from: '2026-01-01', to: '2027-01-01' });
  assert.equal(periodRange('all', now), null);
});

test('duplicate physical rows: newest row per business id wins (same as the Trade app), then active only', async () => {
  const b = await rolldown({
    input: path.join(ROOT, 'api/trade/_read.ts'),
    platform: 'node',
    plugins: [{ name: 'stub-auth', resolveId: (id) => (id === '../_lib/auth' ? '\0a' : null), load: (id) => (id === '\0a' ? 'export function legacyTradeAnonHeaders(){return {}}' : null) }],
  });
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gci-cr-')), 'read.mjs');
  await b.write({ file: out, format: 'esm' });
  const { currentRows } = await import(pathToFileURL(out).href);
  // Rows arrive updated_at DESC, like the app's cloudDb.exportAll.
  const rows = [
    { id: 'r3', state: 'active', payload: { id: 'SO-1', status: 'PAID', outstandingAmount: 0 } },      // newest
    { id: 'r2', state: 'active', payload: { id: 'SO-1', status: 'PENDING', outstandingAmount: 814.8 } },
    { id: 'r1', state: 'active', payload: { id: 'SO-1', status: 'VOIDED', outstandingAmount: 0 } },
    { id: 'r5', state: 'cancelled', payload: { id: 'SO-2', status: 'PENDING' } },                     // newest is cancelled → hidden
    { id: 'r4', state: 'active', payload: { id: 'SO-2', status: 'PENDING' } },                        // older active row is NOT resurrected
    { id: 'r6', state: null, payload: { id: 'SO-3', status: 'PAID' } },                               // missing state = active
  ];
  assert.deepEqual(currentRows(rows).map((p) => `${p.id}:${p.status}`), ['SO-1:PAID', 'SO-3:PAID']);
});

// ── Older AI endpoints that read `orders` themselves: same newest-row rule ──
const DUP_ORDER_ROWS = [ // updated_at DESC, as requested with order=updated_at.desc
  { id: 'r3', created_at: '2026-07-07T02:40:00Z', state: 'active', payload: { id: 'SO-20260707-3525', customerName: 'BINGOMART 1+1', grandTotal: 814.8, paidAmount: 814.8, outstandingAmount: 0, status: 'VOIDED', createdAt: '2026-07-07T02:40:00Z', dueDate: '2026/07/07' } },
  { id: 'r2', created_at: '2026-07-07T02:40:00Z', state: 'active', payload: { id: 'SO-20260707-3525', customerName: 'BINGOMART 1+1', grandTotal: 814.8, paidAmount: 0, outstandingAmount: 814.8, status: 'PENDING', createdAt: '2026-07-07T02:40:00Z', dueDate: '2026/07/07' } },
  { id: 'r1', created_at: '2026-05-21T02:40:00Z', state: 'active', payload: { id: 'SO-20260521-3787', customerName: 'Easy4me FZ LLE', grandTotal: 449.22, paidAmount: 0, outstandingAmount: 449.22, status: 'PENDING', createdAt: new Date().toISOString(), dueDate: '2099/01/01' } },
];

async function buildEndpoint(rel) {
  const b = await rolldown({
    input: path.join(ROOT, rel),
    platform: 'node',
    plugins: [{
      name: 'stub-auth',
      resolveId(id) { return id === '../_lib/auth' ? '\0auth' : null; },
      load(id) {
        return id === '\0auth'
          ? `export async function requireModule(){ return { ok: true, ctx: {} }; }
             export function legacyTradeAnonHeaders(){ return { apikey: 'anon-stub', Authorization: 'Bearer anon-stub' }; }`
          : null;
      },
    }],
  });
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gci-ai-')), path.basename(rel, '.ts') + '.mjs');
  await b.write({ file: out, format: 'esm' });
  return (await import(pathToFileURL(out).href)).default;
}

function stubOrders() {
  const urls = [];
  globalThis.fetch = async (url) => {
    const u = decodeURIComponent(String(url));
    urls.push(u);
    const rows = /\/rest\/v1\/orders\?/.test(u) ? DUP_ORDER_ROWS : [];
    return new Response(JSON.stringify(rows), { status: 200 });
  };
  return urls;
}

test('receivables-summary: an order whose newest row is VOIDED is no longer counted as unpaid (stale PENDING row ignored)', async () => {
  const handler = await buildEndpoint('api/ai/receivables-summary.ts');
  const urls = stubOrders();
  const body = await (await handler(new Request('https://x/api/ai/receivables-summary', { headers: { authorization: 'Bearer u' } }))).json();
  assert.equal(body.orderReceivables.orderCount, 1);
  assert.equal(body.orderReceivables.total, 449.22);
  assert.ok(!JSON.stringify(body.orderReceivables.customers).includes('SO-20260707-3525'));
  assert.deepEqual(body.orderReceivables.voided.orderIds, ['SO-20260707-3525']); // reported separately
  const ordersUrl = urls.find((u) => u.includes('/rest/v1/orders?'));
  assert.match(ordersUrl, /order=updated_at\.desc/);
  assert.doesNotMatch(ordersUrl, /state=eq\.active/); // a state pre-filter would let older active rows stand in
});

test('sales-summary: duplicate rows count once, using the newest row', async () => {
  const handler = await buildEndpoint('api/ai/sales-summary.ts');
  stubOrders();
  const body = await (await handler(new Request('https://x/api/ai/sales-summary?period=month', { headers: { authorization: 'Bearer u' } }))).json();
  // SO-20260707-3525 newest = VOIDED (not a sale); the Easy4me order is PENDING (not a sale either) → no revenue rows
  assert.equal(body.totalGrandTotal ?? body.summary?.totalGrandTotal ?? 0, 0);
});

test('customer-360 and daily-brief read orders newest-first without a state pre-filter and apply currentOrderRows', () => {
  for (const rel of ['api/ai/customer-360.ts', 'api/ai/daily-brief.ts', 'api/ai/receivables-summary.ts', 'api/ai/sales-summary.ts']) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.match(src, /import \{ currentOrderRows[^}]*\} from '\.\.\/trade\/_read'/, rel);
    assert.doesNotMatch(src, /orders\?select=[^'`]*state=eq\.active/, rel);
    assert.ok(/currentOrderRows\(/.test(src) || /\.then\(currentOrderRows\)/.test(src), rel);
  }
});

test('customer-360: voided orders are listed but not counted in order amount / outstanding', async () => {
  const handler = await buildEndpoint('api/ai/customer-360.ts');
  const rows = [
    { id: 'v1', created_at: '2026-07-07T02:15:00Z', state: 'active', payload: { id: 'SO-20260707-2203', customerName: 'BINGOMART 1+1', grandTotal: 703.5, paidAmount: 0, outstandingAmount: 703.5, status: 'VOIDED', createdAt: '2026-07-07T02:15:00Z' } },
    { id: 'p1', created_at: '2026-06-01T00:00:00Z', state: 'active', payload: { id: 'SO-X', customerName: 'BINGOMART 1+1', grandTotal: 100, paidAmount: 40, outstandingAmount: 60, status: 'PARTIAL', createdAt: '2026-06-01T00:00:00Z' } },
  ];
  globalThis.fetch = async (url) => new Response(JSON.stringify(/\/rest\/v1\/orders\?/.test(decodeURIComponent(String(url))) ? rows : []), { status: 200 });
  const body = await (await handler(new Request('https://x/api/ai/customer-360?customer=BINGOMART', { headers: { authorization: 'Bearer u' } }))).json();
  assert.equal(body.summary.orderCount, 1);
  assert.equal(body.summary.totalOrderAmt, 100);
  assert.equal(body.summary.totalOutstanding, 60);
  assert.equal(body.orders.length, 2); // still listed
});

test('有效应收 rule is identical to the 经营看板 (isRevenueOrder) and used by every receivables endpoint', async () => {
  const b = await rolldown({
    input: path.join(ROOT, 'api/trade/_read.ts'), platform: 'node',
    plugins: [{ name: 'stub-auth', resolveId: (id) => (id === '../_lib/auth' ? '\0a' : null), load: (id) => (id === '\0a' ? 'export function legacyTradeAnonHeaders(){return {}}' : null) }],
  });
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gci-eff-')), 'read.mjs');
  await b.write({ file: out, format: 'esm' });
  const { isEffectiveOrder, voidedSummary } = await import(pathToFileURL(out).href);
  const d = await rolldown({ input: path.join(ROOT, 'modules/trade/services/annualDashboard.ts'), platform: 'node' });
  const out2 = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gci-eff2-')), 'dash.mjs');
  await d.write({ file: out2, format: 'esm' });
  const { isRevenueOrder } = await import(pathToFileURL(out2).href);
  const cases = [
    { status: 'PAID' }, { status: 'PENDING' }, { status: 'PARTIAL' }, { status: 'VOIDED' },
    { status: 'CONSIGNMENT', transactionMode: 'Consignment' }, { status: 'VOIDED', transactionMode: 'Consignment' },
    { status: 'PENDING', order_type: 'ADJUSTMENT' }, { status: 'PAID', order_type: 'NORMAL', transactionMode: 'Direct Sale' },
  ];
  for (const c of cases) assert.equal(isEffectiveOrder(c), isRevenueOrder(c), JSON.stringify(c));
  assert.deepEqual(voidedSummary([{ id: 'A', status: 'VOIDED' }, { id: 'B', status: 'PAID' }], [{ orderId: 'A', amount: 10.5 }, { orderId: 'B', amount: 1 }]),
    { orderCount: 1, orderIds: ['A'], paymentCount: 1, paymentAmount: 10.5, note: '已作废订单及其收款记录单独列示，不计入有效营业额或应收' });
  for (const rel of ['api/ai/customer-360.ts', 'api/ai/daily-brief.ts', 'api/ai/receivables-summary.ts', 'api/trade/order-lookup.ts', 'api/trade/payment-list.ts']) {
    assert.match(fs.readFileSync(path.join(ROOT, rel), 'utf8'), /isEffectiveOrder\(/, rel);
  }
});

test('daily-brief: 有效应收 excludes voided / consignment / adjustment; voided reported separately', async () => {
  const handler = await buildEndpoint('api/ai/daily-brief.ts');
  const rows = [
    { id: 'a', created_at: '2026-07-07T00:00:00Z', state: 'active', payload: { id: 'SO-V', customerName: 'BINGOMART 1+1', grandTotal: 703.5, paidAmount: 0, outstandingAmount: 703.5, status: 'VOIDED', createdAt: '2026-07-07T00:00:00Z' } },
    { id: 'b', created_at: '2026-06-01T00:00:00Z', state: 'active', payload: { id: 'SO-C', customerName: 'K', grandTotal: 90, paidAmount: 0, outstandingAmount: 90, status: 'CONSIGNMENT', transactionMode: 'Consignment', createdAt: '2026-06-01T00:00:00Z' } },
    { id: 'c', created_at: '2026-06-01T00:00:00Z', state: 'active', payload: { id: 'SO-X', customerName: 'Easy', grandTotal: 100, paidAmount: 40, outstandingAmount: 60, status: 'PARTIAL', createdAt: '2026-06-01T00:00:00Z' } },
  ];
  const pays = [{ payload: { id: 'p9', orderId: 'SO-V', amount: 20, date: '2026-07-07' } }];
  globalThis.fetch = async (url) => {
    const u = decodeURIComponent(String(url));
    return new Response(JSON.stringify(/\/rest\/v1\/orders\?/.test(u) ? rows : /\/rest\/v1\/payments\?/.test(u) ? pays : []), { status: 200 });
  };
  const body = await (await handler(new Request('https://x/api/ai/daily-brief', { headers: { authorization: 'Bearer u' } }))).json();
  assert.equal(body.receivables.unpaidOrderCount, 1);
  assert.equal(body.receivables.totalOutstanding, 60);
  assert.deepEqual([body.receivables.voided.orderIds, body.receivables.voided.paymentAmount], [['SO-V'], 20]);
});
