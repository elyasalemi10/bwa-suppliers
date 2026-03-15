import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { deleteFromR2 } from "@/lib/r2";

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();
    const supabase = getSupabaseClient();

    // Get history entry to find R2 keys
    const { data: entry } = await supabase
      .from("processing_history")
      .select("*")
      .eq("id", id)
      .single();

    if (!entry) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    // Delete from R2 (keys are stored as URLs or paths)
    try {
      // Extract key from URL if needed
      const originalKey = entry.original_file_url.includes("://")
        ? new URL(entry.original_file_url).pathname.substring(1)
        : entry.original_file_url;
      const processedKey = entry.processed_file_url.includes("://")
        ? new URL(entry.processed_file_url).pathname.substring(1)
        : entry.processed_file_url;

      await Promise.all([
        deleteFromR2(originalKey),
        deleteFromR2(processedKey),
      ]);
    } catch (r2Err) {
      console.error("R2 deletion error:", r2Err);
    }

    // Delete product index entries
    await supabase.from("product_index").delete().eq("processing_history_id", id);

    // Delete history entry
    await supabase.from("processing_history").delete().eq("id", id);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Deletion failed" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { id, notes } = await request.json();
    const supabase = getSupabaseClient();

    const { error } = await supabase
      .from("processing_history")
      .update({ notes })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
