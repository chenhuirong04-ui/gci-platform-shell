-- GCI Business Solutions — Customer Documents
-- Run in Supabase SQL Editor
-- Also: create Storage bucket "service-customer-documents" (public=false) in Supabase Dashboard → Storage

-- ── service_customer_documents table ──────────────────────────────────────────
create table if not exists service_customer_documents (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid references service_customers(id) on delete cascade,
  document_type text not null default 'OTHER',
  document_name text not null,
  file_url      text,
  storage_path  text,
  issue_date    date,
  expiry_date   date,
  reminder_days integer default 30,
  status        text default 'ACTIVE',
  notes         text,
  uploaded_by   text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

alter table service_customer_documents enable row level security;
drop policy if exists "anon all scd" on service_customer_documents;
create policy "anon all scd" on service_customer_documents for all using (true) with check (true);

create index if not exists idx_scd_customer on service_customer_documents(customer_id);
create index if not exists idx_scd_expiry on service_customer_documents(expiry_date);

-- ── Storage bucket setup (run via Supabase Dashboard or use SQL below) ─────────
-- Note: bucket must be created in Dashboard → Storage → New bucket
-- Name: service-customer-documents
-- Public: false (files served via signed URLs)
--
-- Or insert via SQL if on Pro plan:
insert into storage.buckets (id, name, public)
values ('service-customer-documents', 'service-customer-documents', false)
on conflict (id) do nothing;

-- RLS for storage bucket
drop policy if exists "allow anon upload scd" on storage.objects;
drop policy if exists "allow anon read scd" on storage.objects;
drop policy if exists "allow anon delete scd" on storage.objects;

create policy "allow anon upload scd" on storage.objects
  for insert with check (bucket_id = 'service-customer-documents');

create policy "allow anon read scd" on storage.objects
  for select using (bucket_id = 'service-customer-documents');

create policy "allow anon delete scd" on storage.objects
  for delete using (bucket_id = 'service-customer-documents');
