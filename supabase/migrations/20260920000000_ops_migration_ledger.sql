-- GCI Platform — ops.migration_ledger
-- PREPARED, NOT EXECUTED. Idempotent. Rollback: supabase/rollbacks/20260920000000_ops_migration_ledger.rollback.sql
--
-- Purpose: the missing "which migration files have actually been executed in Production" record.
-- Every file in supabase/migrations/ ends with a self-registering INSERT into this table, so pasting a file
-- into the Supabase SQL Editor registers it automatically. Files executed before this table existed are
-- registered once by supabase/ops/ledger-backfill.sql (marks them applied — does NOT run their content).
--
-- Schema `ops` is not exposed through the API and both API roles are revoked; RLS is on with no policy,
-- so only the service role / SQL Editor can read or write it.

create schema if not exists ops;

create table if not exists ops.migration_ledger (
  version     text primary key,                                   -- 14-digit timestamp of the file name
  name        text not null,                                      -- file name without version / extension
  kind        text not null check (kind in ('baseline', 'schema', 'policy', 'data_fix', 'ops')),
  sha256      text,                                               -- filled by tools/migration-checksums.mjs output
  applied_at  timestamptz not null default now(),
  applied_by  text default current_user,
  notes       text
);

alter table ops.migration_ledger enable row level security;      -- deliberately no policy

revoke all on schema ops from anon, authenticated;
revoke all on all tables in schema ops from anon, authenticated;

-- self-register (guarded so the file also works if this table is ever dropped)
do $$
begin
  if to_regclass('ops.migration_ledger') is not null then
    insert into ops.migration_ledger (version, name, kind, notes)
    values ('20260920000000', 'ops_migration_ledger', 'schema', 'creates the ledger itself')
    on conflict (version) do nothing;
  end if;
end $$;
