-- Rollback of 20261103090000_quotation_save_atomic_rpc.sql.
-- Drops only the function; no table or row is touched. Roll the client (quotationCloud.ts) back FIRST — the app calls
-- this function for every quotation save, so dropping it while the new client is live makes every save fail.
begin;

drop function if exists public.save_quotation_with_items(uuid, jsonb, jsonb, timestamptz);

do $$
begin
  if to_regclass('ops.migration_ledger') is not null then
    delete from ops.migration_ledger where version = '20261103090000';
  end if;
end $$;

commit;

notify pgrst, 'reload schema';
