-- GCI CRM — Customer primary type (项目客户 / 批发·小贸易 / 服务类客户)
-- Idempotent, safe to re-run. Nullable — no historical row is auto-classified.
-- Does NOT touch the existing customer_type column (free-text Notion-migrated
-- industry description) or business_type column (GCI internal business-line
-- routing, used by getBusinessLineBreakdown()) — both keep their current,
-- separate meanings untouched.

alter table crm_customers
  add column if not exists customer_primary_type text;

-- Postgres has no "ADD CONSTRAINT IF NOT EXISTS" — this DO block is the
-- idempotent equivalent: skips (no drop, no recreate) if it's already there.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'crm_customers_customer_primary_type_check'
  ) then
    alter table crm_customers
      add constraint crm_customers_customer_primary_type_check
      check (customer_primary_type is null or customer_primary_type in ('project', 'trade', 'services'));
  end if;
end $$;

create index if not exists idx_crm_customers_primary_type on crm_customers(customer_primary_type);
