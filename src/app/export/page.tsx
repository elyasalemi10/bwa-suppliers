"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
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
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([]);
  const [selectedColumns, setSelectedColumns] = useState<string[]>(COLUMN_OPTIONS.map((c) => c.key));
  const [asOfDate, setAsOfDate] = useState<Date>(new Date());
  const [format, setFormat] = useState<"tabs" | "flat">("tabs");
  const [generating, setGenerating] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  useEffect(() => {
    supabase.from("suppliers").select("*").order("name").then(({ data }) => setSuppliers(data || []));
  }, []);

  function toggleSupplier(id: string) {
    setSelectedSuppliers((prev) => prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]);
  }

  function toggleColumn(key: string) {
    setSelectedColumns((prev) => prev.includes(key) ? prev.filter((c) => c !== key) : [...prev, key]);
  }

  async function handleGenerate() {
    if (selectedColumns.length === 0) { toast.error("Select at least one column"); return; }
    setGenerating(true);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asOfDate: asOfDate.toISOString().split("T")[0], supplierIds: selectedSuppliers, columns: selectedColumns, format }),
      });
      if (!res.ok) { const d = await res.json(); toast.error(d.error || "Export failed"); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] || "export.xlsx";
      a.click(); URL.revokeObjectURL(url);
      toast.success("Export downloaded");
    } catch { toast.error("Export failed"); }
    finally { setGenerating(false); }
  }

  const formattedDate = asOfDate.toLocaleDateString("en-AU", { day: "2-digit", month: "2-digit", year: "numeric" });

  return (
    <div className="max-w-3xl">
      <h1 className="text-lg font-semibold mb-6">Master Export</h1>

      <Card className="mb-6">
        <CardHeader className="pb-3"><CardTitle className="text-sm">Date</CardTitle></CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-2">Uses the most recent processing run on or before this date.</p>
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger render={<Button variant="outline" className="w-[200px] justify-start text-left font-normal">{formattedDate}</Button>} />
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={asOfDate} onSelect={(d) => { if (d) { setAsOfDate(d); setCalendarOpen(false); } }} initialFocus />
            </PopoverContent>
          </Popover>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader className="pb-3"><CardTitle className="text-sm">Suppliers</CardTitle></CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-2">Leave all unchecked to include all suppliers.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
            {suppliers.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer py-0.5">
                <input type="checkbox" checked={selectedSuppliers.includes(s.id)} onChange={() => toggleSupplier(s.id)} className="accent-primary" />
                {s.name}
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader className="pb-3"><CardTitle className="text-sm">Columns</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-1">
            {COLUMN_OPTIONS.map((col) => (
              <label key={col.key} className="flex items-center gap-2 text-sm cursor-pointer py-0.5">
                <input type="checkbox" checked={selectedColumns.includes(col.key)} onChange={() => toggleColumn(col.key)} className="accent-primary" />
                {col.label}
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader className="pb-3"><CardTitle className="text-sm">Format</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="radio" checked={format === "tabs"} onChange={() => setFormat("tabs")} className="accent-primary" />
              Separate tabs per supplier
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="radio" checked={format === "flat"} onChange={() => setFormat("flat")} className="accent-primary" />
              Single flat sheet
            </label>
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleGenerate} disabled={generating || selectedColumns.length === 0}>
        {generating ? "Generating..." : "Generate & Download"}
      </Button>
    </div>
  );
}
