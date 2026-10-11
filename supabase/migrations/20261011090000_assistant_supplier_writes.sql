-- GCI Executive Assistant supplier writes.
-- Service-to-service only; existing application permissions remain unchanged.

create schema if not exists assistant_private;

create table if not exists assistant_private.supplier_idempotency_requests (
  action text not null,
  idempotency_key text not null,
  request_hash text not null,
  actor text not null,
  supplier_id uuid references public.suppliers(id),
  response jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (action, idempotency_key)
);

create table if not exists assistant_private.supplier_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor text not null,
  action text not null,
  supplier_id uuid not null references public.suppliers(id),
  target_id uuid,
  idempotency_key text not null,
  request_hash text not null,
  before_state jsonb,
  after_state jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists assistant_supplier_audit_supplier_created_idx
  on assistant_private.supplier_audit_log(supplier_id, created_at desc);

alter table assistant_private.supplier_idempotency_requests enable row level security;
alter table assistant_private.supplier_audit_log enable row level security;
revoke all on assistant_private.supplier_idempotency_requests from public, anon, authenticated;
revoke all on assistant_private.supplier_audit_log from public, anon, authenticated;
grant select, insert, update on assistant_private.supplier_idempotency_requests to service_role;
grant select, insert on assistant_private.supplier_audit_log to service_role;
grant usage on schema assistant_private to service_role;

create or replace function public.assistant_execute_supplier_action(
  p_action text,
  p_supplier_id uuid,
  p_payload jsonb,
  p_idempotency_key text,
  p_request_hash text,
  p_actor text default 'gci-executive-assistant'
)
returns jsonb
language plpgsql
security invoker
set search_path = public, assistant_private, pg_temp
as $$
declare
  v_inserted integer := 0;
  v_existing_hash text;
  v_existing_response jsonb;
  v_before jsonb;
  v_after jsonb;
  v_result jsonb;
  v_supplier_id uuid := p_supplier_id;
  v_target_id uuid;
  v_short_code text;
