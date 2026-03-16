import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { parseConfigFile } from "@/lib/config-parser";
import { parseSourceFile } from "@/lib/source-parser";
import { classifyProduct } from "@/lib/category-classifier";
import { generateOutputWorkbook } from "@/lib/output-generator";
import { uploadToR2, slugify, formatDateForFilename, formatDateForR2 } from "@/lib/r2";
import type { ClassifiedProduct, ColumnMapping } from "@/lib/types";

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const supplierCode = formData.get("supplierCode") as string;

    // Optional: manual column mapping override (JSON string)
    const manualMappingStr = formData.get("columnMapping") as string | null;

    if (!file || !supplierCode) {
      return NextResponse.json({ error: "Missing file or supplier code" }, { status: 400 });
    }

    // Load config from Supabase
    const supabase = getSupabaseClient();
    const { data: configData } = await supabase
      .from("active_config")
      .select("config_json")
      .order("uploaded_at", { ascending: false })
      .limit(1)
      .single();

    if (!configData) {
      return NextResponse.json({ error: "No config file uploaded. Please upload a config first." }, { status: 400 });
    }

    const config = parseConfigFile(
      // Re-parse from stored JSON by creating a minimal structure
      // Actually, the config_json stores the parsed result directly
      new ArrayBuffer(0) // placeholder
    );
    // Use stored parsed config instead
    const parsedConfig = JSON.parse(configData.config_json);

    // Get supplier-specific config
    const supplierMarkups = parsedConfig.markups.filter(
      (m: { supplierCode: string }) => m.supplierCode === supplierCode
    );

    if (supplierMarkups.length === 0) {
      return NextResponse.json({ error: `No markup configuration found for supplier code "${supplierCode}"` }, { status: 404 });
    }

    const supplierName = supplierMarkups[0].supplierName;

    // Get column mapping (from config or manual override)
    let columnMapping: ColumnMapping;
    if (manualMappingStr) {
      columnMapping = JSON.parse(manualMappingStr);
    } else {
      const configMapping = parsedConfig.columnMappings?.find(
        (m: { supplierCode: string }) => m.supplierCode === supplierCode
      );
      if (!configMapping) {
        return NextResponse.json({
          error: `No column mapping found for supplier "${supplierCode}". Please provide column mapping.`,
          needsMapping: true,
        }, { status: 400 });
      }
      columnMapping = configMapping;
    }

    // Get category rules and special handling
    const categoryRules = (parsedConfig.categoryRules || []).filter(
      (r: { supplierCode: string }) => r.supplierCode === supplierCode
    );
    const specialHandling = (parsedConfig.specialHandling || []).filter(
      (s: { supplierCode: string }) => s.supplierCode === supplierCode
    );

    // Parse source file
    const buffer = await file.arrayBuffer();
    const products = parseSourceFile(buffer, columnMapping);

    if (products.length === 0) {
      return NextResponse.json({ error: "No valid products found in the uploaded file" }, { status: 400 });
    }

    // Classify products
    const classified: ClassifiedProduct[] = products.map((product) => {
      const category = classifyProduct(product, categoryRules);
      const defaultCategory = supplierMarkups[0]?.category || "Products";

      // Determine pricing mode from special handling
      const cat = category || defaultCategory;
      let pricingMode = "per_sqm";
      const modeSettingSpecific = specialHandling.find(
        (s: { category: string; setting: string }) => s.category.toLowerCase() === cat.toLowerCase() && s.setting === "pricing_mode"
      );
      const modeSettingAll = specialHandling.find(
        (s: { category: string; setting: string }) => s.category === "ALL" && s.setting === "pricing_mode"
      );

      if (modeSettingSpecific) pricingMode = modeSettingSpecific.value;
      else if (modeSettingAll) pricingMode = modeSettingAll.value;

      // Check unit override (e.g. PCE items on tiles sheet get per_piece)
      const unitOverride = specialHandling.find(
        (s: { category: string; setting: string }) =>
          s.category.toLowerCase() === cat.toLowerCase() &&
          s.setting === `unit_override_${product.unit}`
      );
      if (unitOverride) pricingMode = unitOverride.value;

      return { ...product, category: cat, pricingMode };
    });

    // Generate output workbook
    const outputBuffer = await generateOutputWorkbook(
      classified,
      supplierName,
      supplierCode,
      supplierMarkups,
      specialHandling
    );

    const supplierSlug = slugify(supplierName);
    const dateStr = formatDateForFilename();
    const outputFilename = `${supplierSlug}-${dateStr}.xlsx`;

    // Store output in R2 and record history
    try {
      const dateR2 = formatDateForR2();
      const outputKey = `outputs/${supplierCode}/${dateR2}/${outputFilename}`;
      const outputUrl = await uploadToR2(
        outputKey,
        Buffer.from(outputBuffer),
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );

      await supabase.from("processing_history").insert({
        supplier_code: supplierCode,
        supplier_name: supplierName,
        original_filename: file.name,
        output_file_url: outputUrl,
        row_count: classified.length,
      });
    } catch (r2Err) {
      console.error("R2/history storage error:", r2Err);
    }

    return new NextResponse(new Uint8Array(outputBuffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${outputFilename}"`,
      },
    });
  } catch (err) {
    console.error("Processing error:", err);
    return NextResponse.json({ error: "Processing failed: " + (err instanceof Error ? err.message : "Unknown error") }, { status: 500 });
  }
}
