import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q") || "";
    const supplierId = searchParams.get("supplier") || "";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = 50;
    const offset = (page - 1) * limit;

    if (!query.trim()) {
      return NextResponse.json({ results: [], total: 0 });
    }

    const supabase = getSupabaseClient();

    // Use ILIKE for search across multiple fields
    const searchPattern = `%${query}%`;

    let queryBuilder = supabase
      .from("product_index")
      .select("*", { count: "exact" })
      .or(
        `original_code.ilike.${searchPattern},bwa_code.ilike.${searchPattern},description.ilike.${searchPattern},brand.ilike.${searchPattern}`
      )
      .order("processed_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (supplierId) {
      queryBuilder = queryBuilder.eq("supplier_id", supplierId);
    }

    const { data, count, error } = await queryBuilder;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ results: data || [], total: count || 0 });
  } catch {
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
