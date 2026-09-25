#!/usr/bin/env node
// Knowledge Hub -> GCI Platform, step 1: EXPORT (read-only).
//
// Reads the in-scope tables of the old Knowledge Hub project (otnluzvrhbygxvaesqgq) through PostgREST with GET requests only
// and writes one JSON bundle. Never writes to any database.
//
//   KH_SUPABASE_URL=https://otnluzvrhbygxvaesqgq.supabase.co KH_SERVICE_ROLE_KEY=... \
//     node tools/knowledge-migration/export-kh.mjs --out C:/secure/kh_export_2026-09-26.json
//
// The service-role key is needed because RLS on the old project hides INTERNAL rows from anon. Keep the key in your shell /
// a local .env file only. The output contains INTERNAL content: store it outside the repo and delete it after the import.
import fs from 'node:fs';
import path from 'node:path';

const TABLES = ['industries', 'knowledge_domains', 'jurisdictions', 'source_documents', 'knowledge_items', 'rule_cards',
                'activities', 'pending_questions'];
const PAGE = 1000;

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const out = outIdx >= 0 ? args[outIdx + 1] : null;
const url = (process.env.KH_SUPABASE_URL || '').replace(/\/$/, '');
const key = process.env.KH_SERVICE_ROLE_KEY || '';
if (!out || !url || !key) {
  console.error('usage: KH_SUPABASE_URL=... KH_SERVICE_ROLE_KEY=... node export-kh.mjs --out <file outside the repo>');
  process.exit(2);
}
if (!/otnluzvrhbygxvaesqgq\.supabase\.co$/.test(url)) {
  console.error(`refusing: KH_SUPABASE_URL must be the Knowledge Hub project (otnluzvrhbygxvaesqgq), got ${url}`);
  process.exit(2);
}
if (path.resolve(out).startsWith(path.resolve(process.cwd()))) {
  console.error('refusing: --out must be outside the repository (the export contains INTERNAL content)');
  process.exit(2);
}

async function getAll(table, select = '*') {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(`${url}/rest/v1/${table}?select=${select}&order=id`, {
      method: 'GET',
      headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${from}-${from + PAGE - 1}`, 'Range-Unit': 'items' },
    });
    if (!res.ok) throw new Error(`${table}: HTTP ${res.status} ${await res.text()}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  // search_vector is regenerated on the platform side
  return rows.map(({ search_vector, ...rest }) => rest);
}

const bundle = { source_project: 'otnluzvrhbygxvaesqgq', exported_at: new Date().toISOString(), tables: {} };
for (const t of TABLES) {
  bundle.tables[t] = await getAll(t);
  console.log(`${t.padEnd(20)} ${bundle.tables[t].length}`);
}
// only id + email, to turn owner/creator uuids into a readable legacy_owner_email
bundle.tables.profiles = await getAll('profiles', 'id,email');
console.log(`${'profiles (id,email)'.padEnd(20)} ${bundle.tables.profiles.length}`);

fs.writeFileSync(out, JSON.stringify(bundle));
console.log(`\nwritten ${out}`);
