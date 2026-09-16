-- GCI Business Solutions — Service Customer lifecycle (archive) + delete guard
-- Idempotent: safe to re-run. Does not alter any existing table besides adding columns.
-- Run in Supabase SQL Editor.

-- ── 1. Lifecycle field ──────────────────────────────────────────────────────
alter table service_customers
  add column if not exists is_active boolean not null default true,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_reason text;

create index if not exists idx_sc_is_active on service_customers(is_active);

-- ── 2. DB-level delete guard ─────────────────────────────────────────────────
-- Blocks physical delete of a service_customers row that still has any linked
-- quote / document / person / compliance record. Archive (is_active=false) is
-- always allowed; only a customer with zero linked records in all four tables
-- can be physically deleted. This is a backstop behind the app-level check in
-- bsCloud.ts (customerHasLinkedRecords) — it protects Production data even if
-- a delete is ever issued outside the app (SQL Editor, another client, etc).
create or replace function prevent_service_customer_delete_with_links()
returns trigger
language plpgsql
security invoker
as $$
declare
  v_count integer;
begin
  select count(*) into v_count from service_quotes where customer_id = old.id;
  if v_count > 0 then
    raise exception 'Cannot delete service_customers %: % linked service_quotes row(s) exist. Archive the customer instead.', old.id, v_count;
  end if;

  select count(*) into v_count from service_customer_documents where customer_id = old.id;
  if v_count > 0 then
    raise exception 'Cannot delete service_customers %: % linked service_customer_documents row(s) exist. Archive the customer instead.', old.id, v_count;
  end if;

  select count(*) into v_count from service_customer_persons where customer_id = old.id;
  if v_count > 0 then
    raise exception 'Cannot delete service_customers %: % linked service_customer_persons row(s) exist. Archive the customer instead.', old.id, v_count;
  end if;

  select count(*) into v_count from service_customer_compliance_items where customer_id = old.id;
  if v_count > 0 then
    raise exception 'Cannot delete service_customers %: % linked service_customer_compliance_items row(s) exist. Archive the customer instead.', old.id, v_count;
  end if;

  return old;
end;
$$;

drop trigger if exists trg_prevent_service_customer_delete_with_links on service_customers;
create trigger trg_prevent_service_customer_delete_with_links
  before delete on service_customers
  for each row execute function prevent_service_customer_delete_with_links();
