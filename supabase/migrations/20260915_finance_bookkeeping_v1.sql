-- GCI Finance — Bookkeeping & Reconciliation V1 (记账与对账)
--
-- NOT YET EXECUTED — review before running in Supabase SQL Editor.
--
-- Scope: two intake pipelines feeding the SAME existing `transactions`
-- table (no second ledger):
--   1. Bank Reconciliation (银行对账) — upload a bank statement, split it
--      into lines, AI suggests a category/customer/supplier/project per
--      line, user confirms each line into a real transaction (or links it
--      to an existing transaction instead of creating a duplicate).
--   2. Voucher Entry (凭证录入) — upload one receipt/invoice/payment proof,
--      AI extracts date/amount/counterparty/invoice_no/VAT/description +
--      suggests category/customer/supplier/project, user confirms into
--      either a real transaction (already paid) or a supplier_payables row
--      (unpaid supplier invoice — reuses the existing AP V1 table, no new
--      payable concept invented here).
--
-- "银行流水是资金事实，凭证是业务依据，transactions 是正式内部账" — the two
-- staging tables below hold the fact/evidence; nothing becomes a real
-- financial record until a human confirms it. AI never writes directly to
-- `transactions` or `supplier_payables` — every ai_suggested_*/ai_* column
-- here is read-only guidance, the confirm step is always a separate,
-- explicit user action from the frontend.
--
-- Updated 2026-09-15 (second revision) — three production-readiness guards
-- added before first execution, no scope expansion:
--   1. Transaction matching now scores by date proximity (see
--      bookkeepingService.dateMatchTier — same day > ±1 day > ±3 days,
--      never suggested past 3 days) on top of the existing hard filters
--      (account/direction/amount). Still Suggested-only, never auto-Match —
--      this only changes which candidates are worth showing and in what
--      order, not who gets linked.
--   2. bank_statement_imports gained file_hash (client-computed SHA-256) +
--      UNIQUE(bank_account_id, file_hash) — re-importing the exact same
--      statement file against the same account is now rejected at the
--      database level, not just discouraged in the UI.
--   3. confirm_bank_statement_line()/match_bank_statement_line() are new
--      atomic RPCs (see section 2b below) — a bank_statement_line can only
--      ever be confirmed or matched ONCE. A double-click, a retried
--      request, or two open tabs can never produce two transactions from
--      the same line: the guard is a real database-level atomic claim
--      (UPDATE ... WHERE status = 'pending'), not just a disabled button.
--
-- Not built this round (explicit instruction): GL, double-entry,
-- Balance Sheet, VAT filing, bank API integration.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. bank_statement_imports — one row per uploaded statement file
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bank_statement_imports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_account_id uuid NOT NULL REFERENCES public.bank_accounts(id),
  file_name       text NOT NULL,
  storage_path    text NOT NULL,
  -- SHA-256 of the file's raw bytes (computed client-side, see
  -- bookkeepingService.computeFileHash) — blocks re-importing the exact
  -- same statement file against the same bank account. Database-level
  -- protection, not just a frontend check: the UNIQUE constraint below is
  -- the actual guard, the frontend only turns its violation into a
  -- friendly message.
  file_hash       text NOT NULL,
  status          text NOT NULL DEFAULT 'reviewing' CHECK (status IN ('reviewing', 'completed')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT uq_bank_statement_imports_account_hash UNIQUE (bank_account_id, file_hash)
);

CREATE INDEX IF NOT EXISTS idx_bank_statement_imports_account ON public.bank_statement_imports(bank_account_id);

ALTER TABLE public.bank_statement_imports ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON TABLE public.bank_statement_imports TO authenticated;

DROP POLICY IF EXISTS "finance users can view bank statement imports" ON public.bank_statement_imports;
CREATE POLICY "finance users can view bank statement imports"
ON public.bank_statement_imports FOR SELECT TO authenticated USING (public.has_module('finance'));

DROP POLICY IF EXISTS "finance users can create bank statement imports" ON public.bank_statement_imports;
CREATE POLICY "finance users can create bank statement imports"
ON public.bank_statement_imports FOR INSERT TO authenticated WITH CHECK (public.has_module('finance'));

DROP POLICY IF EXISTS "finance users can update bank statement imports" ON public.bank_statement_imports;
CREATE POLICY "finance users can update bank statement imports"
ON public.bank_statement_imports FOR UPDATE TO authenticated
USING (public.has_module('finance')) WITH CHECK (public.has_module('finance'));

