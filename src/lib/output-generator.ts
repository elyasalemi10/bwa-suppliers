import ExcelJS from "exceljs";
import type { ClassifiedProduct, SupplierMarkup, SpecialHandlingSetting } from "./types";
import { extractSize } from "./source-parser";

// ─── Mosaic Pieces Per Sqm lookup (from done.xlsx) ───
const MOSAIC_PCS_PER_SQM: Record<string, number> = {
  "CHX BLK23G":12.8205,"CHX BLK23M":12.8205,"CHX BLK51G":13.0846,"CHX BLK51GA":10.92,
  "CHX BLK51M":13.0846,"CHX BLK51MA":10.92,"CHX WHT23G":12.8205,"CHX WHT23M":12.8205,
  "CHX WHT51G":13.0846,"CHX WHT51GA":10.9099,"CHX WHT51M":13.0899,"CHX WHT51MA":10.9099,
  "CPR BLK19G":10.2701,"CPR BLK19M":10.2701,"CPR BLK19MA":10.91,"CPR WHT19G":10.2701,
  "CPR WHT19GA":10.9099,"CPR WHT19M":10.2701,"CPR WHT19MA":10.9099,
  "CSQ BLK48G":10.6793,"CSQ BLK48M":10.6793,"CSQ BLK97G":11.1111,"CSQ BLK97M":11.1111,
  "CSQ WHT48G":10.6793,"CSQ WHT48M":10.6793,"CSQ WHT97G":11.1111,"CSQ WHT97M":11.1111,
  "DEC BARCAR":11.2359,"DEC BARNER":11.2359,"DEC CUBCAR":9.7087,"DEC CUBNER":9.7087,
  "DEC FORCAR":13.1578,"DEC FORNER":13.1578,"DEC HERCAR":11.1111,"DEC HERNER":10.5263,
  "DEC PYRCAR":10.5263,"DEC PYRNER":10.5263,
  "FGR BEI214G":11.3,"FGR DBL214G":11.3,"FGR GRN214G":11.3,"FGR LBL214G":11.2599,
  "FGR LGY214G":11.3,"FGR PLGY214M":11.3208,"FGR PWHT214M":11.3208,"FGR TER214G":11.3,"FGR WHT214G":11.3,
  "PMC BLK214G":11.26,"PMC BLK214M":11.26,"PMC WHT1514M":11.3798,"PMC WHT214G":11.26,"PMC WHT214M":11.26,
  "PRD GRA30HEX":12.4194,"PRD GRY30HEX":12.4194,"PRD LGY30HEX":12.4194,
  "TSC CAR30N":10.984,"TSC CAR75N":10.984,"TSC CARCHN":12.9955,"TSC CARLHN":12.3266,
  "TSC CARPN20N":10.75,"TSC GRNFGR":10.989,"TSC GRNFS":14.792,"TSC GRNLH":12.3266,
  "TUN GRYCHN":14.4737,"TUN GRYFGR":12.0879,"TUN GRYHER":13.5802,"TUN GRYSQU":11.2245,
  "TUN WHTCHN":14.4738,"TUN WHTFGR":12.0879,"TUN WHTHER":13.5802,"TUN WHTSQU":11.2245,
  "VOG GRY30HEX":12.4194,"VOG LGY30HEX":12.4194,
};

const TIERS = [
  { headerPrefix: "REGIONAL RETAIL", configField: "regionalRetailPct" as keyof SupplierMarkup, summaryHeader: "Regional Retail AUD Incl", isPlus: true },
  { headerPrefix: "REGIONAL TRADE", configField: "regionalTradePct" as keyof SupplierMarkup, summaryHeader: "Regional Trade AUD Incl", isPlus: true },
  { headerPrefix: "METRO RETAIL", configField: "metroRetailPct" as keyof SupplierMarkup, summaryHeader: "Metro Retail AUD Incl", isPlus: true },
  { headerPrefix: "METRO TRADE", configField: "metroTradePct" as keyof SupplierMarkup, summaryHeader: "Metro Trade AUD Incl", isPlus: true },
  { headerPrefix: "REGIONAL RETAIL VIP", configField: "regRetailVipPct" as keyof SupplierMarkup, summaryHeader: "Regional Retail VIP AUD Inc", isPlus: false, roundedOverride: "REGIONL RETAIL VIP ROUNDED PRICE" },
  { headerPrefix: "REGIONAL TRADE VIP1", configField: "regTradeVip1Pct" as keyof SupplierMarkup, summaryHeader: "Regional Trade VIP1 AUD Inc", isPlus: false },
  { headerPrefix: "REGIONAL TRADE VIP2", configField: "regTradeVip2Pct" as keyof SupplierMarkup, summaryHeader: "Regional Trade VIP2 AUD Inc", isPlus: false },
  { headerPrefix: "METRO TRADE VIP1", configField: "metroTradeVip1Pct" as keyof SupplierMarkup, summaryHeader: "Metro Trade VIP1 AUD Inc", isPlus: false },
  { headerPrefix: "METRO TRADE VIP2", configField: "metroTradeVip2Pct" as keyof SupplierMarkup, summaryHeader: "Metro Trade VIP2 AUD Inc", isPlus: false },
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

// Column number (1-indexed for exceljs)
const C = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, I: 9, J: 10,
  K: 11, L: 12, M: 13, N: 14, O: 15, P: 16, Q: 17, R: 18, S: 19,
};

