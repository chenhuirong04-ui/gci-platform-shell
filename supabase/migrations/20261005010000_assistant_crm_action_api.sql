-- GCI Executive Assistant CRM Action API: atomic writes, audit, and idempotency.
-- Server-to-server only. The public RPC is executable by service_role only;
-- anon/authenticated receive no access to the private audit/idempotency schema.

create schema if not exists assistant_private;

create table if not exists assistant_private.idempotency_requests (
  action text not null,
  idempotency_key text not null,
  request_hash text not null,
  actor text not null,
  customer_id uuid not null references public.crm_customers(id),
  response jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (action, idempotency_key)
);

create table if not exists assistant_private.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor text not null,
  action text not null,
  customer_id uuid not null references public.crm_customers(id),
  target_id uuid,
  idempotency_key text not null,
  request_hash text not null,
  before_state jsonb,
  after_state jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists assistant_audit_customer_created_idx
  on assistant_private.audit_log(customer_id, created_at desc);

alter table assistant_private.idempotency_requests enable row level security;
alter table assistant_private.audit_log enable row level security;

revoke all on schema assistant_private from public, anon, authenticated;
revoke all on all tables in schema assistant_private from public, anon, authenticated;
grant usage on schema assistant_private to service_role;
grant select, insert, update on assistant_private.idempotency_requests to service_role;
grant select, insert on assistant_private.audit_log to service_role;

