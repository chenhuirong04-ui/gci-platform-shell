-- GCI Platform — BASELINE 40: Quotation (quotation_*, supplier_quote*, service_*) — 8 tables
-- PREPARED, NOT EXECUTED. Do NOT run against Production: these objects already exist there. This file is the
-- repo record of them so a fresh database can be rebuilt from Git (see supabase/README.md, "Baseline files").
-- Registered in ops.migration_ledger WITHOUT running it, via supabase/ops/ledger-backfill.sql (kind='baseline').
--
-- Source: read-only catalog introspection of efrkvwhzpgahjgfukjth on 2026-09-25
--   (gci_quotation_production_schema_2026-09-25.json). Generated mechanically from that snapshot:
--   column order / types / NOT NULL / defaults, constraint names + definitions, indexes, RLS, policies, triggers, grants.
--
-- Safety: idempotent; no DROP / TRUNCATE / DELETE / UPDATE / INSERT; no business-data DML.
--   * tables: CREATE TABLE IF NOT EXISTS; on an existing table a preflight fails loudly if any column is missing or
--     has a different type (so IF NOT EXISTS never silently hides drift).
--   * indexes: CREATE INDEX IF NOT EXISTS. Policies / triggers / cross-domain FKs: created only when absent (guarded DO blocks).
--   * grants: re-stating Production's existing grants is a no-op there.
--
-- Recorded AS-IS, NOT fixed here (follow-up Security Audit — see end of file): RLS is OFF on quotation_records,
--   quotation_items, supplier_quotes, supplier_quote_items; the 4 service_* tables have RLS ON with a single
--   "anon all" policy (roles {public}, USING true / WITH CHECK true); anon holds ALL privileges on all 8 tables.
--
-- Dependencies: gen_random_uuid(); cross-domain FK targets public.crm_customers, crm_projects, suppliers,
--   supplier_products, supplier_documents, service_customers (FK added only if the target exists — rerun after those
--   baselines); trigger functions public.touch_updated_at() and public.touch_supplier_quotes_updated_at() — their
--   bodies are NOT in the snapshot, so this file does not define them; triggers are attached only if they exist.

