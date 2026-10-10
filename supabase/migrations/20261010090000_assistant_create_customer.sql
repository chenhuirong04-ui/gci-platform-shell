-- GCI Executive Assistant: narrowly-scoped, service-role-only customer creation.
-- Reuses the existing assistant_private audit/idempotency tables. No table or RLS changes.

create or replace function public.assistant_create_crm_customer(
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
  v_name text;
  v_normalized_name text;
  v_existing_hash text;
  v_existing_response jsonb;
  v_customer public.crm_customers%rowtype;
  v_safe_customer jsonb;
  v_result jsonb;
  v_created boolean := false;
begin
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'assistant_service_role_required' using errcode = '42501';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object'
     or exists (select 1 from jsonb_object_keys(p_payload) k where k not in ('customer_name', 'business_type', 'country', 'city'))
     or length(coalesce(p_idempotency_key, '')) not between 8 and 200
     or p_request_hash !~ '^[0-9a-f]{64}$'
     or length(coalesce(p_actor, '')) not between 1 and 100 then
    raise exception 'assistant_invalid_payload' using errcode = '22023';
  end if;

  v_name := btrim(coalesce(p_payload->>'customer_name', ''));
  v_normalized_name := lower(regexp_replace(v_name, '\s+', ' ', 'g'));
  if length(v_name) not between 1 and 300
     or (p_payload ? 'business_type' and coalesce(p_payload->>'business_type', '') not in ('25H/AI', 'Trade', 'Workforce/Technical Services', 'Ecommerce', 'Other'))
     or length(coalesce(p_payload->>'country', '')) > 100
     or length(coalesce(p_payload->>'city', '')) > 100 then
    raise exception 'assistant_invalid_payload' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('customer_create:' || p_idempotency_key, 0));
  select request_hash, response into v_existing_hash, v_existing_response
    from assistant_private.idempotency_requests
    where action = 'customer_create' and idempotency_key = p_idempotency_key;
  if found then
    if v_existing_hash is distinct from p_request_hash then
      raise exception 'assistant_idempotency_conflict' using errcode = '23505';
    end if;
    if v_existing_response is null then
      raise exception 'assistant_idempotency_incomplete' using errcode = '55000';
    end if;
    return v_existing_response || jsonb_build_object('idempotent_replay', true);
  end if;

  perform pg_advisory_xact_lock(hashtextextended('crm_customer_name:' || v_normalized_name, 0));
  select * into v_customer
    from public.crm_customers c
    where lower(regexp_replace(btrim(c.customer_name), '\s+', ' ', 'g')) = v_normalized_name
    order by c.is_active desc, c.created_at asc
    limit 1;

  if not found then
    insert into public.crm_customers (
      customer_name, business_type, country, city, source, status, priority, is_active
    ) values (
      v_name,
      nullif(btrim(p_payload->>'business_type'), ''),
      nullif(btrim(p_payload->>'country'), ''),
      nullif(btrim(p_payload->>'city'), ''),
      'assistant_api', '新询盘', 'B', true
    ) returning * into v_customer;
    v_created := true;
  end if;

  v_safe_customer := jsonb_build_object(
    'id', v_customer.id,
    'customer_name', v_customer.customer_name,
    'business_type', v_customer.business_type,
    'country', v_customer.country,
    'city', v_customer.city,
    'status', v_customer.status,
    'priority', v_customer.priority,
    'is_active', v_customer.is_active
  );
  v_result := jsonb_build_object(
    'ok', true,
    'outcome', case when v_created then 'created' else 'duplicate' end,
    'customer', v_safe_customer,
    'idempotent_replay', false
  );

  insert into assistant_private.idempotency_requests (
    action, idempotency_key, request_hash, actor, customer_id, response, completed_at
  ) values (
    'customer_create', p_idempotency_key, p_request_hash, p_actor, v_customer.id, v_result, now()
  );
  insert into assistant_private.audit_log (
    actor, action, customer_id, target_id, idempotency_key, request_hash, before_state, after_state
  ) values (
    p_actor, 'customer_create', v_customer.id, v_customer.id, p_idempotency_key, p_request_hash,
    case when v_result->>'outcome' = 'duplicate' then v_safe_customer else null end,
    v_safe_customer || jsonb_build_object('outcome', v_result->>'outcome')
  );
  return v_result;
end;
$$;

revoke all on function public.assistant_create_crm_customer(jsonb, text, text, text) from public, anon, authenticated;
grant execute on function public.assistant_create_crm_customer(jsonb, text, text, text) to service_role;
