-- ═══════════════════════════════════════════════════════════════════════════
-- GCI Finance V1 — Historical `transactions` cleanup + dedup + 归户
--
-- PRODUCTION DATA CLEANUP — EXECUTABLE SCRIPT
--
-- This script performs DELETE/UPDATE operations on public.transactions and
-- COMMITs automatically only if both STEP 0 and STEP 5 hard guards pass.
-- Every prior review round (SQL logic, STEP 0 pre-flight guard, STEP 5
-- post-flight guard) is complete and signed off — see chat history for the
-- full audit trail. Run this as one paste into the Supabase SQL Editor.
--
-- Scope: `transactions` table ONLY. Does not touch `orders`, `payments`,
-- `quotes`, or any other table. BINGOMART's VOIDED order rows are NOT
-- touched by anything here — that's a separate, still-open question and
-- this file has no opinion on it.
--
-- Numbers below are from a live query against Production run on 2026-09-14,
-- same session — table had 8932 rows, all four buckets below sum to
-- exactly 8932 with nothing left over.
--
-- Updated 2026-09-14 (same day, later revision): STEP 4's 归户 logic no
-- longer ever picks a bank_accounts row by account_type alone. The 6 order
-- payments (payload.method='CASH', unambiguous) still auto-assign to the
-- Cash account. CST-1779957931246 (consignment settlement) is deduped but
-- left WITHOUT a bank_account_id — its only source field was the old
-- free-text account:'Corporate' label, which doesn't identify one specific
-- account. It's flagged needs_manual_account_assignment=true instead.
--
-- Updated 2026-09-15: STEP 0 turned from a block of plain SELECTs (a human
-- had to eyeball the output against "-- expect N" comments) into an
-- enforced DO $$ ... RAISE EXCEPTION $$ guard. It now hard-checks all 13
-- baseline counts (total, both seed buckets, BS test rows, the consignment
-- event, the orphan payment, and each of the 6 Bucket-B refId counts) and
-- aborts the whole transaction on the first mismatch — nothing below it
-- can run against data that has drifted since this draft was written.
-- Bucket A/A2/B/C and STEP 4's assignment logic are unchanged.
--
-- Updated 2026-09-15 (second revision): STEP 5 turned from two read-only
-- SELECTs (a human was meant to eyeball the output, then come back and
-- type COMMIT) into the same kind of enforced DO $$ ... RAISE EXCEPTION $$
-- guard as STEP 0 — because Supabase Dashboard's SQL Editor does not keep
-- a transaction open across separate "Run" clicks, so "run to STEP 5,
-- review by hand, run COMMIT afterward" was never actually possible there.
-- STEP 5 now hard-checks total_rows_after=8, exactly 6 rows on the Cash
-- account, CST-1779957931246's flag+empty bank_account_id, the orphan's
-- flag+empty bank_account_id, and that both seed buckets and BS test rows
-- are fully gone — and only if every one of those holds does the script
-- fall through to the two display SELECTs and an unconditional COMMIT, all
-- in the same run. Any mismatch raises before COMMIT is ever reached, and
-- the transaction is left aborted (needs a manual bare ROLLBACK; to clear).
-- Bucket A/A2/B/C and STEP 4's assignment logic are still unchanged.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- STEP 0 — Pre-flight guard (2026-09-15 revision: enforced, not advisory).
-- Was a block of plain SELECTs with "-- expect N" comments a human had to
-- eyeball before continuing; that's not a guard, it's a suggestion. Now a
-- real DO $$ block that RAISE EXCEPTIONs on the first mismatch, which
-- aborts the enclosing transaction immediately — every DELETE/UPDATE below
-- (Bucket A/A2/B/C, STEP 4) never runs if even one baseline count has
-- drifted since this draft was written. If it passes, it falls through to
-- Bucket A and the rest of the file exactly as before.
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_total       int;
  v_seed1       int;
  v_seed2       int;
  v_bs_test     int;
  v_consignment int;
  v_orphan      int;
  v_b1 int; v_b2 int; v_b3 int; v_b4 int; v_b5 int; v_b6 int;
