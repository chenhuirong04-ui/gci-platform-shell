-- GCI Production schema inventory — READ-ONLY (SELECTs only). Run each block separately in the Supabase SQL Editor and paste the results.
-- [Q1] tables / views: RLS, policy/index/trigger counts, anon/authenticated privileges, approx rows
select c.relname as tbl, case c.relkind when 'r' then 'table' when 'p' then 'partitioned' when 'v' then 'view' else 'matview' end as kind,
       c.relrowsecurity as rls, c.relforcerowsecurity as rls_forced,
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies,
       (select count(*) from pg_indexes i where i.schemaname = 'public' and i.tablename = c.relname) as indexes,
       (select count(*) from pg_trigger t where t.tgrelid = c.oid and not t.tgisinternal) as triggers,
       has_table_privilege('anon', c.oid, 'SELECT') as anon_select,
       has_table_privilege('anon', c.oid, 'INSERT,UPDATE,DELETE') as anon_any_write,
       has_table_privilege('authenticated', c.oid, 'INSERT,UPDATE,DELETE') as auth_any_write,
       coalesce(s.n_live_tup, 0) as approx_rows
from pg_class c join pg_namespace n on n.oid = c.relnamespace left join pg_stat_user_tables s on s.relid = c.oid
where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm') order by 1;

-- [Q2] every policy (public + storage.objects)
select schemaname, tablename, policyname, cmd, roles::text as roles, permissive,
       left(coalesce(qual, ''), 100) as using_expr, left(coalesce(with_check, ''), 100) as check_expr
from pg_policies where schemaname in ('public', 'storage') order by 1, 2, 3;

-- [Q3] functions (md5 of the definition lets me diff against the repo without you pasting code)
select p.proname as fn, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef as security_definer,
       coalesce(p.proconfig::text, '') as config, md5(pg_get_functiondef(p.oid)) as def_md5,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f' order by 1;

-- [Q4] triggers and indexes
select 'trigger' as kind, tgrelid::regclass::text as tbl, tgname as name, pg_get_triggerdef(t.oid) as def
from pg_trigger t where not tgisinternal and tgrelid::regclass::text not like 'storage.%' and tgrelid::regclass::text not like 'auth.%'
union all
select 'index', tablename, indexname, indexdef from pg_indexes where schemaname = 'public' order by 1, 2, 3;

-- [Q5] storage buckets, migration ledger, extensions
select 'bucket' as kind, id as name, 'public=' || public::text || ' limit=' || coalesce(file_size_limit::text, '-') as detail from storage.buckets
union all select 'cli_ledger', coalesce(to_regclass('supabase_migrations.schema_migrations')::text, 'NONE'), ''
union all select 'extension', extname, extversion from pg_extension where extname not in ('plpgsql') order by 1, 2;

-- [Q6] columns of the tables the iCare migration writes to (drift check against the repo migrations)
select table_name, ordinal_position as pos, column_name, data_type, is_nullable, left(coalesce(column_default, ''), 40) as col_default
from information_schema.columns
where table_schema = 'public' and table_name in ('executive_tasks', 'crm_projects', 'crm_followups', 'crm_customers', 'crm_contacts', 'icare_snapshots')
order by 1, 2;

-- [Q7] the iCare snapshot: shape and sizes only — no business content is selected
select id, updated_at, pg_column_size(data) as bytes,
       (select jsonb_agg(k order by k) from jsonb_object_keys(data->'kv') k) as kv_keys,
       jsonb_array_length(data->'kv'->'ICARE_HISTORY_V1') as history, jsonb_array_length(data->'kv'->'ICARE_PROJECTS_V1') as projects,
       jsonb_array_length(data->'kv'->'ICARE_INTERNAL_TASKS_V1') as tasks
from public.icare_snapshots;
