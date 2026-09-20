-- GCI Platform — retire the last Deal / iCare tables: public.icare_snapshots and public.service_receivable_refs
-- PREPARED, NOT EXECUTED. Idempotent (safe to run twice). Rollback: supabase/rollbacks/20260921000300_retire_icare_snapshots_and_service_receivable_refs.rollback.sql
--
-- Decision (Chris, 2026-09): the old Deal / iCare chain is retired and will be rebuilt from scratch if it is ever needed again.
--   * public.icare_snapshots        — the single-row (id 'v1') KV snapshot written by the retired quick-api Edge Function.
--                                      Its 3 internal tasks were migrated to executive_tasks (batch 605ada97-dae5-4cc5-ab88-920dbbb54f1e);
--                                      projects / follow-ups / history were deliberately NOT migrated. No JSON archive was kept (decision).
--   * public.service_receivable_refs — empty table (0 rows) of the removed invoice-link feature; created by hand, never in Git.
-- Runtime callers: none (apps/ modules/ packages/ api/ contain no reference; Commit 0c8030e removed the last ones; Vercel `deal` deleted;
-- GitHub `deal` archived; quick-api / ICARE_GATE_PASSWORD removed in Supabase).
--
-- Touches ONLY these two tables (+ the ledger row). No other schema, no RLS on any other table, no executive_tasks, no crm_*.
-- DROP without CASCADE on purpose: if anything in the database still depends on either table (foreign key, view), the whole
-- transaction fails and nothing is dropped.

begin;

-- ── 0. Preflight guards: refuse to drop something that is not what the decision was made about ──
do $$
declare n bigint;
begin
  if to_regclass('public.service_receivable_refs') is not null then
    execute 'select count(*) from public.service_receivable_refs' into n;
    if n <> 0 then
      raise exception 'preflight failed: service_receivable_refs has % row(s); it was expected to be empty. Nothing dropped.', n;
    end if;
  end if;

  if to_regclass('public.icare_snapshots') is not null then
    execute 'select count(*) from public.icare_snapshots' into n;
    if n > 1 then
      raise exception 'preflight failed: icare_snapshots has % rows; expected at most 1 (id v1). Nothing dropped.', n;
    end if;
    execute 'select count(*) from public.icare_snapshots where id <> ''v1''' into n;
    if n <> 0 then
      raise exception 'preflight failed: icare_snapshots holds a row whose id is not v1. Nothing dropped.';
    end if;
  end if;
end $$;

-- ── 1. Drop (no CASCADE) ──
drop table if exists public.icare_snapshots;
drop table if exists public.service_receivable_refs;

-- ── 2. Ledger self-registration ──
do $$
begin
  if to_regclass('ops.migration_ledger') is not null then
    insert into ops.migration_ledger (version, name, kind, notes)
    values ('20260921000300', 'retire_icare_snapshots_and_service_receivable_refs', 'schema',
            'DROP icare_snapshots (1 row, tasks already in executive_tasks; no archive kept) + service_receivable_refs (0 rows). No other change.')
    on conflict (version) do nothing;
  end if;
end $$;

commit;
