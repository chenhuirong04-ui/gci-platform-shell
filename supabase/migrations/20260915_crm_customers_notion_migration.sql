-- GCI CRM — Notion Customer Master → crm_customers one-time migration
--
-- NOT YET EXECUTED — review before running in Supabase SQL Editor.
--
-- Source: PI's Notion customer database (2bfd0b13b3b980fc8b49e81603b8183d),
-- queried read-only on 2026-09-15 — 14 rows total. Matching decisions were
-- reviewed and confirmed in chat before this file was written; nothing
-- here was auto-merged by name-matching.
--
-- Updated 2026-09-15 (second revision): the migration list was cut from 12
-- customers down to 8 — k thai, Merich Global Wholesale LLC, Liz Metore
-- International, and Easy4me FZ LLE were explicitly removed from scope.
-- Those four Notion pages are NOT touched by this file at all (no INSERT,
-- no mention) — they stay exactly as unmigrated Notion-only records until
-- a future round decides otherwise. STEP 0 also became a hard abort
-- instead of an informational NOTICE, per explicit instruction.
--
-- Updated 2026-09-15 (third revision): diamond horse GTC LLC removed from
-- scope too (customer not yet confirmed) — cut from 8 down to 7. Same
-- treatment as the other four exclusions: no INSERT, no mention in the
-- customer/contact sections, and its notion_page_id was moved into the
-- STEP 5 excluded-customers guard alongside the original four.
--
-- Final scope — 7 customers:
--   1. 荔枝
--   2. CLAMB SUPERMARKET (merged with "LEO CLAMB SUPERMARKET")
--   3. ICHIGO GLOBAL
--   4. WONDER PETS
--   5. BINGOMART 1+1
--   6. Hong gourmet hypermarket L.L.C
--   7. 1212 chinese supermarket
--
-- Confirmed decisions this migration implements:
--   1. "LEO CLAMB SUPERMARKET" (37ad0b13-b3b9-8046-b326-c047a0dc53d5) and
--      "CLAMB SUPERMARKET" (2d1d0b13-b3b9-80c9-a166-e7c30864c5cc) are the
--      same real customer. Migrated as ONE crm_customers row. The primary
--      page (2d1d0b13...) was chosen because it's the more complete record
--      (has a phone number, cleaner name without the contact's name
--      prefixed onto it) — its notion_page_id is what goes in the unique
--      column. The secondary page id, AND the fact the two Notion pages
--      disagreed on customer_type (Supermarket vs Wholesaler), are both
--      preserved in full in follow_up_notes — nothing about the merge is
--      silently dropped.
--   2. The one Notion row with a blank Customer Name
--      (37ad0b13-b3b9-80b9-991e-c07c3c3b8b94) is skipped entirely — no
--      crm_customers row, no crm_contacts row.
--   3. Final count: 7 crm_customers rows created by this migration (2
--      existing + 7 new = 9 total after this runs).
--   4. Three Notion fields with no existing crm_customers column
--      (Payment Terms / Sales Channel / Channel Source) get three new
--      columns. None of the 7 customers in THIS scope actually has a
--      Payment Terms or Sales Channel/Channel Source value on Notion
--      (those only applied to the SB_POOL customers now removed from
--      scope) — the columns are still added for future migrations/manual
--      entry, just unused by this file's own INSERTs.
--
-- Idempotent: safe to run more than once.
--   - crm_customers: ON CONFLICT (notion_page_id) DO NOTHING — the column
--     already has a UNIQUE constraint (20260816_crm_core_tables.sql), so a
--     second run inserts zero new customer rows.
--   - crm_contacts: no unique constraint exists on this table, so each
--     contact INSERT is instead an INSERT ... SELECT ... WHERE NOT EXISTS
--     (same customer_id + same identifying field), which is equivalent
--     protection for this migration's purposes.
--
-- Does NOT touch the 2 existing crm_customers rows (ZIMO蒲总/SHADI,
-- notion_page_id both NULL) — this migration only INSERTs, never UPDATEs
-- an existing row.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- STEP 0 — Pre-flight guard (hard abort, per explicit instruction — this
-- is no longer an informational NOTICE). Confirms the exact baseline this
-- migration was written against — 2 existing customers, none with a
-- notion_page_id — still holds. If it doesn't, someone else has already
-- written to crm_customers since this file was reviewed, and the 7
-- INSERTs below must not run against data that has moved.
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_total int;
  v_with_notion int;
