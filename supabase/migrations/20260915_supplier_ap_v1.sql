-- GCI Finance V1 — Supplier Payment / AP V1
--
-- NOT YET EXECUTED — review before running in Supabase SQL Editor.
--
-- Scope: two new tables only — `supplier_payables` (money we owe a
-- supplier) and `supplier_payments` (money we actually paid). No double-
-- entry bookkeeping, no chart of accounts, no general ledger, no AP aging
-- report, no VAT engine, no bank API, no OCR — see chat report for full
-- scope. Does not touch `suppliers`, `orders`, `payments`, `quotes`, any
-- invoice table, or InventoryManager. No amount/balance is ever written
-- back onto the `suppliers` master row.
--
-- Permission model: reuses the EXISTING public.has_module('finance')
-- function from 20260914_bank_accounts.sql — no new permission system.
--
-- Payment method fields (payment_method / bank_account_id /
-- issued_from_bank_account_id / cheque_*) mirror `transactions` 1:1 — same
-- CASH/BANK_TRANSFER/CHEQUE rules already live in production, applied here
-- with a fixed direction (a supplier payment is always type='out').
--
-- `outstanding_amount` is a GENERATED column (never drifts from
-- amount/paid_amount by construction). `status` is maintained by a
-- BEFORE INSERT/UPDATE trigger, not by the frontend — the frontend may
-- read it but is never responsible for keeping it correct.
--
-- Updated 2026-09-15 (second revision):
--   1. All real multi-table writes (create a payment, clear a cheque) now
--      go through a SECURITY INVOKER RPC function — create_supplier_payment()
--      / clear_supplier_cheque() — instead of three separate INSERT/UPDATE
--      calls strung together on the frontend. Everything each RPC does
--      (validate, insert supplier_payments, insert/update the linked
--      transactions row, update supplier_payables.paid_amount) runs inside
--      ONE Postgres transaction: any failure partway through rolls back
--      everything that function call did, so there is no possible
--      half-written state (a payment row with no transaction row, or a
--      transaction row with no matching payable update). RLS still applies
--      normally inside these functions (SECURITY INVOKER, not DEFINER) —
--      they're a transaction boundary, not a privilege escalation.
--   2. supplier_payables.status gained a fourth value, CANCELLED — a
--      payable can be voided (not deleted) only while paid_amount = 0,
--      enforced by a CHECK constraint. CANCELLED rows are excluded from AP
--      totals/overdue/due-soon by the frontend query (status != 'PAID' AND
--      status != 'CANCELLED'), and the status-auto-derive trigger now
--      leaves an already-CANCELLED row alone instead of recomputing it back
--      to UNPAID/PARTIAL/PAID.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. supplier_payables — money we owe a supplier
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.supplier_payables (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id         uuid NOT NULL REFERENCES public.suppliers(id),
  -- Snapshot of the supplier's display name at creation time — same
  -- convention as transactions.customer/transactions.supplier, so a later
  -- rename in the suppliers table never rewrites historical payable rows.
  supplier_name       text NOT NULL,
  -- V1 payables are hand-entered (no PO/bill system exists yet — confirmed
  -- by the read-only investigation, see chat report). 'SUPPLIER_QUOTE' is
  -- reserved for a future round that links a payable to a supplier_quotes
  -- row; nothing in this migration or the V1 UI ever sets it.
  source_type         text NOT NULL DEFAULT 'MANUAL'
                        CHECK (source_type IN ('MANUAL', 'SUPPLIER_QUOTE')),
  source_id           text,
  reference_no        text,
  invoice_no          text,
  amount              numeric(14,2) NOT NULL CHECK (amount > 0),
  paid_amount         numeric(14,2) NOT NULL DEFAULT 0
                        CHECK (paid_amount >= 0 AND paid_amount <= amount),
  outstanding_amount  numeric(14,2) GENERATED ALWAYS AS (amount - paid_amount) STORED,
  due_date            date,
  status              text NOT NULL DEFAULT 'UNPAID'
                        CHECK (status IN ('UNPAID', 'PARTIAL', 'PAID', 'CANCELLED')),
  notes               text NOT NULL DEFAULT '',
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- A payable can only be voided while nothing has been paid against it yet
  -- — cancelling a partially/fully paid payable would need to reverse real
  -- money movement, which V1 explicitly does not attempt (see chat report).
  -- Enforced here, not just in the frontend, so it holds regardless of
  -- which client writes the row.
  CONSTRAINT chk_supplier_payables_cancel_requires_zero_paid
    CHECK (status <> 'CANCELLED' OR paid_amount = 0)
);

