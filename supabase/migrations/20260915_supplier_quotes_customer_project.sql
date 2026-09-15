-- GCI Quotation Center — supplier_quotes gains customer_id/project_id
--
-- NOT YET EXECUTED — review before running in Supabase SQL Editor.
--
-- Quotation Center master-data unification (2026-09-15): Supplier Quote's
-- Step 1 now optionally links a real crm_customers/crm_projects row (via
-- the shared <CustomerProjectSelector>) alongside its already-real
-- supplier_id (supplier_id itself was added earlier by
-- 20260718_supplier_quotes_fk.sql — no change needed there, this file only
-- adds the two columns that migration didn't cover).
--
-- Both nullable — a Supplier Quote is not always tied to one specific
-- customer/project deal yet, and old rows stay NULL, never backfilled by
-- matching supplier_name/any text against crm_customers/crm_projects.

ALTER TABLE public.supplier_quotes
  ADD COLUMN IF NOT EXISTS customer_id uuid NULL REFERENCES public.crm_customers(id),
  ADD COLUMN IF NOT EXISTS project_id  uuid NULL REFERENCES public.crm_projects(id);

CREATE INDEX IF NOT EXISTS idx_supplier_quotes_customer_id ON public.supplier_quotes(customer_id);
CREATE INDEX IF NOT EXISTS idx_supplier_quotes_project_id  ON public.supplier_quotes(project_id);

-- ─────────────────────────────────────────────────────────────────────────
-- STEP 0 — Pre-flight sanity check (read-only, safe to run any time).
-- ─────────────────────────────────────────────────────────────────────────
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'supplier_quotes'
  AND column_name IN ('supplier_id', 'customer_id', 'project_id');
-- expect: 3 rows (supplier_id already existed; customer_id/project_id new)
