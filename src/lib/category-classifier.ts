import type { CategoryRule, SourceProduct } from "./types";

/**
 * Classify a product into a category using priority-ordered rules.
 * Returns the matched category name, or null if no rules exist.
 */
export function classifyProduct(
  product: SourceProduct,
  rules: CategoryRule[]
): string | null {
  if (rules.length === 0) return null;

  // Sort by priority (lower = higher priority)
  const sorted = [...rules].sort((a, b) => a.priority - b.priority);

  for (const rule of sorted) {
    if (matchesRule(product, rule)) {
      return rule.category;
    }
  }

  return null;
}

function matchesRule(product: SourceProduct, rule: CategoryRule): boolean {
  switch (rule.ruleType) {
    case "code_prefix": {
      const prefixes = rule.ruleValue.split(",").map((p) => p.trim());
      return prefixes.some((prefix) =>
        product.itemCode.toUpperCase().startsWith(prefix.toUpperCase())
      );
    }

    case "description_keyword": {
      const keywords = rule.ruleValue.split(",").map((k) => k.trim().toLowerCase());
      const desc = product.description.toLowerCase();
      return keywords.some((kw) => desc.includes(kw));
    }

    case "column_value": {
      // Format: "ColLetter=Value" e.g. "A=Tiles"
      // For now, simple match against raw row data
      const match = rule.ruleValue.match(/^([A-Z]+)=(.+)$/i);
      if (!match) return false;
      const colIdx = XLSX_colToIndex(match[1]);
      const expectedValue = match[2].trim().toLowerCase();
      const actualValue = product.rawRow[colIdx];
      return actualValue != null && String(actualValue).trim().toLowerCase() === expectedValue;
    }

    case "sheet_name": {
      return product.sheetName?.toLowerCase() === rule.ruleValue.toLowerCase();
    }

    case "default": {
      return true; // Always matches
    }

    default:
      return false;
  }
}

function XLSX_colToIndex(col: string): number {
  let idx = 0;
  for (let i = 0; i < col.length; i++) {
    idx = idx * 26 + (col.charCodeAt(i) - 64);
  }
  return idx - 1;
}
