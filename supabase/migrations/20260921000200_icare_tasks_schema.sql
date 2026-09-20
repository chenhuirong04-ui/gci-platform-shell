-- GCI Platform — iCare internal tasks: schema for the one-off migration (TASKS ONLY, additive)
-- PREPARED, NOT EXECUTED. Idempotent (safe to run twice). Rollback: supabase/rollbacks/20260921000200_icare_tasks_schema.rollback.sql
--
-- Scope decision (Chris, 2026-09): the ONLY iCare data that moves is the 3 internal tasks -> executive_tasks.
-- 19 projects, 6 projectFollowUps and 21 history rows are NOT migrated, so this file touches NOTHING on crm_projects, crm_followups or
-- crm_customers. (An earlier proposal that also extended those tables was dropped and is not part of the execution chain.)
--
-- Adds to executive_tasks: owner, blocker, logs jsonb, legacy_source, legacy_id, legacy_payload jsonb, migration_batch_id
-- Adds: public.data_migration_batches (rollback handle for the batch)
--
-- legacy_source used by the data migration: 'icare:ICARE_INTERNAL_TASKS_V1'

-- ── 0. Preflight: fail loudly instead of letting IF NOT EXISTS skip a column that already exists with a different type ──
do $$
declare r record;
begin
  if to_regclass('public.executive_tasks') is null then
    raise exception 'preflight failed: table public.executive_tasks does not exist';
  end if;
  for r in
    select * from (values
      ('owner', 'text'), ('blocker', 'text'), ('logs', 'jsonb'), ('legacy_source', 'text'),
      ('legacy_id', 'text'), ('legacy_payload', 'jsonb'), ('migration_batch_id', 'uuid')
    ) v(c, ty)
  loop
    if exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'executive_tasks' and column_name = r.c and data_type <> r.ty) then
      raise exception 'preflight failed: public.executive_tasks.% already exists with a different type than expected (%)', r.c, r.ty;
    end if;
  end loop;
end $$;

-- ── 1. Migration batch ledger ──
create table if not exists public.data_migration_batches (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  source         text not null,
  status         text not null default 'running' check (status in ('running', 'completed', 'rolled_back', 'failed')),
  counts         jsonb not null default '{}'::jsonb,
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  rolled_back_at timestamptz,
  notes          text
);
alter table public.data_migration_batches enable row level security;   -- deliberately no policy: service role / SQL Editor only
revoke all on public.data_migration_batches from anon, authenticated;

-- ── 2. executive_tasks ──
alter table public.executive_tasks
  add column if not exists owner              text,
  add column if not exists blocker            text,
  add column if not exists logs               jsonb not null default '[]'::jsonb,
  add column if not exists legacy_source      text,
  add column if not exists legacy_id          text,
  add column if not exists legacy_payload     jsonb,
  add column if not exists migration_batch_id uuid references public.data_migration_batches (id);

create unique index if not exists uq_executive_tasks_legacy on public.executive_tasks (legacy_source, legacy_id) where legacy_id is not null;
create index        if not exists idx_et_batch              on public.executive_tasks (migration_batch_id)       where migration_batch_id is not null;

-- ── 3. Ledger self-registration ──
do $$
begin
  if to_regclass('ops.migration_ledger') is not null then
    insert into ops.migration_ledger (version, name, kind, notes)
    values ('20260921000200', 'icare_tasks_schema', 'schema', 'executive_tasks owner/blocker/logs/legacy_* + data_migration_batches; no crm_* change')
    on conflict (version) do nothing;
  end if;
end $$;
