-- GCI Platform — Phase 1 / Batch 2a — GROUP 7: Storage buckets suppliers-private / suppliers-public
-- NOT YET EXECUTED. Run 00_snapshot_readonly.sql first and save its output (block 4/4b).
--
-- Before: NO policy exists for these two (private) buckets (confirmed in Production).
--         Consequence today: the two flows that call Storage DIRECTLY from the browser
--         cannot succeed for anyone —
--           * SupplierForm.uploadTemp   (POST /storage/v1/object/{bucket}/suppliers/new/...)
--           * documentsCloud.moveStorageFile (POST /storage/v1/object/copy, then DELETE /object/{bucket})
--         The other supplier file flows (DocumentCenter, CertificationUploader,
--         TradeLicenseUploader -> uploadSupplierFile) use server-issued signed upload URLs and
--         signed download URLs (service role, /api/suppliers/upload-document) and do not depend
--         on these policies.
-- After : authenticated users with a supplier-library module can do exactly the operations the
--         app performs, on these two buckets only. No anon access.
--
--   Storage operation (Supabase)             -> Postgres privilege on storage.objects
--   upload (POST /object/{bucket}/{path})       INSERT   (+ SELECT: the new row is RETURNed)
--   upload with x-upsert, NEW path              INSERT   (+ SELECT); UPDATE is needed only when
--                                               overwriting an existing object — the client always
--                                               uses fresh timestamp-named paths
--   copy   (POST /object/copy)                  SELECT on the source + INSERT for the destination
--   delete (DELETE /object/{bucket})            DELETE   (+ SELECT: the WHERE clause reads the row)
--   list / download / createSignedUrl           SELECT
--   => policies below: SELECT, INSERT, DELETE. Deliberately NO UPDATE and NO rename/move.
--
--   SELECT / INSERT / DELETE : authenticated AND (trade | quotation | crm | active Admin)
--   restricted to bucket_id IN ('suppliers-private', 'suppliers-public') — never the whole table.
--
-- NOT touched: company-documents, finance-documents, account-vault-attachments,
-- service-customer-documents, or any policy that is not exclusively about these two buckets.
--
-- ADDITIVE — no policy is removed unless it is exclusively about these two buckets (none exist
-- today). It only grants access to signed-in users, so it is safe to apply BEFORE the client
-- session code is deployed (anon has no policy on these buckets today and gains none).
-- Safety: aborts if a blanket anon/public policy on storage.objects (no bucket_id condition)
-- would still expose these buckets.
-- Policies only — no objects, buckets or data are touched. Idempotent. Own transaction.
-- Rollback: 07_storage_suppliers_rollback.sql

begin;

do $$
begin
  if to_regprocedure('public.has_module(text)') is null then
    raise exception 'public.has_module(text) not found - aborting';
  end if;
  if to_regprocedure('public.is_active_admin()') is null then
    raise exception 'public.is_active_admin() not found - aborting';
  end if;
end $$;

do $$
declare
  r record;
  can_use constant text := $e$(
    (select public.has_module('trade'))
    or (select public.has_module('quotation'))
    or (select public.has_module('crm'))
    or (select public.is_active_admin())
  )$e$;
begin
  -- 1. Replace only policies that are exclusively about these two buckets (re-runs + anything
  --    a person may have added by hand since the snapshot).
  for r in
    select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ '(suppliers-private|suppliers-public)'
      and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) !~
          '(company-documents|finance-documents|account-vault-attachments|service-customer-documents)'
  loop
    execute format('drop policy %I on storage.objects', r.policyname);
    raise notice 'dropped storage policy %', r.policyname;
  end loop;

  -- 2. Abort if a blanket anon/public policy would still expose these buckets.
  if exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and roles && array['anon', 'public']::name[]
      and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) !~* 'bucket_id'
  ) then
    raise exception 'a blanket anon/public policy without a bucket_id condition exists on storage.objects - review 00_snapshot block 4 before continuing';
  end if;

  -- 3. New authenticated, module-scoped, bucket-scoped policies.
  execute format($p$create policy b2a_sup_select on storage.objects for select to authenticated
    using (bucket_id in ('suppliers-private', 'suppliers-public') and %s)$p$, can_use);
  execute format($p$create policy b2a_sup_insert on storage.objects for insert to authenticated
    with check (bucket_id in ('suppliers-private', 'suppliers-public') and %s)$p$, can_use);
  execute format($p$create policy b2a_sup_delete on storage.objects for delete to authenticated
    using (bucket_id in ('suppliers-private', 'suppliers-public') and %s)$p$, can_use);
end $$;

commit;

-- Verification:
-- select policyname, cmd, roles from pg_policies where schemaname='storage' and tablename='objects'
--   and policyname like 'b2a_sup_%';                        -- 3 rows, roles={authenticated}
-- Anon check: POST /storage/v1/object/list/suppliers-private with the anon key -> [] (0 entries)
-- Object counts per bucket must equal the snapshot (block 5).
