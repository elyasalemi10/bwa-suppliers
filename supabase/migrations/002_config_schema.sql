-- BWA Supplier Pricing Platform — Config-driven schema
-- Run this AFTER 001_initial_schema.sql (or on a fresh database)

-- Drop old tables if they exist (from Phase 1/2)
DROP TABLE IF EXISTS product_index CASCADE;
DROP TABLE IF EXISTS gst_exemption_keywords CASCADE;
DROP TABLE IF EXISTS suppliers CASCADE;

-- Active config file storage
CREATE TABLE IF NOT EXISTS active_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_url text NOT NULL,
  filename text NOT NULL,
  supplier_count integer DEFAULT 0,
  config_json jsonb NOT NULL DEFAULT '{}',
  uploaded_at timestamptz DEFAULT now()
);

-- Processing history (simplified)
-- Drop and recreate to match new schema
DROP TABLE IF EXISTS processing_history CASCADE;
CREATE TABLE processing_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_code text NOT NULL,
  supplier_name text NOT NULL,
  processed_at timestamptz DEFAULT now(),
  original_filename text NOT NULL,
  output_file_url text,
  row_count integer DEFAULT 0,
  notes text
);

CREATE INDEX idx_history_supplier_code ON processing_history(supplier_code);
CREATE INDEX idx_history_processed_at ON processing_history(processed_at DESC);
