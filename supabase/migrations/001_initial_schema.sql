-- BWA Supplier Price Processor — Full Database Schema
-- Run this in the Supabase SQL Editor on a fresh project.

-- 1. Suppliers table
CREATE TABLE suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  gst_included boolean NOT NULL DEFAULT true,
  discount_type text NOT NULL CHECK (discount_type IN ('percentage', 'fixed')) DEFAULT 'percentage',
  discount_value numeric NOT NULL DEFAULT 0,
  regular_markup_type text NOT NULL CHECK (regular_markup_type IN ('percentage', 'fixed')) DEFAULT 'percentage',
  regular_markup_value numeric NOT NULL DEFAULT 0,
  vip_markup_type text NOT NULL CHECK (vip_markup_type IN ('percentage', 'fixed')) DEFAULT 'percentage',
  vip_markup_value numeric NOT NULL DEFAULT 0,
  column_mapping jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. GST exemption keywords (references suppliers)
CREATE TABLE gst_exemption_keywords (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  keyword text NOT NULL,
  target_column text NOT NULL
);

CREATE INDEX idx_gst_keywords_supplier ON gst_exemption_keywords(supplier_id);

-- 3. Processing history (references suppliers)
CREATE TABLE processing_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  processed_at timestamptz DEFAULT now(),
  original_file_url text NOT NULL,
  processed_file_url text NOT NULL,
  original_filename text NOT NULL,
  row_count integer,
  skipped_rows integer DEFAULT 0,
  notes text
);

CREATE INDEX idx_history_supplier ON processing_history(supplier_id);
CREATE INDEX idx_history_processed_at ON processing_history(processed_at DESC);

-- 4. Product index (references suppliers and processing_history)
CREATE TABLE product_index (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  processing_history_id uuid NOT NULL REFERENCES processing_history(id) ON DELETE CASCADE,
  supplier_name text NOT NULL,
  original_code text,
  bwa_code text,
  description text,
  brand text,
  original_price numeric,
  regular_price numeric,
  vip_price numeric,
  processed_at timestamptz DEFAULT now()
);

CREATE INDEX idx_product_supplier ON product_index(supplier_id);
CREATE INDEX idx_product_history ON product_index(processing_history_id);
CREATE INDEX idx_product_processed_at ON product_index(processed_at DESC);

-- Full-text search index for universal product search
CREATE INDEX idx_product_search ON product_index
  USING gin(to_tsvector('english',
    coalesce(original_code, '') || ' ' ||
    coalesce(bwa_code, '') || ' ' ||
    coalesce(description, '') || ' ' ||
    coalesce(brand, '')
  ));
