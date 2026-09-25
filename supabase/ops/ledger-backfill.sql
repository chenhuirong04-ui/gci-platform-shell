-- ops.migration_ledger BACKFILL — PREPARED, NOT EXECUTED.
-- Marks work that ALREADY happened in Production as applied. It never runs the content of those files.
-- Run only AFTER supabase/migrations/20260920000000_ops_migration_ledger.sql has been applied.
-- Idempotent (ON CONFLICT DO NOTHING).
--
-- The file-content checksums are NOT in this script: run `node tools/check-migrations.mjs --sums` and paste its UPDATE statements after this one.

insert into ops.migration_ledger (version, name, kind, applied_at, applied_by, notes) values

  -- Executed by Chris in the Supabase SQL Editor on 2026-09-19 (before the ledger existed). File is byte-identical to what was pasted (sha256[:16] a2f2c5a4a4deca9c).
  ('20260921000100', 'policy_storage_suppliers', 'policy', '2026-09-19 00:00:00+00', 'chris (SQL Editor)',
   'Batch 2a file 07: storage.objects policies b2a_sup_select/insert/delete on suppliers-private/public. Verified in Production.'),

  -- Baseline: describes the 8 Quotation tables that already exist in Production. Registered WITHOUT executing it.
  -- Generated from the read-only catalog snapshot of 2026-09-25; replay-tested on a scratch DB (schema identical to the snapshot).
  ('20260920000040', 'baseline_40_quotation_bs', 'baseline', now(), 'chris',
   'quotation_records/items, supplier_quotes/items, service_categories/catalog_items/quotes/quote_items. RLS/policies/grants recorded as-is (Security Audit SA-Q1..Q4).')

on conflict (version) do nothing;

-- ── To be added at S2–S4 (do NOT uncomment now) ────────────────────────────────────────────────
-- Baseline files (generated from Production `pg_dump --schema-only`, replay-tested on a scratch DB) are registered here as kind='baseline'
-- WITHOUT executing them, e.g.:
--   ('20260920000010', 'baseline_00_helpers',      'baseline', now(), 'chris', 'has_module(), is_active_admin(), ...'),
--   ('20260920000020', 'baseline_10_core_crm',     'baseline', now(), 'chris', ...),
--   ... one row per baseline file.
--
-- One-off data fixes are registered as kind='data_fix' ONLY once it is confirmed they ran in Production:
--   ('20260915000000', 'transactions_cleanup', 'data_fix', '<date it ran>', 'chris', 'ops/data-fixes/20260915_transactions_cleanup.sql — 8932 rows -> 8')
--   NOT confirmed today: Production has 7 rows, the script's own guard requires 8, so the count proves nothing. Use ops/data-fixes/verify_20260915_transactions_cleanup.sql
--   and the SQL Editor history; register it only after that.