create or replace function public.assistant_execute_crm_action(
  p_action text,
  p_customer_id uuid,
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
  v_target_id uuid;
begin
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'assistant_service_role_required' using errcode = '42501';
  end if;
  if p_action not in ('customer_update', 'followup_create', 'contact_upsert')
     or p_customer_id is null
     or p_payload is null
     or jsonb_typeof(p_payload) <> 'object'
     or length(coalesce(p_idempotency_key, '')) not between 8 and 200
     or p_request_hash !~ '^[0-9a-f]{64}$'
     or length(coalesce(p_actor, '')) not between 1 and 100 then
    raise exception 'assistant_invalid_payload' using errcode = '22023';
  end if;

  insert into assistant_private.idempotency_requests (
    action, idempotency_key, request_hash, actor, customer_id
  ) values (
    p_action, p_idempotency_key, p_request_hash, p_actor, p_customer_id
  ) on conflict (action, idempotency_key) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    select request_hash, response
      into v_existing_hash, v_existing_response
      from assistant_private.idempotency_requests
      where action = p_action and idempotency_key = p_idempotency_key;
    if v_existing_hash is distinct from p_request_hash then
      raise exception 'assistant_idempotency_conflict' using errcode = '23505';
    end if;
    if v_existing_response is null then
      raise exception 'assistant_idempotency_incomplete' using errcode = '55000';
    end if;
    return v_existing_response || jsonb_build_object('idempotent_replay', true);
  end if;

  select to_jsonb(c) into v_before
    from public.crm_customers c
    where c.id = p_customer_id and c.is_active = true
    for update;
  if v_before is null then
    raise exception 'assistant_customer_not_found' using errcode = 'P0002';
  end if;

  if p_action = 'customer_update' then
    if not exists (select 1 from jsonb_object_keys(p_payload))
       or exists (
         select 1 from jsonb_object_keys(p_payload) as k
         where k not in ('status', 'priority', 'notes', 'next_action', 'next_follow_up_at')
       ) then
      raise exception 'assistant_invalid_payload' using errcode = '22023';
    end if;
    if p_payload ? 'status' and coalesce(p_payload->>'status', '') not in
      ('新询盘', '需求整理中', '待报价', '已报价待确认', '合同待签', '执行中', '暂缓', '已成交') then
      raise exception 'assistant_unsafe_status' using errcode = '22023';
    end if;
    if p_payload ? 'priority' and upper(coalesce(p_payload->>'priority', '')) not in ('A', 'B', 'C') then
      raise exception 'assistant_invalid_priority' using errcode = '22023';
    end if;

    update public.crm_customers
      set status = case when p_payload ? 'status' then p_payload->>'status' else status end,
          priority = case when p_payload ? 'priority' then upper(p_payload->>'priority') else priority end,
          follow_up_notes = case when p_payload ? 'notes' then nullif(btrim(p_payload->>'notes'), '') else follow_up_notes end,
          next_action = case when p_payload ? 'next_action' then nullif(btrim(p_payload->>'next_action'), '') else next_action end,
          next_follow_up_at = case when p_payload ? 'next_follow_up_at' then nullif(p_payload->>'next_follow_up_at', '')::date else next_follow_up_at end,
          updated_at = now()
      where id = p_customer_id
      returning to_jsonb(crm_customers.*) into v_after;

    v_target_id := p_customer_id;
    v_result := jsonb_build_object('ok', true, 'action', p_action, 'customer', v_after, 'idempotent_replay', false);

  elsif p_action = 'followup_create' then
    if exists (
         select 1 from jsonb_object_keys(p_payload) as k
         where k not in ('notes', 'next_action', 'next_follow_up_at', 'follow_up_date', 'method', 'status', 'owner')
       ) or length(btrim(coalesce(p_payload->>'notes', ''))) not between 1 and 5000 then
      raise exception 'assistant_invalid_payload' using errcode = '22023';
    end if;
    if p_payload ? 'status' and coalesce(p_payload->>'status', '') not in
      ('新询盘', '需求整理中', '待报价', '已报价待确认', '合同待签', '执行中', '暂缓', '已成交') then
      raise exception 'assistant_unsafe_status' using errcode = '22023';
    end if;

    insert into public.crm_followups (
      customer_id, follow_up_date, next_follow_up_at, method, notes,
      next_action, status_after, owner, source
    ) values (
      p_customer_id,
      coalesce(nullif(p_payload->>'follow_up_date', '')::date, current_date),
      nullif(p_payload->>'next_follow_up_at', '')::date,
      nullif(btrim(p_payload->>'method'), ''),
      btrim(p_payload->>'notes'),
      nullif(btrim(p_payload->>'next_action'), ''),
      nullif(btrim(p_payload->>'status'), ''),
      nullif(btrim(p_payload->>'owner'), ''),
      'assistant_api'
    ) returning id, to_jsonb(crm_followups.*) into v_target_id, v_after;

    update public.crm_customers
      set last_follow_up_at = coalesce(nullif(p_payload->>'follow_up_date', '')::date, current_date),
          follow_up_notes = btrim(p_payload->>'notes'),
          next_action = case when p_payload ? 'next_action' then nullif(btrim(p_payload->>'next_action'), '') else next_action end,
          next_follow_up_at = case when p_payload ? 'next_follow_up_at' then nullif(p_payload->>'next_follow_up_at', '')::date else next_follow_up_at end,
          status = case when p_payload ? 'status' then p_payload->>'status' else status end,
          updated_at = now()
      where id = p_customer_id;

    v_result := jsonb_build_object('ok', true, 'action', p_action, 'followup', v_after, 'idempotent_replay', false);

  else
    if exists (
         select 1 from jsonb_object_keys(p_payload) as k
         where k not in ('contact_id', 'contact_name', 'phone', 'whatsapp', 'email', 'is_primary')
       ) or not (p_payload ?| array['contact_name', 'phone', 'whatsapp', 'email', 'is_primary']) then
      raise exception 'assistant_invalid_payload' using errcode = '22023';
    end if;

    if p_payload ? 'contact_id' then
      v_target_id := (p_payload->>'contact_id')::uuid;
      select to_jsonb(c) into v_before
        from public.crm_contacts c
        where c.id = v_target_id and c.customer_id = p_customer_id
        for update;
      if v_before is null then
        raise exception 'assistant_contact_not_found' using errcode = 'P0002';
      end if;
      update public.crm_contacts
        set contact_name = case when p_payload ? 'contact_name' then nullif(btrim(p_payload->>'contact_name'), '') else contact_name end,
            phone = case when p_payload ? 'phone' then nullif(btrim(p_payload->>'phone'), '') else phone end,
            whatsapp = case when p_payload ? 'whatsapp' then nullif(btrim(p_payload->>'whatsapp'), '') else whatsapp end,
            email = case when p_payload ? 'email' then nullif(btrim(p_payload->>'email'), '') else email end,
            is_primary = case when p_payload ? 'is_primary' then (p_payload->>'is_primary')::boolean else is_primary end,
            updated_at = now()
        where id = v_target_id
        returning to_jsonb(crm_contacts.*) into v_after;
    else
      v_before := null;
      insert into public.crm_contacts (customer_id, contact_name, phone, whatsapp, email, is_primary)
      values (
        p_customer_id,
        nullif(btrim(p_payload->>'contact_name'), ''),
        nullif(btrim(p_payload->>'phone'), ''),
        nullif(btrim(p_payload->>'whatsapp'), ''),
        nullif(btrim(p_payload->>'email'), ''),
        coalesce((p_payload->>'is_primary')::boolean, true)
      ) returning id, to_jsonb(crm_contacts.*) into v_target_id, v_after;
    end if;
    v_result := jsonb_build_object('ok', true, 'action', p_action, 'contact', v_after, 'idempotent_replay', false);
  end if;

  insert into assistant_private.audit_log (
    actor, action, customer_id, target_id, idempotency_key, request_hash, before_state, after_state
  ) values (
    p_actor, p_action, p_customer_id, v_target_id, p_idempotency_key, p_request_hash, v_before, v_after
  );

  update assistant_private.idempotency_requests
    set response = v_result, completed_at = now()
    where action = p_action and idempotency_key = p_idempotency_key;
  return v_result;
end;
$$;

revoke all on function public.assistant_execute_crm_action(text, uuid, jsonb, text, text, text) from public, anon, authenticated;
grant execute on function public.assistant_execute_crm_action(text, uuid, jsonb, text, text, text) to service_role;

do $$
begin
  if to_regclass('ops.migration_ledger') is not null then
    insert into ops.migration_ledger (version, name, kind, notes)
    values ('20261005010000', 'assistant_crm_action_api', 'schema', 'Executive Assistant service-role-only CRM action RPC with private audit and idempotency records')
    on conflict (version) do nothing;
  end if;
end $$;
