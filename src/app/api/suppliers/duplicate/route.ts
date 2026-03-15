import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export async function POST(request: NextRequest) {
  try {
    const { supplierId } = await request.json();
    const supabase = getSupabaseClient();

    // Get original supplier
    const { data: supplier, error: fetchError } = await supabase
      .from("suppliers")
      .select("*")
      .eq("id", supplierId)
      .single();

    if (fetchError || !supplier) {
      return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
    }

    // Get exemption keywords
    const { data: keywords } = await supabase
      .from("gst_exemption_keywords")
      .select("*")
      .eq("supplier_id", supplierId);

    // Create duplicate
    const { data: newSupplier, error: insertError } = await supabase
      .from("suppliers")
      .insert({
        name: `${supplier.name} (Copy)`,
        gst_included: supplier.gst_included,
        discount_type: supplier.discount_type,
        discount_value: supplier.discount_value,
        regular_markup_type: supplier.regular_markup_type,
        regular_markup_value: supplier.regular_markup_value,
        vip_markup_type: supplier.vip_markup_type,
        vip_markup_value: supplier.vip_markup_value,
        column_mapping: supplier.column_mapping,
      })
      .select("id")
      .single();

    if (insertError || !newSupplier) {
      return NextResponse.json({ error: "Failed to duplicate supplier" }, { status: 500 });
    }

    // Duplicate keywords
    if (keywords && keywords.length > 0) {
      await supabase.from("gst_exemption_keywords").insert(
        keywords.map((kw: { keyword: string; target_column: string }) => ({
          supplier_id: newSupplier.id,
          keyword: kw.keyword,
          target_column: kw.target_column,
        }))
      );
    }

    return NextResponse.json({ id: newSupplier.id });
  } catch {
    return NextResponse.json({ error: "Duplication failed" }, { status: 500 });
  }
}
