-- Refuses to remove audit/idempotency history after the API has processed writes.
do $$
begin
  if to_regclass('assistant_private.audit_log') is not null
     and exists (select 1 from assistant_private.audit_log) then
    raise exception 'Rollback refused: assistant_private.audit_log contains records.';
  end if;
  if to_regclass('assistant_private.idempotency_requests') is not null
     and exists (select 1 from assistant_private.idempotency_requests) then
    raise exception 'Rollback refused: assistant_private.idempotency_requests contains records.';
  end if;
end $$;

drop function if exists public.assistant_execute_crm_action(text, uuid, jsonb, text, text, text);
drop table if exists assistant_private.audit_log;
drop table if exists assistant_private.idempotency_requests;
drop schema if exists assistant_private;

delete from ops.migration_ledger where version = '20261005010000';