BEGIN
  SELECT count(*) INTO v_total FROM public.crm_customers;
  SELECT count(*) INTO v_with_notion FROM public.crm_customers WHERE notion_page_id IS NOT NULL;

  IF v_total <> 2 THEN
    RAISE EXCEPTION 'Pre-flight guard failed: crm_customers total = % (expected 2). Data has changed since this migration was written — STOP, re-derive the plan against current data.', v_total;
  END IF;
  IF v_with_notion <> 0 THEN
    RAISE EXCEPTION 'Pre-flight guard failed: crm_customers rows with notion_page_id set = % (expected 0).', v_with_notion;
  END IF;

  RAISE NOTICE 'Pre-flight guard passed: crm_customers at baseline (2 rows, 0 with notion_page_id). Proceeding.';
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. New columns — additive only, all nullable, nothing existing touched.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.crm_customers
  ADD COLUMN IF NOT EXISTS payment_terms  text,
  ADD COLUMN IF NOT EXISTS sales_channel  text,
  ADD COLUMN IF NOT EXISTS channel_source text;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Customers (7 INSERTs, one per Notion row / merged pair)
-- ─────────────────────────────────────────────────────────────────────────

-- #1 — 荔枝
INSERT INTO public.crm_customers (
  customer_name, notion_page_id, country, city, customer_type, source, follow_up_notes
) VALUES (
  '荔枝', '3cdd0b13-b3b9-8099-8e84-d35038d9ccc3', 'UAE', 'DUBAI', 'Individual（个体）',
  'notion_migration_2026',
  '[Notion Migration 2026-09-15] Migrated from Notion customer master (2bfd0b13b3b980fc8b49e81603b8183d).'
) ON CONFLICT (notion_page_id) DO NOTHING;

-- #2 — CLAMB SUPERMARKET (merged: primary 2d1d0b13-...-e7c30864c5cc "CLAMB SUPERMARKET"
-- + secondary 37ad0b13-...-c047a0dc53d5 "LEO CLAMB SUPERMARKET", same real customer)
INSERT INTO public.crm_customers (
  customer_name, notion_page_id, country, city, customer_type, currency, source, follow_up_notes
) VALUES (
  'CLAMB SUPERMARKET', '2d1d0b13-b3b9-80c9-a166-e7c30864c5cc', 'UAE', 'Dubai', 'Wholesaler（批发商）', 'AED',
  'notion_migration_2026',
  '[Notion Migration 2026-09-15] Merged from TWO Notion pages confirmed to be the same customer: '
  || 'primary page 2d1d0b13-b3b9-80c9-a166-e7c30864c5cc ("CLAMB SUPERMARKET", customer_type=Wholesaler（批发商）, phone=564677877) '
  || 'and secondary/legacy page 37ad0b13-b3b9-8046-b326-c047a0dc53d5 ("LEO CLAMB SUPERMARKET", customer_type=Supermarket（超市）, no phone on file). '
  || 'Field conflict on record: the two Notion pages disagreed on customer_type (Supermarket vs Wholesaler) — this row kept the primary page''s value; not independently re-verified against the real business. '
  || 'The secondary page id is NOT stored in notion_page_id (unique, one value only) — kept here in full for audit trail.'
) ON CONFLICT (notion_page_id) DO NOTHING;

-- #3 — ICHIGO GLOBAL
INSERT INTO public.crm_customers (
  customer_name, notion_page_id, country, city, customer_type, currency, source, follow_up_notes
) VALUES (
  'ICHIGO GLOBAL', '2d1d0b13-b3b9-8020-9a4b-ff9df25292e0', 'UAE', 'DUBAI', 'Trading Company（贸易公司）', 'AED',
  'notion_migration_2026',
  '[Notion Migration 2026-09-15] Migrated from Notion customer master (2bfd0b13b3b980fc8b49e81603b8183d).'
) ON CONFLICT (notion_page_id) DO NOTHING;

-- #4 — WONDER PETS
INSERT INTO public.crm_customers (
  customer_name, notion_page_id, country, city, customer_type, currency, source, follow_up_notes
) VALUES (
  'WONDER PETS', '2d1d0b13-b3b9-80fa-af79-fcba4b0c6699', 'UAE', 'DUBAI', 'Individual（个体）', 'AED',
  'notion_migration_2026',
  '[Notion Migration 2026-09-15] Migrated from Notion customer master (2bfd0b13b3b980fc8b49e81603b8183d).'
) ON CONFLICT (notion_page_id) DO NOTHING;

-- #5 — BINGOMART 1+1
INSERT INTO public.crm_customers (
  customer_name, notion_page_id, country, city, customer_type, currency, source, follow_up_notes
) VALUES (
  'BINGOMART 1+1', '2d1d0b13-b3b9-8015-9357-d80eb616f0f1', 'UAE', 'Dubai', 'Supermarket（超市）', 'AED',
  'notion_migration_2026',
  '[Notion Migration 2026-09-15] Migrated from Notion customer master (2bfd0b13b3b980fc8b49e81603b8183d).'
) ON CONFLICT (notion_page_id) DO NOTHING;

