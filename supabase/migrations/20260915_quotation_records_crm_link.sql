-- GCI Quotation — quotation_records gains real crm_customers/crm_projects FKs
--
-- NOT YET EXECUTED — review before running in Supabase SQL Editor.
--
-- Customer/Project Linking V1 (2026-09-15), continuing the main chain:
--   crm_customers -> Quote -> Order -> Payment
--   crm_projects  -> BOQ Quote -> Order -> Payment
--
-- Scope: two new nullable columns on the real `quotation_records` table
-- (the one backing BOQ/Trade "Send to Trade" quotes — see
-- modules/quotation/lib/quotationCloud.ts). customer_name/project_name
-- stay exactly as they are (display snapshot, unchanged) — these two
-- columns are additive only.
--
-- Depends on:
--   - crm_customers (20260816_crm_core_tables.sql) — already live in
--     Production.
--   - crm_projects (20260915_crm_projects.sql) — NOT YET EXECUTED. This
--     migration's project_id FK will fail to create if crm_projects
--     doesn't exist yet — run 20260915_crm_projects.sql first.
--
-- Old rows: customer_id/project_id stay NULL. Never backfilled by matching
-- customer_name/project_name text against crm_customers — same "don't
-- guess" principle as every other migration this round.

ALTER TABLE public.quotation_records
  ADD COLUMN IF NOT EXISTS customer_id uuid NULL REFERENCES public.crm_customers(id),
  ADD COLUMN IF NOT EXISTS project_id  uuid NULL REFERENCES public.crm_projects(id);

CREATE INDEX IF NOT EXISTS idx_quotation_records_customer_id ON public.quotation_records(customer_id);
CREATE INDEX IF NOT EXISTS idx_quotation_records_project_id  ON public.quotation_records(project_id);

-- ─────────────────────────────────────────────────────────────────────────
-- STEP 0 — Pre-flight sanity check (read-only, safe to run any time).
-- ─────────────────────────────────────────────────────────────────────────
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'quotation_records'
  AND column_name IN ('customer_id', 'project_id');
-- expect: 2 rows
