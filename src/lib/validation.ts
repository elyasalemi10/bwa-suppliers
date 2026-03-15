import type { ColumnMapping, ValidationIssue } from "./types";
import { getColumnIndex, cleanPriceString } from "./xlsx-utils";

/**
 * Validate rows against column mapping rules.
 * Returns issues found and cleaned rows.
 */
export function validateRows(
  headers: string[],
  rows: string[][],
  mapping: ColumnMapping
): { issues: ValidationIssue[]; cleanedRows: string[][] } {
  const issues: ValidationIssue[] = [];
  const cleanedRows = rows.map((r) => [...r]);

  const idColIdx = getColumnIndex(headers, mapping.id);
  const costColIdx = getColumnIndex(headers, mapping.cost);

  // Track codes for duplicate detection
  const codeCounts = new Map<string, number[]>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    // Check if all mapped columns are empty → skip silently
    const mappedValues = Object.values(mapping)
      .filter(Boolean)
      .map((col) => {
        const idx = getColumnIndex(headers, col);
        return idx >= 0 ? row[idx]?.trim() || "" : "";
      });
    if (mappedValues.every((v) => !v)) continue;

    // Missing code
    const code = idColIdx >= 0 ? row[idColIdx]?.trim() || "" : "";
    if (!code) {
      issues.push({
        rowIndex: i,
        originalRow: row,
        issueType: "missing_code",
        field: "id",
        value: "",
        message: "Missing product code",
      });
    } else {
      const existing = codeCounts.get(code) || [];
      existing.push(i);
      codeCounts.set(code, existing);
    }

    // Cost price validation
    const costRaw = costColIdx >= 0 ? row[costColIdx] || "" : "";
    const { value: cleanedValue, cleaned, warning } = cleanPriceString(costRaw);

    if (cleanedValue !== null && cleaned !== costRaw) {
      // Auto-clean the price
      cleanedRows[i] = [...cleanedRows[i]];
      cleanedRows[i][costColIdx] = cleaned;
    }

    if (cleanedValue === null && costRaw.trim() !== "") {
      issues.push({
        rowIndex: i,
        originalRow: row,
        issueType: "non_numeric_price",
        field: "cost",
        value: costRaw,
        message: warning || `Non-numeric price: "${costRaw}"`,
      });
    } else if (cleanedValue !== null && cleanedValue <= 0) {
      issues.push({
        rowIndex: i,
        originalRow: row,
        issueType: "zero_negative_price",
        field: "cost",
        value: costRaw,
        message: `Price is ${cleanedValue === 0 ? "zero" : "negative"}: ${cleanedValue}`,
      });
    }
  }

  // Duplicate codes
  for (const [code, indices] of codeCounts) {
    if (indices.length > 1) {
      for (const idx of indices) {
        issues.push({
          rowIndex: idx,
          originalRow: rows[idx],
          issueType: "duplicate_code",
          field: "id",
          value: code,
          message: `Duplicate code "${code}" (appears ${indices.length} times)`,
        });
      }
    }
  }

  // Sort by row index
  issues.sort((a, b) => a.rowIndex - b.rowIndex);

  return { issues, cleanedRows };
}

/**
 * Check if uploaded file columns match the supplier's expected mapping.
 */
export function checkColumnMismatch(
  headers: string[],
  mapping: ColumnMapping,
  supplierName: string
): string | null {
  const allMapped: { field: string; label: string; col: string | null }[] = [
    { field: "id", label: "Product ID/Code", col: mapping.id },
    { field: "cost", label: "Cost Price", col: mapping.cost },
    { field: "brand", label: "Brand", col: mapping.brand },
    { field: "description", label: "Description", col: mapping.description },
    { field: "quantity", label: "Quantity", col: mapping.quantity },
  ];

  const missing: string[] = [];
  for (const { label, col } of allMapped) {
    if (!col) continue;
    const idx = getColumnIndex(headers, col);
    if (idx === -1) {
      missing.push(`${label} ("${col}")`);
    }
  }

  if (missing.length > 0) {
    return `This file doesn't match the expected format for ${supplierName}. Missing columns: ${missing.join(", ")}. Please check you've uploaded the correct file.`;
  }

  return null;
}
