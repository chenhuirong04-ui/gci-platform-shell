-- GCI Supplier Library — supplier_certification_products (cert ↔ product link)
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
