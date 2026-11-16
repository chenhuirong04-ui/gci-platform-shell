// /api/suppliers/search — Chinese keyword extraction + under_review coverage.
// Run from the repo root:  node --test api/suppliers/__tests__/search.test.mjs
// Supabase and auth are stubbed; no network, no data written.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { rolldown } from 'rolldown';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');

// Fixture rows shaped like production `suppliers` (names / categories / statuses as recorded).
const SUPPLIERS = [
  { id: 'a1', status: 'active', supplier_name_display: 'Vision Carpets F.Z.E', supplier_type: 'Trading', country: 'UAE', product_categories: ['carpet'], is_preferred: true, current_rating: 'B' },
  { id: 'a2', status: 'active', supplier_name_display: 'Multi Industries FZC (Multipack)', supplier_type: 'Integrated', country: 'UAE', product_categories: ['packaging'], is_preferred: true, current_rating: 'B' },
  { id: 'a3', status: 'active', supplier_name_display: 'Moni Happy Hygiene', supplier_type: 'Factory', country: 'China', product_categories: ['hygiene', 'baby care'], is_preferred: false, current_rating: 'A' },
  { id: 'r1', status: 'under_review', supplier_name_display: 'Recruit Me Pvt Ltd', supplier_type: 'Agent', country: 'Nepal', product_categories: ['海外劳务招聘'] },
  { id: 'r2', status: 'under_review', supplier_name_display: 'Dakshinkali Manpower Suppliers (P) Ltd.', supplier_type: 'Agent', country: 'Nepal', product_categories: ['海外劳务招聘'] },
  { id: 'r3', status: 'under_review', supplier_name_display: 'Infinite Talent', supplier_type: 'Agent', country: 'Kenya', product_categories: ['海外劳务招聘'] },
  { id: 'r4', status: 'under_review', supplier_name_display: 'FES Workforce Solutions L.L.C.', supplier_type: 'Agent', country: 'UAE', product_categories: ['Manpower Recruitment', 'Construction Workforce'] },
  { id: 'r5', status: 'under_review', supplier_name_display: 'Emirates Strategic L.L.C-FZ', supplier_type: 'Trading', country: 'UAE', product_categories: ['Trading / Sourcing / Business Facilitation', '印度劳工招聘对接'] },
  { id: 'r6', status: 'under_review', supplier_name_display: 'Smart Hire Human Resources Consultancy', supplier_type: 'Service', country: 'UAE', product_categories: ['UAE Visa Sponsorship', 'Manpower Services'] },
  { id: 'x1', status: 'archived', supplier_name_display: 'Old Manpower Agent (archived)', supplier_type: 'Agent', country: 'Nepal', product_categories: ['海外劳务招聘'] },
];

let handler;
const seenUrls = [];

before(async () => {
  process.env.SUPABASE_URL = 'https://stub.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'stub';
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gci-sup-')), 'search.mjs');
  const b = await rolldown({
    input: path.join(ROOT, 'api/suppliers/search.ts'),
    platform: 'node',
    plugins: [{
      name: 'stub-auth',
      resolveId(id) { return id === '../_lib/auth' ? '\0stub-auth' : null; },
      load(id) {
        if (id !== '\0stub-auth') return null;
        return 'export async function requireModule(){return {ok:true,ctx:{}}}; export function userRestHeaders(){return {}}';
      },
    }],
  });
  await b.write({ file: out, format: 'esm' });
  handler = (await import(pathToFileURL(out).href)).default;
  globalThis.fetch = async (url) => {
    const u = String(url);
    seenUrls.push(u);
    let rows = [];
    if (u.includes('/rest/v1/suppliers?')) {
      const m = u.match(/status=(eq\.active|in\.\(active,under_review\))/);
      const allowed = !m ? [] : m[1] === 'eq.active' ? ['active'] : ['active', 'under_review'];
      rows = SUPPLIERS.filter(s => allowed.includes(s.status));
    }
    return new Response(JSON.stringify(rows), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
});

async function search(query) {
  seenUrls.length = 0;
  const res = await handler(new Request('https://x/api/suppliers/search', { method: 'POST', body: JSON.stringify({ query }) }));
  const j = await res.json();
  const results = [...(j.exactTypeMatches ?? []), ...(j.relatedTypeCandidates ?? []), ...(j.results ?? [])];
  const names = [...new Set(results.map(r => r.supplierName))];
  return { j, names, results, supplierUrl: seenUrls.find(u => u.includes('/rest/v1/suppliers?')) };
}

test('有几个劳务供应商 → keyword 劳务, all labour agents (incl. under_review), no unrelated suppliers', async () => {
  const { j, names, supplierUrl } = await search('有几个劳务供应商');
  assert.equal(j.ok, true);
  assert.match(supplierUrl, /status=in\.\(active,under_review\)/);
  assert.equal(j.extractedIntent.matchedSynonym, '劳务');
  assert.deepEqual(names.sort(), [
    'Dakshinkali Manpower Suppliers (P) Ltd.', 'Emirates Strategic L.L.C-FZ', 'FES Workforce Solutions L.L.C.',
    'Infinite Talent', 'Recruit Me Pvt Ltd', 'Smart Hire Human Resources Consultancy',
  ]);
  assert.ok(!names.some(n => /Vision Carpets|Multipack|Moni Happy|archived/.test(n)));
});

test('under_review results are labelled; archived never included', async () => {
  const { results } = await search('劳务供应商');
  const r = results.find(x => x.supplierName === 'Recruit Me Pvt Ltd');
  assert.equal(r.supplierStatus, 'under_review');
  assert.ok(r.warnings.some(w => w.includes('待审核')));
  assert.ok(!results.some(x => x.supplierName.includes('archived')));
});

test('pure Chinese keywords are kept (no longer dropped by the \\W filter)', async () => {
  const { j } = await search('清洁供应商');
  assert.deepEqual(j.extractedIntent.keywords, ['清洁']); // was [] before the fix
});

test('no search terms → active suppliers only, as before', async () => {
  const { supplierUrl, names } = await search('有几个供应商');
  assert.match(supplierUrl, /status=eq\.active/);
  assert.ok(names.every(n => !/Recruit Me|Dakshinkali|Infinite Talent/.test(n)));
});

test('existing product synonym search unchanged (纸尿裤 → hygiene supplier)', async () => {
  const { names, j } = await search('哪家供应商有纸尿裤');
  assert.equal(j.extractedIntent.matchedSynonym, '纸尿裤');
  assert.ok(names.includes('Moni Happy Hygiene'));
  assert.ok(!names.some(n => /Recruit Me|Vision Carpets/.test(n)));
});
