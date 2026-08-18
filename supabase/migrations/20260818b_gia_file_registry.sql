-- GCI Executive Desk — Task 17: GIA File Inbox & Smart Library — File Registry
-- Run in Supabase SQL Editor (project: gci-trade-260521 / efrkvwhzpgahjgfukjth)
-- Metadata only — never stores the file itself. The file bytes live in
-- Google Drive; this table is just an index so GIA can find them again by
-- description without a full-text Drive search. Additive only — no drop/
-- delete/truncate, no change to any existing table. No delete policy is
-- added; old versions are never removed, only flipped to is_current=false.

create table if not exists gia_file_registry (
  id             uuid primary key default gen_random_uuid(),
  file_name      text not null,             -- original filename as uploaded
  display_name   text not null,             -- human label GIA/Chris confirmed, e.g. "Highway 营业执照"
  document_type  text not null,             -- e.g. license | vat_trn | company_profile | catalog | contract_template | quote_template | agreement | brand_asset | bank_details | other
  business_area  text,                      -- e.g. 25H_AI | TRADE | WORKFORCE | COMPANY_ADMIN | OTHER
  company_name   text,                      -- e.g. GCI | Highway | a client/supplier name
  customer_id    uuid references crm_customers(id) on delete set null,
  drive_file_id  text not null,
  drive_url      text not null,
  drive_folder   text,                      -- human-readable target folder path/name, for display only
  is_current     boolean not null default true,
  tags           text[],
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table gia_file_registry enable row level security;

create policy "gia_file_registry_select"
  on gia_file_registry for select
  using (auth.uid() is not null);

create policy "gia_file_registry_insert"
  on gia_file_registry for insert
  with check (auth.uid() is not null);

create policy "gia_file_registry_update"
  on gia_file_registry for update
  using  (auth.uid() is not null)
  with check (auth.uid() is not null);

create index if not exists idx_gfr_document_type on gia_file_registry(document_type);
create index if not exists idx_gfr_company_name  on gia_file_registry(company_name);
create index if not exists idx_gfr_customer_id   on gia_file_registry(customer_id);
create index if not exists idx_gfr_is_current    on gia_file_registry(is_current);
