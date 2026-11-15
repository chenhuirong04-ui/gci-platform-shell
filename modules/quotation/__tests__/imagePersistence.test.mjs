// Quotation image persistence — Supplier Quote (Task 01) + GCI customer quote history (Task 02).
// Run from the repo root:  node --test modules/quotation/__tests__/
// No extra dependencies: bundles the helper with the repo's own rolldown, fakes Storage with an in-memory map.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { rolldown } from 'rolldown';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'); // CRLF-safe on Windows checkouts
const MODULE_SRC = read('modules/quotation/QuotationModule.tsx');
const between = (s, a, b) => { const i = s.indexOf(a); assert.ok(i >= 0, 'missing: ' + a); const j = s.indexOf(b, i + a.length); return s.slice(i, j < 0 ? undefined : j); };

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PNG2 = 'data:image/png;base64,' + Buffer.from('second-distinct-png').toString('base64');
const JPG = 'data:image/jpeg;base64,' + Buffer.from('jpeg-bytes').toString('base64');
const COST_KEYS = ['supplier_cost', 'targetUnitPrice', 'targetTotal', 'originalUnitCost', 'originalTotal', 'marginPercent',
  'markupPercents', 'totalSupplierCost', 'totalProfit', 'overallMargin', 'profit', 'margin', 'markup', 'discount'];

let m; const store = new Map(); const calls = [];

before(async () => {
  // Browser globals the helper relies on.
  globalThis.FileReader = class { readAsDataURL(blob) { blob.arrayBuffer().then(b => { this.result = `data:${blob.type};base64,` + Buffer.from(b).toString('base64'); this.onload(); }); } };
  globalThis.fetch = async (url, init = {}) => {
    url = String(url); calls.push(url);
    if (url === '/api/suppliers/upload-document') {
      const body = JSON.parse(init.body);
      if (body.action === 'create-upload-url') return Response.json({ ok: true, bucket: body.documentType === '产品图片' ? 'suppliers-public' : 'suppliers-private', path: `suppliers/${body.supplierId}/1-${body.fileName}`, token: 't' });
      if (body.action === 'sign') return store.has(`${body.bucket}/${body.path}`) ? Response.json({ ok: true, url: `https://stub.supabase.co/signed/${body.bucket}/${body.path}` }) : Response.json({ ok: false }, { status: 502 });
    }
    const up = /storage\/v1\/object\/upload\/sign\/([^/]+)\/(.+)\?token=/.exec(url);
    if (up && init.method === 'PUT') { store.set(`${up[1]}/${decodeURI(up[2])}`, init.body.get('')); return new Response('{}'); }
    const dl = /\/signed\/(.+)$/.exec(url);
    if (dl) { const f = store.get(dl[1]); return f ? new Response(f, { headers: { 'content-type': f.type } }) : new Response('', { status: 404 }); }
    return new Response('unexpected ' + url, { status: 500 });
  };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gci-qimg-'));
  const stub = path.join(tmp, 'supabaseRest.stub.ts');
  fs.writeFileSync(stub, "export const SUPABASE_URL = 'https://stub.supabase.co';\nexport async function sbAuthHeaders() { return { apikey: 'anon' }; }\n");
  const bundle = await rolldown({
    input: path.join(ROOT, 'modules/quotation/lib/supplierQuoteImages.ts'), platform: 'node',
    plugins: [{ name: 'stub-supabase-rest', resolveId(id) { if (id.endsWith('lib/supabaseRest')) return stub; } }],
  });
  const out = path.join(tmp, 'bundle.mjs');
  await bundle.write({ file: out, format: 'esm' });
  m = await import(pathToFileURL(out).href);
});

// ── Storage round trip (shared by supplier quotes and customer quotes) ──
test('upload → ref → restore returns identical image (simulates re-login: only the ref survives)', async () => {
  const ref = await m.uploadSupplierQuoteImage(PNG, undefined, 'GCI-20261114-001', 0);
  assert.equal(ref.b, 'suppliers-public');
  assert.match(ref.p, /^suppliers\/unlinked-quotes\/1-GCI-20261114-001-row1\.png$/);
  const persisted = JSON.parse(JSON.stringify({ img: ref }));                 // jsonb round trip
  assert.ok(m.isValidImageRef(persisted.img));
  assert.equal(await m.loadSupplierQuoteImage(persisted.img), PNG);
});

test('every SKU restores its own image, rows without images stay empty', async () => {
  const imgs = [PNG, null, JPG, PNG2];
  const refs = await m.mapWithLimit(imgs, 4, (d, i) => d ? m.uploadSupplierQuoteImage(d, 'sup-1', 'GCI-MAP', i) : Promise.resolve(null));
  const back = await m.mapWithLimit(JSON.parse(JSON.stringify(refs)), 6, r => r ? m.loadSupplierQuoteImage(r) : Promise.resolve(null));
  assert.deepEqual(back, imgs);
});