-- ── 0. Preflight: existing tables must already match the Production snapshot ─────────────────────────────
do $$
declare r record; actual text;
begin
  for r in
    select * from (values
      ('quotation_records', 'id', 'uuid'),
      ('quotation_records', 'quote_no', 'text'),
      ('quotation_records', 'customer_name', 'text'),
      ('quotation_records', 'project_name', 'text'),
      ('quotation_records', 'deal_id', 'text'),
      ('quotation_records', 'salesperson', 'text'),
      ('quotation_records', 'phone_wa', 'text'),
      ('quotation_records', 'quote_type', 'text'),
      ('quotation_records', 'status', 'text'),
      ('quotation_records', 'source', 'text'),
      ('quotation_records', 'supplier_cost_total', 'numeric(14,2)'),
      ('quotation_records', 'selling_total', 'numeric(14,2)'),
      ('quotation_records', 'profit_total', 'numeric(14,2)'),
      ('quotation_records', 'margin_percent', 'numeric(8,2)'),
      ('quotation_records', 'vat_amount', 'numeric(14,2)'),
      ('quotation_records', 'grand_total', 'numeric(14,2)'),
      ('quotation_records', 'terms_notes', 'text'),
      ('quotation_records', 'pdf_url', 'text'),
      ('quotation_records', 'trade_pi_id', 'text'),
      ('quotation_records', 'created_by', 'text'),
      ('quotation_records', 'quote_date', 'text'),
      ('quotation_records', 'created_at', 'timestamp with time zone'),
      ('quotation_records', 'updated_at', 'timestamp with time zone'),
      ('quotation_records', 'customer_id', 'uuid'),
      ('quotation_records', 'project_id', 'uuid'),
      ('quotation_items', 'id', 'uuid'),
      ('quotation_items', 'quotation_id', 'uuid'),
      ('quotation_items', 'item_name', 'text'),
      ('quotation_items', 'description', 'text'),
      ('quotation_items', 'qty', 'numeric(12,3)'),
      ('quotation_items', 'unit', 'text'),
      ('quotation_items', 'supplier_cost', 'numeric(14,2)'),
      ('quotation_items', 'selling_price', 'numeric(14,2)'),
      ('quotation_items', 'profit_amount', 'numeric(14,2)'),
      ('quotation_items', 'margin_percent', 'numeric(8,2)'),
      ('quotation_items', 'vat_amount', 'numeric(14,2)'),
      ('quotation_items', 'line_total', 'numeric(14,2)'),
      ('quotation_items', 'currency', 'text'),
      ('quotation_items', 'item_notes', 'text'),
      ('quotation_items', 'sort_order', 'integer'),
      ('quotation_items', 'created_at', 'timestamp with time zone'),
      ('supplier_quotes', 'id', 'uuid'),
      ('supplier_quotes', 'supplier_quote_no', 'text'),
      ('supplier_quotes', 'supplier_name', 'text'),
      ('supplier_quotes', 'supplier_contact', 'text'),
      ('supplier_quotes', 'category', 'text'),
      ('supplier_quotes', 'currency', 'text'),
      ('supplier_quotes', 'quote_date', 'text'),
      ('supplier_quotes', 'valid_until', 'text'),
      ('supplier_quotes', 'terms_notes', 'text'),
      ('supplier_quotes', 'uploaded_by', 'text'),
      ('supplier_quotes', 'source_file_name', 'text'),
      ('supplier_quotes', 'status', 'text'),
      ('supplier_quotes', 'total_cost', 'numeric(14,2)'),
      ('supplier_quotes', 'converted_quote_id', 'uuid'),
      ('supplier_quotes', 'created_at', 'timestamp with time zone'),
      ('supplier_quotes', 'updated_at', 'timestamp with time zone'),
      ('supplier_quotes', 'supplier_id', 'uuid'),
      ('supplier_quotes', 'source_document_id', 'uuid'),
      ('supplier_quotes', 'supplier_match_status', 'text'),
      ('supplier_quotes', 'supplier_matched_at', 'timestamp with time zone'),
      ('supplier_quotes', 'supplier_matched_by', 'text'),
      ('supplier_quotes', 'customer_id', 'uuid'),
      ('supplier_quotes', 'project_id', 'uuid'),
      ('supplier_quote_items', 'id', 'uuid'),
      ('supplier_quote_items', 'supplier_quote_id', 'uuid'),
      ('supplier_quote_items', 'item_name', 'text'),
      ('supplier_quote_items', 'description', 'text'),
      ('supplier_quote_items', 'qty', 'numeric(12,3)'),
      ('supplier_quote_items', 'unit', 'text'),
      ('supplier_quote_items', 'supplier_cost', 'numeric(14,2)'),
      ('supplier_quote_items', 'currency', 'text'),
      ('supplier_quote_items', 'notes', 'text'),
      ('supplier_quote_items', 'sort_order', 'integer'),
      ('supplier_quote_items', 'created_at', 'timestamp with time zone'),
      ('supplier_quote_items', 'supplier_product_id', 'uuid'),
      ('service_categories', 'id', 'uuid'),
      ('service_categories', 'name_cn', 'text'),
      ('service_categories', 'name_en', 'text'),
      ('service_categories', 'sort_order', 'integer'),
      ('service_categories', 'active', 'boolean'),
      ('service_catalog_items', 'id', 'uuid'),
      ('service_catalog_items', 'category_id', 'uuid'),
      ('service_catalog_items', 'name_cn', 'text'),
      ('service_catalog_items', 'name_en', 'text'),
      ('service_catalog_items', 'default_unit', 'text'),
      ('service_catalog_items', 'default_billing_type', 'text'),
      ('service_catalog_items', 'sort_order', 'integer'),
      ('service_catalog_items', 'active', 'boolean'),
      ('service_catalog_items', 'description_zh', 'text'),
      ('service_catalog_items', 'description_en', 'text'),
      ('service_catalog_items', 'scope_zh', 'text'),
      ('service_catalog_items', 'scope_en', 'text'),
      ('service_catalog_items', 'deliverables_zh', 'text'),
      ('service_catalog_items', 'deliverables_en', 'text'),
      ('service_catalog_items', 'exclusions_zh', 'text'),
      ('service_catalog_items', 'exclusions_en', 'text'),
      ('service_catalog_items', 'one_time_fee', 'numeric'),
      ('service_catalog_items', 'monthly_fee', 'numeric'),
      ('service_catalog_items', 'annual_fee', 'numeric'),
      ('service_catalog_items', 'default_quantity', 'numeric'),
      ('service_catalog_items', 'default_months', 'integer'),
      ('service_catalog_items', 'default_timeline', 'text'),
      ('service_catalog_items', 'default_payment_terms_zh', 'text'),
      ('service_catalog_items', 'default_payment_terms_en', 'text'),
      ('service_catalog_items', 'minimum_price', 'numeric'),
      ('service_catalog_items', 'allow_price_edit', 'boolean'),
      ('service_catalog_items', 'updated_at', 'timestamp with time zone'),
      ('service_catalog_items', 'currency', 'text'),
      ('service_catalog_items', 'frequency', 'text'),
      ('service_catalog_items', 'is_price_on_request', 'boolean'),
      ('service_catalog_items', 'client_requirements_zh', 'text'),
      ('service_catalog_items', 'client_requirements_en', 'text'),
      ('service_catalog_items', 'notes_zh', 'text'),
      ('service_catalog_items', 'notes_en', 'text'),
      ('service_quotes', 'id', 'uuid'),
      ('service_quotes', 'quote_no', 'text'),
      ('service_quotes', 'customer_name', 'text'),
      ('service_quotes', 'contact_person', 'text'),
      ('service_quotes', 'quote_date', 'date'),
      ('service_quotes', 'currency', 'text'),
      ('service_quotes', 'project_duration', 'text'),
      ('service_quotes', 'payment_terms', 'text'),
      ('service_quotes', 'notes', 'text'),
      ('service_quotes', 'status', 'text'),
      ('service_quotes', 'total_amount', 'numeric'),
      ('service_quotes', 'created_at', 'timestamp with time zone'),
      ('service_quotes', 'updated_at', 'timestamp with time zone'),
      ('service_quotes', 'customer_id', 'uuid'),
      ('service_quotes', 'version', 'integer'),
      ('service_quotes', 'quotation_title', 'text'),
      ('service_quotes', 'service_type', 'text'),
      ('service_quotes', 'valid_until', 'date'),
      ('service_quotes', 'subtotal_one_time', 'numeric'),
      ('service_quotes', 'subtotal_monthly', 'numeric'),
      ('service_quotes', 'subtotal_annual', 'numeric'),
      ('service_quotes', 'discount_type', 'text'),
      ('service_quotes', 'discount_value', 'numeric'),
      ('service_quotes', 'discount_amount', 'numeric'),
      ('service_quotes', 'total_one_time', 'numeric'),
      ('service_quotes', 'monthly_fee', 'numeric'),
      ('service_quotes', 'annual_recurring_amount', 'numeric'),
      ('service_quotes', 'grand_total', 'numeric'),
      ('service_quotes', 'delivery_period', 'text'),
      ('service_quotes', 'exclusions', 'text'),
      ('service_quotes', 'owner', 'text'),
      ('service_quotes', 'sent_at', 'timestamp with time zone'),
      ('service_quotes', 'accepted_at', 'timestamp with time zone'),
      ('service_quote_items', 'id', 'uuid'),
      ('service_quote_items', 'service_quote_id', 'uuid'),
      ('service_quote_items', 'category_name', 'text'),
      ('service_quote_items', 'service_name', 'text'),
      ('service_quote_items', 'description', 'text'),
      ('service_quote_items', 'unit', 'text'),
      ('service_quote_items', 'quantity', 'numeric'),
      ('service_quote_items', 'unit_price', 'numeric'),
      ('service_quote_items', 'billing_type', 'text'),
      ('service_quote_items', 'billing_label', 'text'),
      ('service_quote_items', 'line_total', 'numeric'),
      ('service_quote_items', 'sort_order', 'integer'),
      ('service_quote_items', 'catalog_service_id', 'uuid'),
      ('service_quote_items', 'scope', 'text'),
      ('service_quote_items', 'deliverables', 'text'),
      ('service_quote_items', 'item_exclusions', 'text'),
      ('service_quote_items', 'timeline', 'text'),
      ('service_quote_items', 'one_time_fee', 'numeric'),
      ('service_quote_items', 'monthly_fee', 'numeric'),
      ('service_quote_items', 'annual_fee', 'numeric'),
      ('service_quote_items', 'months', 'integer'),
      ('service_quote_items', 'is_optional', 'boolean'),
      ('service_quote_items', 'updated_at', 'timestamp with time zone')
    ) v(tbl, col, ty)
  loop
    continue when to_regclass('public.' || r.tbl) is null;   -- table absent: section 1 creates it
    actual := null;
    select format_type(a.atttypid, a.atttypmod) into actual
      from pg_attribute a
     where a.attrelid = ('public.' || r.tbl)::regclass and a.attname = r.col and a.attnum > 0 and not a.attisdropped;
    if actual is null then
      raise exception 'baseline_40 preflight: public.%.% is missing (expected %)', r.tbl, r.col, r.ty;
    elsif actual <> r.ty then
      raise exception 'baseline_40 preflight: public.%.% is % (expected %)', r.tbl, r.col, actual, r.ty;
    end if;
  end loop;
