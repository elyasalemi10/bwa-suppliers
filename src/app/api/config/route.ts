import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { uploadToR2, formatDateForR2 } from "@/lib/r2";
import { parseConfigFile, getSupplierList } from "@/lib/config-parser";

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
    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();

    // Parse and validate config
    const config = parseConfigFile(buffer);
    if (config.markups.length === 0) {
      return NextResponse.json({ error: "No supplier markups found in config file" }, { status: 400 });
    }

    const suppliers = getSupplierList(config);

    // Upload to R2
    const date = formatDateForR2();
    const key = `configs/${date}/${file.name}`;
    const fileUrl = await uploadToR2(key, Buffer.from(buffer), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

    // Store in Supabase
    const supabase = getSupabaseClient();
    await supabase.from("active_config").delete().neq("id", "00000000-0000-0000-0000-000000000000"); // Clear old configs

    const { error: insertError } = await supabase.from("active_config").insert({
      file_url: fileUrl,
      filename: file.name,
      supplier_count: suppliers.length,
      config_json: JSON.stringify(config),
    });

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      supplierCount: suppliers.length,
      suppliers: suppliers.map((s) => ({ code: s.code, name: s.name, categories: s.categories })),
    });
  } catch (err) {
    console.error("Config upload error:", err);
    return NextResponse.json({ error: "Failed to process config file" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const supabase = getSupabaseClient();
    const { data } = await supabase
      .from("active_config")
      .select("*")
      .order("uploaded_at", { ascending: false })
      .limit(1)
      .single();

    if (!data) {
      return NextResponse.json({ config: null });
    }

    const config = JSON.parse(data.config_json);
    const suppliers = getSupplierList(config);

    return NextResponse.json({
      config: {
        id: data.id,
        filename: data.filename,
        uploadedAt: data.uploaded_at,
        supplierCount: data.supplier_count,
        suppliers,
      },
      parsedConfig: config,
    });
  } catch {
    return NextResponse.json({ error: "Failed to load config" }, { status: 500 });
  }
}