-- #6 — Hong gourmet hypermarket L.L.C
INSERT INTO public.crm_customers (
  customer_name, notion_page_id, country, city, customer_type, currency, source, follow_up_notes
) VALUES (
  'Hong gourmet hypermarket L.L.C', '2ced0b13-b3b9-805a-aee0-dd092d7130f8', 'UAE', 'Dubai', 'Supermarket（超市）', 'AED',
  'notion_migration_2026',
  '[Notion Migration 2026-09-15] Migrated from Notion customer master (2bfd0b13b3b980fc8b49e81603b8183d).'
) ON CONFLICT (notion_page_id) DO NOTHING;

-- #7 — 1212 chinese supermarket
INSERT INTO public.crm_customers (
  customer_name, notion_page_id, country, city, customer_type, currency, source, follow_up_notes
) VALUES (
  '1212 chinese supermarket', '2ccd0b13-b3b9-801c-84e5-f16a059614d3', 'UAE', 'Dubai', 'Supermarket（超市）', 'AED',
  'notion_migration_2026',
  '[Notion Migration 2026-09-15] Migrated from Notion customer master (2bfd0b13b3b980fc8b49e81603b8183d).'
) ON CONFLICT (notion_page_id) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────
-- 3. Contacts — only for the customers (of these 7) that actually had a
-- name/phone/whatsapp/email on Notion. 荔枝 had none of the four, so it
-- gets no contact row. Final count: 6 crm_contacts rows.
-- Idempotent via WHERE NOT EXISTS on the identifying field, since
-- crm_contacts has no unique constraint of its own.
-- ─────────────────────────────────────────────────────────────────────────

-- CLAMB SUPERMARKET — LEO
INSERT INTO public.crm_contacts (customer_id, contact_name, phone, is_primary)
SELECT c.id, 'LEO', '564677877', true
FROM public.crm_customers c
WHERE c.notion_page_id = '2d1d0b13-b3b9-80c9-a166-e7c30864c5cc'
  AND NOT EXISTS (SELECT 1 FROM public.crm_contacts x WHERE x.customer_id = c.id AND x.contact_name = 'LEO');

-- ICHIGO GLOBAL — SHEEN
INSERT INTO public.crm_contacts (customer_id, contact_name, phone, is_primary)
SELECT c.id, 'SHEEN', '564922117', true
FROM public.crm_customers c
WHERE c.notion_page_id = '2d1d0b13-b3b9-8020-9a4b-ff9df25292e0'
  AND NOT EXISTS (SELECT 1 FROM public.crm_contacts x WHERE x.customer_id = c.id AND x.contact_name = 'SHEEN');

-- WONDER PETS — NADEEM
INSERT INTO public.crm_contacts (customer_id, contact_name, phone, is_primary)
SELECT c.id, 'NADEEM', '522599258', true
FROM public.crm_customers c
WHERE c.notion_page_id = '2d1d0b13-b3b9-80fa-af79-fcba4b0c6699'
  AND NOT EXISTS (SELECT 1 FROM public.crm_contacts x WHERE x.customer_id = c.id AND x.contact_name = 'NADEEM');

-- BINGOMART 1+1 — CHEN BIN BIN
INSERT INTO public.crm_contacts (customer_id, contact_name, phone, is_primary)
SELECT c.id, 'CHEN BIN BIN', '507585879', true
FROM public.crm_customers c
WHERE c.notion_page_id = '2d1d0b13-b3b9-8015-9357-d80eb616f0f1'
  AND NOT EXISTS (SELECT 1 FROM public.crm_contacts x WHERE x.customer_id = c.id AND x.contact_name = 'CHEN BIN BIN');

-- Hong gourmet hypermarket L.L.C — JEFF CHONG
INSERT INTO public.crm_contacts (customer_id, contact_name, phone, is_primary)
SELECT c.id, 'JEFF CHONG', '523370218', true
FROM public.crm_customers c
WHERE c.notion_page_id = '2ced0b13-b3b9-805a-aee0-dd092d7130f8'
  AND NOT EXISTS (SELECT 1 FROM public.crm_contacts x WHERE x.customer_id = c.id AND x.contact_name = 'JEFF CHONG');