end $$;

-- ── 1. Tables (column order as in Production) ────────────────────────────────────────────────────────────
create table if not exists public.quotation_records (
  id                  uuid not null default gen_random_uuid(),
  quote_no            text not null,
  customer_name       text,
  project_name        text,
  deal_id             text,
  salesperson         text,
  phone_wa            text,
  quote_type          text not null default 'TRADE'::text,
  status              text not null default 'DRAFT'::text,
  source              text default 'Manual'::text,
  supplier_cost_total numeric(14,2) default 0,
  selling_total       numeric(14,2) default 0,
  profit_total        numeric(14,2) default 0,
  margin_percent      numeric(8,2) default 0,
  vat_amount          numeric(14,2) default 0,
  grand_total         numeric(14,2) default 0,
  terms_notes         text,
  pdf_url             text,
  trade_pi_id         text,
  created_by          text default 'Admin'::text,
  quote_date          text,
  created_at          timestamp with time zone default now(),
  updated_at          timestamp with time zone default now(),
  customer_id         uuid,
  project_id          uuid,
  constraint quotation_records_pkey PRIMARY KEY (id),
  constraint quotation_records_quote_no_key UNIQUE (quote_no)
);

create table if not exists public.quotation_items (
  id             uuid not null default gen_random_uuid(),
  quotation_id   uuid not null,
  item_name      text not null,
  description    text,
  qty            numeric(12,3) default 1,
  unit           text default 'pcs'::text,
  supplier_cost  numeric(14,2) default 0,
  selling_price  numeric(14,2) default 0,
  profit_amount  numeric(14,2) default 0,
  margin_percent numeric(8,2) default 0,
  vat_amount     numeric(14,2) default 0,
  line_total     numeric(14,2) default 0,
  currency       text default 'AED'::text,
  item_notes     text,
  sort_order     integer default 0,
  created_at     timestamp with time zone default now(),
  constraint quotation_items_pkey PRIMARY KEY (id),
  constraint quotation_items_quotation_id_fkey FOREIGN KEY (quotation_id) REFERENCES public.quotation_records(id) ON DELETE CASCADE
);

