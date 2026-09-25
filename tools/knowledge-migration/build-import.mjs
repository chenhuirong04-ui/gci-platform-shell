#!/usr/bin/env node
// Knowledge Hub -> GCI Platform, step 2: DRY-RUN + build the guarded import SQL.
//
//   node tools/knowledge-migration/build-import.mjs --in C:/secure/kh_export.json                 # dry-run report only
//   node tools/knowledge-migration/build-import.mjs --in C:/secure/kh_export.json --out C:/secure/kh_import.sql
//   (optional) --raise-confidential <id,id,...>   ids whose level is raised to CONFIDENTIAL (never lowered)
//
// Connects to no database. Exits non-zero if any check fails, and then writes no SQL.
// The generated SQL (contains the data — keep it outside the repo) is ONE transaction:
//   preflight (schema present, no foreign rows in the way) -> INSERT … ON CONFLICT (legacy_source, legacy_id) DO NOTHING
//   into the 7 knowledge_* tables only -> postflight row counts per table -> ledger row (kind='data_fix').
// It never UPDATEs, DELETEs or TRUNCATEs, and touches no other table. Re-running it inserts 0 rows.
import fs from 'node:fs';

const LEGACY = 'kh:otnluzvrhbygxvaesqgq';
const IMPORT_VERSION = '20260926000200';
// Exact counts confirmed on the old project (2026-09-26). A different export aborts the run.
const EXPECTED = { industries: 9, knowledge_domains: 6, jurisdictions: 3, source_documents: 45, knowledge_items: 62,
                   rule_cards: 52, activities: 1047, pending_questions: 37 };
// Confidentiality distribution confirmed by Q2 (jurisdictions not included there).
const EXPECTED_LEVELS = { PUBLIC: 1167, INTERNAL: 76, CONFIDENTIAL: 0, ADMIN_ONLY: 0 };
// Report-only scan; a hit is never auto-raised. "服务中心佣金" = the official service-centre fee, not a partner commission.
const COMMISSION = /(commission|佣金|返佣|partner term|channel partner|rebate)/i;
const COMMISSION_FALSE_POSITIVE = /服务中心佣金/;
const LEVELS = ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'ADMIN_ONLY'];

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const inPath = opt('--in');
const outPath = opt('--out');
const raise = new Set((opt('--raise-confidential') || '').split(',').map((s) => s.trim()).filter(Boolean));
if (!inPath) { console.error('usage: build-import.mjs --in <export.json> [--out <import.sql>] [--raise-confidential id,id]'); process.exit(2); }

