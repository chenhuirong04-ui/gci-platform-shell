-- GCI Platform — Finance V1: bank_accounts banking-detail fields
-- Minimal extension of the existing bank_accounts table (see
-- 20260914_bank_accounts.sql) — adds columns only, touches no other table,
-- no existing data, and no RLS policy. The three existing SELECT/INSERT/
-- UPDATE policies already cover whole rows, so new nullable columns need no
-- new policy — a finance-module user can already read/write these the same
-- way they read/write account_name/bank_name today.
--
-- All six new columns are nullable text with no default: existing rows
-- (e.g. the Corporate account already created) simply get NULL in them
-- until someone fills them in — nothing is backfilled, nothing is guessed.
--
-- NOT YET EXECUTED — review before running in Supabase SQL Editor.

ALTER TABLE public.bank_accounts
  ADD COLUMN IF NOT EXISTS account_holder_name text,
  ADD COLUMN IF NOT EXISTS account_number      text,
  ADD COLUMN IF NOT EXISTS iban                text,
  ADD COLUMN IF NOT EXISTS swift_bic           text,
  ADD COLUMN IF NOT EXISTS bank_address        text,
  ADD COLUMN IF NOT EXISTS branch_name         text;

-- ─────────────────────────────────────────────────────────────────────────
-- Verify (read-only)
-- ─────────────────────────────────────────────────────────────────────────
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'bank_accounts'
ORDER BY ordinal_position;
-- expect: the 7 original columns (account_name, account_type, bank_name,
-- currency, opening_balance, is_active, notes, + id/timestamps/created_by/
-- updated_by) plus the 6 new ones above, all is_nullable = 'YES' for the
-- new ones.

SELECT id, account_name, account_type, account_holder_name, account_number, iban, swift_bic, bank_address, branch_name
FROM public.bank_accounts;
-- expect: existing rows unchanged, new columns all NULL.