create table if not exists public.supplier_quotes (
  id                    uuid not null default gen_random_uuid(),
  supplier_quote_no     text not null,
  supplier_name         text,
  supplier_contact      text,
  category              text,
  currency              text default 'AED'::text,
  quote_date            text,
  valid_until           text,
  terms_notes           text,
  uploaded_by           text default 'Admin'::text,
  source_file_name      text,
  status                text default 'Active'::text,
  total_cost            numeric(14,2) default 0,
  converted_quote_id    uuid,
  created_at            timestamp with time zone default now(),
  updated_at            timestamp with time zone default now(),
  supplier_id           uuid,
  source_document_id    uuid,
  supplier_match_status text default 'pending'::text,
  supplier_matched_at   timestamp with time zone,
  supplier_matched_by   text,
  customer_id           uuid,
  project_id            uuid,
  constraint supplier_quotes_pkey PRIMARY KEY (id)
);

create table if not exists public.supplier_quote_items (
  id                  uuid not null default gen_random_uuid(),
  supplier_quote_id   uuid not null,
  item_name           text not null,
  description         text,
  qty                 numeric(12,3) default 1,
  unit                text default 'pcs'::text,
  supplier_cost       numeric(14,2) default 0,
  currency            text default 'AED'::text,
  notes               text,
  sort_order          integer default 0,
  created_at          timestamp with time zone default now(),
  supplier_product_id uuid,
  constraint supplier_quote_items_pkey PRIMARY KEY (id),
  constraint supplier_quote_items_supplier_quote_id_fkey FOREIGN KEY (supplier_quote_id) REFERENCES public.supplier_quotes(id) ON DELETE CASCADE
);