-- 1212 chinese supermarket — ANGELA
INSERT INTO public.crm_contacts (customer_id, contact_name, phone, is_primary)
SELECT c.id, 'ANGELA', '501695739', true
FROM public.crm_customers c
WHERE c.notion_page_id = '2ccd0b13-b3b9-801c-84e5-f16a059614d3'
  AND NOT EXISTS (SELECT 1 FROM public.crm_contacts x WHERE x.customer_id = c.id AND x.contact_name = 'ANGELA');


-- ─────────────────────────────────────────────────────────────────────────
-- STEP 5 — Post-flight verification (read-only). Review before COMMIT.
-- ─────────────────────────────────────────────────────────────────────────

-- Hard checks — same enforced style as STEP 0, mismatch aborts before COMMIT.
DO $$
DECLARE
  v_total_after      int;
  v_migrated_count   int;
  v_excluded_present int;
BEGIN
  SELECT count(*) INTO v_total_after FROM public.crm_customers;
  IF v_total_after <> 9 THEN
    RAISE EXCEPTION 'Post-flight guard failed: crm_customers total after migration = % (expected 9 = 2 existing + 7 migrated).', v_total_after;
  END IF;

  SELECT count(*) INTO v_migrated_count
  FROM public.crm_customers
  WHERE notion_page_id IN (
    '3cdd0b13-b3b9-8099-8e84-d35038d9ccc3', -- 荔枝
    '2d1d0b13-b3b9-80c9-a166-e7c30864c5cc', -- CLAMB SUPERMARKET
    '2d1d0b13-b3b9-8020-9a4b-ff9df25292e0', -- ICHIGO GLOBAL
    '2d1d0b13-b3b9-80fa-af79-fcba4b0c6699', -- WONDER PETS
    '2d1d0b13-b3b9-8015-9357-d80eb616f0f1', -- BINGOMART 1+1
    '2ced0b13-b3b9-805a-aee0-dd092d7130f8', -- Hong gourmet hypermarket L.L.C
    '2ccd0b13-b3b9-801c-84e5-f16a059614d3'  -- 1212 chinese supermarket
  );
  IF v_migrated_count <> 7 THEN
    RAISE EXCEPTION 'Post-flight guard failed: expected exactly 7 rows matching this migration''s notion_page_id list, found %.', v_migrated_count;
  END IF;

  -- The 5 explicitly excluded customers (k thai, Merich Global Wholesale
  -- LLC, Liz Metore International, Easy4me FZ LLE, diamond horse GTC LLC)
  -- must NOT appear — this file never INSERTs them, but this checks
  -- nothing else did either.
  SELECT count(*) INTO v_excluded_present
  FROM public.crm_customers
  WHERE notion_page_id IN (
    '367d0b13-b3b9-810b-9b63-cd1a932ecd70', -- k thai
    '367d0b13-b3b9-8137-9f65-c2c8aefc2402', -- Merich Global Wholesale LLC
    '367d0b13-b3b9-8176-95ec-d69178ea35fa', -- Liz Metore International
    '2c1d0b13-b3b9-80a1-80c5-e903203cb991', -- Easy4me FZ LLE
    '367d0b13-b3b9-8146-99d3-db8516779067'  -- diamond horse GTC LLC
  );
  IF v_excluded_present <> 0 THEN
    RAISE EXCEPTION 'Post-flight guard failed: % of the 5 explicitly-excluded customers exist in crm_customers with a notion_page_id — this migration must not create or match them.', v_excluded_present;
  END IF;

  RAISE NOTICE 'Post-flight guard passed: total=9 (2 existing + 7 migrated), all 7 target notion_page_ids present, all 5 excluded customers absent.';
END $$;

-- Display — the guard above already decided pass/fail; these are for you to eyeball.
SELECT count(*) AS total_customers_after FROM public.crm_customers;
-- expect: 9

SELECT customer_name, notion_page_id, customer_type, currency
FROM public.crm_customers
WHERE notion_page_id IS NOT NULL
ORDER BY customer_name;
-- expect: exactly these 7 — 1212 chinese supermarket / BINGOMART 1+1 /
-- CLAMB SUPERMARKET / Hong gourmet hypermarket L.L.C / ICHIGO GLOBAL /
-- WONDER PETS / 荔枝

SELECT cc.customer_name, ct.contact_name, ct.phone, ct.whatsapp
FROM public.crm_contacts ct
JOIN public.crm_customers cc ON cc.id = ct.customer_id
WHERE cc.notion_page_id IS NOT NULL
ORDER BY cc.customer_name;
-- expect: 6 rows (荔枝 has no contact — nothing to migrate for it)

-- Review the output above. If it matches expectations: COMMIT;
-- If anything looks wrong: ROLLBACK;
-- COMMIT;
-- ROLLBACK;
