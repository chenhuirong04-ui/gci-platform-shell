-- GCI Platform — Company Documents: open upload to any authenticated user
-- Minimal follow-up to 20260907_company_documents.sql. Only the INSERT policies on
-- public.company_documents and storage.objects (company-documents bucket) change:
--   Active Admin only  →  any authenticated user
-- SELECT (view), UPDATE, and DELETE policies on both are untouched — delete stays
-- Active-Admin-only via public.is_active_admin(), update stays Active-Admin-only
-- (the upload flow in companyDocumentsService.ts never calls update(), so there is
-- no reason to widen it).
--
-- NOT YET EXECUTED — review before running in Supabase SQL Editor.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Table INSERT policy — company_documents
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Active admins can insert company documents" ON public.company_documents;
DROP POLICY IF EXISTS "Authenticated users can insert company documents" ON public.company_documents;
CREATE POLICY "Authenticated users can insert company documents"
ON public.company_documents FOR INSERT TO authenticated WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Storage INSERT policy — company-documents bucket
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Active admins can upload company-documents files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload company-documents files" ON storage.objects;
CREATE POLICY "Authenticated users can upload company-documents files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'company-documents');

-- ─────────────────────────────────────────────────────────────────────────
-- Verify (read-only)
-- ─────────────────────────────────────────────────────────────────────────
-- Expect: company_documents INSERT policy is USING (none)/WITH CHECK (true), no is_active_admin() call
SELECT policyname, cmd, qual, with_check FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'company_documents' ORDER BY cmd;

-- Expect: storage.objects INSERT policy for this bucket has no is_active_admin() call; UPDATE/DELETE
-- policies still do
SELECT policyname, cmd, qual, with_check FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname LIKE '%company-documents%' ORDER BY cmd;