const bundle = JSON.parse(fs.readFileSync(inPath, 'utf8'));
const src = bundle.tables || {};
let failures = 0;
const check = (label, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok || !detail ? '' : '  -> ' + detail}`); if (!ok) failures++; };
const warn = (label) => console.log(`NOTE  ${label}`);

// ── 1. source counts ──
console.log('── source counts');
check(`export is from otnluzvrhbygxvaesqgq`, bundle.source_project === 'otnluzvrhbygxvaesqgq', String(bundle.source_project));
for (const [t, n] of Object.entries(EXPECTED)) check(`${t.padEnd(18)} ${String((src[t] || []).length).padStart(5)} rows (expected ${n})`, (src[t] || []).length === n);

const email = new Map((src.profiles || []).map((p) => [p.id, p.email || null]));
const level = (row) => {
  const l = raise.has(row.id) && LEVELS.indexOf(row.confidentiality) < 2 ? 'CONFIDENTIAL' : row.confidentiality;
  return l;
};

// ── 2. transform (old table.column -> new table.column) ──
const base = (r) => ({ id: r.id, legacy_source: LEGACY, legacy_id: r.id, created_at: r.created_at ?? null, updated_at: r.updated_at ?? r.created_at ?? null });
const out = {
  knowledge_taxonomy: [
    ...(src.industries || []).map((r) => ({ id: r.id, kind: 'industry', name: r.name, description: null, parent_id: r.parent_id ?? null, legacy_source: LEGACY, legacy_id: r.id })),
    ...(src.knowledge_domains || []).map((r) => ({ id: r.id, kind: 'domain', name: r.name, description: r.description ?? null, parent_id: null, legacy_source: LEGACY, legacy_id: r.id })),
  ],
  knowledge_jurisdictions: (src.jurisdictions || []).map((r) => ({ ...base(r),
    country: r.country, region: r.region, emirate: r.emirate, jurisdiction_type: r.jurisdiction_type, name: r.name,
    confidentiality: level(r), verification_status: r.verification_status })),
  knowledge_sources: (src.source_documents || []).map((r) => ({ ...base(r),
    title: r.title, file_name: r.file_name, drive_url: r.google_drive_url ?? null, source_institution: r.source_institution,
    document_type: r.document_type, version: r.version, status: r.status, confidentiality: level(r),
    verification_status: r.verification_status, published_at: r.published_at, legacy_owner_email: email.get(r.uploaded_by) ?? null })),
  knowledge_items: (src.knowledge_items || []).map((r) => ({ ...base(r),
    title: r.title, summary: r.summary, body: r.body, country: r.country, region: r.region, emirate: r.emirate,
    jurisdiction_id: r.jurisdiction_id, industry_id: r.industry_id, domain_id: r.domain_id, source_id: r.source_document_id,
    source_page: r.source_page, activity_code: r.activity_code, language: r.language ?? 'zh', status: r.status,
    confidentiality: level(r), verification_status: r.verification_status, published_at: r.published_at,
    effective_date: r.effective_date, expiry_date: r.expiry_date, last_verified_at: r.last_verified_at,
    legacy_owner_email: email.get(r.created_by) ?? null })),
  knowledge_rules: (src.rule_cards || []).map((r) => ({ ...base(r),
    knowledge_item_id: r.knowledge_item_id, title: r.title, applies_to: r.applies_to, trigger_conditions: r.trigger_conditions,
    required_actions: r.required_actions, required_documents: r.required_documents, deadline: r.deadline, risks: r.risks,
    exceptions: r.exceptions, source_note: r.source, country: r.country, region: r.region, industry: r.industry,
    official_service_url: r.official_service_url ?? null, official_email: r.official_email ?? null, official_phone: r.official_phone ?? null,
    official_address: r.official_address ?? null, official_working_hours: r.official_working_hours ?? null,
    contact_last_verified_date: r.contact_last_verified_date ?? null, status: r.status, confidentiality: level(r),
    verification_status: r.verification_status, last_verified_at: r.last_verified_at })),
  knowledge_activities: (src.activities || []).map((r) => ({ ...base(r),
    jurisdiction_id: r.jurisdiction_id, business_sector: r.business_sector, sub_sector: r.sub_sector,
    activity_isic4_code: r.activity_isic4_code, activity_code: r.activity_code, activity_name: r.activity_name,
    activity_name_arabic: r.activity_name_arabic, licence_type: r.licence_type, activity_description: r.activity_description,
    space_required: r.space_required, restrictions: r.restrictions, additional_requirements: r.additional_ecda_requirements,
    third_party_approval_required: r.third_party_approval_required, source_file: r.source_file,
    confidentiality: level(r), verification_status: r.verification_status })),
  knowledge_questions: (src.pending_questions || []).map((r) => {
    const s = String(r.status || '').toUpperCase();
    const status = ['RESOLVED', 'ANSWERED', 'CLOSED', 'DONE', 'CONFIRMED'].includes(s) ? 'RESOLVED' : s === 'STALE' ? 'STALE' : 'OPEN';
    return { ...base(r), question: r.question, context: r.context, target_authority: r.target_authority, status,
      legacy_status: r.status ?? null, review_note: `导入自 Knowledge Hub（原创建于 ${String(r.created_at || '').slice(0, 10)}），未复核`,
      confidentiality: level(r), verification_status: r.verification_status, legacy_owner_email: email.get(r.owner_id) ?? null };
  }),
};
const ORDER = ['knowledge_taxonomy', 'knowledge_jurisdictions', 'knowledge_sources', 'knowledge_items', 'knowledge_rules',
               'knowledge_activities', 'knowledge_questions'];

// ── 3. integrity ──
console.log('── integrity');
const ids = (t) => new Set(out[t].map((r) => r.id));
const tax = ids('knowledge_taxonomy'), jur = ids('knowledge_jurisdictions'), srcIds = ids('knowledge_sources'), items = ids('knowledge_items');
const fk = (t, col, set) => { const bad = out[t].filter((r) => r[col] != null && !set.has(r[col])); check(`${t}.${col} -> all resolve in scope`, bad.length === 0, `${bad.length} unresolved: ${bad.slice(0, 5).map((r) => r.id).join(', ')}`); };
fk('knowledge_taxonomy', 'parent_id', tax);
fk('knowledge_items', 'jurisdiction_id', jur); fk('knowledge_items', 'industry_id', tax); fk('knowledge_items', 'domain_id', tax);
fk('knowledge_items', 'source_id', srcIds);
fk('knowledge_rules', 'knowledge_item_id', items);
fk('knowledge_activities', 'jurisdiction_id', jur);
const industryIds = new Set(out.knowledge_taxonomy.filter((r) => r.kind === 'industry').map((r) => r.id));
const domainIds = new Set(out.knowledge_taxonomy.filter((r) => r.kind === 'domain').map((r) => r.id));
check('knowledge_items.industry_id points at an industry', out.knowledge_items.every((r) => r.industry_id == null || industryIds.has(r.industry_id)));
check('knowledge_items.domain_id points at a domain', out.knowledge_items.every((r) => r.domain_id == null || domainIds.has(r.domain_id)));
const all = ORDER.flatMap((t) => out[t].map((r) => r.id));
check('ids unique across all 7 target tables', new Set(all).size === all.length, `${all.length - new Set(all).size} duplicate(s)`);
for (const t of ['industries', 'knowledge_domains']) {
  const names = (src[t] || []).map((r) => r.name); check(`${t}.name unique`, new Set(names).size === names.length);
}
const required = { knowledge_taxonomy: ['name'], knowledge_jurisdictions: ['country', 'jurisdiction_type', 'name'], knowledge_sources: ['title', 'document_type'],
  knowledge_items: ['title'], knowledge_rules: ['title'], knowledge_activities: ['activity_name'], knowledge_questions: ['question'] };
for (const [t, cols] of Object.entries(required)) for (const c of cols) {
  const bad = out[t].filter((r) => r[c] == null || r[c] === ''); check(`${t}.${c} present`, bad.length === 0, `${bad.length} empty`);
}
const enumOk = (t, c, vals) => { const bad = out[t].filter((r) => r[c] != null && !vals.includes(r[c])); check(`${t}.${c} values valid`, bad.length === 0, [...new Set(bad.map((r) => r[c]))].join(',')); };
for (const t of ORDER.slice(1)) enumOk(t, 'confidentiality', LEVELS);
for (const t of ORDER.slice(1)) enumOk(t, 'verification_status', ['OFFICIAL', 'CONFIRMED', 'INTERNAL', 'PENDING', 'EXPIRED']);
for (const t of ['knowledge_sources', 'knowledge_items', 'knowledge_rules']) enumOk(t, 'status', ['DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED']);

// ── 4. dropped columns must be empty (otherwise data would be lost silently) ──
console.log('── dropped columns');
const nonNull = (t, c) => (src[t] || []).filter((r) => r[c] != null && r[c] !== '').length;
check('knowledge_items.authority_id empty (authorities has 0 rows)', nonNull('knowledge_items', 'authority_id') === 0, `${nonNull('knowledge_items', 'authority_id')} set`);
const jt = (src.knowledge_items || []).filter((r) => r.jurisdiction_type && !r.jurisdiction_id).length;
check('knowledge_items.jurisdiction_type only dropped where jurisdiction_id carries it', jt === 0, `${jt} row(s) have jurisdiction_type but no jurisdiction_id`);

// ── 5. confidentiality ──
console.log('── confidentiality');
const dist = { PUBLIC: 0, INTERNAL: 0, CONFIDENTIAL: 0, ADMIN_ONLY: 0 };
for (const t of ['knowledge_sources', 'knowledge_items', 'knowledge_rules', 'knowledge_activities', 'knowledge_questions']) for (const r of out[t]) dist[r.confidentiality]++;
// expected = confirmed distribution, shifted by every explicitly raised PUBLIC/INTERNAL row
const expected = { ...EXPECTED_LEVELS };
const scoredSrc = ['source_documents', 'knowledge_items', 'rule_cards', 'activities', 'pending_questions'].flatMap((t) => src[t] || []);
for (const r of scoredSrc) if (raise.has(r.id) && LEVELS.indexOf(r.confidentiality) < 2) { expected[r.confidentiality]--; expected.CONFIDENTIAL++; }
if (raise.size) {
  const unknown = [...raise].filter((id) => !scoredSrc.some((r) => r.id === id));
  check('--raise-confidential ids all exist', unknown.length === 0, unknown.join(','));
}
for (const l of LEVELS) check(`level ${l.padEnd(12)} ${String(dist[l]).padStart(5)} (expected ${expected[l]})`, dist[l] === expected[l]);
check('no row lowered in level', ['source_documents', 'knowledge_items', 'rule_cards', 'activities', 'pending_questions'].every((t) =>
  (src[t] || []).every((r) => { const n = ORDER.flatMap((x) => out[x]).find((o) => o.id === r.id); return LEVELS.indexOf(n.confidentiality) >= LEVELS.indexOf(r.confidentiality); })));
const scan = [
  ...out.knowledge_items.map((r) => ['knowledge_items', r, [r.title, r.summary, r.body].join(' ')]),
  ...out.knowledge_rules.map((r) => ['knowledge_rules', r, [r.title, r.required_actions, r.source_note].join(' ')]),
  ...out.knowledge_sources.map((r) => ['knowledge_sources', r, [r.title, r.file_name].join(' ')]),
].filter(([, r, text]) => COMMISSION.test(text) && LEVELS.indexOf(r.confidentiality) < 2);
for (const [t, r, text] of scan) {
  const fp = COMMISSION_FALSE_POSITIVE.test(text) && !COMMISSION.test(text.replace(/服务中心佣金/g, ''));
  warn(`commission keyword at ${r.confidentiality}: ${t} ${r.id} "${String(r.title).slice(0, 40)}"${fp ? '  (official service-centre fee — reviewed false positive)' : '  (REVIEW: raise with --raise-confidential if it is partner/commission content)'}`);
}

// ── 6. questions ──
console.log('── pending questions');
const qs = out.knowledge_questions.reduce((m, r) => ((m[r.status] = (m[r.status] || 0) + 1), m), {});
console.log(`      status after normalisation: ${JSON.stringify(qs)}`);
const oddStatus = (src.pending_questions || []).filter((r) => !['OPEN', 'RESOLVED', 'ANSWERED', 'CLOSED', 'DONE', 'CONFIRMED', 'STALE'].includes(String(r.status || '').toUpperCase()));
check('pending_questions.status all recognised', oddStatus.length === 0, [...new Set(oddStatus.map((r) => r.status))].join(','));

// ── 7. SQL ──
const payloads = Object.fromEntries(ORDER.map((t) => [t, JSON.stringify(out[t])]));
const tagClash = Object.values(payloads).some((p) => p.includes('$kh$'));
check('payload does not contain the $kh$ quote tag', !tagClash);

console.log(`\n${failures === 0 ? 'DRY-RUN: ALL CHECKS PASSED' : `DRY-RUN: ${failures} CHECK(S) FAILED — no SQL written`}`);
for (const t of ORDER) console.log(`      would insert ${String(out[t].length).padStart(5)} into public.${t}`);
if (failures) process.exit(1);
if (!outPath) process.exit(0);

const cols = (t) => Object.keys(out[t][0] || { id: 1 });
const lines = [];
const L = (s) => lines.push(s);
L(`-- Knowledge Hub -> GCI Platform: one-off DATA import (kind='data_fix'), GENERATED by tools/knowledge-migration/build-import.mjs`);
L(`-- from ${inPath} on ${new Date().toISOString()}. Contains the migrated content: keep outside the repo, delete after use.`);
L(`-- One transaction. Inserts into the 7 knowledge_* tables only; never UPDATE/DELETE/TRUNCATE. Re-running inserts 0 rows.`);
L(`-- Requires supabase/migrations/20260926000100_knowledge_schema.sql to be applied first.`);
L(`begin;`);
L(``);
L(`-- preflight: schema present; nothing foreign in the way`);
L(`do $$`);
L(`declare t text; n bigint;`);
L(`begin`);
L(`  foreach t in array array[${ORDER.map((t) => `'${t}'`).join(', ')}] loop`);
L(`    if to_regclass('public.' || t) is null then raise exception 'preflight: public.% missing — apply 20260926000100_knowledge_schema.sql first', t; end if;`);
L(`    execute format('select count(*) from public.%I where legacy_source is distinct from %L', t, '${LEGACY}') into n;`);
L(`    if n > 0 then raise notice 'preflight: public.% already has % non-Knowledge-Hub row(s); they are left untouched', t, n; end if;`);
L(`  end loop;`);
L(`end $$;`);
L(``);
for (const t of ORDER) {
  const c = cols(t).join(', ');
  L(`insert into public.${t} (${c})`);
  L(`select ${c} from jsonb_populate_recordset(null::public.${t}, $kh$${payloads[t]}$kh$::jsonb)`);
  L(`on conflict (legacy_source, legacy_id) do nothing;`);
  L(``);
}
L(`-- postflight: every expected row is present`);
L(`do $$`);
L(`declare n bigint;`);
L(`begin`);
for (const t of ORDER) {
  L(`  select count(*) into n from public.${t} where legacy_source = '${LEGACY}';`);
  L(`  if n <> ${out[t].length} then raise exception 'postflight: public.${t} has % Knowledge Hub rows, expected ${out[t].length}', n; end if;`);
}
L(`end $$;`);
L(``);
L(`do $$`);
L(`begin`);
L(`  if to_regclass('ops.migration_ledger') is not null then`);
L(`    insert into ops.migration_ledger (version, name, kind, notes)`);
L(`    values ('${IMPORT_VERSION}', 'knowledge_hub_import', 'data_fix', '${ORDER.map((t) => `${t}=${out[t].length}`).join(' ')}; source otnluzvrhbygxvaesqgq')`);
L(`    on conflict (version) do nothing;`);
L(`  end if;`);
L(`end $$;`);
L(``);
L(`commit;`);
fs.writeFileSync(outPath, lines.join('\n') + '\n');
console.log(`\nwritten ${outPath} (${(fs.statSync(outPath).size / 1024).toFixed(0)} KB) — review, then paste into the SQL Editor of efrkvwhzpgahjgfukjth`);
