"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/Toast";
import type { Supplier } from "@/lib/types";

const COLUMN_OPTIONS = [
  { key: "wholesaler_code", label: "Wholesaler Code" },
  { key: "wholesaler_description", label: "Wholesaler Description" },
  { key: "wholesaler_price", label: "Wholesaler Price" },
  { key: "bwa_code", label: "BWA Code" },
  { key: "bwa_regular_price", label: "BWA Regular Customer Price" },
  { key: "bwa_vip_price", label: "BWA VIP Customer Price" },
];

export default function ExportPage() {
  const { showToast } = useToast();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([]);
  const [selectedColumns, setSelectedColumns] = useState<string[]>(
    COLUMN_OPTIONS.map((c) => c.key)
  );
  const [asOfDate, setAsOfDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split("T")[0];
  });
  const [format, setFormat] = useState<"tabs" | "flat">("tabs");
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    supabase
      .from("suppliers")
      .select("*")
      .order("name")
      .then(({ data }) => setSuppliers(data || []));
  }, []);

  function toggleSupplier(id: string) {
    setSelectedSuppliers((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  }

  function toggleColumn(key: string) {
    setSelectedColumns((prev) =>
      prev.includes(key) ? prev.filter((c) => c !== key) : [...prev, key]
    );
  }

  async function handleGenerate() {
    if (selectedColumns.length === 0) {
      showToast("Select at least one column", "error");
      return;
    }

    setGenerating(true);

    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asOfDate,
          supplierIds: selectedSuppliers,
          columns: selectedColumns,
          format,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        showToast(data.error || "Export failed", "error");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const disposition = res.headers.get("Content-Disposition");
      const filenameMatch = disposition?.match(/filename="(.+)"/);
      a.download = filenameMatch?.[1] || "export.xlsx";
      a.click();
      URL.revokeObjectURL(url);
      showToast("Export downloaded");
    } catch {
      showToast("Export failed", "error");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-lg font-bold mb-6">Master Export</h1>

      {/* Date picker */}
      <section className="border border-[#E5E5E5] rounded-lg p-5 mb-6">
        <h2 className="font-bold text-sm mb-3">Date</h2>
        <p className="text-xs text-gray-500 mb-2">
          Show prices as of this date (uses the most recent processing run on or before this date).
        </p>
        <input
          type="date"
          value={asOfDate}
          onChange={(e) => setAsOfDate(e.target.value)}
          className="border border-[#E5E5E5] rounded px-3 py-2 text-sm"
        />
      </section>

      {/* Supplier filter */}
      <section className="border border-[#E5E5E5] rounded-lg p-5 mb-6">
        <h2 className="font-bold text-sm mb-3">Suppliers</h2>
        <p className="text-xs text-gray-500 mb-2">
          Leave all unchecked to include all suppliers.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
          {suppliers.map((s) => (
            <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer py-0.5">
              <input
                type="checkbox"
                checked={selectedSuppliers.includes(s.id)}
                onChange={() => toggleSupplier(s.id)}
                className="accent-[#111]"
              />
              {s.name}
            </label>
          ))}
        </div>
      </section>

      {/* Column filter */}
      <section className="border border-[#E5E5E5] rounded-lg p-5 mb-6">
        <h2 className="font-bold text-sm mb-3">Columns</h2>
        <div className="space-y-1">
          {COLUMN_OPTIONS.map((col) => (
            <label key={col.key} className="flex items-center gap-2 text-sm cursor-pointer py-0.5">
              <input
                type="checkbox"
                checked={selectedColumns.includes(col.key)}
                onChange={() => toggleColumn(col.key)}
                className="accent-[#111]"
              />
              {col.label}
            </label>
          ))}
        </div>
      </section>

      {/* Output format */}
      <section className="border border-[#E5E5E5] rounded-lg p-5 mb-6">
        <h2 className="font-bold text-sm mb-3">Format</h2>
        <div className="flex gap-6">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="radio"
              checked={format === "tabs"}
              onChange={() => setFormat("tabs")}
              className="accent-[#111]"
            />
            Separate tabs per supplier
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="radio"
              checked={format === "flat"}
              onChange={() => setFormat("flat")}
              className="accent-[#111]"
            />
            Single flat sheet
          </label>
        </div>
      </section>

      <button
        onClick={handleGenerate}
        disabled={generating || selectedColumns.length === 0}
        className="bg-[#111] text-white px-6 py-2 rounded font-bold text-sm hover:bg-black disabled:opacity-50 transition"
      >
        {generating ? "Generating..." : "Generate & Download"}
      </button>
    </div>
  );
}
