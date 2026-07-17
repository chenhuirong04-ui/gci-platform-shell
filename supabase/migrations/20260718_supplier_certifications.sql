-- GCI Supplier Library — supplier_certifications + cert-product links
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

-- Add FK from supplier_documents to supplier_certifications (documents created before certs table)
ALTER TABLE supplier_documents
  ADD CONSTRAINT fk_supplier_documents_cert
    FOREIGN KEY (certification_id)
    REFERENCES supplier_certifications(id)
    ON DELETE SET NULL;
