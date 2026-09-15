-- GCI CRM — crm_projects (Customer / Project Linking V1)
--
-- NOT YET EXECUTED — review before running in Supabase SQL Editor.
--
-- Read-only investigation finding this migration exists to close: there is
-- currently NO real "project" table anywhere in the schema. crm_customers
-- (20260816_crm_core_tables.sql) has a few free-text columns
-- (project_stage/project_situation) but those describe at most ONE implicit
-- project per customer, folded into the customer row itself — there is no
-- way for a customer to have several real, individually-selectable
-- projects with their own id. Every "Customer / Project" field across BOQ/
-- PI/Business Solutions today (e.g. QuotationModule's
-- quoteInfo.customerProjectName) is a single hand-typed free-text string,
-- not a foreign key to anything. This table is the minimum addition needed
-- for the new shared CustomerProjectSelector to have a real project_id to
-- select or create against — same minimal-schema approach already used for
-- bank_accounts/supplier_payables/supplier_payments this round.
--
-- Scope: one new table. Does NOT touch crm_customers/crm_contacts/
-- crm_followups, does NOT migrate/backfill any existing free-text project
-- data, does NOT change any existing quote/order/invoice table. Downstream
-- inheritance (Quote -> Order -> Invoice -> AR -> Payment carrying the same
-- customer_id/project_id) is a separate, later round — see chat report.
--
-- Permission model: same as crm_customers/crm_contacts/crm_followups —
-- `auth.uid() is not null` (any signed-in user), NOT has_module('finance').
-- This is a CRM table, not a Finance one; matching the CRM module's own
-- existing convention rather than importing Finance's has_module() gate.

CREATE TABLE IF NOT EXISTS public.crm_projects (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  uuid NOT NULL REFERENCES public.crm_customers(id) ON DELETE CASCADE,
  project_name text NOT NULL,
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'on_hold', 'cancelled')),
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_projects_customer_id ON public.crm_projects(customer_id);
CREATE INDEX IF NOT EXISTS idx_crm_projects_status      ON public.crm_projects(status);

ALTER TABLE public.crm_projects ENABLE ROW LEVEL SECURITY;

-- DROP IF EXISTS first (2026-09-15 final-review fix) — every other policy
-- in this session's migrations does this so a re-run never fails on
-- "policy already exists"; this file was missing it. Pure idempotency
-- safety, not a schema/business change.
DROP POLICY IF EXISTS "crm_projects_select" ON public.crm_projects;
CREATE POLICY "crm_projects_select"
  ON public.crm_projects FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "crm_projects_insert" ON public.crm_projects;
CREATE POLICY "crm_projects_insert"
  ON public.crm_projects FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "crm_projects_update" ON public.crm_projects;
CREATE POLICY "crm_projects_update"
  ON public.crm_projects FOR UPDATE
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- No DELETE policy — same convention as every other table this session
-- added (bank_accounts/supplier_payables/supplier_payments): retire via
-- status, never drop the row.

-- ─────────────────────────────────────────────────────────────────────────
-- STEP 0 — Pre-flight sanity check (read-only, safe to run any time).
-- ─────────────────────────────────────────────────────────────────────────
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'crm_projects';
-- expect: 1 row

SELECT policyname FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'crm_projects'
ORDER BY policyname;
-- expect: 3 rows (select/insert/update)
