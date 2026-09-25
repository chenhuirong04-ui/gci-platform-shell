-- GCI Platform — Knowledge module schema (migrated from the standalone Knowledge Hub, otnluzvrhbygxvaesqgq)
-- PREPARED, NOT EXECUTED. Idempotent (safe to run twice). Rollback: supabase/rollbacks/20260926000100_knowledge_schema.rollback.sql
--
-- Adds 7 tables (knowledge_taxonomy, knowledge_jurisdictions, knowledge_activities, knowledge_sources, knowledge_items,
-- knowledge_rules, knowledge_questions), the confidentiality check public.knowledge_can_read(level) and the search function
-- public.knowledge_search(q, max_results). Touches no existing table. Data is loaded separately by the generated, guarded
-- import (tools/knowledge-migration/, registered as kind='data_fix').
--
-- Confidentiality is enforced HERE, in RLS — never only in the UI:
--   PUBLIC       -> any active user holding knowledge_public, knowledge or knowledge_confidential (no anonymous access)
--   INTERNAL     -> knowledge or knowledge_confidential            (old CONSULTANT)
--   CONFIDENTIAL -> knowledge_confidential                         (old MANAGER; commission / partner terms)
--   ADMIN_ONLY   -> is_active_admin() only                         (old ADMIN)
--   is_active_admin() reads everything and is the only writer (plus status updates on questions for knowledge users).
-- Old role -> user_profiles.modules: LEARNER=knowledge_public, CONSULTANT=knowledge, MANAGER=knowledge+knowledge_confidential,
-- ADMIN=role_label 'Admin'. The old roles/permissions/profiles/user_roles tables are not migrated.
--
-- Depends on public.user_profiles, public.has_module(text), public.is_active_admin() and auth.uid().

-- ── 0. Preflight ──
do $$
begin
  if to_regclass('public.user_profiles') is null then raise exception 'preflight failed: public.user_profiles does not exist'; end if;
  if to_regprocedure('public.has_module(text)') is null then raise exception 'preflight failed: public.has_module(text) does not exist'; end if;
  if to_regprocedure('public.is_active_admin()') is null then raise exception 'preflight failed: public.is_active_admin() does not exist'; end if;
end $$;

-- ── 1. Tables ──
create table if not exists public.knowledge_taxonomy (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('industry', 'domain')),
  name          text not null,
  description   text,
  parent_id     uuid references public.knowledge_taxonomy (id),
  legacy_source text,
  legacy_id     uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint uq_knowledge_taxonomy_kind_name unique (kind, name),
  constraint uq_knowledge_taxonomy_legacy unique (legacy_source, legacy_id)
);

