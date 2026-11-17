// GIA P4 — company management endpoints: /api/company/{documents,tasks,knowledge}.
// Run from the repo root:  node --test tools/gia-company-read.test.mjs
// Auth, Supabase, Storage and the Gemini proxy are stubbed; no network, no data written.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { rolldown } from 'rolldown';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NAMES = ['documents', 'tasks', 'knowledge'];

const DOCS = [
  { id: 'd1', category: 'Trade License', document_type: 'Trade License', document_name: 'Trade License - GCI', file_name: 'old-license.pdf', storage_path: 'trade-license/old.pdf', mime_type: 'application/pdf', company_name: 'GlobalCare Info General Trading FZCO', document_number: '210193', expiry_date: '2026-10-02', uploaded_at: '2026-09-21T00:00:00Z', reminder_enabled: true, ai_status: 'completed', ai_summary: 'Licence. password: hunter2', ai_extracted: { activities: ['General Trading'], login_password: 'x' } },
  { id: 'd2', category: 'Trade License', document_type: 'Trade License', document_name: 'Trade License - GCI', file_name: 'renewed-license.pdf', storage_path: 'trade-license/new.pdf', mime_type: 'application/pdf', company_name: 'GlobalCare Info General Trading FZCO', document_number: '210193', expiry_date: '2027-10-02', uploaded_at: '2026-10-06T00:00:00Z', reminder_enabled: true, ai_status: 'completed' },
  { id: 'd3', category: 'Contract', document_type: 'Other', document_name: 'Lease Agreement', file_name: 'lease.pdf', storage_path: 'contract/lease.pdf', mime_type: 'application/pdf', company_name: 'GCI', expiry_date: '2026-12-01', uploaded_at: '2026-01-01T00:00:00Z', reminder_enabled: true },
];
const TASKS = [
  { id: 't1', title: '展厅物品清理', status: 'in_progress', priority: 'P3', business_area: 'COMPANY_ADMIN', owner: '本人', due_at: null, description: '跟进清场退押金', blocker: null, logs: [{ at: '2026-11-01', text: '已联系房东' }], created_at: '2026-10-01T00:00:00Z' },
  { id: 't2', title: 'VAT filing', status: 'open', priority: 'P1', business_area: 'TRADE', owner: null, due_at: '2026-11-10T00:00:00Z', related_customer_id: 'c1', created_at: '2026-10-02T00:00:00Z' },
  { id: 't3', title: 'Old task', status: 'completed', priority: 'P2', business_area: 'OTHER', owner: 'LILI', due_at: '2026-09-01T00:00:00Z', completed_at: '2026-09-02T00:00:00Z', created_at: '2026-08-01T00:00:00Z' },
];
const RULES = [{ id: 'r1', title: 'Golden Visa持有人工作许可', applies_to: 'Golden Visa holders', required_actions: 'Apply for work permit via MOHRE', required_documents: 'Passport, visa', confidentiality: 'PUBLIC' }];
const ITEMS = [{ id: 'i1', title: 'Golden Visa可以不办Work Permit吗？', summary: 'Short', body: 'Full body text. API key: sk-123', confidentiality: 'INTERNAL' }];

const mods = {};
const seen = [];

before(async () => {
  process.env.SUPABASE_URL = 'https://stub.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'anon-stub';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gci-company-'));
  for (const name of NAMES) {
    const b = await rolldown({
      input: path.join(ROOT, `api/company/${name}.ts`),
      platform: 'node',
      plugins: [{
        name: 'stubs',
        resolveId(id) { return id === '../_lib/auth' ? '\0auth' : id === '../ai/gemini-generate' ? '\0gem' : null; },
        load(id) {
          if (id === '\0auth') return `export async function requireModule(req, mods) {
            globalThis.__mods = mods;
            const a = req.headers.get('authorization');
            if (!a) return { ok: false, response: new Response('{}', { status: 401 }) };
            if (a === 'Bearer nomodule') return { ok: false, response: new Response('{}', { status: 403 }) };
            return { ok: true, ctx: { token: 'user-token' } };
          }
          export function userRestHeaders(ctx) { return { apikey: 'anon-stub', Authorization: 'Bearer ' + ctx.token }; }`;
          if (id === '\0gem') return `export default async function (req) {
            const body = await req.json();
            globalThis.__gem = (globalThis.__gem || 0) + 1;
            globalThis.__gemAuth = req.headers.get('authorization');
            const part = body.contents.parts[0].inline_data;
            return new Response(JSON.stringify({ ok: true, text: 'FULL TEXT of ' + part.mime_type + ' ' + atob(part.data) + ' Password: abc123' }), { status: 200 });
          }`;
          return null;
        },
      }],
    });
    const out = path.join(dir, `${name}.mjs`);
    await b.write({ file: out, format: 'esm' });
    mods[name] = await import(pathToFileURL(out).href);
  }
  globalThis.fetch = async (url, init = {}) => {
    const u = decodeURIComponent(String(url));
    seen.push({ u, method: init.method || 'GET', auth: init.headers?.Authorization });
    if (u.includes('/storage/v1/object/authenticated/company-documents/')) {
      const p = u.split('/company-documents/')[1];
      return new Response(new TextEncoder().encode(`bytes:${p}`), { status: 200, headers: { 'content-type': 'application/pdf' } });
    }
    if (u.includes('/rest/v1/rpc/knowledge_search')) {
      return new Response(JSON.stringify([{ kind: 'rule', id: 'r1', title: RULES[0].title, rank: 2 }, { kind: 'item', id: 'i1', title: ITEMS[0].title, rank: 1 }]), { status: 200 });
    }
    const table = u.match(/\/rest\/v1\/([a-z_]+)\?/)?.[1];
    const T = { company_documents: DOCS, executive_tasks: TASKS, crm_customers: [{ id: 'c1', customer_name: 'Alpha Co' }], knowledge_rules: RULES, knowledge_items: ITEMS, knowledge_sources: [], knowledge_questions: [] };
    return new Response(JSON.stringify(T[table] || []), { status: 200 });
  };
});

