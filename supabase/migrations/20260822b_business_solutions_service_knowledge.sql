-- GCI Executive Desk — Business Solutions Service Knowledge Base V1
-- Run in Supabase SQL Editor (project: gci-trade-260521 / efrkvwhzpgahjgfukjth)
-- Read-only design audit confirmed: service_catalog_items already carries
-- Tax/Compliance/Corporate-service pricing (one_time_fee/monthly_fee/
-- annual_fee), but has no currency column, no way to express "price on
-- request", and no place for client-facing requirements/notes. Workforce
-- hourly rates (普工/木工/钢筋工/... AED per man-hour) are a structurally
-- different shape — a role+rate lookup, not a service with a fixed-period
-- fee — so they get their own new table instead of being forced into
-- service_catalog_items.
-- Additive only: no existing column dropped or renamed, no change to any
-- existing fee column's type/default/nullability, no change to
-- service_quotes/service_quote_items, no pricing/condition engine, no
-- source-file/version/effective-date columns (explicitly out of scope —
-- see report).

-- ── A. service_catalog_items — minimal additive columns ──────────────────
alter table service_catalog_items
  add column if not exists currency               text not null default 'AED',
  add column if not exists frequency               text,
  add column if not exists is_price_on_request     boolean not null default false,
  add column if not exists client_requirements_zh  text,
  add column if not exists client_requirements_en  text,
  add column if not exists notes_zh                text,
  add column if not exists notes_en                text;

-- ── B. workforce_rate_card (new table) ────────────────────────────────────
-- Hourly labor rates (普工/木工/钢筋工/木工/...). Deliberately kept separate
-- from service_catalog_items — this is a role+rate lookup, not a service
-- with a fixed-period fee. No calculation logic here: quantity x hours x
-- days x rate is explicitly future work per the confirmed design, not part
-- of this schema.
create table if not exists workforce_rate_card (
  id            uuid primary key default gen_random_uuid(),
  role_name_zh  text not null,
  role_name_en  text,
  rate          numeric not null,
  currency      text not null default 'AED',
  billing_unit  text not null default 'man-hour',
  active        boolean not null default true,
  notes_zh      text,
  notes_en      text,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table workforce_rate_card enable row level security;

-- anon-compatible (no auth.uid() check) — Business Solutions has no
-- Supabase Auth session anywhere today; modules/business-solutions/lib/
-- bsCloud.ts connects with the anon key only, matching service_customers'
-- own existing access level. Deliberately 3 separate policies rather than
-- a single `for all` (which would silently also grant delete) — this
-- table never gets a delete policy: select/insert/update only.
create policy "workforce_rate_card_select"
  on workforce_rate_card for select
  using (true);

create policy "workforce_rate_card_insert"
  on workforce_rate_card for insert
  with check (true);

create policy "workforce_rate_card_update"
  on workforce_rate_card for update
  using (true)
  with check (true);

create index if not exists idx_wrc_active       on workforce_rate_card(active);
create index if not exists idx_wrc_role_name_zh on workforce_rate_card(role_name_zh);
create index if not exists idx_wrc_sort_order   on workforce_rate_card(sort_order);
