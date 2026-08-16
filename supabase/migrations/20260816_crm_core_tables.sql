-- GCI Executive Desk — CRM core tables (customers, contacts, follow-ups)
-- Run in Supabase SQL Editor (project: gci-trade-260521 / efrkvwhzpgahjgfukjth)

-- ── crm_customers ──────────────────────────────────────────────────────────
create table if not exists crm_customers (
  id                     uuid primary key default gen_random_uuid(),
  customer_name          text not null,
  customer_type          text,
  business_type          text,
  country                text,
  city                   text,
  owner                  text,
  status                 text,
  priority               text,
  source                 text,
  last_follow_up_at      date,
  next_follow_up_at      date,
  follow_up_notes        text,
  next_action            text,
  project_stage          text,
  project_situation      text,
  currency               text,
  expected_completion_at date,
  expected_signing_at    date,
  -- Note: 'SB_POOL' / 'PROJECTS' are legacy_source values only, never customer_type.
  legacy_source          text,
  notion_page_id         text unique,
  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);

alter table crm_customers enable row level security;

create policy "crm_customers_select"
  on crm_customers for select
  using (auth.uid() is not null);

create policy "crm_customers_insert"
  on crm_customers for insert
  with check (auth.uid() is not null);

create policy "crm_customers_update"
  on crm_customers for update
  using  (auth.uid() is not null)
  with check (auth.uid() is not null);

create index if not exists idx_crm_customers_customer_name on crm_customers(customer_name);
create index if not exists idx_crm_customers_next_follow_up_at on crm_customers(next_follow_up_at);
create index if not exists idx_crm_customers_status on crm_customers(status);

-- ── crm_contacts ───────────────────────────────────────────────────────────
create table if not exists crm_contacts (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references crm_customers(id) on delete cascade,
  contact_name text,
  phone       text,
  whatsapp    text,
  email       text,
  is_primary  boolean default true,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table crm_contacts enable row level security;

create policy "crm_contacts_select"
  on crm_contacts for select
  using (auth.uid() is not null);

create policy "crm_contacts_insert"
  on crm_contacts for insert
  with check (auth.uid() is not null);

create policy "crm_contacts_update"
  on crm_contacts for update
  using  (auth.uid() is not null)
  with check (auth.uid() is not null);

create index if not exists idx_crm_contacts_customer_id on crm_contacts(customer_id);

-- ── crm_followups ──────────────────────────────────────────────────────────
create table if not exists crm_followups (
  id               uuid primary key default gen_random_uuid(),
  customer_id      uuid not null references crm_customers(id) on delete cascade,
  follow_up_date   date default current_date,
  next_follow_up_at date,
  method           text,
  notes            text,
  next_action      text,
  status_after     text,
  owner            text,
  source           text default 'manual',
  notion_page_id   text unique,
  created_at       timestamptz default now()
);

alter table crm_followups enable row level security;

create policy "crm_followups_select"
  on crm_followups for select
  using (auth.uid() is not null);

create policy "crm_followups_insert"
  on crm_followups for insert
  with check (auth.uid() is not null);

create policy "crm_followups_update"
  on crm_followups for update
  using  (auth.uid() is not null)
  with check (auth.uid() is not null);

create index if not exists idx_crm_followups_customer_id on crm_followups(customer_id);
create index if not exists idx_crm_followups_follow_up_date on crm_followups(follow_up_date);
create index if not exists idx_crm_followups_next_follow_up_at on crm_followups(next_follow_up_at);
