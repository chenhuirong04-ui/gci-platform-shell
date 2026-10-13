-- Rollback of 20261013140000_bs_customer_files_crm_customer_link.sql.
-- Refuses to run once any row is owned by a CRM customer: dropping the column would orphan those files and records.
begin;

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'service_customer_documents' and column_name = 'crm_customer_id')
     and (exists (select 1 from public.service_customer_documents where crm_customer_id is not null)
       or exists (select 1 from public.service_customer_compliance_items where crm_customer_id is not null)
       or exists (select 1 from public.service_customer_persons where crm_customer_id is not null)) then
    raise exception 'Rollback refused: rows owned by a CRM customer exist (crm_customer_id is not null). Nothing changed.';
  end if;
end $$;

drop trigger if exists trg_scci_document_same_owner on public.service_customer_compliance_items;
drop function if exists public.scci_document_same_owner();

alter table public.service_customer_documents        drop constraint if exists scd_one_owner;
alter table public.service_customer_compliance_items drop constraint if exists scci_one_owner;
alter table public.service_customer_persons          drop constraint if exists scp_one_owner;

alter table public.service_customer_documents        drop column if exists crm_customer_id;  -- also drops FK + index
alter table public.service_customer_compliance_items drop column if exists crm_customer_id;
alter table public.service_customer_persons          drop column if exists crm_customer_id;

do $$
begin
  if to_regclass('ops.migration_ledger') is not null then
    delete from ops.migration_ledger where version = '20261013140000';
  end if;
end $$;

commit;
