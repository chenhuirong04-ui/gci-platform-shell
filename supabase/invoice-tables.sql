-- ── GCI Invoice Tables ─────────────────────────────────────────────────────
-- Safe to run: NO DROP, NO ALTER on existing tables.
-- Creates two NEW tables only: invoice_billing_profiles, invoice_drafts
-- Does NOT touch: auth, user_profiles, companies, or any existing table.
--
-- Run in: https://supabase.com/dashboard/project/efrkvwhzpgahjgfukjth/sql/new

-- ── Table 1: invoice_billing_profiles ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoice_billing_profiles (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid        NOT NULL DEFAULT 'a1000000-0000-0000-0000-000000000001',
  customer_name         text        NOT NULL,
  billing_name          text        NOT NULL DEFAULT '',
  billing_address       text        NOT NULL DEFAULT '',
  phone                 text        NOT NULL DEFAULT '',
  email                 text        NOT NULL DEFAULT '',
  trn                   text        NOT NULL DEFAULT '',
  country               text        NOT NULL DEFAULT 'UAE',
  city                  text        NOT NULL DEFAULT 'Dubai',
  default_currency      text        NOT NULL DEFAULT 'AED',
  default_vat_rate      numeric     NOT NULL DEFAULT 5,
  default_payment_terms text        NOT NULL DEFAULT '',
  notes                 text        NOT NULL DEFAULT '',
  status                text        NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'inactive', 'archived')),
  last_invoice_date     date,
  created_by            uuid        REFERENCES auth.users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE invoice_billing_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoice_bp_select"
  ON invoice_billing_profiles FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "invoice_bp_insert"
  ON invoice_billing_profiles FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "invoice_bp_update"
  ON invoice_billing_profiles FOR UPDATE
  USING  (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- ── Table 2: invoice_drafts ──────────────────────────────────────────────────
-- items  = JSONB array: [{id, description, unitPrice, qty, amount}]
-- bill_to = JSONB snapshot: {name, address, phone, email, trn}
-- Status 'issued' and 'paid' must only be set manually by the Owner (Chris).
-- This system never auto-issues or auto-marks paid.

CREATE TABLE IF NOT EXISTS invoice_drafts (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid        NOT NULL DEFAULT 'a1000000-0000-0000-0000-000000000001',
  invoice_no          text        NOT NULL,
  customer_name       text        NOT NULL,
  billing_profile_id  uuid        REFERENCES invoice_billing_profiles(id),
  bill_to             jsonb       NOT NULL DEFAULT '{}',
  invoice_date        date        NOT NULL,
  due_date            date        NOT NULL,
  currency            text        NOT NULL DEFAULT 'AED',
  items               jsonb       NOT NULL DEFAULT '[]',
  subtotal            numeric     NOT NULL DEFAULT 0,
  vat_rate            numeric     NOT NULL DEFAULT 5,
  vat_amount          numeric     NOT NULL DEFAULT 0,
  total               numeric     NOT NULL DEFAULT 0,
  payment_terms       text        NOT NULL DEFAULT '',
  other_comments      text        NOT NULL DEFAULT '',
  related_pi          text        NOT NULL DEFAULT '',
  related_quotation   text        NOT NULL DEFAULT '',
  related_order       text        NOT NULL DEFAULT '',
  status              text        NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'waiting_approval', 'approved', 'issued', 'cancelled', 'paid')),
  pdf_url             text,
  notes               text        NOT NULL DEFAULT '',
  created_by          uuid        REFERENCES auth.users(id),
  approved_by         uuid        REFERENCES auth.users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  approved_at         timestamptz,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE invoice_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoice_draft_select"
  ON invoice_drafts FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "invoice_draft_insert"
  ON invoice_drafts FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "invoice_draft_update"
  ON invoice_drafts FOR UPDATE
  USING  (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- ── updated_at trigger ───────────────────────────────────────────────────────
-- Scoped function name to avoid conflicting with any other project triggers.

CREATE OR REPLACE FUNCTION gci_invoice_update_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER invoice_billing_profiles_updated_at
  BEFORE UPDATE ON invoice_billing_profiles
  FOR EACH ROW EXECUTE FUNCTION gci_invoice_update_updated_at();

CREATE TRIGGER invoice_drafts_updated_at
  BEFORE UPDATE ON invoice_drafts
  FOR EACH ROW EXECUTE FUNCTION gci_invoice_update_updated_at();

-- ── Verify ───────────────────────────────────────────────────────────────────
SELECT 'invoice_billing_profiles' AS table_name, count(*) AS row_count FROM invoice_billing_profiles
UNION ALL
SELECT 'invoice_drafts',           count(*) AS row_count FROM invoice_drafts;
