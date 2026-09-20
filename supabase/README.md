# supabase/ — how database changes are made in this repo

Production is changed by hand in the Supabase SQL Editor. This folder is the **record** of that, so Production can be rebuilt from Git.
Status: nothing in `migrations/` has been executed in Production except the files marked *executed* (bank_accounts, and Batch 2a file 07).

## Layout

| Folder | Holds | Executed in Production? |
|---|---|---|
| `migrations/` | The **replayable** chain: 14-digit-versioned, additive schema/policy files. Data changes are forbidden here (`tools/check-migrations.mjs` rejects them). | one file, see below |
| `rollbacks/` | One `<version>_<name>.rollback.sql` per non-baseline migration | no |
| `migrations/` (8-digit files) | The old pre-ledger files. They stay where they are for now (the checker only warns about them); moving them to `migrations_legacy/` is a later, separate step. | historical |
| `ops/data-fixes/` | One-off Production data changes (guarded scripts). **Never replayed.** | see each file |
| `ops/ledger-backfill.sql` | Marks work done before the ledger existed as applied | no |
| `proposals/` | Prepared, **not executed**: `icare/` (final scope: 3 internal tasks only) | no |

Already executed: `migrations/20260921000100_policy_storage_suppliers.sql` (Batch 2a file 07, byte-identical to what was pasted; sha256[:16] `a2f2c5a4a4deca9c`).

## File naming

`YYYYMMDDHHMMSS_<area>_<verb>_<object>.sql`, lower snake case, 14-digit version unique across the folder.
Baseline files use the series `202609200000NN_baseline_<NN>_<domain>.sql` (sorted before everything else): `00_helpers` (extensions, `has_module()`, `is_active_admin()`), `10_core_crm`, `20_executive`, `30_suppliers` (parent table first), `40_quotation_bs`, `50_trade_finance` (`bank_accounts`, `transactions`, … before `supplier_payables`), `60_documents_misc`, `70_storage_buckets`, `80_policies`, `90_grants`.
The rollback of `X.sql` is `rollbacks/X.rollback.sql`. Baselines have none (they are regenerated, never rolled back).

## Rules for every migration file

1. **Idempotent** — `create … if not exists`, `add column if not exists`, `drop policy if exists` + `create policy`, `create or replace function`.
2. **No business-data DML.** Only `ops.migration_ledger` and `storage.buckets` may be written. Everything else is a data fix.
3. **Preflight guard** when it touches an existing table: fail loudly if a column already exists with a different type (see `20260921000200`).
4. **Self-registers** in `ops.migration_ledger` at the end, inside a `to_regclass(...) is not null` guard so the file also runs before the ledger exists.
5. **Has a rollback file** that refuses to run if it would destroy data.

## The ledger

`ops.migration_ledger(version, name, kind, sha256, applied_at, applied_by, notes)` — created by `20260920000000`. It is the source of truth for "what ran in Production"; the "NOT YET EXECUTED" headers in the legacy files are stale and must not be trusted.
Baseline versions are inserted **without running them** (they describe what already exists). `node tools/check-migrations.mjs --sums` prints the `sha256` UPDATE statements.

## Standard flow for any schema change from now on

1. Write the migration + rollback in a branch (never paste SQL into the dashboard first; an emergency fix gets its file within 24 h).
2. `node tools/check-migrations.mjs` must print `OK`.
3. Replay on a scratch database (empty Supabase branch or local Postgres) and diff against a Production `pg_dump --schema-only` — the difference must be exactly the new change.
4. Take a read-only snapshot of the affected objects ((a read-only `select` of the current policies / rows)) and keep the output.
5. Review, then paste the file **unchanged** into the SQL Editor and run it. The self-register line writes the ledger row.
6. Run the verification queries, record `sha256` in the ledger, report.
7. Data changes: a guarded script in `ops/data-fixes/` (pre-flight and post-flight guards, one transaction), executed once, then registered with `kind='data_fix'`.

## Hard rule

`ops/data-fixes/20260915_transactions_cleanup.sql` (and `20260915_crm_customers_notion_migration.sql` after the freeze) must **never** be placed in `migrations/`: they delete/update production rows and abort unless the table holds exactly the row counts they were written against.
