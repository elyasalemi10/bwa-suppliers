import * as XLSX from "xlsx";
import type { SupplierMarkup, CategoryRule, ColumnMapping, SpecialHandlingSetting, ParsedConfig } from "./types";

function cellVal(sheet: XLSX.WorkSheet, row: number, col: number): string {
  const addr = XLSX.utils.encode_cell({ r: row, c: col });
  const cell = sheet[addr];
  return cell ? String(cell.v).trim() : "";
}

function cellNum(sheet: XLSX.WorkSheet, row: number, col: number): number {
  const v = cellVal(sheet, row, col);
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

export function parseConfigFile(buffer: ArrayBuffer): ParsedConfig {
  const wb = XLSX.read(buffer, { type: "array" });
  const result: ParsedConfig = {
    markups: [],
    categoryRules: [],
    columnMappings: [],
    specialHandling: [],
  };

  // Sheet 1: Supplier Markups
  const markupSheet = wb.Sheets[wb.SheetNames.find(n =>
    n.toLowerCase().includes("markup")
  ) || wb.SheetNames[0]];

  if (markupSheet) {
    const range = XLSX.utils.decode_range(markupSheet["!ref"] || "A1");
    for (let r = range.s.r + 1; r <= range.e.r; r++) {
      const name = cellVal(markupSheet, r, 0);
      const code = cellVal(markupSheet, r, 1);
      if (!name && !code) continue;
      result.markups.push({
        supplierName: name,
        supplierCode: code,
        category: cellVal(markupSheet, r, 2),
        tradePct: cellNum(markupSheet, r, 3),
        retailPct: cellNum(markupSheet, r, 4),
        regionalTradePct: cellNum(markupSheet, r, 5),
        regionalRetailPct: cellNum(markupSheet, r, 6),
        regTradeVip1Pct: cellNum(markupSheet, r, 7),
        regTradeVip2Pct: cellNum(markupSheet, r, 8),
        regRetailVipPct: cellNum(markupSheet, r, 9),
        metroTradePct: cellNum(markupSheet, r, 10),
        metroRetailPct: cellNum(markupSheet, r, 11),
        metroTradeVip1Pct: cellNum(markupSheet, r, 12),
        metroTradeVip2Pct: cellNum(markupSheet, r, 13),
        metroRetailVipPct: cellNum(markupSheet, r, 14),
      });
    }
  }

  // Sheet 2: Category Rules
  const rulesSheetName = wb.SheetNames.find(n =>
    n.toLowerCase().includes("category") && n.toLowerCase().includes("rule")
  );
  if (rulesSheetName) {
    const sheet = wb.Sheets[rulesSheetName];
    const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
    for (let r = range.s.r + 1; r <= range.e.r; r++) {
      const code = cellVal(sheet, r, 0);
      if (!code) continue;
      result.categoryRules.push({
        supplierCode: code,
        category: cellVal(sheet, r, 1),
        ruleType: cellVal(sheet, r, 2) as CategoryRule["ruleType"],
        ruleValue: cellVal(sheet, r, 3),
        priority: cellNum(sheet, r, 4) || 99,
        notes: cellVal(sheet, r, 5),
      });
    }
  }

  // Sheet 3: Column Mapping
  const mappingSheetName = wb.SheetNames.find(n =>
    n.toLowerCase().includes("column") && n.toLowerCase().includes("map")
  );
  if (mappingSheetName) {
    const sheet = wb.Sheets[mappingSheetName];
    const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
    for (let r = range.s.r + 1; r <= range.e.r; r++) {
      const code = cellVal(sheet, r, 0);
      if (!code) continue;
      result.columnMappings.push({
        supplierCode: code,
        sourceFormat: cellVal(sheet, r, 1),
        fileExtension: cellVal(sheet, r, 2),
        itemCodeCol: cellNum(sheet, r, 3) || undefined,
        descriptionCol: cellNum(sheet, r, 4) || undefined,
        unitCol: cellNum(sheet, r, 5) || undefined,
        costPriceCol: cellNum(sheet, r, 6) || undefined,
        pcsBoxCol: cellNum(sheet, r, 7) || undefined,
        m2BoxCol: cellNum(sheet, r, 8) || undefined,
        m2PalletCol: cellNum(sheet, r, 9) || undefined,
        piecesPerSqmCol: cellNum(sheet, r, 10) || undefined,
        skipRowsPattern: cellVal(sheet, r, 11),
        notes: cellVal(sheet, r, 12),
      });
    }
  }

  // Sheet 4: Special Handling
  const specialSheetName = wb.SheetNames.find(n =>
    n.toLowerCase().includes("special") || n.toLowerCase().includes("handling")
  );
  if (specialSheetName) {
    const sheet = wb.Sheets[specialSheetName];
    const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
    for (let r = range.s.r + 1; r <= range.e.r; r++) {
      const code = cellVal(sheet, r, 0);
      if (!code) continue;
      result.specialHandling.push({
        supplierCode: code,
        category: cellVal(sheet, r, 1),
        setting: cellVal(sheet, r, 2),
        value: cellVal(sheet, r, 3),
        notes: cellVal(sheet, r, 4),
      });
    }
  }

  return result;
}

/**
 * Get unique supplier list from markups.
 */
export function getSupplierList(config: ParsedConfig): { code: string; name: string; categories: string[] }[] {
  const map = new Map<string, { name: string; categories: string[] }>();
  for (const m of config.markups) {
    if (!m.supplierCode) continue;
    const existing = map.get(m.supplierCode);
    if (existing) {
      if (m.category && !existing.categories.includes(m.category)) {
        existing.categories.push(m.category);
      }
    } else {
      map.set(m.supplierCode, {
        name: m.supplierName,
        categories: m.category ? [m.category] : [],
      });
    }
  }
  return Array.from(map.entries()).map(([code, v]) => ({
    code,
    name: v.name,
    categories: v.categories,
  }));
}