BEGIN
  SELECT count(*) INTO v_total       FROM public.transactions;
  SELECT count(*) INTO v_seed1       FROM public.transactions WHERE payload->>'id' = '1';
  SELECT count(*) INTO v_seed2       FROM public.transactions WHERE payload->>'id' = '2';
  SELECT count(*) INTO v_bs_test     FROM public.transactions
    WHERE payload->>'source_module' = 'BUSINESS_SOLUTIONS' AND payload->>'note' = 'test';
  SELECT count(*) INTO v_consignment FROM public.transactions WHERE payload->>'id' = 'CST-1779957931246';
  SELECT count(*) INTO v_orphan      FROM public.transactions WHERE payload->>'refId' = 'PAY-1779440121802';
  SELECT count(*) INTO v_b1 FROM public.transactions WHERE payload->>'refId' = 'PAY-1779386522159';
  SELECT count(*) INTO v_b2 FROM public.transactions WHERE payload->>'refId' = 'PAY-1780996785791';
  SELECT count(*) INTO v_b3 FROM public.transactions WHERE payload->>'refId' = 'PAY-1783390941877';
  SELECT count(*) INTO v_b4 FROM public.transactions WHERE payload->>'refId' = 'PAY-1783391236568';
  SELECT count(*) INTO v_b5 FROM public.transactions WHERE payload->>'refId' = 'PAY-1783391669701';
  SELECT count(*) INTO v_b6 FROM public.transactions WHERE payload->>'refId' = 'PAY-1783392027700';

  IF v_total <> 8932 THEN
    RAISE EXCEPTION 'Pre-flight guard failed: total_rows = % (expected 8932). Data has changed since this draft was written — STOP, re-derive the plan against current data.', v_total;
  END IF;
  IF v_seed1 <> 3896 THEN
    RAISE EXCEPTION 'Pre-flight guard failed: fake_seed_in (payload.id=''1'') = % (expected 3896).', v_seed1;
  END IF;
  IF v_seed2 <> 3849 THEN
    RAISE EXCEPTION 'Pre-flight guard failed: fake_seed_out (payload.id=''2'') = % (expected 3849).', v_seed2;
  END IF;
  IF v_bs_test <> 2 THEN
    RAISE EXCEPTION 'Pre-flight guard failed: bs_test_rows = % (expected 2).', v_bs_test;
  END IF;
  IF v_consignment <> 156 THEN
    RAISE EXCEPTION 'Pre-flight guard failed: consignment_rows (CST-1779957931246) = % (expected 156).', v_consignment;
  END IF;
  IF v_orphan <> 156 THEN
    RAISE EXCEPTION 'Pre-flight guard failed: orphan_rows (refId=PAY-1779440121802) = % (expected 156).', v_orphan;
  END IF;
  IF v_b1 <> 765 THEN
    RAISE EXCEPTION 'Pre-flight guard failed: refId PAY-1779386522159 count = % (expected 765).', v_b1;
  END IF;
  IF v_b2 <> 68 THEN
    RAISE EXCEPTION 'Pre-flight guard failed: refId PAY-1780996785791 count = % (expected 68).', v_b2;
  END IF;
  IF v_b3 <> 16 THEN
    RAISE EXCEPTION 'Pre-flight guard failed: refId PAY-1783390941877 count = % (expected 16).', v_b3;
  END IF;
  IF v_b4 <> 12 THEN
    RAISE EXCEPTION 'Pre-flight guard failed: refId PAY-1783391236568 count = % (expected 12).', v_b4;
  END IF;
  IF v_b5 <> 8 THEN
    RAISE EXCEPTION 'Pre-flight guard failed: refId PAY-1783391669701 count = % (expected 8).', v_b5;
  END IF;
  IF v_b6 <> 4 THEN
    RAISE EXCEPTION 'Pre-flight guard failed: refId PAY-1783392027700 count = % (expected 4).', v_b6;
  END IF;

  RAISE NOTICE 'Pre-flight guard passed: total=%, seed1=%, seed2=%, bs_test=%, consignment=%, orphan=%, refIds=[%,%,%,%,%,%]. Proceeding.',
    v_total, v_seed1, v_seed2, v_bs_test, v_consignment, v_orphan, v_b1, v_b2, v_b3, v_b4, v_b5, v_b6;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- BUCKET A — 纯假 seed. Delete entirely, no representative kept.
