// ─── Config Types ───

export interface SupplierMarkup {
  supplierName: string;
  supplierCode: string;
  category: string;
  tradePct: number;
  retailPct: number;
  regionalTradePct: number;
  regionalRetailPct: number;
  regTradeVip1Pct: number;
  regTradeVip2Pct: number;
  regRetailVipPct: number;
  metroTradePct: number;
  metroRetailPct: number;
  metroTradeVip1Pct: number;
  metroTradeVip2Pct: number;
  metroRetailVipPct: number;
}

export interface CategoryRule {
  supplierCode: string;
  category: string;
  ruleType: "code_prefix" | "description_keyword" | "column_value" | "sheet_name" | "default";
  ruleValue: string;
  priority: number;
  notes?: string;
}

export interface ColumnMapping {
  supplierCode: string;
  sourceFormat?: string;
  fileExtension?: string;
  itemCodeCol?: number;
  descriptionCol?: number;
  unitCol?: number;
  costPriceCol?: number;
  pcsBoxCol?: number;
  m2BoxCol?: number;
  m2PalletCol?: number;
  piecesPerSqmCol?: number;
  skipRowsPattern?: string;
  notes?: string;
}

export interface SpecialHandlingSetting {
  supplierCode: string;
  category: string;
  setting: string;
  value: string;
  notes?: string;
}

export interface ParsedConfig {
  markups: SupplierMarkup[];
  categoryRules: CategoryRule[];
  columnMappings: ColumnMapping[];
  specialHandling: SpecialHandlingSetting[];
}

// ─── Processing Types ───

export interface SourceProduct {
  rowIndex: number;
  itemCode: string;
  description: string;
  unit: string;
  costPrice: number;
  pcsBox?: number;
  m2Box?: number;
  m2Pallet?: number;
  piecesPerSqm?: number;
  sheetName?: string;
  rawRow: (string | number | undefined)[];
}

export interface ClassifiedProduct extends SourceProduct {
  category: string;
  pricingMode: string;
}

export interface ProcessingResult {
  tilesProducts: ClassifiedProduct[];
  mosaicsProducts: ClassifiedProduct[];
  supplierName: string;
  supplierCode: string;
  outputSheets: string[];
}

// ─── Pricing Tier Definition ───

export const PRICING_TIERS = [
  { key: "regionalRetail", label: "Regional Retail", configField: "regionalRetailPct" },
  { key: "regionalTrade", label: "Regional Trade", configField: "regionalTradePct" },
  { key: "metroRetail", label: "Metro Retail", configField: "metroRetailPct" },
  { key: "metroTrade", label: "Metro Trade", configField: "metroTradePct" },
  { key: "regRetailVip", label: "Regional Retail VIP", configField: "regRetailVipPct" },
  { key: "regTradeVip1", label: "Regional Trade VIP1", configField: "regTradeVip1Pct" },
  { key: "regTradeVip2", label: "Regional Trade VIP2", configField: "regTradeVip2Pct" },
  { key: "metroTradeVip1", label: "Metro Trade VIP1", configField: "metroTradeVip1Pct" },
  { key: "metroTradeVip2", label: "Metro Trade VIP2", configField: "metroTradeVip2Pct" },
] as const;

// ─── Processing History ───

export interface ProcessingHistoryEntry {
  id: string;
  supplier_code: string;
  supplier_name: string;
  processed_at: string;
  original_filename: string;
  output_file_url: string;
  row_count: number;
  notes: string | null;
}
