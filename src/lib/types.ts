export interface ColumnMapping {
  id: string | null;
  cost: string | null;
  brand: string | null;
  description: string | null;
  quantity: string | null;
}

export interface GstExemptionKeyword {
  id?: string;
  supplier_id?: string;
  keyword: string;
  target_column: string;
}

export interface Supplier {
  id: string;
  name: string;
  gst_included: boolean;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  regular_markup_type: "percentage" | "fixed";
  regular_markup_value: number;
  vip_markup_type: "percentage" | "fixed";
  vip_markup_value: number;
  column_mapping: ColumnMapping;
  created_at: string;
  updated_at: string;
  gst_exemption_keywords?: GstExemptionKeyword[];
}

export interface ProcessedRow {
  wholesaler_code: string;
  wholesaler_description: string;
  wholesaler_price: number;
  bwa_code: string;
  bwa_regular_price: number;
  bwa_vip_price: number;
}

export interface ValidationIssue {
  rowIndex: number;
  originalRow: string[];
  issueType: "missing_code" | "duplicate_code" | "zero_negative_price" | "non_numeric_price";
  field: string;
  value: string;
  message: string;
}

export interface ProcessingHistoryEntry {
  id: string;
  supplier_id: string;
  processed_at: string;
  original_file_url: string;
  processed_file_url: string;
  original_filename: string;
  row_count: number;
  skipped_rows: number;
  notes: string | null;
}

export interface ProductIndexEntry {
  id: string;
  supplier_id: string;
  processing_history_id: string;
  supplier_name: string;
  original_code: string | null;
  bwa_code: string | null;
  description: string | null;
  brand: string | null;
  original_price: number | null;
  regular_price: number | null;
  vip_price: number | null;
  processed_at: string;
}

export interface SheetInfo {
  name: string;
  rowCount: number;
}

export interface ParseOptions {
  headerRow: number;
  sheetName?: string;
}
