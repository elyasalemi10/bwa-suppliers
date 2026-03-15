import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";
import { calculatePrices } from "@/lib/pricing";
import { cleanPriceString } from "@/lib/xlsx-utils";
import { uploadToR2, buildR2Key, slugify, formatDateForFilename, formatDateForR2 } from "@/lib/r2";
import type { Supplier, GstExemptionKeyword, ColumnMapping } from "@/lib/types";

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

function getColumnIndex(headers: string[], columnName: string | null): number {
  if (!columnName) return -1;
  const idx = headers.indexOf(columnName);
  if (idx !== -1) return idx;
  return headers.findIndex((h) => h.toLowerCase() === columnName.toLowerCase());
}

function getCellValue(row: (string | number | boolean | undefined)[], headers: string[], columnName: string | null): string {
  if (!columnName) return "";
  const idx = getColumnIndex(headers, columnName);
  if (idx === -1) return "";
  return row[idx] != null ? String(row[idx]) : "";
}

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
        sheet[XLSX.utils.encode_cell({ r, c })] = { ...topLeftCell };
      }
    }
  }
}

interface ProcessResult {
  outputRows: (string | number | undefined)[][];
  headers: string[];
  skippedCount: number;
  productIndexRows: {
    original_code: string;
    bwa_code: string;
    description: string;
    brand: string;
    original_price: number;
    regular_price: number;
    vip_price: number;
  }[];
}

