-- GCI Supplier Library — supplier_services
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