create table if not exists public.service_categories (
  id         uuid not null default gen_random_uuid(),
  name_cn    text not null,
  name_en    text not null,
  sort_order integer not null default 0,
  active     boolean not null default true,
  constraint service_categories_pkey PRIMARY KEY (id)
);

create table if not exists public.service_catalog_items (
  id                       uuid not null default gen_random_uuid(),
  category_id              uuid,
  name_cn                  text not null,
  name_en                  text not null,
  default_unit             text not null default '项'::text,
  default_billing_type     text not null default 'fixed'::text,
  sort_order               integer not null default 0,
  active                   boolean not null default true,
  description_zh           text,
  description_en           text,
  scope_zh                 text,
  scope_en                 text,
  deliverables_zh          text,
  deliverables_en          text,
  exclusions_zh            text,
  exclusions_en            text,
  one_time_fee             numeric default 0,
  monthly_fee              numeric default 0,
  annual_fee               numeric default 0,
  default_quantity         numeric default 1,
  default_months           integer,
  default_timeline         text,
  default_payment_terms_zh text,
  default_payment_terms_en text,
  minimum_price            numeric,
  allow_price_edit         boolean default true,
  updated_at               timestamp with time zone default now(),
  currency                 text not null default 'AED'::text,
  frequency                text,
  is_price_on_request      boolean not null default false,
  client_requirements_zh   text,
  client_requirements_en   text,
  notes_zh                 text,
  notes_en                 text,
  constraint service_catalog_items_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.service_categories(id) ON DELETE CASCADE,
  constraint service_catalog_items_pkey PRIMARY KEY (id)
);

create table if not exists public.service_quotes (
  id                      uuid not null default gen_random_uuid(),
  quote_no                text not null,
  customer_name           text not null,
  contact_person          text,
  quote_date              date,
  currency                text not null default 'AED'::text,
  project_duration        text,
  payment_terms           text,
  notes                   text,
  status                  text not null default 'Draft'::text,
  total_amount            numeric not null default 0,
  created_at              timestamp with time zone not null default now(),
  updated_at              timestamp with time zone not null default now(),
  customer_id             uuid,
  version                 integer default 1,
  quotation_title         text,
  service_type            text,
  valid_until             date,
  subtotal_one_time       numeric default 0,
  subtotal_monthly        numeric default 0,
  subtotal_annual         numeric default 0,
  discount_type           text,
  discount_value          numeric default 0,
  discount_amount         numeric default 0,
  total_one_time          numeric default 0,
  monthly_fee             numeric default 0,
  annual_recurring_amount numeric default 0,
  grand_total             numeric default 0,
  delivery_period         text,
  exclusions              text,
  owner                   text,
  sent_at                 timestamp with time zone,
  accepted_at             timestamp with time zone,
  constraint service_quotes_pkey PRIMARY KEY (id)
);

create table if not exists public.service_quote_items (
  id                 uuid not null default gen_random_uuid(),
  service_quote_id   uuid,
  category_name      text,
  service_name       text not null,
  description        text,
  unit               text not null default '项'::text,
  quantity           numeric not null default 1,
  unit_price         numeric not null default 0,
  billing_type       text not null default 'fixed'::text,
  billing_label      text,
  line_total         numeric not null default 0,
  sort_order         integer not null default 0,
  catalog_service_id uuid,
  scope              text,
  deliverables       text,
  item_exclusions    text,
  timeline           text,
  one_time_fee       numeric default 0,
  monthly_fee        numeric default 0,
  annual_fee         numeric default 0,
  months             integer default 1,
  is_optional        boolean default false,
  updated_at         timestamp with time zone default now(),
  constraint service_quote_items_pkey PRIMARY KEY (id),
  constraint service_quote_items_service_quote_id_fkey FOREIGN KEY (service_quote_id) REFERENCES public.service_quotes(id) ON DELETE CASCADE
);

