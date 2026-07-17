-- GCI Supplier Library — supplier_contacts
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
