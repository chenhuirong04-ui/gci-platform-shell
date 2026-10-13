-- GCI CRM — customer files / compliance / persons owned by the unified CRM customer (crm_customers.id).
-- Adds a nullable crm_customer_id to the three existing Business Solutions tables. Every row has exactly ONE owner:
--   customer_id     → service_customers.id  (historical Business Solutions rows — untouched, never back-filled or merged)
--   crm_customer_id → crm_customers.id      (new files uploaded from the CRM customer drawer / new-customer form)
-- A compliance item linked to a document must have the same owner as that document (trigger), so files never cross customers.
-- No row, file, path, RLS policy or other table is changed. RLS: the existing active-staff policies are row-level and cover the
-- new column. Storage: same bucket service-customer-documents; CRM files go under the crm-customers/<id>/ prefix.
-- Idempotent (safe to re-run). Rollback: rollbacks/20261013140000_bs_customer_files_crm_customer_link.rollback.sql

-- ── STEP 0 — before snapshot (read-only; run separately, keep the output) ──
-- select table_name, column_name, data_type from information_schema.columns
--   where table_schema = 'public' and column_name in ('customer_id', 'crm_customer_id')
--     and table_name in ('service_customer_documents','service_customer_compliance_items','service_customer_persons') order by 1, 2;
-- select 'documents' t, count(*) all_rows, count(*) filter (where customer_id is null) no_owner from public.service_customer_documents
-- union all select 'compliance', count(*), count(*) filter (where customer_id is null) from public.service_customer_compliance_items
-- union all select 'persons', count(*), count(*) filter (where customer_id is null) from public.service_customer_persons;

begin;

-- ── 1. Preflight ──
do $$
declare t text;
begin
  if to_regclass('public.crm_customers') is null then
    raise exception 'preflight failed: public.crm_customers does not exist';
  end if;
  foreach t in array array['service_customer_documents', 'service_customer_compliance_items', 'service_customer_persons'] loop
    if to_regclass('public.' || t) is null then
      raise exception 'preflight failed: public.% does not exist', t;
    end if;
    if exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = t and column_name = 'crm_customer_id' and data_type <> 'uuid') then
      raise exception 'preflight failed: public.%.crm_customer_id exists with a non-uuid type', t;
    end if;
  end loop;
end $$;

-- ── 2. Column + FK + index on each table ──
alter table public.service_customer_documents        add column if not exists crm_customer_id uuid null;
alter table public.service_customer_compliance_items add column if not exists crm_customer_id uuid null;
alter table public.service_customer_persons          add column if not exists crm_customer_id uuid null;

alter table public.service_customer_documents        drop constraint if exists scd_crm_customer_fk;
alter table public.service_customer_documents        add  constraint scd_crm_customer_fk  foreign key (crm_customer_id) references public.crm_customers(id) on delete restrict;
alter table public.service_customer_compliance_items drop constraint if exists scci_crm_customer_fk;
alter table public.service_customer_compliance_items add  constraint scci_crm_customer_fk foreign key (crm_customer_id) references public.crm_customers(id) on delete restrict;
alter table public.service_customer_persons          drop constraint if exists scp_crm_customer_fk;
alter table public.service_customer_persons          add  constraint scp_crm_customer_fk  foreign key (crm_customer_id) references public.crm_customers(id) on delete restrict;

create index if not exists idx_scd_crm_customer  on public.service_customer_documents(crm_customer_id);
create index if not exists idx_scci_crm_customer on public.service_customer_compliance_items(crm_customer_id);
create index if not exists idx_scp_crm_customer  on public.service_customer_persons(crm_customer_id);

