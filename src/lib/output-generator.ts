import * as XLSX from "xlsx";
import type { ClassifiedProduct, SupplierMarkup, SpecialHandlingSetting } from "./types";
import { extractSize } from "./source-parser";

const MONEY_FMT = '"$"#,##0.00';

// The 9 pricing tiers in output order, matching done.xlsx exactly
const TIERS: { key: string; label: string; headerPrefix: string; configField: keyof SupplierMarkup; summaryHeader: string; roundedHeaderOverride?: string }[] = [
  { key: "regionalRetail", label: "REGIONAL RETAIL", headerPrefix: "REGIONAL RETAIL", configField: "regionalRetailPct", summaryHeader: "Regional Retail AUD Incl" },
  { key: "regionalTrade", label: "REGIONAL TRADE", headerPrefix: "REGIONAL TRADE", configField: "regionalTradePct", summaryHeader: "Regional Trade AUD Incl" },
  { key: "metroRetail", label: "METRO RETAIL", headerPrefix: "METRO RETAIL", configField: "metroRetailPct", summaryHeader: "Metro Retail AUD Incl" },
  { key: "metroTrade", label: "METRO TRADE", headerPrefix: "METRO TRADE", configField: "metroTradePct", summaryHeader: "Metro Trade AUD Incl" },
  { key: "regRetailVip", label: "REGIONAL RETAIL VIP", headerPrefix: "REGIONAL RETAIL VIP", configField: "regRetailVipPct", summaryHeader: "Regional Retail VIP AUD Inc", roundedHeaderOverride: "REGIONL RETAIL VIP ROUNDED PRICE" },
  { key: "regTradeVip1", label: "REGIONAL TRADE VIP1", headerPrefix: "REGIONAL TRADE VIP1", configField: "regTradeVip1Pct", summaryHeader: "Regional Trade VIP1 AUD Inc" },
  { key: "regTradeVip2", label: "REGIONAL TRADE VIP2", headerPrefix: "REGIONAL TRADE VIP2", configField: "regTradeVip2Pct", summaryHeader: "Regional Trade VIP2 AUD Inc" },
  { key: "metroTradeVip1", label: "METRO TRADE VIP1", headerPrefix: "METRO TRADE VIP1", configField: "metroTradeVip1Pct", summaryHeader: "Metro Trade VIP1 AUD Inc" },
  { key: "metroTradeVip2", label: "METRO TRADE VIP2", headerPrefix: "METRO TRADE VIP2", configField: "metroTradeVip2Pct", summaryHeader: "Metro Trade VIP2 AUD Inc" },
];

function colLetter(n: number): string {
  let s = "";
  let num = n;
  while (num >= 0) {
    s = String.fromCharCode((num % 26) + 65) + s;
    num = Math.floor(num / 26) - 1;
  }
  return s;
}

function setCell(ws: XLSX.WorkSheet, r: number, c: number, value: string | number | undefined, fmt?: string) {
  const addr = XLSX.utils.encode_cell({ r, c });
  if (value == null || value === "") return;
  if (typeof value === "number") {
    ws[addr] = { t: "n", v: value, z: fmt || undefined };
  } else {
    ws[addr] = { t: "s", v: value };
  }
}

function setFormula(ws: XLSX.WorkSheet, r: number, c: number, formula: string, fmt?: string) {
  const addr = XLSX.utils.encode_cell({ r, c });
  ws[addr] = { t: "n", f: formula, z: fmt || MONEY_FMT };
}

interface GenerateOptions {
  products: ClassifiedProduct[];
  sheetName: string;
  supplierName: string;
  supplierCode: string;
  markups: SupplierMarkup[];
  specialHandling: SpecialHandlingSetting[];
  isMosaics: boolean;
  gstRate: number;
  rounding: number;
  styleCodeFormat: string;
}

