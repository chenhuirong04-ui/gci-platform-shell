-- GCI Platform — Phase 1 / Batch 2a — GROUP 7 ROLLBACK: Storage suppliers-private / suppliers-public
-- Removes the three b2a_sup_* policies. Prior state (confirmed in Production): NO policy existed
-- for these buckets, so nothing needs to be re-created. Objects and buckets are never touched.
-- Own transaction. Idempotent.
--
-- Effect of rolling back: SupplierForm.uploadTemp and documentsCloud.moveStorageFile stop working
-- again (exactly as before Batch 2a). The signed-URL flows (DocumentCenter, CertificationUploader,
-- TradeLicenseUploader) are unaffected.
--
-- If the 00_snapshot output showed any policy on these buckets that the apply dropped, re-create it
-- in PART B from the snapshot's restore_sql column.

begin;

drop policy if exists b2a_sup_select on storage.objects;
drop policy if exists b2a_sup_insert on storage.objects;
drop policy if exists b2a_sup_delete on storage.objects;

-- PART B (only if the snapshot showed pre-existing policies for these buckets): paste them here.

commit;
