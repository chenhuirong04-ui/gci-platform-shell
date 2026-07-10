-- GCI Business Solutions Migration
-- Run once in Supabase SQL Editor
-- Safe to re-run (uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)

-- ── service_customers (new table) ────────────────────────────────────────────
create table if not exists service_customers (
  id uuid primary key default gen_random_uuid(),
  customer_number text unique,
  customer_name text not null,
  company_name text,
  contact_name text,
  whatsapp text,
  phone text,
  email text,
  country text,
  city text,
  address text,
  preferred_language text default 'zh',
  customer_source text,
  primary_service_type text default 'OTHER',
  service_tags jsonb default '[]',
  requirement_summary text,
  requirement_details text,
  budget_range text,
  expected_start_date date,
  requires_monthly_service boolean default false,
  status text default 'NEW_REQUIREMENT',
  priority text default 'B',
  owner text,
  next_action text,
  follow_up_date date,
  last_follow_up_at timestamptz,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table service_customers enable row level security;
drop policy if exists "anon all sc" on service_customers;
create policy "anon all sc" on service_customers for all using (true) with check (true);
create index if not exists idx_sc_status on service_customers(status);
create index if not exists idx_sc_type on service_customers(primary_service_type);

-- ── Extend service_catalog_items ──────────────────────────────────────────────
alter table service_catalog_items
  add column if not exists description_zh text,
  add column if not exists description_en text,
  add column if not exists scope_zh text,
  add column if not exists scope_en text,
  add column if not exists deliverables_zh text,
  add column if not exists deliverables_en text,
  add column if not exists exclusions_zh text,
  add column if not exists exclusions_en text,
  add column if not exists one_time_fee numeric default 0,
  add column if not exists monthly_fee numeric default 0,
  add column if not exists annual_fee numeric default 0,
  add column if not exists default_quantity numeric default 1,
  add column if not exists default_months integer,
  add column if not exists default_timeline text,
  add column if not exists default_payment_terms_zh text,
  add column if not exists default_payment_terms_en text,
  add column if not exists minimum_price numeric,
  add column if not exists allow_price_edit boolean default true,
  add column if not exists updated_at timestamptz default now();

-- ── Extend service_quotes ─────────────────────────────────────────────────────
alter table service_quotes
  add column if not exists customer_id uuid references service_customers(id),
  add column if not exists version integer default 1,
  add column if not exists quotation_title text,
  add column if not exists service_type text,
  add column if not exists valid_until date,
  add column if not exists subtotal_one_time numeric default 0,
  add column if not exists subtotal_monthly numeric default 0,
  add column if not exists subtotal_annual numeric default 0,
  add column if not exists discount_type text,
  add column if not exists discount_value numeric default 0,
  add column if not exists discount_amount numeric default 0,
  add column if not exists total_one_time numeric default 0,
  add column if not exists monthly_fee numeric default 0,
  add column if not exists annual_recurring_amount numeric default 0,
  add column if not exists grand_total numeric default 0,
  add column if not exists delivery_period text,
  add column if not exists exclusions text,
  add column if not exists owner text,
  add column if not exists sent_at timestamptz,
  add column if not exists accepted_at timestamptz,
  add column if not exists updated_at timestamptz default now();

-- ── Extend service_quote_items ────────────────────────────────────────────────
alter table service_quote_items
  add column if not exists catalog_service_id uuid,
  add column if not exists scope text,
  add column if not exists deliverables text,
  add column if not exists item_exclusions text,
  add column if not exists timeline text,
  add column if not exists one_time_fee numeric default 0,
  add column if not exists monthly_fee numeric default 0,
  add column if not exists annual_fee numeric default 0,
  add column if not exists months integer default 1,
  add column if not exists is_optional boolean default false,
  add column if not exists updated_at timestamptz default now();

-- ── Indexes ───────────────────────────────────────────────────────────────────
create index if not exists idx_sq_customer_id on service_quotes(customer_id);
create index if not exists idx_sq_status on service_quotes(status);
