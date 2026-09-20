-- ROLLBACK of 20260920000000_ops_migration_ledger.sql — PREPARED, NOT EXECUTED.
-- Destroys the execution record. Only run it if the ledger was created by mistake.
-- Guard: refuses to run while the ledger holds anything other than its own row.

do $$
declare n int;
begin
  if to_regclass('ops.migration_ledger') is not null then
    select count(*) into n from ops.migration_ledger where version <> '20260920000000';
    if n > 0 then
      raise exception 'ops.migration_ledger still holds % other row(s); back them up and delete them first (this record cannot be rebuilt)', n;
    end if;
  end if;
end $$;

drop table if exists ops.migration_ledger;
drop schema if exists ops;   -- fails harmlessly (RESTRICT) if anything else lives in it