function getSpecialValue(settings: SpecialHandlingSetting[], supplierCode: string, category: string, setting: string): string | undefined {
  const specific = settings.find(
    (s) => s.supplierCode === supplierCode && s.category.toLowerCase() === category.toLowerCase() && s.setting === setting
  );
  if (specific) return specific.value;
  const all = settings.find(
    (s) => s.supplierCode === supplierCode && s.category === "ALL" && s.setting === setting
  );
  return all?.value;
}

function generateSheet(ws: XLSX.WorkSheet, opts: GenerateOptions): void {
  const { products, supplierName, supplierCode, markups, isMosaics, gstRate, rounding, styleCodeFormat } = opts;

  const costCol = 16; // Q
  const mosaicCostM2Col = 18; // S
  const summaryStartCol = isMosaics ? 21 : 19; // V or T
  const formulaStartCol = isMosaics ? 32 : 30; // AG or AE

  // Get a representative markup to determine percentages for headers
  const firstMarkup = markups.find((m) => m.supplierCode === supplierCode) || markups[0];

  // ─── Headers (row 0) — match done.xlsx exactly ───
  setCell(ws, 0, 0, "Category");
  // B empty
  setCell(ws, 0, 2, "Tier 3 Category");
  setCell(ws, 0, 3, "Description");
  setCell(ws, 0, 4, "Style Code ");  // trailing space matches done.xlsx
  setCell(ws, 0, 5, "Supplier Code");
  setCell(ws, 0, 6, "Supplier");
  setCell(ws, 0, 7, "Stock Control");
  // I empty
  setCell(ws, 0, 9, "Sqm per box");
  setCell(ws, 0, 10, "Pieces Per Sqm");
  setCell(ws, 0, 11, "Pcs/Box");
  setCell(ws, 0, 12, "m2/\nPallet");  // newline matches done.xlsx
  // N empty
  setCell(ws, 0, 14, "Size:");
  // P empty
  setCell(ws, 0, costCol, isMosaics ? "Price Per Sheet Ex" : "Cost AUD Excl");

  if (isMosaics) {
    setCell(ws, 0, mosaicCostM2Col, "Cost Per m2\nAUD Excl");  // newline matches done.xlsx
  }

  // Summary headers — match done.xlsx exactly
  for (let i = 0; i < TIERS.length; i++) {
    setCell(ws, 0, summaryStartCol + i, TIERS[i].summaryHeader);
  }

  // Formula block headers — match done.xlsx exactly
  for (let t = 0; t < TIERS.length; t++) {
    const tier = TIERS[t];
    const base = formulaStartCol + t * 5;
    const pct = firstMarkup ? (firstMarkup[tier.configField] as number) : 0;

    // First 4 tiers use "PLUS MARKUP", VIP tiers use just "MARKUP" — match done.xlsx
    const isVipTier = t >= 4;
    const markupHeader = isVipTier
      ? `${tier.headerPrefix} MARKUP (${pct}%)`
      : `${tier.headerPrefix} PLUS MARKUP (${pct}%)`;

    setCell(ws, 0, base, markupHeader);
    setCell(ws, 0, base + 1, `${tier.headerPrefix} NET PRICE`);
    setCell(ws, 0, base + 2, `${tier.headerPrefix} PLUS GST`);
    setCell(ws, 0, base + 3, `${tier.headerPrefix} SELL PRICE`);
    setCell(ws, 0, base + 4, tier.roundedHeaderOverride || `${tier.headerPrefix} ROUNDED PRICE`);
  }

  // ─── Data rows ───
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const r = i + 1;
    const excelRow = r + 1; // 1-indexed for formula references

    // Find markup for this product's category
    const markup = markups.find(
      (m) => m.supplierCode === supplierCode && m.category.toLowerCase() === p.category.toLowerCase()
    ) || markups.find(
      (m) => m.supplierCode === supplierCode
    );

    // Config format: "BWA {code} {supplier_code}"
    // In this context: {code} = supplier code (S3), {supplier_code} = item code
    // Result: "BWA S3 AGG DGY36MS"
    const styleCode = styleCodeFormat
      .replace("{code}", supplierCode)
      .replace("{supplier_code}", p.itemCode)
      .replace("{item_code}", p.itemCode);

    // Product info columns
    setCell(ws, r, 0, p.category);
    setCell(ws, r, 3, p.description);
    setCell(ws, r, 4, styleCode);
    setCell(ws, r, 5, p.itemCode);  // Column F = item code (not supplier code)
    setCell(ws, r, 6, supplierName);
    setCell(ws, r, 7, "FIFO");

    // Unit/format columns
    const pricingMode = p.pricingMode || "per_sqm";
    if (pricingMode === "per_bag") {
      setCell(ws, r, 8, "BAG");
      setCell(ws, r, 13, "Price Per BAG");
    } else if (pricingMode === "per_piece") {
      setCell(ws, r, 8, "EACH");
      setCell(ws, r, 13, "Price Per PCE");
    } else if (isMosaics) {
      setCell(ws, r, 8, "SQM/BOX");
      setCell(ws, r, 13, "Price Per Sheet");
    } else {
      setCell(ws, r, 8, "SQM/BOX");
      setCell(ws, r, 13, "Price Per SQM");
    }

    setCell(ws, r, 9, p.m2Box, "0.00");
    setCell(ws, r, 10, p.piecesPerSqm, "0.0000");
    setCell(ws, r, 11, p.pcsBox);
    setCell(ws, r, 12, p.m2Pallet, "0.0000");
    setCell(ws, r, 14, extractSize(p.description));

    // Cost column
    if (isMosaics) {
      // S = raw cost per m2, Q = formula =S/K (always a formula, even if K is blank)
      setCell(ws, r, mosaicCostM2Col, p.costPrice, MONEY_FMT);
      setFormula(ws, r, costCol, `S${excelRow}/K${excelRow}`, MONEY_FMT);
    } else {
      setCell(ws, r, costCol, p.costPrice, MONEY_FMT);
    }

    // ─── Formula blocks (9 tiers × 5 columns each) ───
    if (!markup) continue;

    const costRef = `Q${excelRow}`;
    const gstPctStr = `${gstRate}%`;

    for (let t = 0; t < TIERS.length; t++) {
      const tier = TIERS[t];
      const pct = markup[tier.configField] as number;
      const pctStr = `${pct}%`;
      const base = formulaStartCol + t * 5;

      const markupColLetter = colLetter(base);
      const netColLetter = colLetter(base + 1);
      const gstColLetter = colLetter(base + 2);
      const sellColLetter = colLetter(base + 3);
      const roundedColLetter = colLetter(base + 4);

      // Match done.xlsx formula patterns exactly
      // Metro Trade (tier index 3) uses =SUM(Q2)*50% style, others use =SUM(Q2*50%)
      if (t === 3) {
        // Step 1: Metro Trade special pattern
        setFormula(ws, r, base, `SUM(${costRef})*${pctStr}`, MONEY_FMT);
      } else {
        // Step 1: Markup Amount = =SUM(Q2*xx%)
        setFormula(ws, r, base, `SUM(${costRef}*${pctStr})`, MONEY_FMT);
      }
      // Step 2: Net Price = =SUM(Q2+AE2)
      setFormula(ws, r, base + 1, `SUM(${costRef}+${markupColLetter}${excelRow})`, MONEY_FMT);
      // Step 3: GST = =SUM(AF2*10%)
      setFormula(ws, r, base + 2, `SUM(${netColLetter}${excelRow}*${gstPctStr})`, MONEY_FMT);
      // Step 4: Sell Price = =SUM(AF2:AG2)
      setFormula(ws, r, base + 3, `SUM(${netColLetter}${excelRow}:${gstColLetter}${excelRow})`, MONEY_FMT);
      // Step 5: Rounded = =_xlfn.CEILING.MATH(AH2,0.05)
      setFormula(ws, r, base + 4, `_xlfn.CEILING.MATH(${sellColLetter}${excelRow},${rounding})`, MONEY_FMT);

      // Summary column = =SUM(AI2)
      setFormula(ws, r, summaryStartCol + t, `SUM(${roundedColLetter}${excelRow})`, MONEY_FMT);
    }
  }

  // Set sheet range
  const maxCol = formulaStartCol + TIERS.length * 5 - 1;
  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: products.length, c: maxCol } });

  // Column widths
  const colWidths: XLSX.ColInfo[] = [];
  for (let c = 0; c <= maxCol; c++) {
    if (c === 3) colWidths.push({ wch: 45 });
    else if (c === 4) colWidths.push({ wch: 22 });
    else if (c >= summaryStartCol && c < summaryStartCol + TIERS.length) colWidths.push({ wch: 20 });
    else if (c >= formulaStartCol) colWidths.push({ wch: 16 });
    else colWidths.push({ wch: 14 });
  }
  ws["!cols"] = colWidths;

  // Hide column C (Tier 3 Category)
  while (ws["!cols"].length <= 2) ws["!cols"].push({ wch: 14 });
  ws["!cols"][2] = { wch: 0, hidden: true };
}

