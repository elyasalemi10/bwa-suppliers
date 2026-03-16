"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ParsedConfig, SupplierMarkup, ColumnMapping } from "@/lib/types";

interface SupplierInfo {
  code: string;
  name: string;
  categories: string[];
}

export default function ProcessPageWrapper() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading...</p>}>
      <ProcessPage />
    </Suspense>
  );
}

function ProcessPage() {
  const searchParams = useSearchParams();
  const preselectedSupplier = searchParams.get("supplier") || "";

  const [suppliers, setSuppliers] = useState<SupplierInfo[]>([]);
  const [parsedConfig, setParsedConfig] = useState<ParsedConfig | null>(null);
  const [selectedCode, setSelectedCode] = useState(preselectedSupplier);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  // Manual column mapping (for suppliers without config mapping)
  const [needsMapping, setNeedsMapping] = useState(false);
  const [manualMapping, setManualMapping] = useState<Partial<ColumnMapping>>({});

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((data) => {
        if (data.config) {
          setSuppliers(data.config.suppliers);
          setParsedConfig(data.parsedConfig);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const selectedSupplier = suppliers.find((s) => s.code === selectedCode);
  const supplierMarkups = parsedConfig?.markups.filter((m) => m.supplierCode === selectedCode) || [];
  const hasColumnMapping = parsedConfig?.columnMappings?.some((m) => m.supplierCode === selectedCode);

  async function handleProcess(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selectedCode) return;

    setProcessing(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("supplierCode", selectedCode);

    if (needsMapping || !hasColumnMapping) {
      formData.append("columnMapping", JSON.stringify({
        supplierCode: selectedCode,
        itemCodeCol: manualMapping.itemCodeCol || 1,
        descriptionCol: manualMapping.descriptionCol || 2,
        unitCol: manualMapping.unitCol,
        costPriceCol: manualMapping.costPriceCol || 3,
        pcsBoxCol: manualMapping.pcsBoxCol,
        m2BoxCol: manualMapping.m2BoxCol,
        m2PalletCol: manualMapping.m2PalletCol,
        piecesPerSqmCol: manualMapping.piecesPerSqmCol,
      }));
    }

    try {
      const res = await fetch("/api/process", { method: "POST", body: formData });

      if (!res.ok) {
        const data = await res.json();
        if (data.needsMapping) {
          setNeedsMapping(true);
          toast.error("Column mapping required — please specify column positions below");
          setProcessing(false);
          return;
        }
        toast.error(data.error || "Processing failed");
        setProcessing(false);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] || "processed.xlsx";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("File processed and downloaded");
    } catch {
      toast.error("Processing failed");
    } finally {
      setProcessing(false);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading...</p>;

  if (suppliers.length === 0) {
    return (
      <div>
        <h1 className="text-lg font-semibold mb-6">Process Price Sheet</h1>
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No config loaded. Please upload a config file first.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-lg font-semibold mb-6">Process Price Sheet</h1>

      {/* Supplier selector */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <Label>Select Supplier</Label>
          <Select value={selectedCode} onValueChange={(v) => { setSelectedCode(v || ""); setNeedsMapping(false); }}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="-- Choose supplier --" /></SelectTrigger>
            <SelectContent>
              {suppliers.map((s) => (
                <SelectItem key={s.code} value={s.code}>
                  {s.code} — {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Supplier settings summary */}
      {selectedSupplier && supplierMarkups.length > 0 && (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">{selectedSupplier.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {supplierMarkups.map((m: SupplierMarkup, i: number) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <Badge variant="outline">{m.category || "—"}</Badge>
                  <span className="text-muted-foreground">
                    Trade {m.tradePct}% · Retail {m.retailPct}% · Reg Trade {m.regionalTradePct}% · Reg Retail {m.regionalRetailPct}%
                  </span>
                </div>
              ))}
            </div>
            {!hasColumnMapping && (
              <p className="text-xs text-amber-600 mt-3">
                No column mapping in config — you&apos;ll need to specify column positions.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Manual column mapping (if needed) */}
      {selectedCode && (needsMapping || !hasColumnMapping) && (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Column Mapping</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">
              Enter the 1-indexed column numbers for each field in the supplier&apos;s price list.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { key: "itemCodeCol", label: "Item Code Col" },
                { key: "descriptionCol", label: "Description Col" },
                { key: "costPriceCol", label: "Cost Price Col" },
                { key: "unitCol", label: "Unit Col" },
                { key: "pcsBoxCol", label: "Pcs/Box Col" },
                { key: "m2BoxCol", label: "m2/Box Col" },
                { key: "m2PalletCol", label: "m2/Pallet Col" },
                { key: "piecesPerSqmCol", label: "Pcs/Sqm Col" },
              ].map(({ key, label }) => (
                <div key={key}>
                  <Label className="text-xs">{label}</Label>
                  <Input
                    type="number"
                    min={1}
                    value={manualMapping[key as keyof ColumnMapping] as number || ""}
                    onChange={(e) =>
                      setManualMapping((prev) => ({
                        ...prev,
                        [key]: parseInt(e.target.value) || undefined,
                      }))
                    }
                    className="mt-1"
                    placeholder="—"
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* File upload */}
      {selectedCode && (
        <Card>
          <CardContent className="pt-6">
            <Label>Upload Price List</Label>
            <Input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleProcess}
              disabled={processing}
              className="mt-1"
            />
            {processing && (
              <p className="text-xs text-muted-foreground mt-2">Processing and generating output...</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