function processSheet(
  sheet: XLSX.WorkSheet,
  supplier: Supplier,
  exemptionKeywords: GstExemptionKeyword[],
  mapping: ColumnMapping
): ProcessResult {
  unmergeCells(sheet);
  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");

  // Extract headers
  const headers: string[] = [];
  for (let col = range.s.c; col <= range.e.c; col++) {
    const cell = sheet[XLSX.utils.encode_cell({ r: range.s.r, c: col })];
    headers.push(cell ? String(cell.v) : XLSX.utils.encode_col(col));
  }

  const outputRows: (string | number | undefined)[][] = [];
  const productIndexRows: ProcessResult["productIndexRows"] = [];
  let skippedCount = 0;
  const BATCH_SIZE = 500;

  for (let startRow = range.s.r + 1; startRow <= range.e.r; startRow += BATCH_SIZE) {
    const endRow = Math.min(startRow + BATCH_SIZE - 1, range.e.r);

    for (let r = startRow; r <= endRow; r++) {
      // Skip hidden rows
      if (sheet["!rows"]?.[r]?.hidden) continue;

      // Read full row preserving all columns
      const row: (string | number | boolean | undefined)[] = [];
      let allEmpty = true;
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cell = sheet[XLSX.utils.encode_cell({ r, c: col })];
        const val = cell ? cell.v : undefined;
        if (val != null && String(val).trim()) allEmpty = false;
        row.push(val);
      }

      // Skip fully empty rows silently
      if (allEmpty) continue;

      const costRaw = getCellValue(row, headers, mapping.cost);
      const { value: costPrice } = cleanPriceString(costRaw);

      if (costPrice === null || costPrice <= 0) {
        skippedCount++;
        continue;
      }

      const productId = getCellValue(row, headers, mapping.id);
      if (!productId.trim()) {
        skippedCount++;
        continue;
      }

      const description = getCellValue(row, headers, mapping.description);
      const brand = getCellValue(row, headers, mapping.brand);

      const rowData: Record<string, string> = {};
      for (const [field, columnName] of Object.entries(mapping)) {
        if (columnName) rowData[field] = getCellValue(row, headers, columnName);
      }

      const { regularPrice, vipPrice } = calculatePrices(costPrice, supplier, rowData, exemptionKeywords);

      // Output row = all original columns + 3 BWA columns
      const originalValues = row.map((v) =>
        typeof v === "boolean" ? String(v) : v
      );
      outputRows.push([...originalValues, `BWA-${productId}`, regularPrice, vipPrice]);

      productIndexRows.push({
        original_code: productId,
        bwa_code: `BWA-${productId}`,
        description,
        brand,
        original_price: costPrice,
        regular_price: regularPrice,
        vip_price: vipPrice,
      });
    }
  }

  return { outputRows, headers, skippedCount, productIndexRows };
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const supplierId = formData.get("supplierId") as string;
    const sheetName = formData.get("sheetName") as string | null;
    const processAllTabs = formData.get("processAllTabs") === "true";

    if (!file || !supplierId) {
      return NextResponse.json({ error: "Missing file or supplierId" }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    const [supplierRes, keywordsRes] = await Promise.all([
      supabase.from("suppliers").select("*").eq("id", supplierId).single(),
      supabase.from("gst_exemption_keywords").select("*").eq("supplier_id", supplierId),
    ]);

    if (supplierRes.error || !supplierRes.data) {
      return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
    }

    const supplier: Supplier = supplierRes.data;
    const exemptionKeywords: GstExemptionKeyword[] = keywordsRes.data || [];
    const mapping: ColumnMapping = supplier.column_mapping;
    const supplierSlug = slugify(supplier.name);
    const dateStr = formatDateForFilename();

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", cellDates: true, raw: true });

    const outputWorkbook = XLSX.utils.book_new();
    let totalRows = 0;
    let totalSkipped = 0;
    const allProductIndexRows: ProcessResult["productIndexRows"] = [];

    const sheetsToProcess = processAllTabs
      ? workbook.SheetNames
      : [sheetName || workbook.SheetNames[0]];

    for (const sName of sheetsToProcess) {
      const sheet = workbook.Sheets[sName];
      if (!sheet) continue;

      const result = processSheet(sheet, supplier, exemptionKeywords, mapping);

      // Build output header row: original headers + BWA columns
      const outputHeaders = [...result.headers, "BWA Code", "BWA Regular Customer Price", "BWA VIP Customer Price"];
      const outputData = [outputHeaders, ...result.outputRows];
      const outputSheet = XLSX.utils.aoa_to_sheet(outputData);

      // Set column widths
      const cols = result.headers.map(() => ({ wch: 16 }));
      cols.push({ wch: 20 }, { wch: 24 }, { wch: 22 });
      outputSheet["!cols"] = cols;

      const tabName = processAllTabs ? sName : "Processed";
      XLSX.utils.book_append_sheet(outputWorkbook, outputSheet, tabName.substring(0, 31));

      totalRows += result.outputRows.length;
      totalSkipped += result.skippedCount;
      allProductIndexRows.push(...result.productIndexRows);
    }

    const xlsxBuffer = XLSX.write(outputWorkbook, { type: "buffer", bookType: "xlsx" });
    const outputFilename = `${supplierSlug}-${dateStr}.xlsx`;

    // Store in R2 and record history
    try {
      const dateR2 = formatDateForR2();
      const originalKey = buildR2Key(supplierId, dateR2, `original-${supplierSlug}-${dateStr}.xlsx`);
      const processedKey = buildR2Key(supplierId, dateR2, `processed-${supplierSlug}-${dateStr}.xlsx`);

      const originalBuffer = Buffer.from(buffer);
      const processedBuffer = Buffer.from(xlsxBuffer);

      const [originalUrl, processedUrl] = await Promise.all([
        uploadToR2(originalKey, originalBuffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
        uploadToR2(processedKey, processedBuffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
      ]);

      // Save processing history
      const { data: historyEntry } = await supabase
        .from("processing_history")
        .insert({
          supplier_id: supplierId,
          original_file_url: originalUrl,
          processed_file_url: processedUrl,
          original_filename: file.name,
          row_count: totalRows,
          skipped_rows: totalSkipped,
        })
        .select("id")
        .single();

      // Save product index entries in batches
      if (historyEntry && allProductIndexRows.length > 0) {
        const INDEX_BATCH = 500;
        for (let i = 0; i < allProductIndexRows.length; i += INDEX_BATCH) {
          const batch = allProductIndexRows.slice(i, i + INDEX_BATCH).map((p) => ({
            supplier_id: supplierId,
            processing_history_id: historyEntry.id,
            supplier_name: supplier.name,
            original_code: p.original_code,
            bwa_code: p.bwa_code,
            description: p.description,
            brand: p.brand,
            original_price: p.original_price,
            regular_price: p.regular_price,
            vip_price: p.vip_price,
          }));
          await supabase.from("product_index").insert(batch);
        }
      }
    } catch (r2Error) {
      // R2 storage is non-blocking — log but don't fail the download
      console.error("R2/history storage error:", r2Error);
    }

    return new NextResponse(xlsxBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${outputFilename}"`,
      },
    });
  } catch (err) {
    console.error("Processing error:", err);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