const CALIBRI: Partial<ExcelJS.Font> = { name: "Calibri", size: 11 };
const BOLD_CALIBRI: Partial<ExcelJS.Font> = { name: "Calibri", size: 11, bold: true };
const GREEN_BOLD: Partial<ExcelJS.Font> = { name: "Calibri", size: 11, bold: true, color: { argb: "FF00B050" } };
const MONEY_FMT = '"$"#,##0.00';

const LIGHT_GREEN_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2EFDA" } };
const LIGHT_PURPLE_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFCCCCFF" } };
const WHITE_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };

const THIN_BORDER: Partial<ExcelJS.Border> = { style: "thin" };

function getSpecialValue(settings: SpecialHandlingSetting[], supplierCode: string, category: string, setting: string): string | undefined {
  const specific = settings.find(
    (s) => s.supplierCode === supplierCode && s.category.toLowerCase() === category.toLowerCase() && s.setting === setting
  );
  if (specific) return specific.value;
  return settings.find(
    (s) => s.supplierCode === supplierCode && s.category === "ALL" && s.setting === setting
  )?.value;
}

// ─── Tiles column widths (from done.xlsx, character units) ───
const TILES_WIDTHS: Record<string, number> = {
  A:13,B:4.66,C:0.11,D:84.44,E:27.55,F:19.44,G:13.89,H:7.33,I:10.89,J:9,K:9.55,L:5.11,M:6,N:16.66,O:21.55,P:4.33,Q:11.11,R:13,S:13,
  T:10.11,U:9.89,V:9.55,W:9.44,X:10.55,Y:13,Z:13,AA:13,AB:13,AC:13,AD:13,
  AE:12.44,AF:11.55,AG:10.33,AH:10.44,AI:10.89,AJ:12.89,AK:11.89,AL:10.44,AM:11.89,AN:12,
  AO:11,AP:10,AQ:9,AR:9.33,AS:11.11,AT:10.11,AU:9.89,AV:8.55,AW:9.44,AX:11.11,
  AY:12.11,AZ:12,BA:11,BB:12.11,BC:11.89,BD:12.33,BE:11.89,BF:12.55,BG:14.11,BH:11.89,
  BI:12.55,BJ:12.89,BK:13.33,BL:12.89,BM:13,BN:12.44,BO:11.11,BP:10.55,BQ:12,BR:12.55,
  BS:11,BT:10.66,BU:10.11,BV:11.33,BW:11.44,
};

const MOSAICS_WIDTHS: Record<string, number> = {
  A:9.33,B:4.66,C:0.11,D:69.55,E:25.55,F:19.11,G:13.11,H:13,I:13,J:13,K:10.55,L:13,M:11,N:18.11,O:19.11,P:4.33,Q:13,R:13,S:9.66,
  T:13,U:13,V:13,W:13,X:13,Y:13,Z:13,AA:13,AB:13,AC:13,AD:13,AE:13,AF:13,
  AG:10.11,AH:9.89,AI:9.66,AJ:13,AK:13,AL:10,AM:13,AN:13,AO:13,AP:13,
  AQ:13,AR:13,AS:13,AT:13,AU:13,AV:13,AW:13,AX:13,AY:13,AZ:13,
  BA:10.33,BB:13,BC:13,BD:13,BE:13,BF:10,BG:13,BH:13,BI:13,BJ:13,
  BK:9.89,BL:13,BM:13,BN:13,BO:13,BP:13,BQ:13,BR:13,BS:13,BT:13,BU:13,BV:13,BW:13,BX:13,BY:13,
};

