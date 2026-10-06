-- GCI Executive Assistant: audited Action Center / Decisions writes.
-- Reuses assistant_private.action_previews, audit_log, and
-- idempotency_requests. It does not replace or modify the existing business
-- action RPCs and never deletes or bulk-updates business records.

create or replace function public.assistant_preview_action_center_action(
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
  v_module text;
  v_target_type text;
  v_before jsonb;
  v_proposed jsonb;
  v_preview assistant_private.action_previews%rowtype;
  v_duplicate_id uuid;
begin
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'assistant_service_role_required' using errcode = '42501';
  end if;
  if p_target_id is null
     or p_payload is null or jsonb_typeof(p_payload) <> 'object'
     or p_request_hash !~ '^[0-9a-f]{64}$'
     or length(btrim(coalesce(p_reason, ''))) not between 1 and 1000 then
    raise exception 'assistant_invalid_payload' using errcode = '22023';
  end if;

  v_module := case
    when p_action_type in ('update_task_status') then 'management'
    when p_action_type in ('complete_commitment') then 'management'
    when p_action_type in ('close_decision', 'mark_decision_duplicate') then 'decisions'
    when p_action_type = 'update_asset_review_status' then 'systems'
  end;
  v_target_type := case
    when p_action_type = 'update_task_status' then 'task'
    when p_action_type = 'complete_commitment' then 'commitment'
    when p_action_type in ('close_decision', 'mark_decision_duplicate') then 'decision'
    when p_action_type = 'update_asset_review_status' then 'asset'
  end;
  if v_module is null then
    raise exception 'assistant_invalid_payload' using errcode = '22023';
  end if;

  if p_action_type = 'update_task_status' then
    if p_payload->>'status' not in ('open', 'in_progress', 'completed', 'cancelled')
       or (p_payload - 'status') <> '{}'::jsonb then
      raise exception 'assistant_invalid_payload' using errcode = '22023';
    end if;
    select to_jsonb(t) into v_before from public.executive_tasks t where id = p_target_id;
    v_proposed := v_before || jsonb_build_object(
      'status', p_payload->>'status',
      'completed_at', case when p_payload->>'status' = 'completed' then to_jsonb('on_confirmation'::text) else 'null'::jsonb end
    );
  elsif p_action_type = 'complete_commitment' then
    if (p_payload - 'completion_note') <> '{}'::jsonb
       or length(coalesce(p_payload->>'completion_note', '')) > 5000 then
      raise exception 'assistant_invalid_payload' using errcode = '22023';
    end if;
    select to_jsonb(t) into v_before from public.executive_commitments t where id = p_target_id and status = 'open';
    v_proposed := v_before || jsonb_build_object(
      'status', 'completed',
      'completion_note', nullif(btrim(p_payload->>'completion_note'), ''),
      'completed_at', 'on_confirmation'
    );
  elsif p_action_type = 'close_decision' then
    if (p_payload - 'note') <> '{}'::jsonb or length(coalesce(p_payload->>'note', '')) > 5000 then
      raise exception 'assistant_invalid_payload' using errcode = '22023';
    end if;
    select to_jsonb(t) into v_before from public.executive_decisions t where id = p_target_id and status = 'pending';
    v_proposed := v_before || jsonb_build_object(
      'status', 'dismissed', 'selected_option', 'closed',
      'decision_note', nullif(btrim(p_payload->>'note'), ''),
      'execution_status', 'not_required', 'completed_at', 'on_confirmation'
    );
  elsif p_action_type = 'mark_decision_duplicate' then
    if (p_payload - array['duplicate_of_id', 'note']) <> '{}'::jsonb
       or coalesce(p_payload->>'duplicate_of_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or length(coalesce(p_payload->>'note', '')) > 5000 then
      raise exception 'assistant_invalid_payload' using errcode = '22023';
    end if;
    v_duplicate_id := (p_payload->>'duplicate_of_id')::uuid;
    if v_duplicate_id = p_target_id or not exists (select 1 from public.executive_decisions where id = v_duplicate_id) then
      raise exception 'assistant_invalid_payload' using errcode = '22023';
    end if;
    select to_jsonb(t) into v_before from public.executive_decisions t where id = p_target_id and status = 'pending';
    v_proposed := v_before || jsonb_build_object(
      'status', 'dismissed', 'selected_option', 'duplicate',
      'decision_note', concat_ws(E'\n', 'Duplicate of ' || v_duplicate_id, nullif(btrim(p_payload->>'note'), '')),
      'execution_status', 'not_required', 'completed_at', 'on_confirmation'
    );
  elsif p_action_type = 'update_asset_review_status' then
    if p_payload->>'review_status' not in ('unknown', 'review', 'safe_candidate', 'do_not_delete')
       or (p_payload - 'review_status') <> '{}'::jsonb then
      raise exception 'assistant_invalid_payload' using errcode = '22023';
    end if;
    select to_jsonb(t) into v_before from public.executive_system_registry t where id = p_target_id;
    v_proposed := v_before || jsonb_build_object('deletion_status', p_payload->>'review_status');
  end if;

  if v_before is null then
    raise exception 'assistant_target_not_found' using errcode = 'P0002';
  end if;

  insert into assistant_private.action_previews (
    actor, action_type, module, target_type, target_id, payload,
    request_hash, reason, risk_level, before_state, proposed_state
  ) values (
    p_actor, p_action_type, v_module, v_target_type, p_target_id, p_payload,
    p_request_hash, btrim(p_reason), 'medium', v_before, v_proposed
  ) returning * into v_preview;

  return jsonb_build_object(
    'ok', true, 'preview_id', v_preview.id, 'risk', 'medium',
    'action_type', p_action_type, 'module', v_module,
    'target_type', v_target_type, 'target_id', p_target_id,
    'before', v_before, 'proposed', v_proposed,
    'reason', v_preview.reason, 'expires_at', v_preview.expires_at,
    'confirmation_required', true
  );
end;
$$;

create or replace function public.assistant_execute_action_center_action(
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
  v_risk text;
  v_module text;
  v_target_type text;
  v_inserted integer := 0;
  v_existing_hash text;
  v_existing_response jsonb;
  v_before jsonb;
  v_after jsonb;
  v_result jsonb;
  v_request_id uuid := gen_random_uuid();
  v_preview assistant_private.action_previews%rowtype;
  v_duplicate_id uuid;
begin
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'assistant_service_role_required' using errcode = '42501';
  end if;
  if p_target_id is null
     or p_payload is null or jsonb_typeof(p_payload) <> 'object'
     or length(coalesce(p_idempotency_key, '')) not between 8 and 200
     or p_request_hash !~ '^[0-9a-f]{64}$'
     or length(btrim(coalesce(p_reason, ''))) not between 1 and 1000
     or length(coalesce(p_actor, '')) not between 1 and 100 then
    raise exception 'assistant_invalid_payload' using errcode = '22023';
  end if;

  v_risk := case when p_action_type = 'update_task_due_date' then 'low'
    when p_action_type in ('update_task_status', 'complete_commitment', 'close_decision', 'mark_decision_duplicate', 'update_asset_review_status') then 'medium'
  end;
  v_module := case
    when p_action_type in ('update_task_status', 'update_task_due_date', 'complete_commitment') then 'management'
    when p_action_type in ('close_decision', 'mark_decision_duplicate') then 'decisions'
    when p_action_type = 'update_asset_review_status' then 'systems'
  end;
  v_target_type := case
    when p_action_type in ('update_task_status', 'update_task_due_date') then 'task'
    when p_action_type = 'complete_commitment' then 'commitment'
    when p_action_type in ('close_decision', 'mark_decision_duplicate') then 'decision'
    when p_action_type = 'update_asset_review_status' then 'asset'
  end;
  if v_risk is null then
    raise exception 'assistant_forbidden_action' using errcode = '42501';
  end if;

  insert into assistant_private.idempotency_requests (
    action, idempotency_key, request_hash, actor, customer_id, module,
    target_type, target_id, request_id
  ) values (
    p_action_type, p_idempotency_key, p_request_hash, p_actor, null, v_module,
    v_target_type, p_target_id, v_request_id
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

  if p_action_type in ('update_task_status', 'update_task_due_date') then
    select to_jsonb(t) into v_before from public.executive_tasks t where id = p_target_id for update;
  elsif p_action_type = 'complete_commitment' then
    select to_jsonb(t) into v_before from public.executive_commitments t where id = p_target_id and status = 'open' for update;
  elsif p_action_type in ('close_decision', 'mark_decision_duplicate') then
    select to_jsonb(t) into v_before from public.executive_decisions t where id = p_target_id and status = 'pending' for update;
  elsif p_action_type = 'update_asset_review_status' then
    select to_jsonb(t) into v_before from public.executive_system_registry t where id = p_target_id for update;
  end if;
  if v_before is null then
    raise exception 'assistant_target_not_found' using errcode = 'P0002';
  end if;

  if v_risk <> 'low' then
    if p_confirmation_token is null or length(btrim(coalesce(p_confirmed_by, ''))) < 1 then
      raise exception 'assistant_confirmation_required' using errcode = '42501';
    end if;
    select * into v_preview from assistant_private.action_previews where id = p_confirmation_token for update;
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
  end if;

  if p_action_type = 'update_task_status' then
    if p_payload->>'status' not in ('open', 'in_progress', 'completed', 'cancelled')
       or (p_payload - 'status') <> '{}'::jsonb then
      raise exception 'assistant_invalid_payload' using errcode = '22023';
    end if;
    update public.executive_tasks set
      status = p_payload->>'status',
      completed_at = case when p_payload->>'status' = 'completed' then now() else null end,
      updated_at = now()
    where id = p_target_id returning to_jsonb(executive_tasks.*) into v_after;
  elsif p_action_type = 'update_task_due_date' then
    if not (p_payload ? 'due_at') or (p_payload - 'due_at') <> '{}'::jsonb
       or jsonb_typeof(p_payload->'due_at') not in ('string', 'null') then
      raise exception 'assistant_invalid_payload' using errcode = '22023';
    end if;
    update public.executive_tasks set
      due_at = nullif(p_payload->>'due_at', '')::timestamptz,
      updated_at = now()
    where id = p_target_id returning to_jsonb(executive_tasks.*) into v_after;
  elsif p_action_type = 'complete_commitment' then
    if (p_payload - 'completion_note') <> '{}'::jsonb
       or length(coalesce(p_payload->>'completion_note', '')) > 5000 then
      raise exception 'assistant_invalid_payload' using errcode = '22023';
    end if;
    update public.executive_commitments set
      status = 'completed', completion_note = nullif(btrim(p_payload->>'completion_note'), ''),
      completed_at = now(), updated_at = now()
    where id = p_target_id returning to_jsonb(executive_commitments.*) into v_after;
  elsif p_action_type = 'close_decision' then
    if (p_payload - 'note') <> '{}'::jsonb or length(coalesce(p_payload->>'note', '')) > 5000 then
      raise exception 'assistant_invalid_payload' using errcode = '22023';
    end if;
    update public.executive_decisions set
      status = 'dismissed', selected_option = 'closed',
      decision_note = nullif(btrim(p_payload->>'note'), ''),
      decided_at = now(), execution_status = 'not_required', completed_at = now()
    where id = p_target_id returning to_jsonb(executive_decisions.*) into v_after;
  elsif p_action_type = 'mark_decision_duplicate' then
    if (p_payload - array['duplicate_of_id', 'note']) <> '{}'::jsonb
       or coalesce(p_payload->>'duplicate_of_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or length(coalesce(p_payload->>'note', '')) > 5000 then
      raise exception 'assistant_invalid_payload' using errcode = '22023';
    end if;
    v_duplicate_id := (p_payload->>'duplicate_of_id')::uuid;
    if v_duplicate_id = p_target_id or not exists (select 1 from public.executive_decisions where id = v_duplicate_id) then
      raise exception 'assistant_invalid_payload' using errcode = '22023';
    end if;
    update public.executive_decisions set
      status = 'dismissed', selected_option = 'duplicate',
      decision_note = concat_ws(E'\n', 'Duplicate of ' || v_duplicate_id, nullif(btrim(p_payload->>'note'), '')),
      decided_at = now(), execution_status = 'not_required', completed_at = now()
    where id = p_target_id returning to_jsonb(executive_decisions.*) into v_after;
  elsif p_action_type = 'update_asset_review_status' then
    if p_payload->>'review_status' not in ('unknown', 'review', 'safe_candidate', 'do_not_delete')
       or (p_payload - 'review_status') <> '{}'::jsonb then
      raise exception 'assistant_invalid_payload' using errcode = '22023';
    end if;
    update public.executive_system_registry set
      deletion_status = p_payload->>'review_status', updated_at = now()
    where id = p_target_id returning to_jsonb(executive_system_registry.*) into v_after;
  end if;

  if v_after is null then raise exception 'assistant_invalid_payload' using errcode = '22023'; end if;
  v_result := jsonb_build_object(
    'ok', true, 'action_type', p_action_type, 'risk', v_risk,
    'target_type', v_target_type, 'target_id', p_target_id,
    'result', v_after, 'request_id', v_request_id, 'idempotent_replay', false
  );

  insert into assistant_private.audit_log (
    actor, action, action_type, module, target_type, customer_id, target_id,
    idempotency_key, request_hash, before_state, after_state, reason,
    request_id, confirmation_required, confirmed_by
  ) values (
    p_actor, p_action_type, p_action_type, v_module, v_target_type, null, p_target_id,
    p_idempotency_key, p_request_hash, v_before, v_after, btrim(p_reason),
    v_request_id, v_risk <> 'low', case when v_risk <> 'low' then btrim(p_confirmed_by) else null end
  );
  update assistant_private.idempotency_requests
  set response = v_result, completed_at = now(), target_id = p_target_id
  where action = p_action_type and idempotency_key = p_idempotency_key;
  if v_risk <> 'low' then
    update assistant_private.action_previews set executed_at = now() where id = p_confirmation_token;
  end if;
  return v_result;
end;
$$;

revoke all on function public.assistant_preview_action_center_action(text,uuid,jsonb,text,text,text) from public,anon,authenticated;
revoke all on function public.assistant_execute_action_center_action(text,uuid,jsonb,text,text,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.assistant_preview_action_center_action(text,uuid,jsonb,text,text,text) to service_role;
grant execute on function public.assistant_execute_action_center_action(text,uuid,jsonb,text,text,text,uuid,text,text) to service_role;

do $$ begin
  if to_regclass('ops.migration_ledger') is not null then
    insert into ops.migration_ledger(version,name,kind,notes)
    values('20261006010000','assistant_action_center_writes','schema','Six audited/idempotent Action Center and Decisions writes; confirmation required for status, completion, close, duplicate, and asset review changes')
    on conflict(version) do nothing;
  end if;
end $$;