-- ── 2. Indexes (primary-key / unique-constraint indexes come from section 1) ─────────────────────────────
create index if not exists idx_quotation_records_customer_id ON public.quotation_records USING btree (customer_id);
create index if not exists idx_quotation_records_project_id ON public.quotation_records USING btree (project_id);
create index if not exists idx_sq_match_status ON public.supplier_quotes USING btree (supplier_match_status);
create index if not exists idx_sq_supplier_id ON public.supplier_quotes USING btree (supplier_id);
create index if not exists idx_supplier_quotes_customer_id ON public.supplier_quotes USING btree (customer_id);
create index if not exists idx_supplier_quotes_project_id ON public.supplier_quotes USING btree (project_id);
create index if not exists idx_scat_active ON public.service_categories USING btree (active);
create index if not exists idx_sq_customer_id ON public.service_quotes USING btree (customer_id);
create index if not exists idx_sq_status ON public.service_quotes USING btree (status);

-- ── 3. Cross-domain foreign keys (only when the target table exists and the constraint is absent) ─────────
do $$
begin
  if to_regclass('public.crm_customers') is not null
     and not exists (select 1 from pg_constraint where conname = 'quotation_records_customer_id_fkey' and conrelid = 'public.quotation_records'::regclass) then
    alter table public.quotation_records add constraint quotation_records_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.crm_customers(id);
  end if;
  if to_regclass('public.crm_projects') is not null
     and not exists (select 1 from pg_constraint where conname = 'quotation_records_project_id_fkey' and conrelid = 'public.quotation_records'::regclass) then
    alter table public.quotation_records add constraint quotation_records_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.crm_projects(id);
  end if;
  if to_regclass('public.crm_customers') is not null
     and not exists (select 1 from pg_constraint where conname = 'supplier_quotes_customer_id_fkey' and conrelid = 'public.supplier_quotes'::regclass) then
    alter table public.supplier_quotes add constraint supplier_quotes_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.crm_customers(id);
  end if;
  if to_regclass('public.crm_projects') is not null
     and not exists (select 1 from pg_constraint where conname = 'supplier_quotes_project_id_fkey' and conrelid = 'public.supplier_quotes'::regclass) then
    alter table public.supplier_quotes add constraint supplier_quotes_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.crm_projects(id);
  end if;
  if to_regclass('public.supplier_documents') is not null
     and not exists (select 1 from pg_constraint where conname = 'supplier_quotes_source_document_id_fkey' and conrelid = 'public.supplier_quotes'::regclass) then
    alter table public.supplier_quotes add constraint supplier_quotes_source_document_id_fkey FOREIGN KEY (source_document_id) REFERENCES public.supplier_documents(id);
  end if;
  if to_regclass('public.suppliers') is not null
     and not exists (select 1 from pg_constraint where conname = 'supplier_quotes_supplier_id_fkey' and conrelid = 'public.supplier_quotes'::regclass) then
    alter table public.supplier_quotes add constraint supplier_quotes_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);
  end if;
  if to_regclass('public.supplier_products') is not null
     and not exists (select 1 from pg_constraint where conname = 'supplier_quote_items_supplier_product_id_fkey' and conrelid = 'public.supplier_quote_items'::regclass) then
    alter table public.supplier_quote_items add constraint supplier_quote_items_supplier_product_id_fkey FOREIGN KEY (supplier_product_id) REFERENCES public.supplier_products(id);
  end if;
  if to_regclass('public.service_customers') is not null
     and not exists (select 1 from pg_constraint where conname = 'service_quotes_customer_id_fkey' and conrelid = 'public.service_quotes'::regclass) then
    alter table public.service_quotes add constraint service_quotes_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.service_customers(id);
  end if;
