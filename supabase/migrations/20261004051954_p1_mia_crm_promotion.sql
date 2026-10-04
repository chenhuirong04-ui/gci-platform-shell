-- GCI CRM P1: atomic MIA promotion target.
-- Additive only. This migration does not backfill MIA prospects and does not
-- create crm_followups; those remain post-promotion business actions only.

alter table public.crm_customers
  add column if not exists website_url text,
  add column if not exists source_detail text,
  add column if not exists mia_company_id uuid,
  add column if not exists original_outreach_subject text,
  add column if not exists first_contact_at timestamptz,
  add column if not exists last_reply_at timestamptz,
  add column if not exists mia_intent text,
  add column if not exists mia_reply_classification text,
  add column if not exists latest_reply_summary text,
  add column if not exists mia_confidence numeric,
  add column if not exists promotion_mode text,
  add column if not exists promotion_reason text,
  add column if not exists promoted_by text,
  add column if not exists promoted_at timestamptz,
  add column if not exists external_refs jsonb not null default '{}'::jsonb;

create unique index if not exists uq_crm_customers_mia_company_id
  on public.crm_customers(mia_company_id)
  where mia_company_id is not null;

create table if not exists public.crm_activities (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.crm_customers(id) on delete cascade,
  activity_type text not null,
  activity_at timestamptz not null default now(),
  summary text,
  source text not null default 'manual',
  external_ref_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_crm_activities_customer_at
  on public.crm_activities(customer_id, activity_at desc);
create unique index if not exists uq_crm_activities_mia_promotion
  on public.crm_activities(customer_id, activity_type)
  where activity_type = 'mia_promoted';

alter table public.crm_activities enable row level security;

drop policy if exists crm_activities_select on public.crm_activities;
create policy crm_activities_select
  on public.crm_activities for select to authenticated
  using (auth.uid() is not null);

revoke all on table public.crm_activities from anon;
grant select on table public.crm_activities to authenticated;
grant all on table public.crm_activities to service_role;

create or replace function public.promote_mia_company(
  p_mia_company_id uuid,
  p_company_name text,
  p_website_url text default null,
  p_contact_name text default null,
  p_email text default null,
  p_phone text default null,
  p_original_outreach_subject text default null,
  p_first_contact_at timestamptz default null,
  p_last_reply_at timestamptz default null,
  p_intent text default null,
  p_reply_classification text default 'HUMAN_REPLY',
  p_recommended_next_action text default null,
  p_summary text default null,
  p_status text default '新询盘',
  p_confidence numeric default null,
  p_promotion_mode text default 'automatic',
  p_promotion_reason text default null,
  p_promoted_by text default 'MIA',
  p_promoted_at timestamptz default now(),
  p_external_refs jsonb default '{}'::jsonb
)
returns table(customer_id uuid, created boolean)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_customer_id uuid;
  v_created boolean := false;
begin
  if p_promotion_mode not in ('automatic', 'manual') then
    raise exception 'Invalid promotion mode: %', p_promotion_mode;
  end if;
  if p_promotion_mode = 'automatic' and p_reply_classification <> 'HUMAN_REPLY' then
    raise exception 'Automatic promotion requires HUMAN_REPLY';
  end if;
  if p_promotion_mode = 'manual' and (nullif(trim(coalesce(p_promotion_reason, '')), '') is null or nullif(trim(coalesce(p_promoted_by, '')), '') is null) then
    raise exception 'Manual promotion requires reason and promoted_by';
  end if;
  if p_status not in ('新询盘', '需求整理中', '待报价', '已报价待确认') then
    raise exception 'Invalid MIA promotion status: %', p_status;
  end if;

  select c.id into v_customer_id
  from public.crm_customers c
  where c.mia_company_id = p_mia_company_id;

  if v_customer_id is null then
    insert into public.crm_customers (
      customer_name, website_url, status, source, source_detail, mia_company_id,
      original_outreach_subject, first_contact_at, last_reply_at, mia_intent,
      mia_reply_classification, next_action, latest_reply_summary, mia_confidence,
      promotion_mode, promotion_reason, promoted_by, promoted_at, external_refs
    ) values (
      p_company_name, p_website_url, p_status, 'MIA', 'AI Sales Agent', p_mia_company_id,
      p_original_outreach_subject, p_first_contact_at, p_last_reply_at, p_intent,
      p_reply_classification, p_recommended_next_action, p_summary, p_confidence,
      p_promotion_mode, p_promotion_reason, p_promoted_by, p_promoted_at, p_external_refs
    ) returning id into v_customer_id;
    v_created := true;
  else
    update public.crm_customers set
      customer_name = coalesce(nullif(p_company_name, ''), customer_name),
      website_url = coalesce(p_website_url, website_url),
      status = p_status,
      source = 'MIA',
      source_detail = 'AI Sales Agent',
      original_outreach_subject = coalesce(p_original_outreach_subject, original_outreach_subject),
      first_contact_at = coalesce(first_contact_at, p_first_contact_at),
      last_reply_at = greatest(coalesce(last_reply_at, p_last_reply_at), p_last_reply_at),
      mia_intent = p_intent,
      mia_reply_classification = p_reply_classification,
      next_action = p_recommended_next_action,
      latest_reply_summary = p_summary,
      mia_confidence = p_confidence,
      promotion_mode = p_promotion_mode,
      promotion_reason = p_promotion_reason,
      promoted_by = p_promoted_by,
      promoted_at = p_promoted_at,
      external_refs = coalesce(external_refs, '{}'::jsonb) || coalesce(p_external_refs, '{}'::jsonb),
      updated_at = now(),
      is_active = true
    where id = v_customer_id;
  end if;

  if nullif(trim(coalesce(p_email, '')), '') is not null then
    update public.crm_contacts set
      contact_name = coalesce(nullif(p_contact_name, ''), contact_name),
      phone = coalesce(nullif(p_phone, ''), phone),
      is_primary = true,
      updated_at = now()
    where customer_id = v_customer_id and lower(email) = lower(p_email);

    if not found then
      insert into public.crm_contacts (customer_id, contact_name, email, phone, is_primary)
      values (v_customer_id, p_contact_name, p_email, p_phone, true);
    end if;
  end if;

  insert into public.crm_activities (
    customer_id, activity_type, activity_at, summary, source, external_ref_id, metadata
  ) values (
    v_customer_id, 'mia_promoted', coalesce(p_last_reply_at, now()),
    'Promoted from MIA', 'MIA', p_mia_company_id::text,
    jsonb_build_object(
      'source_detail', 'AI Sales Agent',
      'intent', p_intent,
      'reply_classification', p_reply_classification,
      'summary', p_summary,
      'confidence', p_confidence,
      'promotion_mode', p_promotion_mode,
      'promotion_reason', p_promotion_reason,
      'promoted_by', p_promoted_by,
      'promoted_at', p_promoted_at,
      'external_refs', coalesce(p_external_refs, '{}'::jsonb)
    )
  ) on conflict (customer_id, activity_type)
    where activity_type = 'mia_promoted' do nothing;

  return query select v_customer_id, v_created;
end;
$$;

revoke all on function public.promote_mia_company(
  uuid, text, text, text, text, text, text, timestamptz, timestamptz,
  text, text, text, text, text, numeric, text, text, text, timestamptz, jsonb
) from public, anon, authenticated;
grant execute on function public.promote_mia_company(
  uuid, text, text, text, text, text, text, timestamptz, timestamptz,
  text, text, text, text, text, numeric, text, text, text, timestamptz, jsonb
) to service_role;

comment on function public.promote_mia_company is
  'Service-role-only SECURITY INVOKER atomic upsert for qualified MIA HUMAN_REPLY or audited manual promotions. Never creates crm_followups.';
