-- GCI Supplier Library — suppliers master table
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
