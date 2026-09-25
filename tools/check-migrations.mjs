#!/usr/bin/env node
// Lints supabase/migrations so the replayable chain stays replayable.  Usage:
//   node tools/check-migrations.mjs                 lint supabase/migrations (14-digit files are errors if wrong; legacy 8-digit files are only warnings until the freeze)
//   node tools/check-migrations.mjs --dir <path>    lint another folder (used to prove the checker rejects a data-fix)
//   node tools/check-migrations.mjs --sums          also print sha256 + ledger UPDATE statements for every 14-digit file
// Exit code 1 on any ERROR.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'supabase');
const dirArg = args.indexOf('--dir');
const dir = dirArg >= 0 ? path.resolve(args[dirArg + 1]) : path.join(root, 'migrations');
const rollbackDir = dirArg >= 0 ? path.join(path.dirname(dir), 'rollbacks') : path.join(root, 'rollbacks');
const backfill = fs.existsSync(path.join(root, 'ops', 'ledger-backfill.sql')) ? fs.readFileSync(path.join(root, 'ops', 'ledger-backfill.sql'), 'utf8') : '';
const strip = (t) => t.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

// DML is allowed ONLY against these targets (ledger bookkeeping, bucket creation). Everything else belongs in supabase/ops/data-fixes/.
const DML_ALLOWED = /^(ops\.migration_ledger|storage\.buckets)$/i;
const errors = new (class extends Array { push(...x) { for (const i of x) if (!this.includes(i)) super.push(i); return this.length; } })(), warns = [];
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const seen = new Map();
const legacy = files.filter((f) => !/^\d{14}_/.test(f));
const modern = files.filter((f) => /^\d{14}_/.test(f));

for (const f of modern) {
  const v = f.slice(0, 14), raw = fs.readFileSync(path.join(dir, f), 'utf8'), sql = strip(raw);
  if (!/^\d{14}_[a-z0-9_]+\.sql$/.test(f)) errors.push(`${f}: name must match YYYYMMDDHHMMSS_lower_snake_case.sql`);
  if (seen.has(v)) errors.push(`${f}: version ${v} is already used by ${seen.get(v)}`); else seen.set(v, f);
  // 1) no business-data DML in the replayable chain
  for (const m of sql.matchAll(/\b(insert\s+into|delete\s+from|update)\s+(?:only\s+)?("?[a-z_][a-z0-9_]*"?(?:\."?[a-z_][a-z0-9_]*"?)?)/gi)) {
    const target = m[2].replace(/"/g, '');
    if (/^(update)$/i.test(m[1]) && /^set$/i.test(target)) continue;
    // trigger event clause (CREATE TRIGGER … BEFORE UPDATE ON t / UPDATE OF col), not an UPDATE statement
    if (/^(update)$/i.test(m[1]) && /^(on|of)$/i.test(target)) continue;
    if (!DML_ALLOWED.test(target)) errors.push(`${f}: ${m[1].toUpperCase()} on "${target}" — data changes are not allowed in migrations/ (move it to supabase/ops/data-fixes/)`);
  }
  // 2) rollback pair (baseline files are exempt: they are never rolled back, only re-generated)
  if (!/_baseline_/.test(f) && !fs.existsSync(path.join(rollbackDir, f.replace(/\.sql$/, '.rollback.sql')))) errors.push(`${f}: missing rollback file ${path.basename(rollbackDir)}/${f.replace(/\.sql$/, '.rollback.sql')}`);
  // 3) registered in the ledger: self-registers, or is listed in the backfill (files executed before the ledger existed)
  const selfRegisters = new RegExp(`ops\\.migration_ledger[\\s\\S]{0,400}'${v}'`).test(sql);
  if (!selfRegisters && !backfill.includes(`'${v}'`)) errors.push(`${f}: neither self-registers in ops.migration_ledger nor appears in ops/ledger-backfill.sql`);
}
if (legacy.length) warns.push(`${legacy.length} legacy (non-14-digit) file(s) still in migrations/ — pending the freeze to migrations_legacy/: ${legacy.slice(0, 3).join(', ')}${legacy.length > 3 ? ', …' : ''}`);

console.log(`checked ${modern.length} 14-digit migration file(s) in ${dir}`);
for (const w of warns) console.log('WARN  ' + w);
for (const e of errors) console.log('ERROR ' + e);
if (args.includes('--sums')) {
  console.log('\n-- paste after ops/ledger-backfill.sql (fills the checksum column):');
  for (const f of modern) console.log(`update ops.migration_ledger set sha256 = '${crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, f))).digest('hex')}' where version = '${f.slice(0, 14)}';`);
}
console.log(errors.length ? `\nFAILED (${errors.length} error${errors.length > 1 ? 's' : ''})` : '\nOK');
process.exit(errors.length ? 1 : 0);
