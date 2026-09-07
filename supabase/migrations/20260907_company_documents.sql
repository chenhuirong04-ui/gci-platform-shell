-- GCI Platform — Company Documents V1
-- Direct port of 25H-WorkforceOS's company_documents_setup.sql — same table shape, same private-
-- Storage-bucket-plus-metadata-row pattern, same permission split (any authenticated user can
-- view; only an Active Admin can upload/edit/delete). See chat report for the two GCI-specific
-- adaptations this file makes (both called out inline below with "GCI adaptation:").
--
-- GCI adaptation: WorkforceOS's RLS policies call an existing public.is_active_admin() helper
-- (role='Admin' AND status='Active' on its own profiles table). GCI has no such helper yet — its
-- equivalent table is user_profiles(role_label text, is_active boolean), so this file defines the
-- same-shaped helper against those columns. This is a straight port of WorkforceOS's own concept
-- onto GCI's actual schema, not a new permission system.
--
-- GCI adaptation: WorkforceOS reuses a shared public.set_updated_meta() trigger function created
-- in an earlier file. GCI has no equivalent shared trigger, so this file defines a
-- company_documents-scoped one instead of assuming a shared helper exists elsewhere.
--
-- No company_id/tenant scoping: GCI already has public.companies + user_profiles.default_company_id
-- (Phase 1, seed.sql), but no other table in the app is actually scoped by company_id yet — Phase 2
-- UI per that file's own comment. Company Documents V1 follows the same "single current company"
-- behavior as the rest of the app right now, per explicit instruction not to build multi-tenant
-- scoping just for this feature.
--
-- NOT YET EXECUTED — review before running in Supabase SQL Editor.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Active-Admin helper (GCI-schema equivalent of WorkforceOS's is_active_admin())
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_active_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid() AND is_active = true AND role_label = 'Admin'
  );
$$;

-- Same PUBLIC-default-EXECUTE defense-in-depth as list_active_user_display_names() below —
-- nothing currently calls this outside an `authenticated`-scoped RLS policy, but locking it down
-- explicitly means that stays true even if a future policy/role reaches it unexpectedly.
REVOKE ALL ON FUNCTION public.is_active_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_active_admin() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Table
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.company_documents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category       text NOT NULL,               -- 'Trade License' | 'MOA/AOA' | 'POA' | 'VAT' |
                                                -- 'Corporate Tax' | 'Bank' | 'Contracts' |
                                                -- 'Government Documents' | 'Insurance' | 'Vehicles' |
                                                -- 'HR/Employee' | 'Projects' | 'Other' — fixed list
                                                -- enforced by the frontend dropdown, not a DB CHECK
                                                -- (V1, same choice WorkforceOS made)
  document_name  text NOT NULL,                -- user-facing display name, independent of the raw filename
  file_name      text NOT NULL,                -- original uploaded filename incl. extension
  storage_path   text NOT NULL,                -- path inside the company-documents bucket
  file_size      bigint,
  mime_type      text,
  expiry_date    date,                         -- optional — not every document type has one
  notes          text NOT NULL DEFAULT '',
  uploaded_at    timestamptz NOT NULL DEFAULT now(),
  uploaded_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.company_documents ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.company_documents_set_updated_meta()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_company_documents_updated_meta ON public.company_documents;
CREATE TRIGGER trg_company_documents_updated_meta
BEFORE UPDATE ON public.company_documents
FOR EACH ROW EXECUTE FUNCTION public.company_documents_set_updated_meta();

-- Server-stamped on INSERT too — uploaded_by is never trusted from the client.
CREATE OR REPLACE FUNCTION public.company_documents_set_created_meta()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.uploaded_by := auth.uid();
  NEW.uploaded_at := now();
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_company_documents_created_meta ON public.company_documents;
CREATE TRIGGER trg_company_documents_created_meta
BEFORE INSERT ON public.company_documents
FOR EACH ROW EXECUTE FUNCTION public.company_documents_set_created_meta();

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Table RLS — any authenticated user can view; only an Active Admin can
--    insert/update/delete. Identical split to WorkforceOS's own policies.
-- ─────────────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.company_documents TO authenticated;

