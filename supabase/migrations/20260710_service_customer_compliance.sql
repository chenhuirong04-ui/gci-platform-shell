-- GCI Business Solutions — Service Customer Compliance Items
-- Idempotent: safe to re-run
-- Does NOT delete or alter existing tables

create table if not exists service_customer_compliance_items (
  id                uuid primary key default gen_random_uuid(),
  customer_id       uuid references service_customers(id) on delete cascade,
  document_id       uuid references service_customer_documents(id) on delete set null,
  compliance_type   text not null default 'OTHER',
  title             text not null,
  license_number    text,
  licensee_name     text,
  trade_name        text,
  legal_status      text,
  issuing_authority text,
  manager_name      text,
  premises_number   text,
  building_name     text,
  area_name         text,
  activities        jsonb default '[]',
  issue_date        date,
  expiry_date       date,
  renewal_date      date,
  filing_frequency  text,
  next_due_date     date,
  reminder_days     integer default 30,
  status            text default 'ACTIVE',
  assigned_to       text,
  notes             text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

alter table service_customer_compliance_items enable row level security;
drop policy if exists "anon all scci" on service_customer_compliance_items;
create policy "anon all scci" on service_customer_compliance_items
  for all using (true) with check (true);

create index if not exists idx_scci_customer  on service_customer_compliance_items(customer_id);
create index if not exists idx_scci_type      on service_customer_compliance_items(compliance_type);
create index if not exists idx_scci_expiry    on service_customer_compliance_items(expiry_date);
create index if not exists idx_scci_due       on service_customer_compliance_items(next_due_date);
create index if not exists idx_scci_status    on service_customer_compliance_items(status);
