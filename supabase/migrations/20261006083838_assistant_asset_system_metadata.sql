-- GCI Executive Assistant: narrowly scoped Systems Registry Supabase metadata.
-- The action can update exactly three fields on one existing asset and keeps
-- lifecycle/review status and all MIA business data outside its scope.

alter table public.executive_system_registry
  add column if not exists supabase_url text;

create or replace function public.assistant_preview_asset_system_metadata(
  p_action_type text,
  p_target_id uuid,
  p_payload jsonb,
  p_request_hash text,
  p_reason text,
  p_actor text default 'gci-executive-assistant'
)
returns jsonb
language plpgsql
security invoker
set search_path = public, assistant_private, pg_temp
as $$
declare
  v_before jsonb;
  v_proposed jsonb;
  v_preview assistant_private.action_previews%rowtype;
  v_ref text;
begin
  if p_action_type <> 'update_asset_system_metadata'
     or p_target_id is null
     or p_payload is null or jsonb_typeof(p_payload) <> 'object'
     or not (p_payload ?& array['supabase_project_name', 'supabase_project_ref', 'supabase_url'])
     or (p_payload - array['supabase_project_name', 'supabase_project_ref', 'supabase_url']) <> '{}'::jsonb
     or p_request_hash !~ '^[0-9a-f]{64}$'
     or length(btrim(coalesce(p_reason, ''))) not between 1 and 1000 then
    raise exception 'assistant_invalid_payload' using errcode = '22023';
  end if;

  v_ref := p_payload->>'supabase_project_ref';
  if length(btrim(coalesce(p_payload->>'supabase_project_name', ''))) not between 1 and 200
     or v_ref !~ '^[a-z0-9]{20}$'
     or p_payload->>'supabase_url' <> 'https://' || v_ref || '.supabase.co' then
    raise exception 'assistant_invalid_payload' using errcode = '22023';
  end if;

  select to_jsonb(t) into v_before
  from public.executive_system_registry t
  where id = p_target_id;
  if v_before is null then
    raise exception 'assistant_target_not_found' using errcode = 'P0002';
  end if;

  v_proposed := v_before || jsonb_build_object(
    'supabase_project_name', btrim(p_payload->>'supabase_project_name'),
    'supabase_project_ref', v_ref,
    'supabase_url', p_payload->>'supabase_url'
  );

  insert into assistant_private.action_previews (
    actor, action_type, module, target_type, target_id, payload,
    request_hash, reason, risk_level, before_state, proposed_state
  ) values (
    p_actor, p_action_type, 'systems', 'asset', p_target_id, p_payload,
    p_request_hash, btrim(p_reason), 'medium', v_before, v_proposed
  ) returning * into v_preview;

  return jsonb_build_object(
    'ok', true, 'preview_id', v_preview.id, 'risk', 'medium',
    'action_type', p_action_type, 'module', 'systems',
    'target_type', 'asset', 'target_id', p_target_id,
    'before', v_before, 'proposed', v_proposed,
    'reason', v_preview.reason, 'expires_at', v_preview.expires_at,
    'confirmation_required', true
  );
end;
$$;