DROP POLICY IF EXISTS "Authenticated users can view company documents" ON public.company_documents;
CREATE POLICY "Authenticated users can view company documents"
ON public.company_documents FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Active admins can insert company documents" ON public.company_documents;
CREATE POLICY "Active admins can insert company documents"
ON public.company_documents FOR INSERT TO authenticated WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS "Active admins can update company documents" ON public.company_documents;
CREATE POLICY "Active admins can update company documents"
ON public.company_documents FOR UPDATE TO authenticated
USING (public.is_active_admin()) WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS "Active admins can delete company documents" ON public.company_documents;
CREATE POLICY "Active admins can delete company documents"
ON public.company_documents FOR DELETE TO authenticated USING (public.is_active_admin());

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Storage bucket (private — never public; access only via createSignedUrl())
-- ─────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('company-documents', 'company-documents', false)
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. Storage RLS (storage.objects RLS is already enabled globally by Supabase — no ALTER needed)
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can read company-documents files" ON storage.objects;
CREATE POLICY "Authenticated users can read company-documents files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'company-documents');

DROP POLICY IF EXISTS "Active admins can upload company-documents files" ON storage.objects;
CREATE POLICY "Active admins can upload company-documents files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'company-documents' AND public.is_active_admin());

DROP POLICY IF EXISTS "Active admins can update company-documents files" ON storage.objects;
CREATE POLICY "Active admins can update company-documents files"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'company-documents' AND public.is_active_admin())
WITH CHECK (bucket_id = 'company-documents' AND public.is_active_admin());

DROP POLICY IF EXISTS "Active admins can delete company-documents files" ON storage.objects;
CREATE POLICY "Active admins can delete company-documents files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'company-documents' AND public.is_active_admin());

-- ─────────────────────────────────────────────────────────────────────────
-- 6. Uploader display-name lookup — GCI-specific addition, not part of the
--    WorkforceOS port. user_profiles' own RLS ("users can read own profile")
--    only lets a user read their OWN row, so the client has no way to
--    resolve another user's company_documents.uploaded_by into a display
--    name. This is a narrow, read-only SECURITY DEFINER function exposing
--    only (id, display_name) for active users — nothing else about a
--    profile (role_label, modules, default_company_id) is exposed. Existing
--    user_profiles RLS is left completely untouched.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.list_active_user_display_names()
RETURNS TABLE (id uuid, display_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, display_name FROM public.user_profiles WHERE is_active = true;
$$;

-- Postgres grants EXECUTE on a new function to PUBLIC by default (unlike tables) — without this
-- explicit REVOKE, the anon role would still be able to call this RPC unauthenticated via
-- PostgREST despite the GRANT below only naming `authenticated`. Revoke first, then grant only to
-- the one role that should have it.
REVOKE ALL ON FUNCTION public.list_active_user_display_names() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_active_user_display_names() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- Verify (read-only)
-- ─────────────────────────────────────────────────────────────────────────
SELECT * FROM public.company_documents;                                     -- expect: 0 rows
SELECT id, name, public FROM storage.buckets WHERE id = 'company-documents'; -- expect: 1 row, public = false
SELECT policyname, cmd FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'company_documents';            -- expect: 4 policies (select/insert/update/delete)
SELECT policyname, cmd FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname LIKE '%company-documents%';                                -- expect: 4 policies (select/insert/update/delete)
SELECT proname FROM pg_proc WHERE proname IN ('is_active_admin', 'list_active_user_display_names', 'company_documents_set_created_meta', 'company_documents_set_updated_meta');
-- Confirm exactly one grantee (authenticated) on each — anon/PUBLIC must NOT appear here at all.
SELECT routine_name, grantee, privilege_type FROM information_schema.routine_privileges
WHERE routine_schema = 'public' AND routine_name IN ('is_active_admin', 'list_active_user_display_names')
ORDER BY routine_name, grantee;
