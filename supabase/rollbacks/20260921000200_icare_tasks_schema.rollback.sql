-- ROLLBACK of 20260921000200_icare_tasks_schema.sql — PREPARED, NOT EXECUTED. Idempotent.
--
-- ORDER MATTERS: if the tasks were migrated, run supabase/proposals/icare/20_rollback_batch.sql FIRST.
-- This file refuses to run while any migrated / traced task still exists, because dropping the columns would silently destroy the
-- legacy_id / legacy_payload that make those rows traceable. It touches executive_tasks and data_migration_batches only.

do $$
declare n int := 0;
begin
  if to_regclass('public.executive_tasks') is not null
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'executive_tasks' and column_name = 'legacy_id') then
    execute 'select count(*) from public.executive_tasks where legacy_id is not null or migration_batch_id is not null' into n;
  end if;
  if n > 0 then
    raise exception 'rollback refused: % executive_tasks row(s) still carry legacy / batch links. Run proposals/icare/20_rollback_batch.sql first.', n;
  end if;
end $$;

drop index if exists public.idx_et_batch;
drop index if exists public.uq_executive_tasks_legacy;

alter table public.executive_tasks
  drop column if exists migration_batch_id, drop column if exists legacy_payload, drop column if exists legacy_id,
  drop column if exists legacy_source, drop column if exists logs, drop column if exists blocker, drop column if exists owner;

-- the batch table is dropped only when it holds no batch history (audit trail)
do $$
declare n int;
begin
  if to_regclass('public.data_migration_batches') is not null then
    select count(*) into n from public.data_migration_batches;
    if n > 0 then
      raise notice 'data_migration_batches kept: it holds % batch record(s) (audit trail). Drop it manually once you no longer need them.', n;
    else
      drop table public.data_migration_batches;
    end if;
  end if;
  if to_regclass('ops.migration_ledger') is not null then
    delete from ops.migration_ledger where version = '20260921000200';
  end if;
end $$;