create table if not exists public.knowledge_jurisdictions (
  id                  uuid primary key default gen_random_uuid(),
  country             text not null,
  region              text,
  emirate             text,
  jurisdiction_type   text not null,
  name                text not null,
  confidentiality     text not null default 'PUBLIC'  check (confidentiality in ('PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'ADMIN_ONLY')),
  verification_status text not null default 'PENDING' check (verification_status in ('OFFICIAL', 'CONFIRMED', 'INTERNAL', 'PENDING', 'EXPIRED')),
  legacy_source       text,
  legacy_id           uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint uq_knowledge_jurisdictions_legacy unique (legacy_source, legacy_id)
);

create table if not exists public.knowledge_sources (
  id                  uuid primary key default gen_random_uuid(),
  title               text not null,
  file_name           text,
  drive_url           text,                      -- all 45 legacy rows: empty (metadata only, no file to copy)
  source_institution  text,
  document_type       text not null,
  version             text,
  status              text not null default 'DRAFT'    check (status in ('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED')),
  confidentiality     text not null default 'INTERNAL' check (confidentiality in ('PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'ADMIN_ONLY')),
  verification_status text not null default 'PENDING'  check (verification_status in ('OFFICIAL', 'CONFIRMED', 'INTERNAL', 'PENDING', 'EXPIRED')),
  published_at        timestamptz,
  legacy_owner_email  text,
  legacy_source       text,
  legacy_id           uuid,
  search_vector       tsvector generated always as (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(source_institution, '') || ' ' || coalesce(file_name, ''))
  ) stored,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint uq_knowledge_sources_legacy unique (legacy_source, legacy_id)
);

create table if not exists public.knowledge_items (
  id                  uuid primary key default gen_random_uuid(),
  title               text not null,
  summary             text,
  body                text,
  country             text,
  region              text,
  emirate             text,
  jurisdiction_id     uuid references public.knowledge_jurisdictions (id),
  industry_id         uuid references public.knowledge_taxonomy (id),
  domain_id           uuid references public.knowledge_taxonomy (id),
  source_id           uuid references public.knowledge_sources (id),
  source_page         text,
  activity_code       text,
  language            text not null default 'zh',
  status              text not null default 'DRAFT'    check (status in ('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED')),
  confidentiality     text not null default 'INTERNAL' check (confidentiality in ('PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'ADMIN_ONLY')),
  verification_status text not null default 'PENDING'  check (verification_status in ('OFFICIAL', 'CONFIRMED', 'INTERNAL', 'PENDING', 'EXPIRED')),
  published_at        date,
  effective_date      date,
  expiry_date         date,
  last_verified_at    timestamptz,
  legacy_owner_email  text,
  legacy_source       text,
  legacy_id           uuid,
  search_vector       tsvector generated always as (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(body, '') || ' ' || coalesce(activity_code, ''))
  ) stored,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint uq_knowledge_items_legacy unique (legacy_source, legacy_id)
);

create table if not exists public.knowledge_rules (
  id                         uuid primary key default gen_random_uuid(),
  knowledge_item_id          uuid references public.knowledge_items (id) on delete set null,
  title                      text not null,
  applies_to                 text,
  trigger_conditions         text,
  required_actions           text,
  required_documents         text,
  deadline                   text,
  risks                      text,
  exceptions                 text,
  source_note                text,
  country                    text,
  region                     text,
  industry                   text,
  official_service_url       text,
  official_email             text,
  official_phone             text,
  official_address           text,
  official_working_hours     text,
  contact_last_verified_date date,
  status                     text not null default 'DRAFT'    check (status in ('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED')),
  confidentiality            text not null default 'INTERNAL' check (confidentiality in ('PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'ADMIN_ONLY')),
  verification_status        text not null default 'PENDING'  check (verification_status in ('OFFICIAL', 'CONFIRMED', 'INTERNAL', 'PENDING', 'EXPIRED')),
  last_verified_at           timestamptz,
  legacy_source              text,
  legacy_id                  uuid,
  search_vector              tsvector generated always as (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(applies_to, '') || ' ' || coalesce(trigger_conditions, '') || ' ' ||
                          coalesce(required_actions, '') || ' ' || coalesce(required_documents, ''))
  ) stored,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  constraint uq_knowledge_rules_legacy unique (legacy_source, legacy_id)
);

create table if not exists public.knowledge_activities (
  id                            uuid primary key default gen_random_uuid(),
  jurisdiction_id               uuid references public.knowledge_jurisdictions (id),
  business_sector               text,
  sub_sector                    text,
  activity_isic4_code           text,
  activity_code                 text,
  activity_name                 text not null,
  activity_name_arabic          text,
  licence_type                  text,
  activity_description          text,
  space_required                text,
  restrictions                  text,
  additional_requirements       text,
  third_party_approval_required text,
  source_file                   text,
  confidentiality               text not null default 'PUBLIC'  check (confidentiality in ('PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'ADMIN_ONLY')),
  verification_status           text not null default 'PENDING' check (verification_status in ('OFFICIAL', 'CONFIRMED', 'INTERNAL', 'PENDING', 'EXPIRED')),
  legacy_source                 text,
  legacy_id                     uuid,
  search_vector                 tsvector generated always as (
    to_tsvector('simple', coalesce(activity_code, '') || ' ' || coalesce(activity_name, '') || ' ' || coalesce(activity_description, '') || ' ' ||
                          coalesce(business_sector, '') || ' ' || coalesce(sub_sector, ''))
  ) stored,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),
  constraint uq_knowledge_activities_legacy unique (legacy_source, legacy_id)
);

create table if not exists public.knowledge_questions (
  id                  uuid primary key default gen_random_uuid(),
  question            text not null,
  context             text,
  target_authority    text,
  status              text not null default 'OPEN'     check (status in ('OPEN', 'RESOLVED', 'STALE')),
  legacy_status       text,
  review_note         text,
  confidentiality     text not null default 'INTERNAL' check (confidentiality in ('PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'ADMIN_ONLY')),
  verification_status text not null default 'PENDING'  check (verification_status in ('OFFICIAL', 'CONFIRMED', 'INTERNAL', 'PENDING', 'EXPIRED')),
  legacy_owner_email  text,
  legacy_source       text,
  legacy_id           uuid,
  search_vector       tsvector generated always as (
    to_tsvector('simple', coalesce(question, '') || ' ' || coalesce(context, '') || ' ' || coalesce(target_authority, ''))
  ) stored,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint uq_knowledge_questions_legacy unique (legacy_source, legacy_id)
);

-- ── 2. Indexes ──
create index if not exists idx_knowledge_sources_fts     on public.knowledge_sources    using gin (search_vector);
create index if not exists idx_knowledge_items_fts       on public.knowledge_items      using gin (search_vector);
create index if not exists idx_knowledge_rules_fts       on public.knowledge_rules      using gin (search_vector);
create index if not exists idx_knowledge_activities_fts  on public.knowledge_activities using gin (search_vector);
create index if not exists idx_knowledge_questions_fts   on public.knowledge_questions  using gin (search_vector);
create index if not exists idx_knowledge_activities_code on public.knowledge_activities (activity_code);
create index if not exists idx_knowledge_activities_jur  on public.knowledge_activities (jurisdiction_id);
create index if not exists idx_knowledge_items_jur       on public.knowledge_items      (jurisdiction_id);
create index if not exists idx_knowledge_rules_item      on public.knowledge_rules      (knowledge_item_id);
create index if not exists idx_knowledge_questions_stat  on public.knowledge_questions  (status);

-- ── 3. Confidentiality check (the only place the level rules live) ──
create or replace function public.knowledge_can_read(level text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null then false
    when public.is_active_admin() then true
    when level = 'PUBLIC'       then public.has_module('knowledge_public') or public.has_module('knowledge') or public.has_module('knowledge_confidential')
    when level = 'INTERNAL'     then public.has_module('knowledge') or public.has_module('knowledge_confidential')
    when level = 'CONFIDENTIAL' then public.has_module('knowledge_confidential')
    else false                  -- ADMIN_ONLY and anything unknown: admin only (handled above)
  end;
$$;
revoke all on function public.knowledge_can_read(text) from public;
grant execute on function public.knowledge_can_read(text) to authenticated;

-- ── 4. RLS: read by level, write by admin ──
alter table public.knowledge_taxonomy      enable row level security;
alter table public.knowledge_jurisdictions enable row level security;
alter table public.knowledge_sources       enable row level security;
alter table public.knowledge_items         enable row level security;
alter table public.knowledge_rules         enable row level security;
alter table public.knowledge_activities    enable row level security;
alter table public.knowledge_questions     enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['knowledge_jurisdictions', 'knowledge_sources', 'knowledge_items', 'knowledge_rules',
                           'knowledge_activities', 'knowledge_questions'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'knowledge_read_by_level') then
      execute format('create policy knowledge_read_by_level on public.%I for select to authenticated using (public.knowledge_can_read(confidentiality))', t);
    end if;
  end loop;
  -- taxonomy has no confidentiality of its own: readable by anyone who may read PUBLIC knowledge
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'knowledge_taxonomy' and policyname = 'knowledge_read_by_level') then
    create policy knowledge_read_by_level on public.knowledge_taxonomy for select to authenticated using (public.knowledge_can_read('PUBLIC'));
  end if;
  foreach t in array array['knowledge_taxonomy', 'knowledge_jurisdictions', 'knowledge_sources', 'knowledge_items', 'knowledge_rules',
                           'knowledge_activities', 'knowledge_questions'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'knowledge_admin_write') then
      execute format('create policy knowledge_admin_write on public.%I for all to authenticated using (public.is_active_admin()) with check (public.is_active_admin())', t);
    end if;
  end loop;
  -- consultants may move a question's status (OPEN/RESOLVED/STALE) on rows they can read
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'knowledge_questions' and policyname = 'knowledge_questions_status_update') then
    create policy knowledge_questions_status_update on public.knowledge_questions for update to authenticated
      using (public.has_module('knowledge') and public.knowledge_can_read(confidentiality))
      with check (public.has_module('knowledge') and public.knowledge_can_read(confidentiality));
  end if;
end $$;

-- No anonymous access at all; authenticated gets table privileges, RLS decides the rows.
revoke all on public.knowledge_taxonomy, public.knowledge_jurisdictions, public.knowledge_sources, public.knowledge_items,
              public.knowledge_rules, public.knowledge_activities, public.knowledge_questions from anon;
grant select, insert, update, delete on public.knowledge_taxonomy, public.knowledge_jurisdictions, public.knowledge_sources,
              public.knowledge_items, public.knowledge_rules, public.knowledge_activities, public.knowledge_questions to authenticated;

-- ── 5. Search (SECURITY INVOKER: runs as the caller, so RLS hides what the caller may not read) ──
-- 'simple' tsvector does not segment Chinese, so every branch also matches by ILIKE on the key text columns.
create or replace function public.knowledge_search(q text, max_results int default 20)
returns table (kind text, id uuid, title text, snippet text, confidentiality text, rank real)
language sql
stable
security invoker
set search_path = public
as $$
  with p as (
    select nullif(btrim(q), '') as raw,
           websearch_to_tsquery('simple', coalesce(q, '')) as tsq,
           '%' || replace(replace(replace(btrim(coalesce(q, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat
  )
  select * from (
    select 'rule'::text, r.id, r.title, left(coalesce(r.applies_to, r.required_actions, r.trigger_conditions, ''), 200), r.confidentiality,
           (ts_rank(r.search_vector, p.tsq) + case when r.title ilike p.pat then 1 else 0 end)::real
      from public.knowledge_rules r, p
     where p.raw is not null and r.status <> 'ARCHIVED'
       and (r.search_vector @@ p.tsq or r.title ilike p.pat or r.applies_to ilike p.pat or r.required_actions ilike p.pat
            or r.trigger_conditions ilike p.pat or r.required_documents ilike p.pat)
    union all
    select 'item', i.id, i.title, left(coalesce(i.summary, i.body, ''), 200), i.confidentiality,
           (ts_rank(i.search_vector, p.tsq) + case when i.title ilike p.pat then 1 else 0 end)::real
      from public.knowledge_items i, p
     where p.raw is not null and i.status <> 'ARCHIVED'
       and (i.search_vector @@ p.tsq or i.title ilike p.pat or i.summary ilike p.pat or i.body ilike p.pat or i.activity_code ilike p.pat)
    union all
    select 'activity', a.id, coalesce(a.activity_code || ' ', '') || a.activity_name, left(coalesce(a.activity_description, ''), 200), a.confidentiality,
           (ts_rank(a.search_vector, p.tsq) + case when a.activity_code ilike p.pat or a.activity_name ilike p.pat then 1 else 0 end)::real
      from public.knowledge_activities a, p
     where p.raw is not null
       and (a.search_vector @@ p.tsq or a.activity_code ilike p.pat or a.activity_name ilike p.pat or a.activity_description ilike p.pat
            or a.business_sector ilike p.pat or a.sub_sector ilike p.pat)
  ) hits
  order by 6 desc, 3
  limit greatest(1, least(coalesce(max_results, 20), 50));
$$;
revoke all on function public.knowledge_search(text, int) from public;
grant execute on function public.knowledge_search(text, int) to authenticated;

-- ── 6. Ledger (self-register; no-op before the ledger exists) ──
do $$
begin
  if to_regclass('ops.migration_ledger') is not null then
    insert into ops.migration_ledger (version, name, kind, notes)
    values ('20260926000100', 'knowledge_schema', 'schema', '7 knowledge_* tables + knowledge_can_read() RLS + knowledge_search(); no existing table touched')
    on conflict (version) do nothing;
  end if;
end $$;