begin
  if current_user <> 'service_role' then
    raise exception 'assistant_service_role_required' using errcode = '42501';
  end if;
  if p_action not in ('supplier_create', 'supplier_update', 'supplier_contact_upsert')
     or p_payload is null or jsonb_typeof(p_payload) <> 'object'
     or length(coalesce(p_idempotency_key, '')) not between 8 and 200
     or p_request_hash !~ '^[0-9a-f]{64}$'
     or length(coalesce(p_actor, '')) not between 1 and 100
     or (p_action <> 'supplier_create' and p_supplier_id is null) then
    raise exception 'assistant_invalid_payload' using errcode = '22023';
  end if;

  insert into assistant_private.supplier_idempotency_requests
    (action, idempotency_key, request_hash, actor, supplier_id)
  values (p_action, p_idempotency_key, p_request_hash, p_actor, p_supplier_id)
  on conflict (action, idempotency_key) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    select request_hash, response into v_existing_hash, v_existing_response
      from assistant_private.supplier_idempotency_requests
      where action = p_action and idempotency_key = p_idempotency_key;
    if v_existing_hash is distinct from p_request_hash then
      raise exception 'assistant_idempotency_conflict' using errcode = '23505';
    end if;
    if v_existing_response is null then
      raise exception 'assistant_idempotency_incomplete' using errcode = '55000';
    end if;
    return v_existing_response || jsonb_build_object('idempotent_replay', true);
  end if;

  if p_action = 'supplier_create' then
    if not exists (select 1 from jsonb_object_keys(p_payload))
       or exists (select 1 from jsonb_object_keys(p_payload) k where k not in
         ('supplier_name_display','short_code','legacy_short_code','name_cn','name_en','supplier_type','product_categories','country','city','is_preferred','status','current_rating','internal_owner','default_lead_time_days','payment_terms','strength_notes','website','established_year','notes'))
       or length(btrim(coalesce(p_payload->>'supplier_name_display', ''))) not between 1 and 500 then
      raise exception 'assistant_invalid_payload' using errcode = '22023';
    end if;
    if (p_payload ? 'supplier_type' and coalesce(p_payload->>'supplier_type', '') not in ('Factory','Trading','Integrated','Service','Agent','Unknown'))
       or (p_payload ? 'status' and coalesce(p_payload->>'status', '') not in ('active','inactive','blacklisted','under_review','archived'))
       or (p_payload ? 'current_rating' and p_payload->>'current_rating' is not null and p_payload->>'current_rating' not in ('A','B','C','D'))
       or (p_payload ? 'product_categories' and jsonb_typeof(p_payload->'product_categories') <> 'array') then
      raise exception 'assistant_invalid_payload' using errcode = '22023';
    end if;
    if exists (
      select 1 from public.suppliers s
      where regexp_replace(lower(btrim(coalesce(s.supplier_name_display, ''))), '\s+', ' ', 'g') = regexp_replace(lower(btrim(p_payload->>'supplier_name_display')), '\s+', ' ', 'g')
         or (nullif(btrim(p_payload->>'short_code'), '') is not null and lower(btrim(s.short_code)) = lower(btrim(p_payload->>'short_code')))
         or (nullif(btrim(p_payload->>'legacy_short_code'), '') is not null and lower(btrim(coalesce(s.legacy_short_code, ''))) = lower(btrim(p_payload->>'legacy_short_code')))
    ) then
      raise exception 'assistant_supplier_duplicate' using errcode = '23505';
    end if;

    v_short_code := nullif(btrim(p_payload->>'short_code'), '');
    if v_short_code is null then
      perform pg_advisory_xact_lock(hashtext('assistant_supplier_short_code'));
      select 'SUP-AUTO-' || lpad((coalesce(max(substring(short_code from '^SUP-AUTO-([0-9]+)$')::integer), 0) + 1)::text, 6, '0')
        into v_short_code from public.suppliers where short_code ~ '^SUP-AUTO-[0-9]+$';
    end if;

    insert into public.suppliers (
      short_code, legacy_short_code, supplier_name_display, name_cn, name_en, supplier_type,
      product_categories, country, city, is_preferred, status, current_rating, internal_owner,
      default_lead_time_days, payment_terms, strength_notes, website, established_year, notes
    ) values (
      v_short_code, nullif(btrim(p_payload->>'legacy_short_code'), ''), btrim(p_payload->>'supplier_name_display'),
      nullif(btrim(p_payload->>'name_cn'), ''), nullif(btrim(p_payload->>'name_en'), ''), coalesce(nullif(p_payload->>'supplier_type', ''), 'Unknown'),
      case when p_payload ? 'product_categories' then array(select jsonb_array_elements_text(p_payload->'product_categories')) else null end,
      nullif(btrim(p_payload->>'country'), ''), nullif(btrim(p_payload->>'city'), ''), coalesce((p_payload->>'is_preferred')::boolean, false),
      coalesce(nullif(p_payload->>'status', ''), 'active'), nullif(p_payload->>'current_rating', ''), nullif(btrim(p_payload->>'internal_owner'), ''),
      nullif(p_payload->>'default_lead_time_days', '')::integer, nullif(btrim(p_payload->>'payment_terms'), ''), nullif(btrim(p_payload->>'strength_notes'), ''),
      nullif(btrim(p_payload->>'website'), ''), nullif(p_payload->>'established_year', '')::integer, nullif(btrim(p_payload->>'notes'), '')
    ) returning id, to_jsonb(suppliers.*) into v_supplier_id, v_after;
    v_target_id := v_supplier_id;

  elsif p_action = 'supplier_update' then
    if not exists (select 1 from jsonb_object_keys(p_payload))
       or exists (select 1 from jsonb_object_keys(p_payload) k where k not in
         ('supplier_name_display','name_cn','name_en','supplier_type','product_categories','country','city','is_preferred','status','current_rating','internal_owner','default_lead_time_days','payment_terms','strength_notes','website','established_year','notes')) then
      raise exception 'assistant_invalid_payload' using errcode = '22023';
    end if;
    if (p_payload ? 'supplier_name_display' and length(btrim(coalesce(p_payload->>'supplier_name_display', ''))) not between 1 and 500)
       or (p_payload ? 'supplier_type' and coalesce(p_payload->>'supplier_type', '') not in ('Factory','Trading','Integrated','Service','Agent','Unknown'))
       or (p_payload ? 'status' and coalesce(p_payload->>'status', '') not in ('active','inactive','blacklisted','under_review','archived'))
       or (p_payload ? 'current_rating' and p_payload->>'current_rating' is not null and p_payload->>'current_rating' not in ('A','B','C','D'))
       or (p_payload ? 'product_categories' and jsonb_typeof(p_payload->'product_categories') <> 'array') then
      raise exception 'assistant_invalid_payload' using errcode = '22023';
    end if;
    select to_jsonb(s) into v_before from public.suppliers s where s.id = v_supplier_id for update;
    if v_before is null then raise exception 'assistant_supplier_not_found' using errcode = 'P0002'; end if;
    if p_payload ? 'supplier_name_display' and exists (
      select 1 from public.suppliers s where s.id <> v_supplier_id
        and regexp_replace(lower(btrim(s.supplier_name_display)), '\s+', ' ', 'g') = regexp_replace(lower(btrim(p_payload->>'supplier_name_display')), '\s+', ' ', 'g')
    ) then raise exception 'assistant_supplier_duplicate' using errcode = '23505'; end if;

    update public.suppliers set
      supplier_name_display = case when p_payload ? 'supplier_name_display' then btrim(p_payload->>'supplier_name_display') else supplier_name_display end,
      name_cn = case when p_payload ? 'name_cn' then nullif(btrim(p_payload->>'name_cn'), '') else name_cn end,
      name_en = case when p_payload ? 'name_en' then nullif(btrim(p_payload->>'name_en'), '') else name_en end,
      supplier_type = case when p_payload ? 'supplier_type' then p_payload->>'supplier_type' else supplier_type end,
      product_categories = case when p_payload ? 'product_categories' then array(select jsonb_array_elements_text(p_payload->'product_categories')) else product_categories end,
      country = case when p_payload ? 'country' then nullif(btrim(p_payload->>'country'), '') else country end,
      city = case when p_payload ? 'city' then nullif(btrim(p_payload->>'city'), '') else city end,
      is_preferred = case when p_payload ? 'is_preferred' then (p_payload->>'is_preferred')::boolean else is_preferred end,
      status = case when p_payload ? 'status' then p_payload->>'status' else status end,
      current_rating = case when p_payload ? 'current_rating' then nullif(p_payload->>'current_rating', '') else current_rating end,
      internal_owner = case when p_payload ? 'internal_owner' then nullif(btrim(p_payload->>'internal_owner'), '') else internal_owner end,
      default_lead_time_days = case when p_payload ? 'default_lead_time_days' then nullif(p_payload->>'default_lead_time_days', '')::integer else default_lead_time_days end,
      payment_terms = case when p_payload ? 'payment_terms' then nullif(btrim(p_payload->>'payment_terms'), '') else payment_terms end,
      strength_notes = case when p_payload ? 'strength_notes' then nullif(btrim(p_payload->>'strength_notes'), '') else strength_notes end,
      website = case when p_payload ? 'website' then nullif(btrim(p_payload->>'website'), '') else website end,
      established_year = case when p_payload ? 'established_year' then nullif(p_payload->>'established_year', '')::integer else established_year end,
      notes = case when p_payload ? 'notes' then nullif(btrim(p_payload->>'notes'), '') else notes end,
      updated_at = now()
    where id = v_supplier_id returning to_jsonb(suppliers.*) into v_after;
    v_target_id := v_supplier_id;

  else
    if not exists (select 1 from jsonb_object_keys(p_payload))
       or exists (select 1 from jsonb_object_keys(p_payload) k where k not in
         ('contact_id','full_name','job_title','department','contact_role','phone','mobile','whatsapp','wechat','email','preferred_language','is_primary','is_decision_maker','is_commercial_contact','is_technical_contact','is_finance_contact','is_logistics_contact','status','notes')) then
      raise exception 'assistant_invalid_payload' using errcode = '22023';
    end if;
    perform 1 from public.suppliers where id = v_supplier_id for update;
    if not found then raise exception 'assistant_supplier_not_found' using errcode = 'P0002'; end if;
    if p_payload ? 'contact_id' then
      v_target_id := (p_payload->>'contact_id')::uuid;
      select to_jsonb(c) into v_before from public.supplier_contacts c where c.id = v_target_id and c.supplier_id = v_supplier_id for update;
      if v_before is null then raise exception 'assistant_supplier_contact_not_found' using errcode = 'P0002'; end if;
      if p_payload ? 'full_name' and length(btrim(coalesce(p_payload->>'full_name', ''))) not between 1 and 300 then raise exception 'assistant_invalid_payload' using errcode = '22023'; end if;
      update public.supplier_contacts set
        full_name = case when p_payload ? 'full_name' then btrim(p_payload->>'full_name') else full_name end,
        job_title = case when p_payload ? 'job_title' then nullif(btrim(p_payload->>'job_title'), '') else job_title end,
        department = case when p_payload ? 'department' then nullif(btrim(p_payload->>'department'), '') else department end,
        contact_role = case when p_payload ? 'contact_role' then nullif(btrim(p_payload->>'contact_role'), '') else contact_role end,
        phone = case when p_payload ? 'phone' then nullif(btrim(p_payload->>'phone'), '') else phone end,
        mobile = case when p_payload ? 'mobile' then nullif(btrim(p_payload->>'mobile'), '') else mobile end,
        whatsapp = case when p_payload ? 'whatsapp' then nullif(btrim(p_payload->>'whatsapp'), '') else whatsapp end,
        wechat = case when p_payload ? 'wechat' then nullif(btrim(p_payload->>'wechat'), '') else wechat end,
        email = case when p_payload ? 'email' then nullif(btrim(p_payload->>'email'), '') else email end,
        preferred_language = case when p_payload ? 'preferred_language' then nullif(btrim(p_payload->>'preferred_language'), '') else preferred_language end,
        is_primary = case when p_payload ? 'is_primary' then (p_payload->>'is_primary')::boolean else is_primary end,
        is_decision_maker = case when p_payload ? 'is_decision_maker' then (p_payload->>'is_decision_maker')::boolean else is_decision_maker end,
        is_commercial_contact = case when p_payload ? 'is_commercial_contact' then (p_payload->>'is_commercial_contact')::boolean else is_commercial_contact end,
        is_technical_contact = case when p_payload ? 'is_technical_contact' then (p_payload->>'is_technical_contact')::boolean else is_technical_contact end,
        is_finance_contact = case when p_payload ? 'is_finance_contact' then (p_payload->>'is_finance_contact')::boolean else is_finance_contact end,
        is_logistics_contact = case when p_payload ? 'is_logistics_contact' then (p_payload->>'is_logistics_contact')::boolean else is_logistics_contact end,
        status = case when p_payload ? 'status' then nullif(btrim(p_payload->>'status'), '') else status end,
        notes = case when p_payload ? 'notes' then nullif(btrim(p_payload->>'notes'), '') else notes end,
        updated_at = now()
      where id = v_target_id returning to_jsonb(supplier_contacts.*) into v_after;
    else
      if length(btrim(coalesce(p_payload->>'full_name', ''))) not between 1 and 300 then raise exception 'assistant_invalid_payload' using errcode = '22023'; end if;
      insert into public.supplier_contacts (
        supplier_id, full_name, job_title, department, contact_role, phone, mobile, whatsapp, wechat, email, preferred_language,
        is_primary, is_decision_maker, is_commercial_contact, is_technical_contact, is_finance_contact, is_logistics_contact, status, notes
      ) values (
        v_supplier_id, btrim(p_payload->>'full_name'), nullif(btrim(p_payload->>'job_title'), ''), nullif(btrim(p_payload->>'department'), ''),
        nullif(btrim(p_payload->>'contact_role'), ''), nullif(btrim(p_payload->>'phone'), ''), nullif(btrim(p_payload->>'mobile'), ''),
        nullif(btrim(p_payload->>'whatsapp'), ''), nullif(btrim(p_payload->>'wechat'), ''), nullif(btrim(p_payload->>'email'), ''),
        nullif(btrim(p_payload->>'preferred_language'), ''), coalesce((p_payload->>'is_primary')::boolean, false),
        coalesce((p_payload->>'is_decision_maker')::boolean, false), coalesce((p_payload->>'is_commercial_contact')::boolean, false),
        coalesce((p_payload->>'is_technical_contact')::boolean, false), coalesce((p_payload->>'is_finance_contact')::boolean, false),
        coalesce((p_payload->>'is_logistics_contact')::boolean, false), coalesce(nullif(btrim(p_payload->>'status'), ''), 'active'),
        nullif(btrim(p_payload->>'notes'), '')
      ) returning id, to_jsonb(supplier_contacts.*) into v_target_id, v_after;
    end if;
  end if;

  v_result := jsonb_build_object(
    'ok', true, 'action', p_action, 'supplier_id', v_supplier_id, 'target_id', v_target_id,
    'supplier', case when p_action like 'supplier_%' and p_action <> 'supplier_contact_upsert' then
      jsonb_build_object('id', v_supplier_id, 'short_code', v_after->'short_code', 'supplier_name_display', v_after->'supplier_name_display', 'status', v_after->'status') else null end,
    'contact', case when p_action = 'supplier_contact_upsert' then
      jsonb_build_object('id', v_target_id, 'supplier_id', v_supplier_id, 'full_name', v_after->'full_name', 'status', v_after->'status') else null end,
    'idempotent_replay', false
  );
  insert into assistant_private.supplier_audit_log
    (actor, action, supplier_id, target_id, idempotency_key, request_hash, before_state, after_state)
  values (p_actor, p_action, v_supplier_id, v_target_id, p_idempotency_key, p_request_hash, v_before, v_after);
  update assistant_private.supplier_idempotency_requests
    set supplier_id = v_supplier_id, response = v_result, completed_at = now()
    where action = p_action and idempotency_key = p_idempotency_key;
  return v_result;
end;
$$;

revoke all on function public.assistant_execute_supplier_action(text, uuid, jsonb, text, text, text) from public, anon, authenticated;
grant execute on function public.assistant_execute_supplier_action(text, uuid, jsonb, text, text, text) to service_role;

do $$
begin
  if to_regclass('ops.migration_ledger') is not null then
    insert into ops.migration_ledger (version, name, kind, notes)
    values ('20261011090000', 'assistant_supplier_writes', 'schema', 'Service-role-only supplier profile/contact actions with isolated audit and idempotency')
    on conflict (version) do nothing;
  end if;
end $$;