/**
 * Generate the complete output workbook.
 */
export function generateOutputWorkbook(
  products: ClassifiedProduct[],
  supplierName: string,
  supplierCode: string,
  markups: SupplierMarkup[],
  specialHandling: SpecialHandlingSetting[]
): ArrayBuffer {
  const wb = XLSX.utils.book_new();

  const gstRate = parseFloat(getSpecialValue(specialHandling, supplierCode, "ALL", "gst_rate") || "10");
  const rounding = parseFloat(getSpecialValue(specialHandling, supplierCode, "ALL", "rounding") || "0.05");
  const styleCodeFormat = getSpecialValue(specialHandling, supplierCode, "ALL", "style_code_format") || `BWA {supplier_code} {item_code}`;

  const outputSheetsStr = getSpecialValue(specialHandling, supplierCode, "ALL", "output_sheets");
  const outputSheetNames = outputSheetsStr
    ? outputSheetsStr.split(",").map((s) => s.trim())
    : [`${supplierName.toUpperCase()} - PRODUCTS`];

  // Determine mosaics categories
  const mosaicCategories = new Set<string>();
  for (const sh of specialHandling) {
    if (sh.supplierCode === supplierCode && sh.setting === "pricing_mode" && sh.value === "per_sheet") {
      mosaicCategories.add(sh.category.toLowerCase());
    }
  }

  const tilesProducts = products.filter((p) => !mosaicCategories.has(p.category.toLowerCase()));
  const mosaicsProducts = products.filter((p) => mosaicCategories.has(p.category.toLowerCase()));

  if (tilesProducts.length > 0) {
    const ws: XLSX.WorkSheet = {};
    const name = outputSheetNames[0] || `${supplierName.toUpperCase()} - TILES`;
    generateSheet(ws, { products: tilesProducts, sheetName: name, supplierName, supplierCode, markups, specialHandling, isMosaics: false, gstRate, rounding, styleCodeFormat });
    XLSX.utils.book_append_sheet(wb, ws, name.substring(0, 31));
  }

  if (mosaicsProducts.length > 0) {
    const ws: XLSX.WorkSheet = {};
    const name = outputSheetNames[1] || "MOSAICS";
    generateSheet(ws, { products: mosaicsProducts, sheetName: name, supplierName, supplierCode, markups, specialHandling, isMosaics: true, gstRate, rounding, styleCodeFormat });
    XLSX.utils.book_append_sheet(wb, ws, name.substring(0, 31));
  }

  if (tilesProducts.length === 0 && mosaicsProducts.length === 0) {
    const ws: XLSX.WorkSheet = { "!ref": "A1", A1: { t: "s", v: "No products found" } };
    XLSX.utils.book_append_sheet(wb, ws, "No Data");
  }

  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}
