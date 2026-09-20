-- ROLLBACK of 20260921000300_retire_icare_snapshots_and_service_receivable_refs.sql — PREPARED, NOT EXECUTED. Idempotent.
--
-- WHAT THIS CAN AND CANNOT UNDO
--   * service_receivable_refs: the table was empty (0 rows) and had been created by hand (no DDL in Git); the feature was removed from the app.
--     There is no data to restore and it is NOT recreated. If the invoice-link feature is ever rebuilt, design its table in a new migration.
--   * icare_snapshots: once dropped, its content (the old iCare KV snapshot) is NOT recoverable and no recovery is guaranteed
--     (no JSON archive was kept, by decision; the 3 internal tasks live on in executive_tasks, batch 605ada97-dae5-4cc5-ab88-920dbbb54f1e).
--     This file only re-creates the EMPTY table structure that the retired quick-api Edge Function used (id text primary key, data jsonb,
--     updated_at timestamptz) with RLS enabled and no policies, i.e. reachable only with the service role — so an old deployment of the
--     function could be redeployed from the archived GitHub repo chenhuirong04-ui/deal if ever wanted. It restores NO data.

create table if not exists public.icare_snapshots (
  id         text primary key,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.icare_snapshots enable row level security;

do $$
begin
  if to_regclass('ops.migration_ledger') is not null then
    delete from ops.migration_ledger where version = '20260921000300';
  end if;
end $$;
