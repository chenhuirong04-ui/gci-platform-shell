-- ROLLBACK of 20260926000100_knowledge_schema.sql — PREPARED, NOT EXECUTED. Idempotent.
--
-- Refuses to run while any knowledge_* table holds a row: dropping them would destroy the migrated Knowledge Hub content.
-- Roll the data back first (delete the imported rows by legacy_source in a guarded data-fix), then run this.
-- Touches only the objects created by the migration.

do $$
declare
  t text;
  n bigint;
begin
  foreach t in array array['knowledge_taxonomy', 'knowledge_jurisdictions', 'knowledge_sources', 'knowledge_items', 'knowledge_rules',
                           'knowledge_activities', 'knowledge_questions'] loop
    if to_regclass('public.' || t) is not null then
      execute format('select count(*) from public.%I', t) into n;
      if n > 0 then
        raise exception 'rollback refused: public.% still has % row(s)', t, n;
      end if;
    end if;
  end loop;
end $$;

drop function if exists public.knowledge_search(text, int);
drop table if exists public.knowledge_questions;
drop table if exists public.knowledge_activities;
drop table if exists public.knowledge_rules;
drop table if exists public.knowledge_items;
drop table if exists public.knowledge_sources;
drop table if exists public.knowledge_jurisdictions;
drop table if exists public.knowledge_taxonomy;
drop function if exists public.knowledge_can_read(text);

do $$
begin
  if to_regclass('ops.migration_ledger') is not null then
    delete from ops.migration_ledger where version = '20260926000100';
  end if;
end $$;