function applyColumnWidths(ws: ExcelJS.Worksheet, widths: Record<string, number>) {
  for (const [colKey, width] of Object.entries(widths)) {
    const col = ws.getColumn(colKey);
    col.width = width;
  }
}

interface SheetOpts {
  products: ClassifiedProduct[];
  supplierName: string;
  supplierCode: string;
  markups: SupplierMarkup[];
  specialHandling: SpecialHandlingSetting[];
  isMosaics: boolean;
  gstRate: number;
  rounding: number;
  styleCodeFormat: string;
}

function buildSheet(ws: ExcelJS.Worksheet, opts: SheetOpts): void {
  const { products, supplierName, supplierCode, markups, isMosaics, gstRate, rounding, styleCodeFormat } = opts;

  // Column offsets (0-indexed for formula letters, 1-indexed for exceljs)
  const costColIdx = 16; // Q (0-indexed)
  const mosaicCostM2Idx = 18; // S
  const summaryStart = isMosaics ? 21 : 19; // V or T (0-indexed)
  const formulaStart = isMosaics ? 32 : 30; // AG or AE (0-indexed)

  const firstMarkup = markups.find((m) => m.supplierCode === supplierCode) || markups[0];

  // ─── Set column widths ───
  applyColumnWidths(ws, isMosaics ? MOSAICS_WIDTHS : TILES_WIDTHS);

  // Hide column C
  ws.getColumn("C").hidden = true;

  // ─── Header row ───
  const headerRow = ws.getRow(1);
  headerRow.height = isMosaics ? 121.5 : 144;

  // Product info headers
  ws.getCell("A1").value = "Category";
  ws.getCell("C1").value = "Tier 3 Category";
  ws.getCell("D1").value = "Description";
  ws.getCell("E1").value = "Style Code ";
  ws.getCell("F1").value = "Supplier Code";
  ws.getCell("G1").value = "Supplier";
  ws.getCell("H1").value = "Stock Control";
  ws.getCell("J1").value = "Sqm per box";
  ws.getCell("K1").value = "Pieces Per Sqm";
  ws.getCell("L1").value = "Pcs/Box";
  ws.getCell("M1").value = "m2/\nPallet";
  ws.getCell("O1").value = "Size:";

  if (isMosaics) {
    ws.getCell("N1").value = "Option 2";
    ws.getCell("Q1").value = "Price Per Sheet Ex";
    ws.getCell("S1").value = "Cost Per m2\nAUD Excl";
  } else {
    ws.getCell("Q1").value = "Cost AUD Excl";
  }

  // Summary headers
  for (let i = 0; i < TIERS.length; i++) {
    const cell = ws.getCell(1, summaryStart + i + 1);
    cell.value = TIERS[i].summaryHeader;
  }

  // Formula block headers
  for (let t = 0; t < TIERS.length; t++) {
    const tier = TIERS[t];
    const pct = firstMarkup ? (firstMarkup[tier.configField] as number) : 0;
    const base = formulaStart + t * 5; // 0-indexed

    const markupLabel = tier.isPlus
      ? `${tier.headerPrefix} PLUS MARKUP (${pct}%)`
      : `${tier.headerPrefix} MARKUP (${pct}%)`;

    ws.getCell(1, base + 1).value = markupLabel;
    ws.getCell(1, base + 2).value = `${tier.headerPrefix} NET PRICE`;
    ws.getCell(1, base + 3).value = `${tier.headerPrefix} PLUS GST`;
    ws.getCell(1, base + 4).value = `${tier.headerPrefix} SELL PRICE`;
    ws.getCell(1, base + 5).value = tier.roundedOverride || `${tier.headerPrefix} ROUNDED PRICE`;
  }

  // Style ALL header cells
  const maxCol = formulaStart + TIERS.length * 5;
  for (let c = 1; c <= maxCol; c++) {
    const cell = ws.getCell(1, c);
    cell.font = BOLD_CALIBRI;
    cell.alignment = { wrapText: true, vertical: "bottom" };
  }

  // Summary header fills
  for (let i = 0; i < TIERS.length; i++) {
    const colNum = summaryStart + i + 1;
    const cell = ws.getCell(1, colNum);
    if (i === 0 || i === 1) cell.fill = LIGHT_GREEN_FILL;  // T,U / V,W → Regional Retail/Trade
    else if (i === 2 || i === 3) cell.fill = LIGHT_PURPLE_FILL; // V,W / X,Y → Metro Retail/Trade
  }

  // ─── Data rows ───
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const r = i + 2; // exceljs row (1-indexed, +1 for header)

    const markup = markups.find(
      (m) => m.supplierCode === supplierCode && m.category.toLowerCase() === p.category.toLowerCase()
    ) || markups.find((m) => m.supplierCode === supplierCode);

    const styleCode = styleCodeFormat
      .replace("{code}", supplierCode)
      .replace("{supplier_code}", p.itemCode)
      .replace("{item_code}", p.itemCode);

    const row = ws.getRow(r);
    row.font = CALIBRI;

    // Product info
    ws.getCell(r, C.A).value = p.category;
    ws.getCell(r, C.D).value = p.description;
    ws.getCell(r, C.D).fill = WHITE_FILL;
    ws.getCell(r, C.D).border = { top: THIN_BORDER, bottom: THIN_BORDER, left: THIN_BORDER, right: THIN_BORDER };
    ws.getCell(r, C.D).alignment = { horizontal: "left", vertical: "top" };

    ws.getCell(r, C.E).value = styleCode;
    ws.getCell(r, C.E).fill = WHITE_FILL;
    ws.getCell(r, C.E).alignment = { horizontal: "left", vertical: "top" };

    ws.getCell(r, C.F).value = p.itemCode;
    ws.getCell(r, C.F).alignment = { horizontal: "left", vertical: "top" };

    ws.getCell(r, C.G).value = supplierName;
    ws.getCell(r, C.H).value = "FIFO";

    // Unit/format
    const pricingMode = p.pricingMode || "per_sqm";
    if (pricingMode === "per_bag") {
      ws.getCell(r, C.I).value = "BAG";
      ws.getCell(r, C.N).value = "Price Per BAG";
    } else if (pricingMode === "per_piece") {
      ws.getCell(r, C.I).value = "EACH";
      ws.getCell(r, C.N).value = "Price Per PCE";
    } else if (isMosaics) {
      ws.getCell(r, C.I).value = "SQM/BOX";
      ws.getCell(r, C.N).value = "Price Per Sheet";
    } else {
      ws.getCell(r, C.I).value = "SQM/BOX";
      ws.getCell(r, C.N).value = "Price Per SQM";
    }

    // Numeric columns with white fill
    const m2Box = p.m2Box;
    if (m2Box != null) { ws.getCell(r, C.J).value = m2Box; ws.getCell(r, C.J).fill = WHITE_FILL; }

    // Pieces Per Sqm (K) — for mosaics, look up from table
    const ppsVal = isMosaics ? (MOSAIC_PCS_PER_SQM[p.itemCode] || p.piecesPerSqm) : p.piecesPerSqm;
    if (ppsVal != null) { ws.getCell(r, C.K).value = ppsVal; ws.getCell(r, C.K).fill = WHITE_FILL; }

    if (p.pcsBox != null) { ws.getCell(r, C.L).value = p.pcsBox; ws.getCell(r, C.L).fill = WHITE_FILL; }
    if (p.m2Pallet != null) { ws.getCell(r, C.M).value = p.m2Pallet; ws.getCell(r, C.M).fill = WHITE_FILL; }

    ws.getCell(r, C.O).value = extractSize(p.description);

    // Cost column
    const costCell = ws.getCell(r, C.Q);
    if (isMosaics) {
      ws.getCell(r, C.S).value = p.costPrice;
      ws.getCell(r, C.S).numFmt = MONEY_FMT;
      costCell.value = { formula: `S${r}/K${r}` } as ExcelJS.CellFormulaValue;
    } else {
      costCell.value = p.costPrice;
    }
    costCell.numFmt = MONEY_FMT;
    costCell.font = BOLD_CALIBRI;
    costCell.fill = WHITE_FILL;
    costCell.alignment = { horizontal: "center", vertical: "middle" };
    costCell.border = { left: THIN_BORDER, right: THIN_BORDER, bottom: THIN_BORDER };

    if (!markup) continue;

    // ─── 9 pricing tier formula blocks ───
    const costRef = `Q${r}`;
    const gstPctStr = `${gstRate}%`;

    for (let t = 0; t < TIERS.length; t++) {
      const tier = TIERS[t];
      const pct = markup[tier.configField] as number;
      const pctStr = `${pct}%`;
      const base = formulaStart + t * 5; // 0-indexed

      const mkCol = colLetter(base);
      const ntCol = colLetter(base + 1);
      const gsCol = colLetter(base + 2);
      const slCol = colLetter(base + 3);
      const rdCol = colLetter(base + 4);

      // Step 1: Markup (Metro Trade uses =SUM(Q2)*50% pattern)
      const mkFormula = t === 3
        ? `SUM(${costRef})*${pctStr}`
        : `SUM(${costRef}*${pctStr})`;
      const mkCell = ws.getCell(r, base + 1);
      mkCell.value = { formula: mkFormula } as ExcelJS.CellFormulaValue;
      mkCell.numFmt = MONEY_FMT;
      mkCell.font = BOLD_CALIBRI;

      // Step 2: Net Price
      const ntCell = ws.getCell(r, base + 2);
      ntCell.value = { formula: `SUM(${costRef}+${mkCol}${r})` } as ExcelJS.CellFormulaValue;
      ntCell.numFmt = MONEY_FMT;
      ntCell.font = GREEN_BOLD;

      // Step 3: GST
      const gsCell = ws.getCell(r, base + 3);
      gsCell.value = { formula: `SUM(${ntCol}${r}*${gstPctStr})` } as ExcelJS.CellFormulaValue;
      gsCell.numFmt = MONEY_FMT;

      // Step 4: Sell Price
      const slCell = ws.getCell(r, base + 4);
      slCell.value = { formula: `SUM(${ntCol}${r}:${gsCol}${r})` } as ExcelJS.CellFormulaValue;
      slCell.numFmt = MONEY_FMT;

      // Step 5: Rounded
      const rdCell = ws.getCell(r, base + 5);
      rdCell.value = { formula: `_xlfn.CEILING.MATH(${slCol}${r},${rounding})` } as ExcelJS.CellFormulaValue;
      rdCell.numFmt = MONEY_FMT;

      // Summary column
      const sumCell = ws.getCell(r, summaryStart + t + 1);
      sumCell.value = { formula: `SUM(${rdCol}${r})` } as ExcelJS.CellFormulaValue;
      sumCell.numFmt = MONEY_FMT;

      // Summary fills
      if (t === 0 || t === 1) sumCell.fill = LIGHT_GREEN_FILL;
      else if (t === 2 || t === 3) sumCell.fill = LIGHT_PURPLE_FILL;
    }
  }

  // Freeze panes at A2
  ws.views = [{ state: "frozen", xSplit: 0, ySplit: 1, topLeftCell: "A2", activeCell: "A2" }];
}

