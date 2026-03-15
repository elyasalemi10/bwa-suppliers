import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      asOfDate,
      supplierIds,
      columns,
      format,
    }: {
      asOfDate: string;
      supplierIds: string[];
      columns: string[];
      format: "tabs" | "flat";
    } = body;

    const supabase = getSupabaseClient();

    // Step 1: Find the most recent processing_history entry per supplier on or before asOfDate
    let historyQuery = supabase
      .from("processing_history")
      .select("id, supplier_id")
      .lte("processed_at", asOfDate + "T23:59:59.999Z")
      .order("processed_at", { ascending: false });

    if (supplierIds.length > 0) {
      historyQuery = historyQuery.in("supplier_id", supplierIds);
    }

    const { data: allHistory, error: histErr } = await historyQuery;
    if (histErr) {
      return NextResponse.json({ error: histErr.message }, { status: 500 });
    }

    // Keep only the most recent run per supplier
    const latestRunPerSupplier = new Map<string, string>();
    for (const h of allHistory || []) {
      if (!latestRunPerSupplier.has(h.supplier_id)) {
        latestRunPerSupplier.set(h.supplier_id, h.id);
      }
    }

    const historyIds = Array.from(latestRunPerSupplier.values());

    if (historyIds.length === 0) {
      return NextResponse.json({ error: "No processing runs found for the selected date and suppliers" }, { status: 404 });
    }

    // Step 2: Pull product_index rows for those specific processing_history_ids
    const { data: products, error: prodErr } = await supabase
      .from("product_index")
      .select("*")
      .in("processing_history_id", historyIds);

    if (prodErr) {
      return NextResponse.json({ error: prodErr.message }, { status: 500 });
    }

    // Column definitions
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const COLUMN_MAP: Record<string, { header: string; getValue: (p: any) => string | number }> = {
      wholesaler_code: { header: "Wholesaler Code", getValue: (p) => p.original_code || "" },
      wholesaler_description: { header: "Wholesaler Description", getValue: (p) => p.description || "" },
      wholesaler_price: { header: "Wholesaler Price", getValue: (p) => p.original_price || 0 },
      bwa_code: { header: "BWA Code", getValue: (p) => p.bwa_code || "" },
      bwa_regular_price: { header: "BWA Regular Customer Price", getValue: (p) => p.regular_price || 0 },
      bwa_vip_price: { header: "BWA VIP Customer Price", getValue: (p) => p.vip_price || 0 },
    };

    const selectedColumns = columns.filter((c) => COLUMN_MAP[c]);
    const headers = selectedColumns.map((c) => COLUMN_MAP[c].header);

    const workbook = XLSX.utils.book_new();

    if (format === "tabs") {
      const bySupplier = new Map<string, typeof products>();
      for (const p of products || []) {
        const existing = bySupplier.get(p.supplier_name) || [];
        existing.push(p);
        bySupplier.set(p.supplier_name, existing);
      }

      for (const [supplierName, supplierProducts] of bySupplier) {
        const rows = supplierProducts.map((p) =>
          selectedColumns.map((c) => COLUMN_MAP[c].getValue(p))
        );
        const sheetData = [headers, ...rows];
        const sheet = XLSX.utils.aoa_to_sheet(sheetData);
        sheet["!cols"] = headers.map(() => ({ wch: 20 }));
        XLSX.utils.book_append_sheet(workbook, sheet, supplierName.substring(0, 31));
      }
    } else {
      const flatHeaders = ["Supplier", ...headers];
      const rows = (products || []).map((p) => [
        p.supplier_name,
        ...selectedColumns.map((c) => COLUMN_MAP[c].getValue(p)),
      ]);
      const sheetData = [flatHeaders, ...rows];
      const sheet = XLSX.utils.aoa_to_sheet(sheetData);
      sheet["!cols"] = flatHeaders.map(() => ({ wch: 20 }));
      XLSX.utils.book_append_sheet(workbook, sheet, "All Products");
    }

    const xlsxBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    const now = new Date();
    const dd = String(now.getDate()).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const yyyy = now.getFullYear();
    const filename = `bwa-master-export-${dd}-${mm}-${yyyy}.xlsx`;

    return new NextResponse(xlsxBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("Export error:", err);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
