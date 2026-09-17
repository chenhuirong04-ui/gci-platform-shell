-- GCI Company Documents — persistent category table
-- Fixes: the category dropdown was a hardcoded array in companyDocumentsService.ts
-- (missing "CIC Card", and every future category needed a code change). This
-- table is now the single source for both the upload dropdown and the "All
-- Categories" filter, and lets a user add a new category that's remembered
-- from then on.
--
-- Does NOT touch company_documents.category — it stays a plain text column
-- (no FK, no migration of historical rows). Uploaded documents keep storing
-- the category NAME as before; only where that name now comes from changes.
-- Idempotent, safe to re-run. NOT YET EXECUTED — review before running in
-- Supabase SQL Editor.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Table
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.company_document_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  is_system   boolean not null default false,
  active      boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

-- Case/whitespace-insensitive uniqueness on name — "CIC Card" and " cic card "
-- collide, "CIC Card" and "CIC-Card" don't (only trim+lowercase, no other
-- normalization). Separate from the slug's own plain unique constraint above.
create unique index if not exists idx_company_document_categories_name_norm
  on public.company_document_categories (lower(trim(name)));

alter table public.company_document_categories enable row level security;

grant select, insert on table public.company_document_categories to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. RLS — same split as company_documents itself (20260909 migration): any
--    authenticated user can view and add. No UPDATE/DELETE policy this round
--    — editing/retiring a category is out of scope, existing rows are never
--    touched by this feature.
-- ─────────────────────────────────────────────────────────────────────────
drop policy if exists "Authenticated users can view document categories" on public.company_document_categories;
create policy "Authenticated users can view document categories"
on public.company_document_categories for select to authenticated using (true);

drop policy if exists "Authenticated users can add document categories" on public.company_document_categories;
create policy "Authenticated users can add document categories"
on public.company_document_categories for insert to authenticated with check (true);

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Seed — the 13 categories that were already hardcoded, plus CIC Card.
--    All is_system = true. on conflict do nothing keeps this safe to re-run
--    and never overwrites a category someone has since edited.
-- ─────────────────────────────────────────────────────────────────────────
insert into public.company_document_categories (name, slug, is_system, sort_order) values
  ('Trade License',        'trade-license',        true, 0),
  ('CIC Card',              'cic-card',              true, 1),
  ('MOA/AOA',               'moa-aoa',               true, 2),
  ('POA',                   'poa',                   true, 3),
  ('VAT',                   'vat',                   true, 4),
  ('Corporate Tax',         'corporate-tax',         true, 5),
  ('Bank',                  'bank',                  true, 6),
  ('Contracts',             'contracts',             true, 7),
  ('Government Documents',  'government-documents',  true, 8),
  ('Insurance',             'insurance',             true, 9),
  ('Vehicles',              'vehicles',              true, 10),
  ('HR/Employee',           'hr-employee',           true, 11),
  ('Projects',              'projects',              true, 12),
  ('Other',                 'other',                 true, 13)
on conflict (slug) do nothing;
