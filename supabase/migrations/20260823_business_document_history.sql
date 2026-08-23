-- GCI Executive Desk — GIA Business History / Document Timeline V1
-- Run in Supabase SQL Editor (project: gci-trade-260521 / efrkvwhzpgahjgfukjth)
-- A cross-module business document timeline (QUOTATION/CONTRACT/PROPOSAL/
-- OTHER) for a customer/entity — "which version, what amount, what
-- status, when, is this the current one". This does NOT replace
-- quotation_records (trade/custom quote records), service_quotes
-- (Business Solutions quote records), or gia_file_registry (the general
-- file-search index) — it's a summary timeline layer alongside all three,
-- written only by GIA's own chat-confirm flow (a later round). No CRUD
-- helper, no UI wiring, no supersede trigger — schema only.
-- Additive only: no existing table touched, no existing column changed.

create table if not exists business_document_history (
  id               uuid primary key default gen_random_uuid(),
  customer_id      uuid references crm_customers(id) on delete set null, -- crm_customers.id is uuid; nullable exactly like gia_file_registry.customer_id, for the "not yet matched to a CRM customer" case
  entity_name      text not null,        -- what the user actually said ("蒲总") — the only reliable identifier when customer_id is null
  document_type    text not null,
  title            text not null,
  version_no       integer,
  version_label    text,
  amount           numeric,
  currency         text,
  status           text not null default 'CURRENT',
  document_date    timestamptz,
  sent_at          timestamptz,
  valid_until      timestamptz,
  is_current       boolean not null default true, -- supersede (old version -> false) is handled by application code, not a trigger — see header note
  notes            text,
  drive_file_id    text,
  drive_file_name  text,
  drive_folder_id  text,
  drive_url        text,
  source           text not null default 'chat_confirm',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint business_document_history_type_check
    check (document_type in ('QUOTATION', 'CONTRACT', 'PROPOSAL', 'OTHER'))
);

alter table business_document_history enable row level security;

-- Matches gia_file_registry's own policy exactly (GCI Home/GIA tables use
-- an authenticated Supabase session, unlike Business Solutions' anon-only
-- bsCloud.ts) — authenticated select/insert/update, no delete policy.
create policy "business_document_history_select"
  on business_document_history for select
  using (auth.uid() is not null);

create policy "business_document_history_insert"
  on business_document_history for insert
  with check (auth.uid() is not null);

create policy "business_document_history_update"
  on business_document_history for update
  using  (auth.uid() is not null)
  with check (auth.uid() is not null);

create index if not exists idx_bdh_customer_id    on business_document_history(customer_id);
create index if not exists idx_bdh_entity_name    on business_document_history(entity_name);
create index if not exists idx_bdh_document_type  on business_document_history(document_type);
create index if not exists idx_bdh_is_current     on business_document_history(is_current);
create index if not exists idx_bdh_created_at     on business_document_history(created_at);
create index if not exists idx_bdh_customer_type_current
  on business_document_history(customer_id, document_type, is_current);
