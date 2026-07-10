-- GCI Business Solutions — Company Persons
-- Idempotent, does not touch existing tables

create table if not exists service_customer_persons (
  id                      uuid primary key default gen_random_uuid(),
  customer_id             uuid references service_customers(id) on delete cascade,
  full_name               text not null,
  role                    text,
  nationality             text,
  passport_number         text,
  passport_expiry_date    date,
  emirates_id_number      text,
  emirates_id_expiry_date date,
  uid_number              text,
  visa_number             text,
  visa_type               text,
  visa_expiry_date        date,
  date_of_birth           date,
  shareholding_percentage numeric,
  is_legal_representative boolean default false,
  is_manager              boolean default false,
  phone                   text,
  email                   text,
  notes                   text,
  created_at              timestamptz default now(),
  updated_at              timestamptz default now()
);

alter table service_customer_persons enable row level security;
drop policy if exists "anon all scp" on service_customer_persons;
create policy "anon all scp" on service_customer_persons
  for all using (true) with check (true);

create index if not exists idx_scp_customer on service_customer_persons(customer_id);
create index if not exists idx_scp_passport_expiry on service_customer_persons(passport_expiry_date);
create index if not exists idx_scp_visa_expiry     on service_customer_persons(visa_expiry_date);
create index if not exists idx_scp_eid_expiry      on service_customer_persons(emirates_id_expiry_date);