-- FinanceTracker's old auto-seed effect (removed from code already) wrote
-- "Initial Capital" (id='1') and "Office Supplies" (id='2') on every page
-- load where it thought the ledger was empty. Zero real business content.
-- ═══════════════════════════════════════════════════════════════════════════
DELETE FROM public.transactions WHERE payload->>'id' IN ('1', '2');
-- expect: DELETE 7745


-- ═══════════════════════════════════════════════════════════════════════════
-- BUCKET A2 — Business Solutions dev/QA test rows. Delete entirely.
-- Explicitly self-labeled test data (note:'test', userId:'test',
-- customer_name:'CBD', quote_no:'TEST-059721') from BS module integration
-- testing that landed in the shared `transactions` table. Not seed-bug
-- output, but same disposition: not real, safe to remove outright.
-- ═══════════════════════════════════════════════════════════════════════════
DELETE FROM public.transactions
WHERE payload->>'source_module' = 'BUSINESS_SOLUTIONS' AND payload->>'note' = 'test';
-- expect: DELETE 2


-- ═══════════════════════════════════════════════════════════════════════════
-- BUCKET B — 真实业务重复（确认真实）. Dedup to 1 row each, keep the
-- newest `updated_at` physical row (same rule the app's own mergeById
-- already uses for reads, so the row being kept is the one the UI is
-- already treating as current). 7 confirmed real events, 1029 rows -> 7.
--
-- "Confirmed" means: backed by a real payments-table row (6 order
-- payments) or a real consignment settlement flow (1 consignment event) —
-- not just "has a refType tag". See chat report for the payments-table
-- cross-check per row.
-- ═══════════════════════════════════════════════════════════════════════════

-- B1. PAY-1779386522159 — Order SO-20260521-3787, Easy4me FZ LLE, AED 449.00, 2026-05-21, CASH — 765 rows -> 1
DELETE FROM public.transactions
WHERE payload->>'refId' = 'PAY-1779386522159' AND id <> '412b7744-11a8-49f2-86e5-e5bd9709785a';
-- expect: DELETE 764

-- B2. PAY-1780996785791 — Order SO-20260609-9189, BINGOMART 1+1, AED 269.75, 2026-06-09, CASH — 68 rows -> 1
DELETE FROM public.transactions
WHERE payload->>'refId' = 'PAY-1780996785791' AND id <> '2924d8c4-ea29-4079-81db-f72fe365fd68';
-- expect: DELETE 67

-- B3. PAY-1783390941877 — Order SO-20260707-5270, BINGOMART 1+1, AED 592.20, 2026-07-07, CASH — 16 rows -> 1
DELETE FROM public.transactions
WHERE payload->>'refId' = 'PAY-1783390941877' AND id <> 'd74310df-364f-4d18-a371-e4bd8549578f';
-- expect: DELETE 15

-- B4. PAY-1783391236568 — Order SO-20260707-8865, BINGOMART 1+1, AED 455.70, 2026-07-07, CASH — 12 rows -> 1
DELETE FROM public.transactions
WHERE payload->>'refId' = 'PAY-1783391236568' AND id <> 'df2022c2-8758-43b0-8fb6-9d536f906375';
-- expect: DELETE 11

-- B5. PAY-1783391669701 — Order SO-20260707-1435, BINGOMART 1+1, AED 814.80, 2026-07-07, CASH — 8 rows -> 1
DELETE FROM public.transactions
WHERE payload->>'refId' = 'PAY-1783391669701' AND id <> '8268491c-b42e-4faa-a609-834afdd6395d';
-- expect: DELETE 7

-- B6. PAY-1783392027700 — Order SO-20260707-3525, BINGOMART 1+1, AED 814.80, 2026-07-07, CASH — 4 rows -> 1
DELETE FROM public.transactions
WHERE payload->>'refId' = 'PAY-1783392027700' AND id <> '9d547d1b-8041-4112-838e-6e7c2e337a55';
-- expect: DELETE 3