CREATE INDEX IF NOT EXISTS idx_supplier_payables_supplier_id ON public.supplier_payables(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payables_status      ON public.supplier_payables(status);
CREATE INDEX IF NOT EXISTS idx_supplier_payables_due_date    ON public.supplier_payables(due_date);

ALTER TABLE public.supplier_payables ENABLE ROW LEVEL SECURITY;

-- status is derived from paid_amount vs amount on every insert/update — the
-- frontend writes paid_amount, the database decides what that means. This
-- runs BEFORE the row is written, so it sees NEW.paid_amount/NEW.amount
-- (already-updated values), not the generated outstanding_amount column
-- (generated columns aren't visible inside the same BEFORE trigger that
-- produces them, so the status logic is expressed directly in terms of
-- paid_amount/amount instead of reading outstanding_amount).
--
-- CANCELLED is explicit, not derived — this trigger only fires on
-- paid_amount/amount changes (see the column-scoped CREATE TRIGGER below),
-- so a plain `UPDATE ... SET status='CANCELLED'` never touches those
-- columns and never runs through here at all. The guard below exists for
-- the one path that WOULD otherwise fight it: if paid_amount/amount is
-- ever touched again on a row that is already CANCELLED (should not happen
-- — create_supplier_payment() refuses to pay a CANCELLED payable — but
-- this is the backstop if some other future path tries), the trigger backs
-- off instead of silently un-cancelling the row back to UNPAID/PARTIAL/PAID.
CREATE OR REPLACE FUNCTION public.supplier_payables_set_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'CANCELLED' AND NEW.status = 'CANCELLED' THEN
    RETURN NEW;
  END IF;
  IF NEW.paid_amount <= 0 THEN
    NEW.status := 'UNPAID';
  ELSIF NEW.paid_amount >= NEW.amount THEN
    NEW.status := 'PAID';
  ELSE
    NEW.status := 'PARTIAL';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_supplier_payables_set_status ON public.supplier_payables;
CREATE TRIGGER trg_supplier_payables_set_status
BEFORE INSERT OR UPDATE OF paid_amount, amount ON public.supplier_payables
FOR EACH ROW EXECUTE FUNCTION public.supplier_payables_set_status();

-- created_by/updated_by/timestamps — identical convention to bank_accounts.
CREATE OR REPLACE FUNCTION public.supplier_payables_set_created_meta()
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

DROP TRIGGER IF EXISTS trg_supplier_payables_created_meta ON public.supplier_payables;
CREATE TRIGGER trg_supplier_payables_created_meta
BEFORE INSERT ON public.supplier_payables
FOR EACH ROW EXECUTE FUNCTION public.supplier_payables_set_created_meta();

CREATE OR REPLACE FUNCTION public.supplier_payables_set_updated_meta()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_supplier_payables_updated_meta ON public.supplier_payables;
CREATE TRIGGER trg_supplier_payables_updated_meta
BEFORE UPDATE ON public.supplier_payables
FOR EACH ROW EXECUTE FUNCTION public.supplier_payables_set_updated_meta();

GRANT SELECT, INSERT, UPDATE ON TABLE public.supplier_payables TO authenticated;

DROP POLICY IF EXISTS "finance users can view supplier payables" ON public.supplier_payables;
CREATE POLICY "finance users can view supplier payables"
ON public.supplier_payables FOR SELECT TO authenticated
USING (public.has_module('finance'));

DROP POLICY IF EXISTS "finance users can create supplier payables" ON public.supplier_payables;
CREATE POLICY "finance users can create supplier payables"
ON public.supplier_payables FOR INSERT TO authenticated
WITH CHECK (public.has_module('finance'));

DROP POLICY IF EXISTS "finance users can update supplier payables" ON public.supplier_payables;
CREATE POLICY "finance users can update supplier payables"
ON public.supplier_payables FOR UPDATE TO authenticated
USING (public.has_module('finance')) WITH CHECK (public.has_module('finance'));

-- No DELETE policy on purpose — same reasoning as bank_accounts: void via
-- status, never drop the row (supplier_payments may still reference it).


-- ─────────────────────────────────────────────────────────────────────────
-- 2. supplier_payments — money we actually paid
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.supplier_payments (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id                 uuid NOT NULL REFERENCES public.suppliers(id),
  -- Snapshot, same reasoning as supplier_payables.supplier_name — also lets
  -- the app rebuild the linked `transactions` row (see ref_id linkage
  -- below) without a join back to suppliers.
  supplier_name                text NOT NULL,
  payable_id                  uuid REFERENCES public.supplier_payables(id),
  amount                      numeric(14,2) NOT NULL CHECK (amount > 0),
  payment_date                date NOT NULL DEFAULT current_date,
  payment_method              text NOT NULL CHECK (payment_method IN ('CASH', 'BANK_TRANSFER', 'CHEQUE')),
  -- What actually moves the balance. NULL while a CHEQUE is PENDING/
  -- BOUNCED/CANCELLED — only set once CLEARED. Mirrors transactions.bank_account_id 1:1.
  bank_account_id             uuid REFERENCES public.bank_accounts(id),
  -- CHEQUE ('out' direction) only — chosen at creation, required
  -- immediately regardless of status. Mirrors transactions.issued_from_bank_account_id.
  issued_from_bank_account_id uuid REFERENCES public.bank_accounts(id),
  cheque_number                text,
  cheque_date                  date,
  cheque_bank                  text,
  cheque_amount                numeric(14,2),
  cheque_status                text CHECK (cheque_status IN ('PENDING', 'CLEARED', 'BOUNCED', 'CANCELLED')),
  reference_no                text,
  notes                       text NOT NULL DEFAULT '',
  created_at                  timestamptz NOT NULL DEFAULT now(),
  created_by                  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  updated_by                  uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier_id  ON public.supplier_payments(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_payable_id   ON public.supplier_payments(payable_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_cheque_status ON public.supplier_payments(cheque_status)
  WHERE cheque_status IS NOT NULL;

ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.supplier_payments_set_created_meta()
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

DROP TRIGGER IF EXISTS trg_supplier_payments_created_meta ON public.supplier_payments;
CREATE TRIGGER trg_supplier_payments_created_meta
BEFORE INSERT ON public.supplier_payments
FOR EACH ROW EXECUTE FUNCTION public.supplier_payments_set_created_meta();

CREATE OR REPLACE FUNCTION public.supplier_payments_set_updated_meta()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_supplier_payments_updated_meta ON public.supplier_payments;
CREATE TRIGGER trg_supplier_payments_updated_meta
BEFORE UPDATE ON public.supplier_payments
FOR EACH ROW EXECUTE FUNCTION public.supplier_payments_set_updated_meta();

GRANT SELECT, INSERT, UPDATE ON TABLE public.supplier_payments TO authenticated;

DROP POLICY IF EXISTS "finance users can view supplier payments" ON public.supplier_payments;
CREATE POLICY "finance users can view supplier payments"
ON public.supplier_payments FOR SELECT TO authenticated
USING (public.has_module('finance'));

DROP POLICY IF EXISTS "finance users can create supplier payments" ON public.supplier_payments;
CREATE POLICY "finance users can create supplier payments"
ON public.supplier_payments FOR INSERT TO authenticated
WITH CHECK (public.has_module('finance'));

DROP POLICY IF EXISTS "finance users can update supplier payments" ON public.supplier_payments;
CREATE POLICY "finance users can update supplier payments"
ON public.supplier_payments FOR UPDATE TO authenticated
USING (public.has_module('finance')) WITH CHECK (public.has_module('finance'));

-- No DELETE policy — a supplier payment is a financial record, void/bounce
-- it via cheque_status instead of removing the row.


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Atomic RPC functions — the ONLY way the frontend writes a supplier
-- payment or clears a supplier cheque. Both are SECURITY INVOKER (the
-- default — explicit here for clarity): they run as whichever authenticated
-- user called them, so every INSERT/UPDATE inside still goes through that
-- table's normal RLS policies. The only thing "atomic" buys here is a
-- single transaction boundary around several statements — not elevated
-- privilege.
--
-- Known review item: the INSERT into `public.transactions` inside
-- create_supplier_payment() (and the matching UPDATE inside
-- clear_supplier_cheque()) assumes the `authenticated` role can write that
-- table. `transactions` predates this migration and its own RLS/grants are
-- defined elsewhere — earlier Finance V1 testing confirmed the anon role
-- can already read/write it, which strongly suggests `authenticated` can
-- too, but this has not been independently re-verified against the current
-- policy set. If either RPC's transactions write fails with a permission
-- error at execution time, the fix is a policy on `transactions` granting
-- `authenticated` INSERT/UPDATE — not a change to either function below.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_supplier_payment(
  p_supplier_id                 uuid,
  p_supplier_name                text,
  p_amount                       numeric,
  p_payment_date                 date,
  p_payment_method                text,
  p_payable_id                   uuid DEFAULT NULL,
  p_bank_account_id               uuid DEFAULT NULL,
  p_issued_from_bank_account_id   uuid DEFAULT NULL,
  p_cheque_number                 text DEFAULT NULL,
  p_cheque_date                   date DEFAULT NULL,
  p_cheque_bank                   text DEFAULT NULL,
  p_cheque_amount                 numeric DEFAULT NULL,
  p_cheque_status                 text DEFAULT 'PENDING',
  p_reference_no                  text DEFAULT NULL,
  p_notes                         text DEFAULT NULL
)
RETURNS public.supplier_payments
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_payable        public.supplier_payables%ROWTYPE;
  v_cash_count     int;
  v_cash_id        uuid;
  v_final_bank_id  uuid;
  v_payment        public.supplier_payments%ROWTYPE;
  v_note           text;
  v_txn_business_id text;
BEGIN
  -- 1. permission (RLS on the INSERTs below enforces this too — this is
  -- just a fast, friendly failure instead of a raw RLS-violation error).
  IF NOT public.has_module('finance') THEN
    RAISE EXCEPTION 'permission denied: finance module required';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be > 0';
  END IF;
  IF p_payment_method NOT IN ('CASH', 'BANK_TRANSFER', 'CHEQUE') THEN
    RAISE EXCEPTION 'invalid payment_method: %', p_payment_method;
  END IF;

  -- 2/3. payable + overpay guard. FOR UPDATE locks the row for the rest of
  -- this transaction, so two concurrent payments against the same payable
  -- can't both read the same outstanding_amount and both "succeed" past
  -- the overpay check — the second one waits for the first to commit (or
  -- roll back), then re-reads the now-current balance.
  IF p_payable_id IS NOT NULL THEN
    SELECT * INTO v_payable FROM public.supplier_payables WHERE id = p_payable_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'supplier_payable % not found', p_payable_id;
    END IF;
    IF v_payable.status = 'CANCELLED' THEN
      RAISE EXCEPTION 'supplier_payable % is CANCELLED, cannot pay against it', p_payable_id;
    END IF;
    IF p_amount > v_payable.outstanding_amount + 0.005 THEN
      RAISE EXCEPTION 'payment amount % exceeds outstanding balance %', p_amount, v_payable.outstanding_amount;
    END IF;
  END IF;

  -- 4. payment-method-specific validation + resolve the account that
  -- actually moves (same CASH/BANK_TRANSFER/CHEQUE rules as
  -- PaymentMethodFields/validatePaymentMethodValue/buildPaymentMethodPayload
  -- on the frontend — re-derived here server-side so the RPC never trusts
  -- the client's own account resolution).
  IF p_payment_method = 'CASH' THEN
    SELECT count(*) INTO v_cash_count FROM public.bank_accounts WHERE account_type = 'Cash' AND is_active = true;
    IF v_cash_count = 0 THEN
      RAISE EXCEPTION 'no active Cash bank_accounts row found';
    ELSIF v_cash_count > 1 THEN
      RAISE EXCEPTION 'found % active Cash bank_accounts rows — ambiguous, refusing to guess', v_cash_count;
    END IF;
    SELECT id INTO v_cash_id FROM public.bank_accounts WHERE account_type = 'Cash' AND is_active = true;
    v_final_bank_id := v_cash_id;
  ELSIF p_payment_method = 'BANK_TRANSFER' THEN
    IF p_bank_account_id IS NULL THEN
      RAISE EXCEPTION 'BANK_TRANSFER requires bank_account_id';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.bank_accounts WHERE id = p_bank_account_id AND is_active = true) THEN
      RAISE EXCEPTION 'bank_account_id % is not an active bank account', p_bank_account_id;
    END IF;
    v_final_bank_id := p_bank_account_id;
  ELSE -- CHEQUE
    IF p_issued_from_bank_account_id IS NULL THEN
      RAISE EXCEPTION 'CHEQUE requires issued_from_bank_account_id';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.bank_accounts WHERE id = p_issued_from_bank_account_id AND is_active = true) THEN
      RAISE EXCEPTION 'issued_from_bank_account_id % is not an active bank account', p_issued_from_bank_account_id;
    END IF;
    IF p_cheque_number IS NULL OR p_cheque_date IS NULL OR p_cheque_bank IS NULL OR p_cheque_amount IS NULL THEN
      RAISE EXCEPTION 'CHEQUE requires cheque_number/cheque_date/cheque_bank/cheque_amount';
    END IF;
    IF p_cheque_status NOT IN ('PENDING', 'CLEARED') THEN
      RAISE EXCEPTION 'a new CHEQUE payment must start PENDING or CLEARED, got %', p_cheque_status;
    END IF;
    -- Only set once CLEARED — a PENDING cheque never moves the balance,
    -- same rule as transactions.bank_account_id.
    v_final_bank_id := CASE WHEN p_cheque_status = 'CLEARED' THEN p_issued_from_bank_account_id ELSE NULL END;
  END IF;

  v_note := COALESCE(NULLIF(p_notes, ''), 'Supplier payment — ' || p_supplier_name);

  -- 5. INSERT supplier_payments
  INSERT INTO public.supplier_payments (
    supplier_id, supplier_name, payable_id, amount, payment_date, payment_method,
    bank_account_id, issued_from_bank_account_id,
    cheque_number, cheque_date, cheque_bank, cheque_amount, cheque_status,
    reference_no, notes
  ) VALUES (
    p_supplier_id, p_supplier_name, p_payable_id, p_amount, p_payment_date, p_payment_method,
    v_final_bank_id,
    CASE WHEN p_payment_method = 'CHEQUE' THEN p_issued_from_bank_account_id ELSE NULL END,
    p_cheque_number, p_cheque_date, p_cheque_bank, p_cheque_amount,
    CASE WHEN p_payment_method = 'CHEQUE' THEN p_cheque_status ELSE NULL END,
    p_reference_no, v_note
  )
  RETURNING * INTO v_payment;

  v_txn_business_id := 'TXN-SP-' || v_payment.id::text;

  -- 6. INSERT the linked transactions row (legacy {id,created_at,updated_at,
  -- state,payload} table — physical `id` auto-generates, the business id
  -- this app addresses the row by lives at payload->>'id').
  INSERT INTO public.transactions (created_at, updated_at, state, payload)
  VALUES (now(), now(), 'active', jsonb_strip_nulls(jsonb_build_object(
    'id', v_txn_business_id,
    'date', p_payment_date::text,
    'type', 'out',
    'amount', p_amount,
    'ref_type', 'SUPPLIER_PAYMENT',
    'ref_id', v_payment.id::text,
    'supplier', p_supplier_name,
    'note', v_note,
    'userId', 'Admin',
    'payment_method', p_payment_method,
    'bank_account_id', v_final_bank_id::text,
    'cheque_number', p_cheque_number,
    'cheque_date', p_cheque_date::text,
    'cheque_bank', p_cheque_bank,
    'cheque_amount', p_cheque_amount,
    'cheque_status', CASE WHEN p_payment_method = 'CHEQUE' THEN p_cheque_status ELSE NULL END,
    'issued_from_bank_account_id', CASE WHEN p_payment_method = 'CHEQUE' THEN p_issued_from_bank_account_id::text ELSE NULL END,
    'created_at', now()::text,
    'createdAt', now()::text,
    'updated_at', now()::text,
    'updatedAt', now()::text
  )));

  -- 7/8. Effective immediately only when v_final_bank_id is already set
  -- (CASH/BANK_TRANSFER always; CHEQUE only if entered directly as
  -- CLEARED) — a PENDING cheque leaves supplier_payables untouched on
  -- purpose (see clear_supplier_cheque() for when it later does move).
  IF p_payable_id IS NOT NULL AND v_final_bank_id IS NOT NULL THEN
    UPDATE public.supplier_payables
    SET paid_amount = paid_amount + p_amount
    WHERE id = p_payable_id;
  END IF;

  RETURN v_payment;
END;
$$;

REVOKE ALL ON FUNCTION public.create_supplier_payment(
  uuid, text, numeric, date, text, uuid, uuid, uuid, text, date, text, numeric, text, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_supplier_payment(
  uuid, text, numeric, date, text, uuid, uuid, uuid, text, date, text, numeric, text, text, text
) TO authenticated;


CREATE OR REPLACE FUNCTION public.clear_supplier_cheque(
  p_payment_id uuid,
  p_status     text DEFAULT 'CLEARED'
)
RETURNS public.supplier_payments
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_payment         public.supplier_payments%ROWTYPE;
  v_final_bank_id   uuid;
  v_txn_business_id text;
  v_updated         int;
BEGIN
  IF NOT public.has_module('finance') THEN
    RAISE EXCEPTION 'permission denied: finance module required';
  END IF;

  IF p_status NOT IN ('CLEARED', 'BOUNCED', 'CANCELLED') THEN
    RAISE EXCEPTION 'invalid target status: %', p_status;
  END IF;

  -- 1. lock + validate — must be a CHEQUE still PENDING.
  SELECT * INTO v_payment FROM public.supplier_payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'supplier_payment % not found', p_payment_id;
  END IF;
  IF v_payment.payment_method <> 'CHEQUE' THEN
    RAISE EXCEPTION 'supplier_payment % is not a CHEQUE payment', p_payment_id;
  END IF;
  IF v_payment.cheque_status <> 'PENDING' THEN
    RAISE EXCEPTION 'supplier_payment % is not PENDING (currently %)', p_payment_id, v_payment.cheque_status;
  END IF;

  -- 2. issued_from_bank_account_id was already chosen at creation time.
  IF p_status = 'CLEARED' AND v_payment.issued_from_bank_account_id IS NULL THEN
    RAISE EXCEPTION 'supplier_payment % has no issued_from_bank_account_id, cannot clear', p_payment_id;
  END IF;

  v_final_bank_id := CASE WHEN p_status = 'CLEARED' THEN v_payment.issued_from_bank_account_id ELSE NULL END;

  -- 3. supplier_payments -> new status (+ bank_account_id only on CLEARED)
  UPDATE public.supplier_payments
  SET cheque_status = p_status, bank_account_id = v_final_bank_id
  WHERE id = p_payment_id
  RETURNING * INTO v_payment;

  v_txn_business_id := 'TXN-SP-' || v_payment.id::text;

  -- 4. update the linked transactions row — merge just the two fields that
  -- change, leaving date/amount/ref_type/ref_id/supplier/note untouched.
  UPDATE public.transactions
  SET updated_at = now(),
      payload = payload || jsonb_strip_nulls(jsonb_build_object(
        'cheque_status', p_status,
        'bank_account_id', v_final_bank_id::text
      ))
  WHERE payload->>'id' = v_txn_business_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'linked transactions row % not found for supplier_payment %', v_txn_business_id, p_payment_id;
  END IF;

  -- 5. payable only moves on CLEARED — BOUNCED/CANCELLED never touched it
  -- because PENDING never touched it either, so there's nothing to reverse.
  IF p_status = 'CLEARED' AND v_payment.payable_id IS NOT NULL THEN
    UPDATE public.supplier_payables
    SET paid_amount = paid_amount + v_payment.amount
    WHERE id = v_payment.payable_id;
  END IF;

  RETURN v_payment;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_supplier_cheque(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clear_supplier_cheque(uuid, text) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────
-- STEP 0 — Pre-flight sanity check (read-only, safe to run any time).
-- Confirms both tables, their policies, and both RPC functions exist
-- before anyone starts using them from the app.
-- ─────────────────────────────────────────────────────────────────────────
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN ('supplier_payables', 'supplier_payments');
-- expect: 2 rows

SELECT tablename, policyname FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('supplier_payables', 'supplier_payments')
ORDER BY tablename, policyname;
-- expect: 3 policies per table (select/insert/update) = 6 rows total

SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_name IN ('create_supplier_payment', 'clear_supplier_cheque');
-- expect: 2 rows