export async function generateOutputWorkbook(
  products: ClassifiedProduct[],
  supplierName: string,
  supplierCode: string,
  markups: SupplierMarkup[],
  specialHandling: SpecialHandlingSetting[]
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "BWA Converter";

  const gstRate = parseFloat(getSpecialValue(specialHandling, supplierCode, "ALL", "gst_rate") || "10");
  const rounding = parseFloat(getSpecialValue(specialHandling, supplierCode, "ALL", "rounding") || "0.05");
  const styleCodeFormat = getSpecialValue(specialHandling, supplierCode, "ALL", "style_code_format") || `BWA {code} {supplier_code}`;

  const outputSheetsStr = getSpecialValue(specialHandling, supplierCode, "ALL", "output_sheets");
  const outputSheetNames = outputSheetsStr
    ? outputSheetsStr.split(",").map((s) => s.trim())
    : [`${supplierName.toUpperCase()} - PRODUCTS`];

  const mosaicCategories = new Set<string>();
  for (const sh of specialHandling) {
    if (sh.supplierCode === supplierCode && sh.setting === "pricing_mode" && sh.value === "per_sheet") {
      mosaicCategories.add(sh.category.toLowerCase());
    }
  }

  const tilesProducts = products.filter((p) => !mosaicCategories.has(p.category.toLowerCase()));
  const mosaicsProducts = products.filter((p) => mosaicCategories.has(p.category.toLowerCase()));

  const sheetOpts = { supplierName, supplierCode, markups, specialHandling, gstRate, rounding, styleCodeFormat };

  if (tilesProducts.length > 0) {
    const name = (outputSheetNames[0] || `${supplierName.toUpperCase()} - TILES`).substring(0, 31);
    const ws = wb.addWorksheet(name);
    buildSheet(ws, { ...sheetOpts, products: tilesProducts, isMosaics: false });
  }

  if (mosaicsProducts.length > 0) {
    const name = (outputSheetNames[1] || "MOSAICS").substring(0, 31);
    const ws = wb.addWorksheet(name);
    buildSheet(ws, { ...sheetOpts, products: mosaicsProducts, isMosaics: true });
  }

  if (tilesProducts.length === 0 && mosaicsProducts.length === 0) {
    const ws = wb.addWorksheet("No Data");
    ws.getCell("A1").value = "No products found";
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