test('legacy / malformed refs are ignored, missing objects restore as null', async () => {
  for (const bad of [undefined, null, {}, { b: '', p: 'x' }, { b: 'x' }]) assert.equal(m.isValidImageRef(bad), false);
  assert.equal(await m.loadSupplierQuoteImage({ b: 'suppliers-public', p: 'nope.png' }), null);
});

test('only the existing upload-document API and suppliers-public bucket are used', () => {
  for (const u of calls) assert.ok(u === '/api/suppliers/upload-document' || u.startsWith('https://stub.supabase.co/'), u);
  const buckets = new Set(calls.filter(u => u.includes('/upload/sign/')).map(u => /upload\/sign\/([^/]+)/.exec(u)[1]));
  assert.deepEqual([...buckets], ['suppliers-public']);
});

// ── Customer quote save/load wiring (static guards on QuotationModule.tsx) ──
test('customer quote item_meta carries image ref + product fields and no cost/profit/markup', () => {
  const meta = between(MODULE_SRC, 'item_meta: {', '},\n      };');
  for (const k of ['img:', 'en:', 'model:', 'material:', 'color:', 'size:', 'sa:', 'show:']) assert.ok(meta.includes(k), 'missing ' + k);
  for (const k of COST_KEYS) assert.ok(!new RegExp(`\\b${k}\\b`, 'i').test(meta), 'item_meta leaks ' + k);
});

test('save reuses stored refs and uploads only images without one', () => {
  const save = between(MODULE_SRC, 'const handleSaveToCloud = async', 'const handleLoadDraft = async');
  assert.match(save, /if \(it\.imageRef\) return it\.imageRef;/);
  assert.match(save, /uploadSupplierQuoteImage\(/);
  assert.match(save, /buildCloudPayload\(confirmed, totals, imageRefs(, markGenerated)?\)/);
});

test('history load restores product fields + image from item_meta and keeps legacy rows unchanged', () => {
  const load = between(MODULE_SRC, 'const handleLoadDraft = async', '// ── Package Quote');
  assert.match(load, /imageRef: isValidImageRef\(meta\.img\) \? meta\.img : undefined/);
  assert.match(load, /loadSupplierQuoteImage\(d\.imageRef\)/);
  assert.match(load, /\.\.\.\(meta \? \{/);                      // legacy rows: no meta → unchanged shape
  for (const k of ['quoteNumber: record.quote_no', 'newSelling[draft.id] = src.selling_price', 'customerId: record.customer_id']) assert.ok(load.includes(k), 'changed: ' + k);
});

test('customer Trade PDF draws every stored image and references no cost fields', () => {
  const pdf = between(MODULE_SRC, 'const buildModule2CustomerDescription', '// Module 4: Service Quote');
  assert.match(pdf, /const hasImg = !!item\.imageDataUrl;/);
  assert.match(pdf, /doc\.addImage\(item\.imageDataUrl!/);
  for (const k of COST_KEYS.filter(k => !['profit', 'margin', 'markup'].includes(k))) assert.ok(!pdf.includes(k), 'PDF references ' + k);
  assert.ok(!/item\.marginPercent|imageRef|item_meta/.test(pdf));
});

// ── Migration ──
test('migration only adds item_meta to the RPC; rollback restores the original body', () => {
  const oldSql = read('supabase/migrations/20261103090000_quotation_save_atomic_rpc.sql');
  const newSql = read('supabase/migrations/20261114090000_quotation_items_item_meta.sql');
  const rbSql = read('supabase/rollbacks/20261114090000_quotation_items_item_meta.rollback.sql');
  const fn = s => between(s, 'create or replace function public.save_quotation_with_items(', 'end $$;');
  const norm = s => fn(s).replace(/, item_meta\b/, '').replace(/,\n\s+case when jsonb_typeof\(e->'item_meta'\) = 'object' then e->'item_meta' else null end/, '');
  assert.equal(norm(newSql), fn(oldSql));
  assert.equal(fn(rbSql), fn(oldSql));
  assert.match(newSql, /alter table public\.quotation_items add column if not exists item_meta jsonb;/);
  assert.match(newSql, /security invoker/);
  for (const forbidden of [/create policy/i, /storage\.buckets/i, /drop table/i, /alter table [^;]*(enable|disable) row level security/i, /grant [^;]* on (table )?public\.quotation/i, /\bupdate public\.quotation_items\b/i])
    assert.ok(!forbidden.test(newSql), 'forbidden statement: ' + forbidden);
});
