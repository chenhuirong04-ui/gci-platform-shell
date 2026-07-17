-- GCI Supplier Library — supplier_products
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
