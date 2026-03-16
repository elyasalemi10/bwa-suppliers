import * as XLSX from "xlsx";
import type { ColumnMapping, SourceProduct } from "./types";

/**
 * Parse a supplier's source price list file using the column mapping.
 * Column numbers in the mapping are 1-indexed.
 */
export function parseSourceFile(
  buffer: ArrayBuffer,
  mapping: ColumnMapping
): SourceProduct[] {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true, raw: true });
  const products: SourceProduct[] = [];

  // Build skip patterns
  const skipPatterns = mapping.skipRowsPattern
    ? mapping.skipRowsPattern
        .split(",")
        .map((p) => p.trim().toLowerCase())
        .filter(Boolean)
    : [];

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet["!ref"]) continue;

    const range = XLSX.utils.decode_range(sheet["!ref"]);

    for (let r = range.s.r; r <= range.e.r; r++) {
      // Read the full raw row
      const rawRow: (string | number | undefined)[] = [];
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = sheet[XLSX.utils.encode_cell({ r, c })];
        rawRow.push(cell ? cell.v : undefined);
      }

      // Get key fields using 1-indexed column mapping
      const itemCode = getCol(rawRow, mapping.itemCodeCol);
      const description = getCol(rawRow, mapping.descriptionCol);
      const costStr = getCol(rawRow, mapping.costPriceCol);
      const unit = getCol(rawRow, mapping.unitCol);

      // Skip empty rows
      if (!itemCode && !description && !costStr) continue;

      // Skip pattern rows (page headers, footers, etc.)
      if (skipPatterns.length > 0) {
        const rowText = rawRow
          .filter((v) => v != null)
          .map((v) => String(v).toLowerCase())
          .join(" ");
        if (skipPatterns.some((p) => rowText.includes(p))) continue;
      }

      // Skip actual header rows (cost column contains non-numeric text like "Loose" or "Price")
      const cost = parseFloat(String(costStr || "").replace(/[$ ,]/g, ""));
      if (isNaN(cost) || cost <= 0) continue;

      products.push({
        rowIndex: r,
        itemCode: String(itemCode || "").trim(),
        description: String(description || "").trim(),
        unit: String(unit || "").trim().toUpperCase(),
        costPrice: cost,
        pcsBox: numOrUndef(getCol(rawRow, mapping.pcsBoxCol)),
        m2Box: numOrUndef(getCol(rawRow, mapping.m2BoxCol)),
        m2Pallet: numOrUndef(getCol(rawRow, mapping.m2PalletCol)),
        piecesPerSqm: numOrUndef(getCol(rawRow, mapping.piecesPerSqmCol)),
        sheetName,
        rawRow,
      });
    }
  }

  return products;
}

function getCol(row: (string | number | undefined)[], colNum?: number): string | number | undefined {
  if (!colNum || colNum < 1) return undefined;
  return row[colNum - 1]; // Convert 1-indexed to 0-indexed
}

function numOrUndef(val: string | number | undefined): number | undefined {
  if (val == null) return undefined;
  const n = parseFloat(String(val));
  return isNaN(n) ? undefined : n;
}

/**
 * Extract size from description (e.g. "300X600" from "TILE NAME 300X600 MATT").
 */
export function extractSize(description: string): string {
  const match = description.match(/(\d+)\s*[Xx×]\s*(\d+)/);
  if (match) return `Size: ${match[1]}X${match[2]}MM`;
  return "";
}
