-- GCI Platform — Finance V1, Phase 1: Bank Accounts
-- Scope: bank account master list only. No AP, no invoice auto-reconciliation,
-- no double-entry ledger, no VAT engine — see chat report for full scope.
--
-- Permission model: reuses the EXISTING modules-array auth already driving
-- ProtectedRoute/`can('finance')` in the frontend (see apps/shell's
-- AuthContext + supabase/seed.sql's user_profiles.modules) instead of
-- inventing a new finance-specific permission system, per explicit
-- instruction. has_module() below is a straight port of that same check to
-- SQL so DB-level RLS enforces the exact same rule the UI already gates on.
--
-- current_balance is intentionally NOT a stored column — see B in the chat
-- report: balance = opening_balance + sum(matching transactions), computed
-- at read time, so it can never drift out of sync with the ledger.
--
-- NOT YET EXECUTED — review before running in Supabase SQL Editor.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. has_module() helper — mirrors AuthContext.can(module) in SQL
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.has_module(module_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid()
      AND is_active = true
      AND module_key = ANY(modules)
  );
$$;

REVOKE ALL ON FUNCTION public.has_module(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_module(text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Table
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bank_accounts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_name     text NOT NULL,               -- e.g. "Emirates NBD - GCI Trading"
  account_type     text NOT NULL DEFAULT 'Corporate'
                     CHECK (account_type IN ('Corporate', 'Personal', 'Cash', 'Other')),
  bank_name        text,                         -- nullable — Cash accounts have no bank
  currency         text NOT NULL DEFAULT 'AED',
  opening_balance  numeric NOT NULL DEFAULT 0,
  is_active        boolean NOT NULL DEFAULT true,
  notes            text NOT NULL DEFAULT '',
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.bank_accounts_set_updated_meta()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bank_accounts_updated_meta ON public.bank_accounts;
CREATE TRIGGER trg_bank_accounts_updated_meta
BEFORE UPDATE ON public.bank_accounts
FOR EACH ROW EXECUTE FUNCTION public.bank_accounts_set_updated_meta();

CREATE OR REPLACE FUNCTION public.bank_accounts_set_created_meta()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.created_by := auth.uid();
  NEW.created_at := now();
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bank_accounts_created_meta ON public.bank_accounts;
CREATE TRIGGER trg_bank_accounts_created_meta
BEFORE INSERT ON public.bank_accounts
FOR EACH ROW EXECUTE FUNCTION public.bank_accounts_set_created_meta();

-- ─────────────────────────────────────────────────────────────────────────
-- 3. RLS — any user with 'finance' in modules can view/manage. No DELETE
--    policy on purpose: retire an account via is_active=false, never drop
--    the row (transactions may still reference its id).
-- ─────────────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE ON TABLE public.bank_accounts TO authenticated;

DROP POLICY IF EXISTS "finance users can view bank accounts" ON public.bank_accounts;
CREATE POLICY "finance users can view bank accounts"
ON public.bank_accounts FOR SELECT TO authenticated
USING (public.has_module('finance'));

DROP POLICY IF EXISTS "finance users can create bank accounts" ON public.bank_accounts;
CREATE POLICY "finance users can create bank accounts"
ON public.bank_accounts FOR INSERT TO authenticated
WITH CHECK (public.has_module('finance'));

DROP POLICY IF EXISTS "finance users can update bank accounts" ON public.bank_accounts;
CREATE POLICY "finance users can update bank accounts"
ON public.bank_accounts FOR UPDATE TO authenticated
USING (public.has_module('finance')) WITH CHECK (public.has_module('finance'));

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Documentation-only baseline for the pre-existing generic-wrapper
--    finance tables (transactions / orders / payments). These tables
--    already exist in Production and already hold real data — this block
--    is IF NOT EXISTS / no-op on a database that already has them. It
--    exists only so the schema is finally visible in git instead of solely
--    in the Supabase dashboard (see chat report §1). Do NOT run this
--    against a database that doesn't have these tables yet without first
--    confirming with whoever owns Trade's other tables (quotes/orders/etc
--    share this exact shape and are NOT redefined here — out of scope).
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.transactions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  state       text NOT NULL DEFAULT 'active',
  payload     jsonb NOT NULL DEFAULT '{}'
);

-- ─────────────────────────────────────────────────────────────────────────
-- Verify (read-only)
-- ─────────────────────────────────────────────────────────────────────────
SELECT * FROM public.bank_accounts;                                          -- expect: 0 rows on first run
SELECT policyname, cmd FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'bank_accounts';                 -- expect: 3 policies (select/insert/update)
SELECT proname FROM pg_proc WHERE proname IN ('has_module', 'bank_accounts_set_created_meta', 'bank_accounts_set_updated_meta');
SELECT routine_name, grantee, privilege_type FROM information_schema.routine_privileges
WHERE routine_schema = 'public' AND routine_name = 'has_module'
ORDER BY grantee;                                                            -- expect: only 'authenticated'
