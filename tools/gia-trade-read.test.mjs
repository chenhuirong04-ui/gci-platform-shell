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

test('read-only: GET only, active rows only, legacy anon read like sales-summary; POST → 405', async () => {
  await call('payment-list', 'customer=BINGO');
  assert.ok(seen.length > 0 && seen.every((s) => s.method === 'GET' && s.u.includes('state=eq.active')));
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

test('order_lookup: totals exclude VOIDED, voided still listed; UNPAID filter; items for ≤3 orders', async () => {
  const b = (await call('order-lookup', 'customer=BINGOMART')).body;
  assert.equal(b.matchedCount, 2);
  assert.equal(b.voidedCount, 1);
  assert.deepEqual(b.totals, { grandTotal: 105, paid: 50, outstanding: 55, currency: 'AED', note: 'totals exclude VOIDED orders' });
  assert.equal(b.orders.find((o) => o.orderNo === 'SO-002').items[0].lineTotal, 105);
  const unpaid = (await call('order-lookup', 'status=unpaid')).body;
  assert.deepEqual(unpaid.orders.map((o) => o.orderNo), ['SO-002']);
  assert.equal((await call('order-lookup', 'order=so-001')).body.orders[0].statusZh, '已付清');
});

test('payment_list: joined to orders for the customer; customer + period filters; totals', async () => {
  const b = (await call('payment-list', 'customer=bingomart')).body;
  assert.equal(b.matchedCount, 1);
  assert.equal(b.totalAmount, 50);
  assert.deepEqual(b.payments[0], { date: '2026-11-11', amount: 50, method: 'BANK', methodZh: '银行转账', orderNo: 'SO-002', customerName: 'BINGOMART 1+1', orderStatus: 'PARTIAL', note: 'part' });
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
  assert.equal(periodRange('all', now), null);
});
