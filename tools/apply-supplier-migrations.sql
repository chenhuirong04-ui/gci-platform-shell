-- ============================================================
-- GCI Supplier Library — Combined Migration SQL
-- 执行方式：粘贴到 Supabase Dashboard > SQL Editor > Run
-- Project ref: efrkvwhzpgahjgfukjth (gci-trade-260521)
-- 顺序：8 个 migration 文件按依赖顺序合并
-- 安全：全部使用 IF NOT EXISTS / ADD COLUMN IF NOT EXISTS
--         不会影响现有表和数据
-- ============================================================

-- ── 1. suppliers (核心主表) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS suppliers (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  short_code            text UNIQUE NOT NULL,
  legacy_short_code     text,
  code_needs_review     boolean DEFAULT false,
  supplier_name_display text NOT NULL,
  name_cn               text,
  name_en               text,
  supplier_type         text DEFAULT 'Unknown',
  product_categories    text[] DEFAULT '{}',
  country               text,
  city                  text,
  country_city_raw      text,
  is_preferred          boolean DEFAULT false,
  status                text DEFAULT 'active',
  current_rating        text DEFAULT 'B',
  current_score         numeric(4,1),
  internal_owner        text,
  default_lead_time_days int,
  payment_terms         text,
  strength_notes        text,
  website               text,
  established_year      int,
  notes                 text,
  notion_page_id        text UNIQUE,
  notion_page_url       text,
  import_source         text DEFAULT 'manual',
  imported_at           timestamptz,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_suppliers_status ON suppliers(status);
CREATE INDEX IF NOT EXISTS idx_suppliers_type ON suppliers(supplier_type);
CREATE INDEX IF NOT EXISTS idx_suppliers_is_preferred ON suppliers(is_preferred);
CREATE INDEX IF NOT EXISTS idx_suppliers_country ON suppliers(country);
CREATE INDEX IF NOT EXISTS idx_suppliers_notion_page_id ON suppliers(notion_page_id);

-- ── 2. supplier_contacts ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS supplier_contacts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id           uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  full_name             text NOT NULL,
  job_title             text,
  department            text,
  contact_role          text,
  phone                 text,
  mobile                text,
  whatsapp              text,
  wechat                text,
  email                 text,
  preferred_language    text DEFAULT 'zh',
  is_primary            boolean DEFAULT false,
  is_decision_maker     boolean DEFAULT false,
  is_commercial_contact boolean DEFAULT false,
  is_technical_contact  boolean DEFAULT false,
  is_finance_contact    boolean DEFAULT false,
  is_logistics_contact  boolean DEFAULT false,
  status                text DEFAULT 'active',
  notes                 text,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_contacts_supplier_id ON supplier_contacts(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_contacts_is_primary ON supplier_contacts(supplier_id, is_primary);

-- ── 3. supplier_products ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS supplier_products (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id             uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  supplier_sku            text,
  product_name_cn         text,
  product_name_en         text,
  category                text,
  subcategory             text,
  description             text,
  specification           text,
  material                text,
  model                   text,
  unit                    text DEFAULT '件',
  moq                     int,
  default_currency        text DEFAULT 'CNY',
  indicative_price_min    numeric(14,4),
  indicative_price_max    numeric(14,4),
  price_basis             text,
  default_incoterm        text,
  lead_time_days          int,
  country_of_origin       text DEFAULT 'China',
  hs_code                 text,
  oem_available           boolean DEFAULT false,
  odm_available           boolean DEFAULT false,
  private_label_available boolean DEFAULT false,
  status                  text DEFAULT 'active',
  notes                   text,
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_products_supplier_id ON supplier_products(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_products_status ON supplier_products(status);

-- ── 4. supplier_services ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS supplier_services (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id         uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  service_name        text NOT NULL,
  service_category    text,
  service_description text,
  pricing_model       text,
  minimum_fee         numeric(14,2),
  currency            text DEFAULT 'USD',
  service_area        text,
  coverage_countries  text[] DEFAULT '{}',
  lead_time           text,
  terms               text,
  status              text DEFAULT 'active',
  notes               text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_services_supplier_id ON supplier_services(supplier_id);

-- ── 5. supplier_documents (先建，FK 后补) ────────────────────
CREATE TABLE IF NOT EXISTS supplier_documents (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id          uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  certification_id     uuid,
  is_primary           boolean DEFAULT false,
  document_type        text NOT NULL,
  document_name        text NOT NULL,
  storage_bucket       text DEFAULT 'suppliers-private',
  storage_path         text,
  file_url             text,
  mime_type            text,
  file_size            bigint,
  document_number      text,
  issuing_authority    text,
  issue_date           date,
  expire_date          date,
  verification_status  text DEFAULT 'unverified',
  verified_by          text,
  verified_at          timestamptz,
  notes                text,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_documents_supplier_id ON supplier_documents(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_documents_cert_id ON supplier_documents(certification_id);
CREATE INDEX IF NOT EXISTS idx_supplier_documents_type ON supplier_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_supplier_documents_expire ON supplier_documents(expire_date);

-- ── 6. supplier_certifications + FK 补回 documents ──────────
CREATE TABLE IF NOT EXISTS supplier_certifications (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id          uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  certification_type   text NOT NULL,
  certification_number text,
  status               text NOT NULL DEFAULT 'pending_verification',
  issuing_body         text,
  issue_date           date,
  expire_date          date,
  market_scope         text,
  scope_description    text,
  verification_status  text DEFAULT 'unverified',
  verified_by          text,
  verified_at          timestamptz,
  notes                text,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_certs_supplier_id ON supplier_certifications(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_certs_status ON supplier_certifications(status);

-- 补 FK：documents.certification_id → supplier_certifications
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_supplier_documents_cert'
      AND table_name = 'supplier_documents'
  ) THEN
    ALTER TABLE supplier_documents
      ADD CONSTRAINT fk_supplier_documents_cert
        FOREIGN KEY (certification_id)
        REFERENCES supplier_certifications(id)
        ON DELETE SET NULL;
  END IF;
END$$;

-- ── 7. supplier_certification_products (cert ↔ product) ──────
CREATE TABLE IF NOT EXISTS supplier_certification_products (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  certification_id     uuid NOT NULL REFERENCES supplier_certifications(id) ON DELETE CASCADE,
  supplier_product_id  uuid REFERENCES supplier_products(id) ON DELETE SET NULL,
  covered_model        text,
  covered_scope        text,
  created_at           timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cert_products_cert_id ON supplier_certification_products(certification_id);
CREATE INDEX IF NOT EXISTS idx_cert_products_product_id ON supplier_certification_products(supplier_product_id);

-- ── 8. 扩展 supplier_quotes / supplier_quote_items ───────────
-- 注意：RLS 策略不在此修改，保持现有设置不变
ALTER TABLE supplier_quotes
  ADD COLUMN IF NOT EXISTS supplier_id          uuid REFERENCES suppliers(id),
  ADD COLUMN IF NOT EXISTS source_document_id   uuid REFERENCES supplier_documents(id),
  ADD COLUMN IF NOT EXISTS supplier_match_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS supplier_matched_at   timestamptz,
  ADD COLUMN IF NOT EXISTS supplier_matched_by   text;

CREATE INDEX IF NOT EXISTS idx_sq_supplier_id ON supplier_quotes(supplier_id);
CREATE INDEX IF NOT EXISTS idx_sq_match_status ON supplier_quotes(supplier_match_status);

ALTER TABLE supplier_quote_items
  ADD COLUMN IF NOT EXISTS supplier_product_id uuid REFERENCES supplier_products(id);

-- ── 完成 ──────────────────────────────────────────────────────
-- 执行完毕后，以下表应存在：
-- suppliers / supplier_contacts / supplier_products /
-- supplier_services / supplier_documents /
-- supplier_certifications / supplier_certification_products
-- 以及 supplier_quotes/supplier_quote_items 的新扩展字段
