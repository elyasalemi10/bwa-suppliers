import * as XLSX from "xlsx";
import type { ClassifiedProduct, SupplierMarkup, SpecialHandlingSetting, PRICING_TIERS } from "./types";
import { extractSize } from "./source-parser";

const MONEY_FMT = '"$"#,##0.00';

// The 9 pricing tiers in output order
const TIERS: { key: string; label: string; configField: keyof SupplierMarkup }[] = [
  { key: "regionalRetail", label: "Regional Retail", configField: "regionalRetailPct" },
  { key: "regionalTrade", label: "Regional Trade", configField: "regionalTradePct" },
  { key: "metroRetail", label: "Metro Retail", configField: "metroRetailPct" },
  { key: "metroTrade", label: "Metro Trade", configField: "metroTradePct" },
  { key: "regRetailVip", label: "Regional Retail VIP", configField: "regRetailVipPct" },
  { key: "regTradeVip1", label: "Regional Trade VIP1", configField: "regTradeVip1Pct" },
  { key: "regTradeVip2", label: "Regional Trade VIP2", configField: "regTradeVip2Pct" },
  { key: "metroTradeVip1", label: "Metro Trade VIP1", configField: "metroTradeVip1Pct" },
  { key: "metroTradeVip2", label: "Metro Trade VIP2", configField: "metroTradeVip2Pct" },
];