create or replace function public.assistant_execute_asset_system_metadata(
  p_action_type text,
  p_target_id uuid,
  p_payload jsonb,
  p_idempotency_key text,
  p_request_hash text,
  p_reason text,
  p_confirmation_token uuid default null,
  p_confirmed_by text default null,
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
  v_request_id uuid := gen_random_uuid();
  v_preview assistant_private.action_previews%rowtype;
  v_ref text;
begin
  if p_action_type <> 'update_asset_system_metadata'
     or p_target_id is null
     or p_payload is null or jsonb_typeof(p_payload) <> 'object'
     or not (p_payload ?& array['supabase_project_name', 'supabase_project_ref', 'supabase_url'])
     or (p_payload - array['supabase_project_name', 'supabase_project_ref', 'supabase_url']) <> '{}'::jsonb
     or length(coalesce(p_idempotency_key, '')) not between 8 and 200
     or p_request_hash !~ '^[0-9a-f]{64}$'
     or length(btrim(coalesce(p_reason, ''))) not between 1 and 1000
     or length(coalesce(p_actor, '')) not between 1 and 100 then
    raise exception 'assistant_invalid_payload' using errcode = '22023';
  end if;

  v_ref := p_payload->>'supabase_project_ref';
  if length(btrim(coalesce(p_payload->>'supabase_project_name', ''))) not between 1 and 200
     or v_ref !~ '^[a-z0-9]{20}$'
     or p_payload->>'supabase_url' <> 'https://' || v_ref || '.supabase.co' then
    raise exception 'assistant_invalid_payload' using errcode = '22023';
  end if;

  insert into assistant_private.idempotency_requests (
    action, idempotency_key, request_hash, actor, customer_id, module,
    target_type, target_id, request_id
  ) values (
    p_action_type, p_idempotency_key, p_request_hash, p_actor, null, 'systems',
    'asset', p_target_id, v_request_id
  ) on conflict (action, idempotency_key) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    select request_hash, response into v_existing_hash, v_existing_response
    from assistant_private.idempotency_requests
    where action = p_action_type and idempotency_key = p_idempotency_key;
    if v_existing_hash is distinct from p_request_hash then
      raise exception 'assistant_idempotency_conflict' using errcode = '23505';
    end if;
    if v_existing_response is null then
      raise exception 'assistant_idempotency_incomplete' using errcode = '55000';
    end if;
    return v_existing_response || jsonb_build_object('idempotent_replay', true);
  end if;

  select to_jsonb(t) into v_before
  from public.executive_system_registry t
  where id = p_target_id
  for update;
  if v_before is null then
    raise exception 'assistant_target_not_found' using errcode = 'P0002';
  end if;

  if p_confirmation_token is null or length(btrim(coalesce(p_confirmed_by, ''))) < 1 then
    raise exception 'assistant_confirmation_required' using errcode = '42501';
  end if;
  select * into v_preview
  from assistant_private.action_previews
  where id = p_confirmation_token
  for update;
  if v_preview.id is null then raise exception 'assistant_confirmation_invalid' using errcode = 'P0002'; end if;
  if v_preview.expires_at < now() then raise exception 'assistant_confirmation_expired' using errcode = '57014'; end if;
  if v_preview.executed_at is not null or v_preview.actor <> p_actor
     or v_preview.action_type <> p_action_type
     or v_preview.target_id is distinct from p_target_id
     or v_preview.request_hash <> p_request_hash
     or v_preview.before_state is distinct from v_before then
    raise exception 'assistant_confirmation_mismatch' using errcode = '22023';
  end if;
  update assistant_private.action_previews
  set confirmed_by = btrim(p_confirmed_by), confirmed_at = now()
  where id = p_confirmation_token;

  update public.executive_system_registry
  set supabase_project_name = btrim(p_payload->>'supabase_project_name'),
      supabase_project_ref = v_ref,
      supabase_url = p_payload->>'supabase_url'
  where id = p_target_id
  returning to_jsonb(executive_system_registry.*) into v_after;

  if v_after is null then
    raise exception 'assistant_invalid_payload' using errcode = '22023';
  end if;
  v_result := jsonb_build_object(
    'ok', true, 'action_type', p_action_type, 'risk', 'medium',
    'target_type', 'asset', 'target_id', p_target_id,
    'result', v_after, 'request_id', v_request_id, 'idempotent_replay', false
  );

  insert into assistant_private.audit_log (
    actor, action, action_type, module, target_type, customer_id, target_id,
    idempotency_key, request_hash, before_state, after_state, reason,
    request_id, confirmation_required, confirmed_by
  ) values (
    p_actor, p_action_type, p_action_type, 'systems', 'asset', null, p_target_id,
    p_idempotency_key, p_request_hash, v_before, v_after, btrim(p_reason),
    v_request_id, true, btrim(p_confirmed_by)
  );
  update assistant_private.idempotency_requests
  set response = v_result, completed_at = now(), target_id = p_target_id
  where action = p_action_type and idempotency_key = p_idempotency_key;
  update assistant_private.action_previews
  set executed_at = now()
  where id = p_confirmation_token;
  return v_result;
end;
$$;

revoke all on function public.assistant_preview_asset_system_metadata(text,uuid,jsonb,text,text,text) from public,anon,authenticated;
revoke all on function public.assistant_execute_asset_system_metadata(text,uuid,jsonb,text,text,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.assistant_preview_asset_system_metadata(text,uuid,jsonb,text,text,text) to service_role;
grant execute on function public.assistant_execute_asset_system_metadata(text,uuid,jsonb,text,text,text,uuid,text,text) to service_role;

do $$ begin
  if to_regclass('ops.migration_ledger') is not null then
    insert into ops.migration_ledger(version,name,kind,notes)
    values(
      '20261006083838',
      'assistant_asset_system_metadata',
      'schema',
      'Add one confirmed/audited/idempotent action that updates only Systems Registry Supabase project name, ref, and URL'
    ) on conflict(version) do nothing;
  end if;
end $$;
