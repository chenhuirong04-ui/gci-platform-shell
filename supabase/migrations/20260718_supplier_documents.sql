-- GCI Supplier Library — supplier_documents (unified file center)
CREATE TABLE IF NOT EXISTS supplier_documents (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id          uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  certification_id     uuid,  -- FK added after supplier_certifications created
  is_primary           boolean DEFAULT false,
  document_type        text NOT NULL,
  document_name        text NOT NULL,
  storage_bucket       text DEFAULT 'suppliers-private',
  storage_path         text,
  file_url             text,  -- external source or legacy compat only
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
