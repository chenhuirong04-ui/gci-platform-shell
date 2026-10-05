-- Ensure the pre-existing CRM RPC also populates every v2 audit dimension.
create or replace function assistant_private.normalize_audit_log_v2()
returns trigger
language plpgsql
security invoker
set search_path = assistant_private, pg_temp
as $$
begin
  new.action_type := coalesce(new.action_type, new.action);
  new.module := coalesce(new.module, 'crm');
  new.target_type := coalesce(new.target_type, case
    when new.action = 'followup_create' then 'followup'
    when new.action = 'contact_upsert' then 'contact'
    else 'customer'
  end);
  new.reason := coalesce(new.reason, 'Assistant API CRM action');
  new.request_id := coalesce(new.request_id, gen_random_uuid());
  new.confirmation_required := coalesce(new.confirmation_required, false);
  return new;
end;
$$;

drop trigger if exists assistant_audit_normalize_v2 on assistant_private.audit_log;
create trigger assistant_audit_normalize_v2
before insert on assistant_private.audit_log
for each row execute function assistant_private.normalize_audit_log_v2();

revoke all on function assistant_private.normalize_audit_log_v2() from public,anon,authenticated;
grant execute on function assistant_private.normalize_audit_log_v2() to service_role;

do $$ begin
  if to_regclass('ops.migration_ledger') is not null then
    insert into ops.migration_ledger(version,name,kind,notes)
    values('20261005021000','assistant_audit_normalize','schema','Populate v2 audit dimensions for existing CRM assistant RPC writes')
    on conflict(version) do nothing;
  end if;
end $$;