const call = async (name, qs = '', token = 'u') => {
  seen.length = 0;
  globalThis.__gem = 0;
  const headers = token ? { authorization: `Bearer ${token}` } : {};
  const res = await mods[name].default(new Request(`https://x/api/company/${name}?${qs}`, { headers }));
  return { status: res.status, body: res.status === 200 ? await res.json() : null };
};

test('auth: no session → 401, no module → 403, nothing read; any GCI module (mirrors the tables\' signed-in RLS)', async () => {
  for (const name of NAMES) {
    assert.equal((await call(name, 'query=x', null)).status, 401, name);
    assert.equal(seen.length, 0, name);
    assert.equal((await call(name, 'query=x', 'nomodule')).status, 403, name);
    assert.equal(seen.length, 0, name);
    assert.ok(globalThis.__mods.includes('crm') && globalThis.__mods.includes('knowledge_public'), name);
  }
});

test('every database / storage read uses the caller token; no service role; account vault never read; POST → 405', async () => {
  for (const [name, qs] of [['documents', 'query=lease'], ['tasks', ''], ['knowledge', 'query=visa']]) {
    await call(name, qs);
    assert.ok(seen.length > 0, name);
    for (const s of seen) {
      assert.equal(s.auth, 'Bearer user-token', `${name}: ${s.u}`);
      assert.ok(s.method === 'GET' || s.u.includes('/rpc/knowledge_search'), `${name}: ${s.method} ${s.u}`);
    }
    const res = await mods[name].default(new Request(`https://x/api/company/${name}`, { method: 'POST', headers: { authorization: 'Bearer u' } }));
    assert.equal(res.status, 405, name);
  }
  for (const f of ['_read', ...NAMES]) {
    const src = fs.readFileSync(path.join(ROOT, `api/company/${f}.ts`), 'utf8').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(src, /service_role|SERVICE_ROLE|company_account_logins|\.upload\(|\.remove\(|method: 'DELETE'|method: 'PATCH'/, f);
  }
});

test('documents: versions by type + company + number — renewed old licence is "旧版本", not expired; Home reminder rule', () => {
  const { buildDocuments } = mods.documents;
  const v = buildDocuments(DOCS, '2026-11-17');
  const old = v.documents.find((d) => d.fileName === 'old-license.pdf');
  const cur = v.documents.find((d) => d.fileName === 'renewed-license.pdf');
  assert.deepEqual([old.isCurrentVersion, old.version, old.daysUntilExpiry, old.inHomeReminder], [false, '1/2', -46, true]);
  assert.match(old.status, /旧版本（已续期，新版本到期 2027-10-02）/);
  assert.deepEqual([cur.isCurrentVersion, cur.version, cur.status], [true, '2/2', '有效']);
  assert.deepEqual(v.licences.expired, []);
  assert.deepEqual(v.licences.renewedOldVersionsStillReminding, ['Trade License - GCI · old-license.pdf（2026-10-02）']);
  assert.deepEqual(v.licences.expiringIn90Days, ['Lease Agreement（2026-12-01）']);
  assert.equal(v.homeReminders.count, 2); // old licence (−46 days) + lease (14 days), as the Home tile counts them
});

test('documents: word search keeps the best matches; current version listed (and read) first', () => {
  const { buildDocuments } = mods.documents;
  assert.deepEqual(buildDocuments(DOCS, '2026-11-17', { query: 'lease 合同' }).documents.map((d) => d.fileName), ['lease.pdf']);
  assert.deepEqual(buildDocuments(DOCS, '2026-11-17', { query: 'trade license' }).documents.map((d) => d.fileName),
    ['renewed-license.pdf', 'old-license.pdf']);
  assert.equal(buildDocuments(DOCS, '2026-11-17', { query: 'nothing-here' }).matchedCount, 0);
});

test('documents: stored AI recognition is returned with credentials masked', () => {
  const { buildDocuments } = mods.documents;
  const old = buildDocuments(DOCS, '2026-11-17').documents.find((d) => d.id === 'd1');
  assert.equal(old.aiSummary, 'Licence. password: [已隐藏]');
  assert.deepEqual(old.aiExtracted.activities, ['General Trading']);
});

test('documents: a search matching ≤ 2 files reads the ORIGINAL file in full (as the caller, via the existing Gemini proxy); credentials masked', async () => {
  const { body } = await call('documents', 'query=lease');
  assert.equal(body.matchedCount, 1);
  assert.equal(body.originalContents.length, 1);
  assert.equal(body.originalContents[0].fileName, 'lease.pdf');
  assert.match(body.originalContents[0].text, /^FULL TEXT of application\/pdf bytes:contract\/lease\.pdf Password: \[已隐藏\]$/);
  assert.equal(globalThis.__gem, 1);
  assert.equal(globalThis.__gemAuth, 'Bearer u');           // the caller's own Authorization, no server identity
  assert.ok(seen.some((s) => s.u.endsWith('/storage/v1/object/authenticated/company-documents/contract/lease.pdf')));
});

test('documents: no read for a broad listing; read=true caps at 2 files and says so', async () => {
  const list = (await call('documents', '')).body;
  assert.equal(list.originalContents, undefined);
  assert.equal(globalThis.__gem, 0);
  const all = (await call('documents', 'read=true')).body;
  assert.equal(all.originalContents.length, 2);
  assert.match(all.readNote, /匹配 3 份文件，只读取了前 2 份/);
});

test('tasks: full task + follow-up log, overdue / missing owner / missing due date counted, status filters', async () => {
  const { buildTasks } = mods.tasks;
  const now = new Date('2026-11-17T08:00:00Z');
  const v = buildTasks(TASKS, new Map([['c1', 'Alpha Co']]), now, {});
  assert.deepEqual(v.counts, { total: 3, open: 1, inProgress: 1, completed: 1, cancelled: 0, overdue: 1, activeWithoutDueDate: 1, activeWithoutOwner: 1 });
  assert.deepEqual(v.tasks.map((t) => t.title), ['VAT filing', '展厅物品清理']);   // active, by due date
  const vat = v.tasks[0];
  assert.deepEqual([vat.overdue, vat.owner, vat.relatedCustomer, vat.status], [true, null, 'Alpha Co', '待办']);
  const show = v.tasks[1];
  assert.deepEqual([show.description, show.followUpLog], ['跟进清场退押金', [{ at: '2026-11-01', text: '已联系房东' }]]);
  assert.deepEqual(buildTasks(TASKS, new Map(), now, { status: 'overdue' }).tasks.map((t) => t.title), ['VAT filing']);
  assert.deepEqual(buildTasks(TASKS, new Map(), now, { status: 'all', owner: 'lili' }).tasks.map((t) => t.title), ['Old task']);
  assert.deepEqual(buildTasks(TASKS, new Map(), now, { query: '房东' }).tasks.map((t) => t.title), ['展厅物品清理']);   // searches the log too
});

test('knowledge: a multi-word question is searched whole and per word; items matched by more words rank higher', async () => {
  const { searchTerms } = mods.knowledge;
  const asked = [];
  const fake = async (q) => {
    asked.push(q);
    if (q === 'Golden Visa 工作许可 文件') return [];                       // whole phrase finds nothing (the real failure)
    if (q === 'Golden') return [{ kind: 'rule', id: 'r1', title: 'R', rank: 1 }, { kind: 'activity', id: 'a9', title: 'A', rank: 1.2 }];
    if (q === 'Visa') return [{ kind: 'rule', id: 'r1', title: 'R', rank: 1 }];
    if (q === '工作许可') return [{ kind: 'rule', id: 'r1', title: 'R', rank: 0.8 }];
    return [];
  };
  const hits = await searchTerms('Golden Visa 工作许可 文件', fake);
  assert.deepEqual(asked, ['Golden Visa 工作许可 文件', 'Golden', 'Visa', '工作许可', '文件']);
  assert.deepEqual(hits.map((h) => h.id), ['r1', 'a9']);
  assert.equal(hits[0].rank, 2);    // best 1 + 0.5 + 0.5
});

test('knowledge: the module\'s own knowledge_search ranking, then the FULL records; credentials masked; id + kind reads one record', async () => {
  const { body } = await call('knowledge', 'query=golden%20visa');
  assert.deepEqual(body.results.map((r) => [r.kind, r.title]), [['rule', RULES[0].title], ['item', ITEMS[0].title]]);
  assert.equal(body.results[0].required_actions, 'Apply for work permit via MOHRE');
  assert.equal(body.results[1].body, 'Full body text. API key: [已隐藏]');
  assert.ok(seen.some((s) => s.u.includes('/rest/v1/rpc/knowledge_search')));
  const one = (await call('knowledge', 'id=r1&kind=rule')).body;
  assert.equal(one.records[0].required_documents, 'Passport, visa');
  assert.equal((await call('knowledge', '')).status, 400);
  assert.equal((await call('knowledge', 'query=x&kind=bogus')).status, 400);
});