-- ── 3. Exactly one owner per row. NOT VALID = enforced for every new/updated row; existing rows are then validated
--      only if they already comply (a historical row without any owner is left as it is, never rewritten). ──
alter table public.service_customer_documents        drop constraint if exists scd_one_owner;
alter table public.service_customer_documents        add  constraint scd_one_owner  check (num_nonnulls(customer_id, crm_customer_id) = 1) not valid;
alter table public.service_customer_compliance_items drop constraint if exists scci_one_owner;
alter table public.service_customer_compliance_items add  constraint scci_one_owner check (num_nonnulls(customer_id, crm_customer_id) = 1) not valid;
alter table public.service_customer_persons          drop constraint if exists scp_one_owner;
alter table public.service_customer_persons          add  constraint scp_one_owner  check (num_nonnulls(customer_id, crm_customer_id) = 1) not valid;

do $$
begin
  if not exists (select 1 from public.service_customer_documents where num_nonnulls(customer_id, crm_customer_id) <> 1) then
    alter table public.service_customer_documents validate constraint scd_one_owner;
  end if;
  if not exists (select 1 from public.service_customer_compliance_items where num_nonnulls(customer_id, crm_customer_id) <> 1) then
    alter table public.service_customer_compliance_items validate constraint scci_one_owner;
  end if;
  if not exists (select 1 from public.service_customer_persons where num_nonnulls(customer_id, crm_customer_id) <> 1) then
    alter table public.service_customer_persons validate constraint scp_one_owner;
  end if;
end $$;

-- ── 4. A compliance item's document must belong to the same customer (no cross-customer filing) ──
create or replace function public.scci_document_same_owner()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_customer uuid;
  v_crm uuid;
begin
  if new.document_id is null then
    return new;
  end if;
  select d.customer_id, d.crm_customer_id into v_customer, v_crm
    from public.service_customer_documents d where d.id = new.document_id;
  if not found then
    return new; -- FK on document_id reports a missing document
  end if;
  if v_customer is distinct from new.customer_id or v_crm is distinct from new.crm_customer_id then
    raise exception 'compliance item and its document belong to different customers' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_scci_document_same_owner on public.service_customer_compliance_items;
create trigger trg_scci_document_same_owner
  before insert or update of document_id, customer_id, crm_customer_id on public.service_customer_compliance_items
  for each row execute function public.scci_document_same_owner();

-- ── 5. Ledger self-registration ──
do $$
begin
  if to_regclass('ops.migration_ledger') is not null then
    insert into ops.migration_ledger (version, name, kind, notes)
    values ('20261013140000', 'bs_customer_files_crm_customer_link', 'schema',
            'Nullable crm_customer_id (FK crm_customers, restrict) on the 3 service customer file tables; one-owner check; same-owner trigger')
    on conflict (version) do nothing;
  end if;
end $$;

commit;

-- ── STEP 6 — after verification (read-only) ──
-- (a) columns: 3 rows, uuid
-- select table_name, data_type from information_schema.columns where table_schema = 'public' and column_name = 'crm_customer_id'
--   and table_name in ('service_customer_documents','service_customer_compliance_items','service_customer_persons');
-- (b) constraints: 3 FKs + 3 one-owner checks (convalidated true unless a historical row had no owner)
-- select conrelid::regclass, conname, convalidated from pg_constraint
--   where conname in ('scd_crm_customer_fk','scci_crm_customer_fk','scp_crm_customer_fk','scd_one_owner','scci_one_owner','scp_one_owner') order by 1, 2;
-- (c) trigger present
-- select tgname from pg_trigger where tgname = 'trg_scci_document_same_owner';
-- (d) historical data unchanged: compare with STEP 0 (all rows still on customer_id; crm_customer_id all NULL right after applying)
-- select 'documents' t, count(*), count(customer_id), count(crm_customer_id) from public.service_customer_documents
-- union all select 'compliance', count(*), count(customer_id), count(crm_customer_id) from public.service_customer_compliance_items
-- union all select 'persons', count(*), count(customer_id), count(crm_customer_id) from public.service_customer_persons;
-- (e) RLS unchanged (still the *_staff_* policies)
-- select tablename, policyname from pg_policies where schemaname = 'public'
--   and tablename in ('service_customer_documents','service_customer_compliance_items','service_customer_persons') order by 1, 2;
