-- iCare -> GCI  ROLLBACK OF THE TASKS BATCH   PREPARED, NOT EXECUTED.
-- Deletes only executive_tasks rows carrying this migration_batch_id. Never touches icare_snapshots or any row without the batch id.
-- 1) paste the batch id printed by 10_apply_batch.sql   2) run   3) if it refuses because migrated tasks were edited afterwards, decide, then set v_force.
begin;
do $$
declare
  v_batch uuid := '00000000-0000-0000-0000-000000000000';   -- <<< PASTE THE BATCH ID
  v_force boolean := false;                                 -- true = also delete migrated tasks that people edited after the migration
  b record; edited int; n int;
begin
  if v_batch = '00000000-0000-0000-0000-000000000000' then raise exception 'paste the batch id first'; end if;
  select * into b from public.data_migration_batches where id = v_batch;
  if not found then raise exception 'no such batch %', v_batch; end if;
  if b.status = 'rolled_back' then raise exception 'batch % is already rolled back', v_batch; end if;

  select count(*) into edited from public.executive_tasks where migration_batch_id = v_batch and updated_at > b.finished_at + interval '1 minute';
  if edited > 0 and not v_force then
    raise exception 'refusing: % migrated task(s) were edited after the migration (the Internal Tasks tab now writes to executive_tasks). Review them, then set v_force := true.', edited;
  end if;

  delete from public.executive_tasks where migration_batch_id = v_batch; get diagnostics n = row_count;
  update public.data_migration_batches set status = 'rolled_back', rolled_back_at = now(),
         notes = coalesce(notes || ' | ', '') || format('rolled back: %s task(s) removed', n) where id = v_batch;
  raise notice 'rolled back batch %: % task(s) deleted', v_batch, n;
end $$;
commit;
