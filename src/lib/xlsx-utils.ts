import * as XLSX from "xlsx";
import type { ColumnMapping, SheetInfo } from "./types";

/**
 * Get all sheet names and their row counts from a workbook buffer.
 */
export function getSheetInfos(buffer: ArrayBuffer): SheetInfo[] {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true, raw: true });
  return workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
    return { name, rowCount: range.e.r - range.s.r };
  });
}

/**
 * Unmerge merged cells by filling each cell in the merge range with the top-left value.
 */
function unmergeCells(sheet: XLSX.WorkSheet): void {
  const merges = sheet["!merges"];
  if (!merges) return;
  for (const merge of merges) {
    const topLeftAddr = XLSX.utils.encode_cell({ r: merge.s.r, c: merge.s.c });
    const topLeftCell = sheet[topLeftAddr];
    if (!topLeftCell) continue;
    for (let r = merge.s.r; r <= merge.e.r; r++) {
      for (let c = merge.s.c; c <= merge.e.c; c++) {
        if (r === merge.s.r && c === merge.s.c) continue;
        const addr = XLSX.utils.encode_cell({ r, c });
        sheet[addr] = { ...topLeftCell };
      }
    }
  }
  delete sheet["!merges"];
}

/**
 * Check if a row is hidden.
 */
function isRowHidden(sheet: XLSX.WorkSheet, rowIndex: number): boolean {
  const rows = sheet["!rows"];
  if (!rows || !rows[rowIndex]) return false;
  return !!rows[rowIndex].hidden;
}

/**
 * Check if a column is hidden.
 */
function isColHidden(sheet: XLSX.WorkSheet, colIndex: number): boolean {
  const cols = sheet["!cols"];
  if (!cols || !cols[colIndex]) return false;
  return !!cols[colIndex].hidden;
}

/**
 * Parse an uploaded file with smart handling.
 * headerRow is 1-indexed (1 = first row).
 */
export function parseFileForPreview(
  buffer: ArrayBuffer,
  maxRows: number = 10,
  headerRow: number = 1,
  sheetName?: string
): { headers: string[]; rows: string[][]; allRawRows: string[][] } {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true, raw: true });
  const targetSheet = sheetName || workbook.SheetNames[0];
  const sheet = workbook.Sheets[targetSheet];

  unmergeCells(sheet);

  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
  const headerRowIdx = range.s.r + (headerRow - 1);

  // Get visible columns
  const visibleCols: number[] = [];
  for (let col = range.s.c; col <= range.e.c; col++) {
    if (!isColHidden(sheet, col)) visibleCols.push(col);
  }

  // Extract headers
  const headers: string[] = [];
  for (const col of visibleCols) {
    const cellAddress = XLSX.utils.encode_cell({ r: headerRowIdx, c: col });
    const cell = sheet[cellAddress];
    headers.push(cell ? String(cell.v) : XLSX.utils.encode_col(col));
  }

  // Extract ALL raw rows (before header row too, for the raw preview)
  const allRawRows: string[][] = [];
  const rawEnd = Math.min(range.s.r + 14, range.e.r);
  for (let row = range.s.r; row <= rawEnd; row++) {
    const rowData: string[] = [];
    for (const col of visibleCols) {
      const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
      const cell = sheet[cellAddress];
      rowData.push(cell ? String(cell.v) : "");
    }
    allRawRows.push(rowData);
  }

  // Extract data rows (after header row), skipping hidden rows
  const rows: string[][] = [];
  let count = 0;
  for (let row = headerRowIdx + 1; row <= range.e.r && count < maxRows; row++) {
    if (isRowHidden(sheet, row)) continue;

    const rowData: string[] = [];
    let allEmpty = true;
    for (const col of visibleCols) {
      const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
      const cell = sheet[cellAddress];
      const val = cell ? String(cell.v) : "";
      if (val) allEmpty = false;
      rowData.push(val);
    }
    if (!allEmpty) {
      rows.push(rowData);
      count++;
    }
  }

  return { headers, rows, allRawRows };
}

/**
 * Clean a price string to extract a numeric value.
 * Returns { value, cleaned, warning } where warning is set if special text was stripped.
 */
export function cleanPriceString(raw: string): { value: number | null; cleaned: string; warning: string | null } {
  if (!raw || !raw.trim()) return { value: null, cleaned: "", warning: null };

  let cleaned = raw.trim();
  let warning: string | null = null;

  // Check for known non-price strings
  const nonPricePatterns = /^(poa|call|tbc|n\/a|na|-|–|—|call for pric|on request|price on app)/i;
  if (nonPricePatterns.test(cleaned)) {
    return { value: null, cleaned, warning: `Non-numeric price: "${raw}"` };
  }

  // Check for "+ GST" or similar
  const gstMatch = cleaned.match(/\+\s*gst/i);
  if (gstMatch) {
    warning = `"+ GST" text stripped from price`;
    cleaned = cleaned.replace(/\+\s*gst/i, "");
  }

  // Strip currency symbols, commas, spaces, currency codes
  cleaned = cleaned.replace(/\b(AUD|NZD|USD|EUR|GBP)\b/gi, "").replace(/[$ ,]/g, "").trim();

  const value = parseFloat(cleaned);
  if (isNaN(value)) {
    return { value: null, cleaned: raw, warning: `Non-numeric price: "${raw}"` };
  }

  return { value, cleaned: String(value), warning };
}

/**
 * Get the column index from a header name.
 */
export function getColumnIndex(
  headers: string[],
  columnName: string | null
): number {
  if (!columnName) return -1;
  const idx = headers.indexOf(columnName);
  if (idx !== -1) return idx;
  return headers.findIndex(
    (h) => h.toLowerCase() === columnName.toLowerCase()
  );
}

/**
 * Extract a cell value from a row using the column mapping.
 */
export function getCellValue(
  row: string[],
  headers: string[],
  columnName: string | null
): string {
  if (!columnName) return "";
  const idx = getColumnIndex(headers, columnName);
  if (idx === -1) return "";
  return row[idx] || "";
}

/**
 * Build a record of mapped field -> value for a given row.
 */
export function buildRowData(
  row: string[],
  headers: string[],
  mapping: ColumnMapping
): Record<string, string> {
  const data: Record<string, string> = {};
  for (const [field, columnName] of Object.entries(mapping)) {
    if (columnName) {
      data[field] = getCellValue(row, headers, columnName);
    }
  }
  return data;
}