CREATE OR REPLACE FUNCTION public.bank_statement_imports_set_created_meta()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.created_by := auth.uid();
  NEW.created_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bank_statement_imports_created_meta ON public.bank_statement_imports;
CREATE TRIGGER trg_bank_statement_imports_created_meta
BEFORE INSERT ON public.bank_statement_imports
FOR EACH ROW EXECUTE FUNCTION public.bank_statement_imports_set_created_meta();

-- ─────────────────────────────────────────────────────────────────────────
-- 2. bank_statement_lines — one row per parsed statement line
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bank_statement_lines (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id                 uuid NOT NULL REFERENCES public.bank_statement_imports(id) ON DELETE CASCADE,
  bank_account_id           uuid NOT NULL REFERENCES public.bank_accounts(id),
  line_date                 date,
  direction                 text CHECK (direction IN ('in', 'out')),
  amount                    numeric(14,2) NOT NULL CHECK (amount > 0),
  bank_description          text NOT NULL DEFAULT '',
  -- AI suggestions — read-only guidance, never written back by AI without a
  -- human confirming (see file header). Real FKs, never a name guess.
  ai_suggested_category     text,
  ai_suggested_customer_id  uuid REFERENCES public.crm_customers(id),
  ai_suggested_supplier_id  uuid REFERENCES public.suppliers(id),
  ai_suggested_project_id   uuid REFERENCES public.crm_projects(id),
  ai_confidence             text,
  -- Supplementary evidence the user attaches next to this one line
  -- (payment screenshot / invoice / receipt) — separate from the voucher
  -- pipeline, optional, single file per line for V1.
  storage_path              text,
  file_name                 text,
  mime_type                 text,
  status                    text NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'confirmed', 'matched', 'ignored')),
  -- Business id (transactions.payload->>'id') this line produced when
  -- confirmed as a NEW transaction.
  confirmed_transaction_ref text,
  -- Business id of an EXISTING transaction this line was linked to instead
  -- of creating a duplicate (see file header's "只做关联，不重复生成一笔账").
  matched_transaction_ref   text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  -- A line can be either confirmed into a new transaction OR matched to an
  -- existing one, never both.
  CONSTRAINT chk_bank_statement_lines_confirm_xor_match
    CHECK (confirmed_transaction_ref IS NULL OR matched_transaction_ref IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_bank_statement_lines_import  ON public.bank_statement_lines(import_id);
CREATE INDEX IF NOT EXISTS idx_bank_statement_lines_account ON public.bank_statement_lines(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_bank_statement_lines_status  ON public.bank_statement_lines(status);

ALTER TABLE public.bank_statement_lines ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON TABLE public.bank_statement_lines TO authenticated;

DROP POLICY IF EXISTS "finance users can view bank statement lines" ON public.bank_statement_lines;
CREATE POLICY "finance users can view bank statement lines"
ON public.bank_statement_lines FOR SELECT TO authenticated USING (public.has_module('finance'));

DROP POLICY IF EXISTS "finance users can create bank statement lines" ON public.bank_statement_lines;
CREATE POLICY "finance users can create bank statement lines"
ON public.bank_statement_lines FOR INSERT TO authenticated WITH CHECK (public.has_module('finance'));

DROP POLICY IF EXISTS "finance users can update bank statement lines" ON public.bank_statement_lines;
CREATE POLICY "finance users can update bank statement lines"
ON public.bank_statement_lines FOR UPDATE TO authenticated
USING (public.has_module('finance')) WITH CHECK (public.has_module('finance'));

CREATE OR REPLACE FUNCTION public.bank_statement_lines_set_updated_meta()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bank_statement_lines_updated_meta ON public.bank_statement_lines;
CREATE TRIGGER trg_bank_statement_lines_updated_meta
BEFORE UPDATE ON public.bank_statement_lines
FOR EACH ROW EXECUTE FUNCTION public.bank_statement_lines_set_updated_meta();

-- ═══════════════════════════════════════════════════════════════════════════
-- 2b. Atomic confirm/match RPCs — the ONLY way the frontend turns a pending
-- bank_statement_line into a real transaction or links it to an existing
-- one. SECURITY INVOKER (same as create_supplier_payment()/
-- clear_supplier_cheque() — a transaction boundary, not elevated
-- privilege): every INSERT/UPDATE inside still goes through normal RLS.
--
-- Idempotency guard (2026-09-15 review addition): each function's very
-- first write is `UPDATE bank_statement_lines SET status = ... WHERE id =
-- ... AND status = 'pending'` — this is the atomic claim. Postgres row-
-- level locking on that UPDATE serializes concurrent calls against the
-- SAME line: whichever call's UPDATE commits first is the only one that
-- ever sees status still 'pending' and proceeds to create/link a
-- transaction; every other call (a double-click, a retried request, two
-- browser tabs) finds 0 rows matched, RAISEs, and creates nothing. This is
-- enforced in the database, not just by disabling a button in the UI.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.confirm_bank_statement_line(
  p_line_id       uuid,
  p_category      text,
  p_subcategory   text DEFAULT NULL,
  p_customer_id   uuid DEFAULT NULL,
  p_customer_name text DEFAULT NULL,
  p_supplier_id   uuid DEFAULT NULL,
  p_supplier_name text DEFAULT NULL,
  p_project_id    uuid DEFAULT NULL
)
RETURNS text -- the new transaction's business id (transactions.payload->>'id')
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_line             public.bank_statement_lines%ROWTYPE;
  v_txn_business_id  text;
BEGIN
  IF NOT public.has_module('finance') THEN
    RAISE EXCEPTION 'permission denied: finance module required';
  END IF;
  IF p_category IS NULL OR p_category = '' THEN
    RAISE EXCEPTION 'category is required';
  END IF;

  -- Atomic claim — see header comment above.
  UPDATE public.bank_statement_lines
  SET status = 'confirmed'
  WHERE id = p_line_id AND status = 'pending'
  RETURNING * INTO v_line;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'bank_statement_line % is not pending (already confirmed/matched/ignored, or does not exist) — refusing to create a duplicate transaction', p_line_id;
  END IF;

  v_txn_business_id := 'TXN-BSL-' || v_line.id::text;

  -- Fields come off the already-locked v_line row itself (date/amount/
  -- direction/bank_account_id/attachment), never re-trusted from the
  -- caller — same "never trust client-resolved values" principle as
  -- create_supplier_payment().
  INSERT INTO public.transactions (created_at, updated_at, state, payload)
  VALUES (now(), now(), 'active', jsonb_strip_nulls(jsonb_build_object(
    'id', v_txn_business_id,
    'date', COALESCE(v_line.line_date::text, now()::date::text),
    'type', v_line.direction,
    'amount', v_line.amount,
    'ref_type', 'MANUAL',
    'note', NULLIF(v_line.bank_description, ''),
    'userId', 'Admin',
    'payment_method', 'BANK_TRANSFER',
    'bank_account_id', v_line.bank_account_id::text,
    'category', p_category,
    'subcategory', p_subcategory,
    'source_module', 'FINANCE_BANK_RECONCILIATION',
    'customer_id', p_customer_id::text,
    'customer', p_customer_name,
    'supplier_id', p_supplier_id::text,
    'supplier', p_supplier_name,
    'project_id', p_project_id::text,
    'reconciliation_status', 'matched',
    'attachment_storage_path', v_line.storage_path,
    'attachment_file_name', v_line.file_name,
    'created_at', now()::text,
    'createdAt', now()::text,
    'updated_at', now()::text,
    'updatedAt', now()::text
  )));

  UPDATE public.bank_statement_lines
  SET confirmed_transaction_ref = v_txn_business_id
  WHERE id = p_line_id;

  RETURN v_txn_business_id;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_bank_statement_line(uuid, text, text, uuid, text, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_bank_statement_line(uuid, text, text, uuid, text, uuid, text, uuid) TO authenticated;


-- Updated 2026-09-15 (third revision) — match_bank_statement_line() no
-- longer trusts the frontend's own candidate resolution at all. The
-- frontend still only ever SUGGESTS candidates (date-scored, see
-- bookkeepingService.candidateMatches) — nothing here changes that — but
-- before this function marks a line MATCHED it now independently re-reads
-- the target transaction from the database and hard-validates every fact
-- that makes it a legitimate match. Any failure RAISEs and the whole call
-- rolls back (including the line's own atomic claim below) — no partial
-- state.
CREATE OR REPLACE FUNCTION public.match_bank_statement_line(
  p_line_id                  uuid,
  p_matched_transaction_ref  text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_line             public.bank_statement_lines%ROWTYPE;
  v_txn_payload      jsonb;
  v_diff_days        int;
  v_already_matched  boolean;
BEGIN
  IF NOT public.has_module('finance') THEN
    RAISE EXCEPTION 'permission denied: finance module required';
  END IF;
  IF p_matched_transaction_ref IS NULL OR p_matched_transaction_ref = '' THEN
    RAISE EXCEPTION 'matched_transaction_ref is required';
  END IF;

  -- Lock + validate the line itself first (same atomic-claim intent as
  -- confirm_bank_statement_line() — FOR UPDATE here instead of a blind
  -- UPDATE because several more checks need the line's own fields before
  -- the final claim below).
  SELECT * INTO v_line FROM public.bank_statement_lines WHERE id = p_line_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'bank_statement_line % not found', p_line_id;
  END IF;
  IF v_line.status <> 'pending' THEN
    RAISE EXCEPTION 'bank_statement_line % is not pending (currently %) — refusing duplicate match', p_line_id, v_line.status;
  END IF;

  -- Lock + re-read the target transaction server-side — never trusts
  -- whatever the client resolved as "this looks like a match". FOR UPDATE
  -- also serializes two concurrent match attempts against the SAME
  -- transaction (see check 6 below).
  SELECT payload INTO v_txn_payload
  FROM public.transactions
  WHERE payload->>'id' = p_matched_transaction_ref
  FOR UPDATE;

  -- 1. transaction must exist.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'transaction % not found — refusing to match', p_matched_transaction_ref;
  END IF;

  -- 2. bank_account_id must match.
  IF v_txn_payload->>'bank_account_id' IS DISTINCT FROM v_line.bank_account_id::text THEN
    RAISE EXCEPTION 'transaction % bank_account_id does not match bank_statement_line % — refusing to match', p_matched_transaction_ref, p_line_id;
  END IF;

  -- 3. direction/type must match.
  IF v_txn_payload->>'type' IS DISTINCT FROM v_line.direction THEN
    RAISE EXCEPTION 'transaction % type does not match bank_statement_line % direction — refusing to match', p_matched_transaction_ref, p_line_id;
  END IF;

  -- 4. amount must match exactly — numeric comparison, not a text/string one.
  IF (v_txn_payload->>'amount')::numeric IS DISTINCT FROM v_line.amount THEN
    RAISE EXCEPTION 'transaction % amount does not match bank_statement_line % amount — refusing to match', p_matched_transaction_ref, p_line_id;
  END IF;

  -- 5. dates within 3 days of each other (inclusive) — same window the
  -- frontend's own suggestion scoring already enforces, re-checked here so
  -- it can't be bypassed by calling the RPC directly.
  IF v_line.line_date IS NULL OR v_txn_payload->>'date' IS NULL THEN
    RAISE EXCEPTION 'missing date on bank_statement_line % or transaction % — refusing to match', p_line_id, p_matched_transaction_ref;
  END IF;
  v_diff_days := ABS(v_line.line_date - (v_txn_payload->>'date')::date);
  IF v_diff_days > 3 THEN
    RAISE EXCEPTION 'transaction % date is % days from bank_statement_line % date — exceeds the 3-day window, refusing to match', p_matched_transaction_ref, v_diff_days, p_line_id;
  END IF;

  -- 6. target transaction must not already be matched by a DIFFERENT line.
  SELECT EXISTS (
    SELECT 1 FROM public.bank_statement_lines
    WHERE matched_transaction_ref = p_matched_transaction_ref AND id <> p_line_id
  ) INTO v_already_matched;
  IF v_already_matched THEN
    RAISE EXCEPTION 'transaction % is already matched to another bank_statement_line — refusing duplicate match', p_matched_transaction_ref;
  END IF;

  -- Final atomic claim — still guarded by status = 'pending' even though
  -- the FOR UPDATE lock above already serializes concurrent calls against
  -- this same line, as defense in depth.
  UPDATE public.bank_statement_lines
  SET status = 'matched', matched_transaction_ref = p_matched_transaction_ref
  WHERE id = p_line_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'bank_statement_line % is not pending — refusing duplicate match', p_line_id;
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.match_bank_statement_line(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_bank_statement_line(uuid, text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. finance_vouchers — one row per uploaded receipt/invoice/payment proof
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.finance_vouchers (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_path              text NOT NULL,
  file_name                 text NOT NULL,
  mime_type                 text,
  -- Chosen by the user up front, per spec: Cash / Bank Account / Cheque.
  payment_context           text NOT NULL CHECK (payment_context IN ('CASH', 'BANK_TRANSFER', 'CHEQUE')),
  bank_account_id           uuid REFERENCES public.bank_accounts(id),
  purpose_note              text NOT NULL DEFAULT '',
  -- AI-extracted fields — read-only until confirmed, see file header.
  ai_date                   date,
  ai_amount                 numeric(14,2),
  ai_counterparty           text,
  ai_invoice_no             text,
  ai_vat_amount             numeric(14,2),
  ai_description            text,
  ai_suggested_category     text,
  ai_suggested_subcategory  text,
  ai_suggested_customer_id  uuid REFERENCES public.crm_customers(id),
  ai_suggested_supplier_id  uuid REFERENCES public.suppliers(id),
  ai_suggested_project_id   uuid REFERENCES public.crm_projects(id),
  status                    text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed')),
  -- Business id (transactions.payload->>'id') — set when confirmed as "已付款".
  resulting_transaction_ref text,
  -- Set when confirmed as "未付款供应商发票" instead (reuses AP V1's table).
  resulting_payable_id      uuid REFERENCES public.supplier_payables(id),
  created_at                timestamptz NOT NULL DEFAULT now(),
  created_by                uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT chk_finance_vouchers_one_outcome
    CHECK (resulting_transaction_ref IS NULL OR resulting_payable_id IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_finance_vouchers_status ON public.finance_vouchers(status);

ALTER TABLE public.finance_vouchers ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON TABLE public.finance_vouchers TO authenticated;

DROP POLICY IF EXISTS "finance users can view finance vouchers" ON public.finance_vouchers;
CREATE POLICY "finance users can view finance vouchers"
ON public.finance_vouchers FOR SELECT TO authenticated USING (public.has_module('finance'));

DROP POLICY IF EXISTS "finance users can create finance vouchers" ON public.finance_vouchers;
CREATE POLICY "finance users can create finance vouchers"
ON public.finance_vouchers FOR INSERT TO authenticated WITH CHECK (public.has_module('finance'));

DROP POLICY IF EXISTS "finance users can update finance vouchers" ON public.finance_vouchers;
CREATE POLICY "finance users can update finance vouchers"
ON public.finance_vouchers FOR UPDATE TO authenticated
USING (public.has_module('finance')) WITH CHECK (public.has_module('finance'));

CREATE OR REPLACE FUNCTION public.finance_vouchers_set_created_meta()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.created_by := auth.uid();
  NEW.created_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_finance_vouchers_created_meta ON public.finance_vouchers;
CREATE TRIGGER trg_finance_vouchers_created_meta
BEFORE INSERT ON public.finance_vouchers
FOR EACH ROW EXECUTE FUNCTION public.finance_vouchers_set_created_meta();

-- No DELETE policy on either table — same "void via status, never drop the
-- row" convention as every other Finance table this session.

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Storage bucket — private, gated on has_module('finance') the same way
--    company-documents gates on is_active_admin(). Signed URLs only, never
--    a public link.
-- ─────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('finance-documents', 'finance-documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "finance users can read finance-documents files" ON storage.objects;
CREATE POLICY "finance users can read finance-documents files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'finance-documents' AND public.has_module('finance'));

DROP POLICY IF EXISTS "finance users can upload finance-documents files" ON storage.objects;
CREATE POLICY "finance users can upload finance-documents files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'finance-documents' AND public.has_module('finance'));

DROP POLICY IF EXISTS "finance users can update finance-documents files" ON storage.objects;
CREATE POLICY "finance users can update finance-documents files"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'finance-documents' AND public.has_module('finance'))
WITH CHECK (bucket_id = 'finance-documents' AND public.has_module('finance'));

-- ─────────────────────────────────────────────────────────────────────────
-- STEP 0 — Pre-flight sanity check (read-only, safe to run any time).
-- ─────────────────────────────────────────────────────────────────────────
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('bank_statement_imports', 'bank_statement_lines', 'finance_vouchers');
-- expect: 3 rows

SELECT tablename, policyname FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('bank_statement_imports', 'bank_statement_lines', 'finance_vouchers')
ORDER BY tablename, policyname;
-- expect: 3 policies per table (select/insert/update) = 9 rows total

SELECT id, name, public FROM storage.buckets WHERE id = 'finance-documents';
-- expect: 1 row, public = false

SELECT policyname, cmd FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE '%finance-documents%';
-- expect: 3 policies (select/insert/update)

SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_name IN ('confirm_bank_statement_line', 'match_bank_statement_line');
-- expect: 2 rows

SELECT conname FROM pg_constraint
WHERE conrelid = 'public.bank_statement_imports'::regclass AND contype = 'u';
-- expect: 1 row (uq_bank_statement_imports_account_hash)
