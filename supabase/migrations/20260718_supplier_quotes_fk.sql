-- GCI Supplier Library — extend supplier_quotes and supplier_quote_items
-- All new columns are nullable for full backwards compatibility.
-- Existing fields, functions and data are untouched.

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