-- B7. CST-1779957931246 — Consignment settlement, Hong gourmet hypermarket, AED 3.85, 2026-05-28
-- Business reality is NOT in doubt (real consignment settlement, unlike
-- Bucket C's orphan) — only WHICH bank account is unknown. The only source
-- field is the old free-text account:'Corporate' label, which does not
-- identify a specific bank_accounts row (per explicit instruction: never
-- guess one Corporate account out of possibly several). Dedup only, no
-- bank_account_id assignment — see STEP 4.
DELETE FROM public.transactions
WHERE payload->>'id' = 'CST-1779957931246' AND id <> '542c5422-db46-4c72-8fc2-c96bf083da99';
-- expect: DELETE 155

-- Bucket B total: 764+67+15+11+7+3+155 = 1022 deleted, 7 kept (6 auto-归户
-- to Cash in STEP 4 below; CST kept but intentionally left unassigned)


-- ═══════════════════════════════════════════════════════════════════════════
-- BUCKET C — 待确认孤儿记录. Dedup only — collapse duplicates down to 1
-- row, but do NOT delete the event entirely (unlike Bucket A) and do NOT
-- auto-assign a bank_account_id (unlike Bucket B) — per explicit
-- instruction, an unconfirmed record is never auto-归户.
--
-- PAY-1779440121802 — same order as B1 (SO-20260521-3787, Easy4me FZ LLE),
-- AED 449.22, dated the day AFTER that order was already fully paid and
-- closed (outstanding=0). No matching row in `payments`. Order's
-- paidAmount was never incremented by this amount. Likely an artifact of
-- the same duplicate-write bug, not a second real cash collection — but
-- this file does not delete it on that guess. 156 rows -> 1, kept as-is
-- for manual review.
-- ═══════════════════════════════════════════════════════════════════════════
DELETE FROM public.transactions
WHERE payload->>'refId' = 'PAY-1779440121802' AND id <> '2758c063-86a6-4471-b639-ee379e539d9b';
-- expect: DELETE 155

-- Mark the kept row so it's easy to find later without re-deriving this
-- investigation. Adds one field to payload, does not touch amount/date/
-- type/anything else. Safe to skip this UPDATE if you'd rather not tag it.
UPDATE public.transactions
SET payload = payload || '{"needs_manual_review": "orphan payment, no matching payments-table row, see chat audit 2026-09"}'::jsonb
WHERE id = '2758c063-86a6-4471-b639-ee379e539d9b';


-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 4 — 归户: assign bank_account_id ONLY where it can be determined
-- without guessing. Finance V1 rule update (2026-09): a generic
-- account_type='Corporate' match is NEVER an acceptable way to pick a
-- specific bank_accounts row — 'Corporate' is a category, not an account
-- identity, and there can legitimately be more than one active Corporate
-- account. The old version of this block picked "the" Corporate account by
-- type alone; that branch is removed entirely, not just guarded.
--
-- What CAN be determined safely:
--   - The 6 order payments all have payload.method = 'CASH' — unambiguous,
--     maps to whichever bank_accounts row is account_type='Cash'. Still
--     guarded: aborts (does not guess) if there isn't EXACTLY one active
--     Cash account, same "refuse rather than pick one" principle applied
--     to Cash too, not just Corporate.
--   - CST-1779957931246 (consignment settlement) has no field identifying
--     a specific bank account at all — only the old free-text
--     account:'Corporate' label. This is left with bank_account_id = NULL
--     and flagged needs_manual_account_assignment = true for you to assign
--     by hand later (in the UI, once real Corporate accounts exist).
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  cash_id uuid;
  cash_count int;
BEGIN
  SELECT count(*) INTO cash_count FROM public.bank_accounts WHERE account_type = 'Cash' AND is_active = true;

  IF cash_count = 0 THEN
    RAISE EXCEPTION 'No active Cash bank_accounts row found — create it first, then re-run this block.';
  ELSIF cash_count > 1 THEN
    RAISE EXCEPTION 'Found % active Cash bank_accounts rows — ambiguous, refusing to guess which one. Deactivate extras or assign these 6 rows manually.', cash_count;
  END IF;

  SELECT id INTO cash_id FROM public.bank_accounts WHERE account_type = 'Cash' AND is_active = true;

  -- 6 order payments (all payload.method = 'CASH', unambiguous) -> Cash account
  UPDATE public.transactions
  SET payload = payload || jsonb_build_object('bank_account_id', cash_id)
  WHERE id IN (
    '412b7744-11a8-49f2-86e5-e5bd9709785a', -- PAY-1779386522159
    '2924d8c4-ea29-4079-81db-f72fe365fd68', -- PAY-1780996785791
    'd74310df-364f-4d18-a371-e4bd8549578f', -- PAY-1783390941877
    'df2022c2-8758-43b0-8fb6-9d536f906375', -- PAY-1783391236568
    '8268491c-b42e-4faa-a609-834afdd6395d', -- PAY-1783391669701
    '9d547d1b-8041-4112-838e-6e7c2e337a55'  -- PAY-1783392027700
  );

  -- CST-1779957931246: dedup only (already done above) — NOT auto-assigned
  -- to any Corporate account. Flag it for manual assignment instead of
  -- guessing. bank_account_id is left absent/NULL on purpose.
  UPDATE public.transactions
  SET payload = payload || '{"needs_manual_account_assignment": true}'::jsonb
  WHERE id = '542c5422-db46-4c72-8fc2-c96bf083da99'; -- CST-1779957931246

  RAISE NOTICE 'Assigned % rows to Cash (%). CST-1779957931246 flagged needs_manual_account_assignment, no bank_account_id set.', 6, cash_id;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 5 — Post-flight guard (2026-09-15 second revision: enforced, not
-- read-only). Supabase Dashboard's SQL Editor does NOT keep a transaction
-- open across separate "Run" clicks — a "run to here, eyeball the output,
-- come back and type COMMIT" workflow is not actually possible there; the
-- second click would be a brand new session with no open transaction to
-- commit. So this can no longer be "look at two SELECTs, decide by hand" —
-- it has to be a hard DO $$ ... RAISE EXCEPTION $$ guard that either lets
-- the script fall through to COMMIT on its own, in the same run, or aborts
-- the whole transaction before COMMIT is ever reached.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_total_after  int;
  v_cash_id      uuid;
  v_cash_count   int;
  v_cash_rows    int;
  v_cst_count    int;
  v_cst_flag     text;
  v_cst_bank_id  text;
  v_orphan_count   int;
  v_orphan_review  text;
  v_orphan_bank_id text;
  v_seed1_after  int;
  v_seed2_after  int;
  v_bs_test_after int;
BEGIN
  -- 1. total_rows_after = 8
  SELECT count(*) INTO v_total_after FROM public.transactions;
  IF v_total_after <> 8 THEN
    RAISE EXCEPTION 'Post-flight guard failed: total_rows_after = % (expected 8).', v_total_after;
  END IF;

  -- 2. Exactly 6 surviving rows carry the (single) active Cash account's
  -- bank_account_id. Re-derives cash_id independently rather than reusing
  -- STEP 4's — this guard must stand on its own even if someone runs STEP 5
  -- against data that reached this state some other way.
  SELECT count(*) INTO v_cash_count FROM public.bank_accounts WHERE account_type = 'Cash' AND is_active = true;
  IF v_cash_count <> 1 THEN
    RAISE EXCEPTION 'Post-flight guard failed: % active Cash bank_accounts rows found (expected exactly 1) — cannot verify the 6 CASH assignments.', v_cash_count;
  END IF;
  SELECT id INTO v_cash_id FROM public.bank_accounts WHERE account_type = 'Cash' AND is_active = true;
  SELECT count(*) INTO v_cash_rows FROM public.transactions WHERE payload->>'bank_account_id' = v_cash_id::text;
  IF v_cash_rows <> 6 THEN
    RAISE EXCEPTION 'Post-flight guard failed: % surviving rows carry the Cash account''s bank_account_id (expected exactly 6).', v_cash_rows;
  END IF;

  -- 3. CST-1779957931246: exactly 1 row, needs_manual_account_assignment
  -- = true, bank_account_id empty.
  SELECT count(*) INTO v_cst_count FROM public.transactions WHERE payload->>'id' = 'CST-1779957931246';
  IF v_cst_count <> 1 THEN
    RAISE EXCEPTION 'Post-flight guard failed: CST-1779957931246 row count = % (expected exactly 1).', v_cst_count;
  END IF;
  SELECT payload->>'needs_manual_account_assignment', payload->>'bank_account_id'
    INTO v_cst_flag, v_cst_bank_id
    FROM public.transactions WHERE payload->>'id' = 'CST-1779957931246';
  IF v_cst_flag IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Post-flight guard failed: CST-1779957931246 needs_manual_account_assignment = % (expected ''true'').', v_cst_flag;
  END IF;
  IF v_cst_bank_id IS NOT NULL THEN
    RAISE EXCEPTION 'Post-flight guard failed: CST-1779957931246 bank_account_id = % (expected NULL/empty).', v_cst_bank_id;
  END IF;

  -- 4. Orphan PAY-1779440121802: exactly 1 row, needs_manual_review set,
  -- bank_account_id empty.
  SELECT count(*) INTO v_orphan_count FROM public.transactions WHERE payload->>'refId' = 'PAY-1779440121802';
  IF v_orphan_count <> 1 THEN
    RAISE EXCEPTION 'Post-flight guard failed: orphan (refId=PAY-1779440121802) row count = % (expected exactly 1).', v_orphan_count;
  END IF;
  SELECT payload->>'needs_manual_review', payload->>'bank_account_id'
    INTO v_orphan_review, v_orphan_bank_id
    FROM public.transactions WHERE payload->>'refId' = 'PAY-1779440121802';
  IF v_orphan_review IS NULL THEN
    RAISE EXCEPTION 'Post-flight guard failed: orphan row has no needs_manual_review flag set.';
  END IF;
  IF v_orphan_bank_id IS NOT NULL THEN
    RAISE EXCEPTION 'Post-flight guard failed: orphan row bank_account_id = % (expected NULL/empty).', v_orphan_bank_id;
  END IF;

  -- 5. Seed rows (id='1' / id='2') gone.
  SELECT count(*) INTO v_seed1_after FROM public.transactions WHERE payload->>'id' = '1';
  IF v_seed1_after <> 0 THEN
    RAISE EXCEPTION 'Post-flight guard failed: seed rows with payload.id=''1'' remaining = % (expected 0).', v_seed1_after;
  END IF;
  SELECT count(*) INTO v_seed2_after FROM public.transactions WHERE payload->>'id' = '2';
  IF v_seed2_after <> 0 THEN
    RAISE EXCEPTION 'Post-flight guard failed: seed rows with payload.id=''2'' remaining = % (expected 0).', v_seed2_after;
  END IF;

  -- 6. Business Solutions test rows gone.
  SELECT count(*) INTO v_bs_test_after FROM public.transactions
    WHERE payload->>'source_module' = 'BUSINESS_SOLUTIONS' AND payload->>'note' = 'test';
  IF v_bs_test_after <> 0 THEN
    RAISE EXCEPTION 'Post-flight guard failed: BUSINESS_SOLUTIONS test rows remaining = % (expected 0).', v_bs_test_after;
  END IF;

  RAISE NOTICE 'Post-flight guard passed: total=8, 6 rows on Cash account %, CST-1779957931246 flagged/unassigned, orphan flagged/unassigned, seed=0, bs_test=0. Committing.', v_cash_id;
END $$;

-- Result display only — the guard above is what actually decides whether
-- execution reaches this point at all. If either SELECT below doesn't
-- match what the guard just verified, something is wrong with the guard
-- itself, not with the data (the data was already re-checked line by line).
SELECT count(*) AS total_rows_after FROM public.transactions;                 -- expect 8
SELECT
  payload->>'id' AS business_id,
  payload->>'bank_account_id' AS bank_account_id,
  payload->>'needs_manual_review' AS review_flag,
  payload->>'needs_manual_account_assignment' AS account_flag
FROM public.transactions ORDER BY updated_at DESC;
-- expect: 6 rows with a Cash bank_account_id and neither flag;
-- 1 row (CST-1779957931246) with account_flag='true', bank_account_id NULL;
-- 1 row (the orphan payment) with review_flag set, bank_account_id NULL.

-- Reaching this line means every guard above (STEP 0 and STEP 5) passed in
-- this same script run — commit in the same run, since the Dashboard SQL
-- Editor does not keep a transaction open across separate Run clicks for a
-- later manual COMMIT to attach to.
COMMIT;
-- If STEP 0 or STEP 5 raised an exception above, this line is never
-- reached — the transaction is left aborted and Postgres will refuse any
-- further statements in it. Run a bare `ROLLBACK;` afterward to clear it.