end $$;

-- ── 4. Row level security — as in Production (enabled on the 4 service_* tables only) ────────────────────
-- public.quotation_records: RLS disabled in Production (left as-is)
-- public.quotation_items: RLS disabled in Production (left as-is)
-- public.supplier_quotes: RLS disabled in Production (left as-is)
-- public.supplier_quote_items: RLS disabled in Production (left as-is)
alter table public.service_categories enable row level security;
alter table public.service_catalog_items enable row level security;
alter table public.service_quotes enable row level security;
alter table public.service_quote_items enable row level security;

-- ── 5. Policies — as in Production, created only if absent (no DROP) ─────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'service_categories' and policyname = 'anon all') then
    create policy "anon all" on public.service_categories as permissive for all to public using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'service_catalog_items' and policyname = 'anon all') then
    create policy "anon all" on public.service_catalog_items as permissive for all to public using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'service_quotes' and policyname = 'anon all') then
    create policy "anon all" on public.service_quotes as permissive for all to public using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'service_quote_items' and policyname = 'anon all') then
    create policy "anon all" on public.service_quote_items as permissive for all to public using (true) with check (true);
  end if;
end $$;

-- ── 6. Triggers — attached only if the function exists and the trigger is absent ─────────────────────────
do $$
begin
  if to_regprocedure('public.touch_updated_at()') is not null
     and not exists (select 1 from pg_trigger where tgname = 'quotation_records_touch' and tgrelid = 'public.quotation_records'::regclass) then
    create trigger quotation_records_touch BEFORE UPDATE ON public.quotation_records FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
  end if;
  if to_regprocedure('public.touch_supplier_quotes_updated_at()') is not null
     and not exists (select 1 from pg_trigger where tgname = 'supplier_quotes_touch' and tgrelid = 'public.supplier_quotes'::regclass) then
    create trigger supplier_quotes_touch BEFORE UPDATE ON public.supplier_quotes FOR EACH ROW EXECUTE FUNCTION public.touch_supplier_quotes_updated_at();
  end if;
end $$;

-- ── 7. Grants — as in Production (no-op there). Recorded as-is; see Security Audit below ───────────────────
grant all on table public.quotation_records to anon;
grant all on table public.quotation_records to authenticated;
grant all on table public.quotation_records to service_role;
grant all on table public.quotation_items to anon;
grant all on table public.quotation_items to authenticated;
grant all on table public.quotation_items to service_role;
grant all on table public.supplier_quotes to anon;
grant all on table public.supplier_quotes to authenticated;
grant all on table public.supplier_quotes to service_role;
grant all on table public.supplier_quote_items to anon;
grant all on table public.supplier_quote_items to authenticated;
grant all on table public.supplier_quote_items to service_role;
grant all on table public.service_categories to anon;
grant all on table public.service_categories to authenticated;
grant all on table public.service_categories to service_role;
grant all on table public.service_catalog_items to anon;
grant all on table public.service_catalog_items to authenticated;
grant all on table public.service_catalog_items to service_role;
grant all on table public.service_quotes to anon;
grant all on table public.service_quotes to authenticated;
grant all on table public.service_quotes to service_role;
grant all on table public.service_quote_items to anon;
grant all on table public.service_quote_items to authenticated;
grant all on table public.service_quote_items to service_role;

-- ── Follow-up: Security Audit (NOT part of this migration closeout) ───────────────────────────────────────
-- SA-Q1  quotation_records, quotation_items, supplier_quotes, supplier_quote_items: RLS disabled and anon/authenticated
--        hold ALL privileges -> readable/writable with the public anon key.
-- SA-Q2  service_categories, service_catalog_items, service_quotes, service_quote_items: RLS on, but the only policy is
--        "anon all" FOR ALL TO public USING (true) WITH CHECK (true) -> RLS gives no protection.
-- SA-Q3  The two groups are inconsistent with each other and with the has_module()-style policies used elsewhere.
-- SA-Q4  Definitions of public.touch_updated_at() and public.touch_supplier_quotes_updated_at() are not in the repo;
--        capture them (pg_get_functiondef) into baseline_00_helpers so a fresh DB gets the updated_at triggers.