function col(n: number): string {
  // Convert 0-indexed column number to Excel column letter
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
  if (value == null || value === "") {
    // Leave empty
    return;
  }
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
  // Check specific category first, then ALL
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

  // ─── Column layout ───
  // For TILES: Cost is in col Q (16), summaries start at T (19), formulas at AE (30)
  // For MOSAICS: Q (16) = Price Per Sheet formula, S (18) = Cost per m2, summaries at V (21), formulas at AG (32)
  const costCol = 16; // Q for both
  const mosaicCostM2Col = 18; // S
  const summaryStartCol = isMosaics ? 21 : 19; // V or T
  const formulaStartCol = isMosaics ? 32 : 30; // AG or AE

  // ─── Headers (row 0) ───
  const headers: [number, string][] = [
    [0, "Category"],
    [2, "Tier 3 Category"],
    [3, "Description"],
    [4, "Style Code"],
    [5, "Supplier Code"],
    [6, "Supplier"],
    [7, "Stock Control"],
    [8, ""],
    [9, "Sqm per box"],
    [10, "Pieces Per Sqm"],
    [11, "Pcs/Box"],
    [12, "m2/Pallet"],
    [13, ""],
    [14, "Size:"],
    [16, isMosaics ? "Price Per Sheet Ex" : "Cost AUD Excl"],
  ];

  if (isMosaics) {
    headers.push([mosaicCostM2Col, "Cost Per m2 AUD Excl"]);
  }

  // Summary headers
  const summaryLabels = TIERS.map((t) => `${t.label} AUD Incl`);
  for (let i = 0; i < summaryLabels.length; i++) {
    headers.push([summaryStartCol + i, summaryLabels[i]]);
  }

  // Formula block headers (5 per tier)
  for (let t = 0; t < TIERS.length; t++) {
    const base = formulaStartCol + t * 5;
    headers.push([base, `PLUS MARKUP (${TIERS[t].label})`]);
    headers.push([base + 1, "NET PRICE"]);
    headers.push([base + 2, "PLUS GST"]);
    headers.push([base + 3, "SELL PRICE"]);
    headers.push([base + 4, "ROUNDED PRICE"]);
  }

  for (const [c, label] of headers) {
    setCell(ws, 0, c, label);
  }

  // ─── Data rows ───
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const r = i + 1; // Excel row (1-indexed in the sheet, but 0-indexed in our array + 1 for header)
    const excelRow = r + 1; // For formula references (1-indexed)

    // Find the markup for this product's category
    const markup = markups.find(
      (m) => m.supplierCode === supplierCode && m.category.toLowerCase() === p.category.toLowerCase()
    ) || markups.find(
      (m) => m.supplierCode === supplierCode
    );

    // Format style code
    const styleCode = styleCodeFormat
      .replace("{supplier_code}", supplierCode)
      .replace("{item_code}", p.itemCode)
      .replace("{code}", supplierCode);

    // Product info columns
    setCell(ws, r, 0, p.category);
    // col 1 empty, col 2 = Tier 3 Category (hidden)
    setCell(ws, r, 3, p.description);
    setCell(ws, r, 4, styleCode);
    setCell(ws, r, 5, p.itemCode);
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
      // S = raw cost per m2, Q = formula =S/K (per sheet price)
      setCell(ws, r, mosaicCostM2Col, p.costPrice, MONEY_FMT);
      if (p.piecesPerSqm && p.piecesPerSqm > 0) {
        setFormula(ws, r, costCol, `${col(mosaicCostM2Col)}${excelRow}/${col(10)}${excelRow}`, MONEY_FMT);
      } else {
        setCell(ws, r, costCol, p.costPrice, MONEY_FMT);
      }
    } else {
      setCell(ws, r, costCol, p.costPrice, MONEY_FMT);
    }

    // ─── Formula blocks (9 tiers × 5 columns each) ───
    if (!markup) continue;

    const costRef = `${col(costCol)}${excelRow}`;
    const gstPct = gstRate / 100;

    for (let t = 0; t < TIERS.length; t++) {
      const tier = TIERS[t];
      const pct = (markup[tier.configField] as number) / 100;
      const base = formulaStartCol + t * 5;

      const markupCol = col(base);
      const netCol = col(base + 1);
      const gstCol = col(base + 2);
      const sellCol = col(base + 3);
      const roundedCol = col(base + 4);

      // Step 1: Markup Amount = Cost × Markup%
      setFormula(ws, r, base, `SUM(${costRef}*${pct})`, MONEY_FMT);
      // Step 2: Net Price = Cost + Markup
      setFormula(ws, r, base + 1, `SUM(${costRef}+${markupCol}${excelRow})`, MONEY_FMT);
      // Step 3: GST = Net × GST%
      setFormula(ws, r, base + 2, `SUM(${netCol}${excelRow}*${gstPct})`, MONEY_FMT);
      // Step 4: Sell Price = Net + GST
      setFormula(ws, r, base + 3, `SUM(${netCol}${excelRow}:${gstCol}${excelRow})`, MONEY_FMT);
      // Step 5: Rounded = CEILING.MATH(Sell, rounding)
      setFormula(ws, r, base + 4, `_xlfn.CEILING.MATH(${sellCol}${excelRow},${rounding})`, MONEY_FMT);

      // Summary column = reference to rounded price
      setFormula(ws, r, summaryStartCol + t, `SUM(${roundedCol}${excelRow})`, MONEY_FMT);
    }
  }

  // Set sheet range
  const maxCol = formulaStartCol + TIERS.length * 5;
  const maxRow = products.length;
  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxRow, c: maxCol } });

  // Column widths
  const colWidths: XLSX.ColInfo[] = [];
  for (let c = 0; c <= maxCol; c++) {
    if (c === 3) colWidths.push({ wch: 45 }); // Description
    else if (c === 4) colWidths.push({ wch: 22 }); // Style Code
    else if (c >= summaryStartCol && c < summaryStartCol + TIERS.length) colWidths.push({ wch: 18 });
    else colWidths.push({ wch: 14 });
  }
  ws["!cols"] = colWidths;

  // Hide column C (Tier 3 Category) - index 2
  if (!ws["!cols"]) ws["!cols"] = [];
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

  // Get global settings
  const gstRate = parseFloat(getSpecialValue(specialHandling, supplierCode, "ALL", "gst_rate") || "10");
  const rounding = parseFloat(getSpecialValue(specialHandling, supplierCode, "ALL", "rounding") || "0.05");
  const styleCodeFormat = getSpecialValue(specialHandling, supplierCode, "ALL", "style_code_format") || `BWA ${supplierCode} {item_code}`;

  // Determine output sheets
  const outputSheetsStr = getSpecialValue(specialHandling, supplierCode, "ALL", "output_sheets");
  const outputSheetNames = outputSheetsStr
    ? outputSheetsStr.split(",").map((s) => s.trim())
    : [`${supplierName.toUpperCase()} - PRODUCTS`];

  // Determine which categories are "mosaics" (need the extra columns)
  const mosaicCategories = new Set<string>();
  for (const sh of specialHandling) {
    if (sh.supplierCode === supplierCode && sh.setting === "pricing_mode" && sh.value === "per_sheet") {
      mosaicCategories.add(sh.category.toLowerCase());
    }
  }

  // Split products into tiles-style and mosaics-style
  const tilesProducts = products.filter((p) => !mosaicCategories.has(p.category.toLowerCase()));
  const mosaicsProducts = products.filter((p) => mosaicCategories.has(p.category.toLowerCase()));

  // Generate sheets
  if (tilesProducts.length > 0) {
    const ws: XLSX.WorkSheet = {};
    const name = outputSheetNames[0] || `${supplierName.toUpperCase()} - TILES`;
    generateSheet(ws, {
      products: tilesProducts,
      sheetName: name,
      supplierName,
      supplierCode,
      markups,
      specialHandling,
      isMosaics: false,
      gstRate,
      rounding,
      styleCodeFormat,
    });
    XLSX.utils.book_append_sheet(wb, ws, name.substring(0, 31));
  }

  if (mosaicsProducts.length > 0) {
    const ws: XLSX.WorkSheet = {};
    const name = outputSheetNames[1] || "MOSAICS";
    generateSheet(ws, {
      products: mosaicsProducts,
      sheetName: name,
      supplierName,
      supplierCode,
      markups,
      specialHandling,
      isMosaics: true,
      gstRate,
      rounding,
      styleCodeFormat,
    });
    XLSX.utils.book_append_sheet(wb, ws, name.substring(0, 31));
  }

  // If no products at all, create an empty sheet
  if (tilesProducts.length === 0 && mosaicsProducts.length === 0) {
    const ws: XLSX.WorkSheet = { "!ref": "A1", A1: { t: "s", v: "No products found" } };
    XLSX.utils.book_append_sheet(wb, ws, "No Data");
  }

  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}
