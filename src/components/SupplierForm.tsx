"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { parseFileForPreview, getSheetInfos } from "@/lib/xlsx-utils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import type { Supplier, ColumnMapping, GstExemptionKeyword, SheetInfo } from "@/lib/types";

const CODE_KEYWORDS = ["code", "product code", "item code", "sku", "product id", "item id", "part number", "part no", "article", "ref", "reference", "item no", "item number", "catalogue", "cat no", "model", "stock code"];
const COST_KEYWORDS = ["price", "cost", "rrp", "wholesale", "trade", "unit price", "sell", "net", "amount", "value", "each", "rate", "charge"];

function autoMatchColumn(headers: string[], keywords: string[]): string | null {
  for (const header of headers) {
    const lower = header.toLowerCase().trim();
    for (const kw of keywords) {
      if (lower.includes(kw)) return header;
    }
  }
  return null;
}

interface SupplierFormProps {
  existingSupplier?: Supplier & { gst_exemption_keywords?: GstExemptionKeyword[] };
}

export default function SupplierForm({ existingSupplier }: SupplierFormProps) {
  const router = useRouter();
  const isEditing = !!existingSupplier;

  const [name, setName] = useState(existingSupplier?.name || "");
  const [gstIncluded, setGstIncluded] = useState(existingSupplier?.gst_included ?? true);
  const [discountType, setDiscountType] = useState<"percentage" | "fixed">(existingSupplier?.discount_type || "percentage");
  const [discountValue, setDiscountValue] = useState(existingSupplier?.discount_value?.toString() || "0");
  const [regularMarkupType, setRegularMarkupType] = useState<"percentage" | "fixed">(existingSupplier?.regular_markup_type || "percentage");
  const [regularMarkupValue, setRegularMarkupValue] = useState(existingSupplier?.regular_markup_value?.toString() || "0");
  const [vipMarkupType, setVipMarkupType] = useState<"percentage" | "fixed">(existingSupplier?.vip_markup_type || "percentage");
  const [vipMarkupValue, setVipMarkupValue] = useState(existingSupplier?.vip_markup_value?.toString() || "0");
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>(
    existingSupplier?.column_mapping || { id: null, cost: null, brand: null, description: null, quantity: null }
  );
  const [headers, setHeaders] = useState<string[]>([]);
  const [allRawRows, setAllRawRows] = useState<string[][]>([]);
  const [fileBuffer, setFileBuffer] = useState<ArrayBuffer | null>(null);
  const [sheetInfos, setSheetInfos] = useState<SheetInfo[]>([]);
  const [selectedSheet, setSelectedSheet] = useState("");
  const [headerRow, setHeaderRow] = useState(1);
  const [exemptionKeywords, setExemptionKeywords] = useState<GstExemptionKeyword[]>(existingSupplier?.gst_exemption_keywords || []);
  const [newKeyword, setNewKeyword] = useState("");
  const [newTargetColumn, setNewTargetColumn] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (existingSupplier?.id && !existingSupplier.gst_exemption_keywords) {
      supabase.from("gst_exemption_keywords").select("*").eq("supplier_id", existingSupplier.id)
        .then(({ data }) => { if (data) setExemptionKeywords(data); });
    }
  }, [existingSupplier]);

  function reparseFile(buffer: ArrayBuffer, hRow: number, sheet?: string) {
    const { headers: h, allRawRows: rawRows } = parseFileForPreview(buffer, 10, hRow, sheet);
    setHeaders(h);
    setAllRawRows(rawRows);

    // Auto-match columns
    const matchedCode = autoMatchColumn(h, CODE_KEYWORDS);
    const matchedCost = autoMatchColumn(h, COST_KEYWORDS);
    // Make sure we don't double-match
    const costMatch = matchedCost && matchedCost !== matchedCode ? matchedCost : null;
    setColumnMapping({ id: matchedCode, cost: costMatch, brand: null, description: null, quantity: null });
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const buffer = await file.arrayBuffer();
    setFileBuffer(buffer);
    const infos = getSheetInfos(buffer);
    setSheetInfos(infos);
    const firstSheet = infos[0]?.name || "";
    setSelectedSheet(firstSheet);
    setHeaderRow(1);
    reparseFile(buffer, 1, firstSheet);
  }

  function handleHeaderRowChange(val: number) {
    setHeaderRow(val);
    if (fileBuffer) reparseFile(fileBuffer, val, selectedSheet);
  }

  function handleSheetChange(sheetName: string) {
    setSelectedSheet(sheetName);
    if (fileBuffer) reparseFile(fileBuffer, headerRow, sheetName);
  }

  function resetMapping() {
    setColumnMapping({ id: null, cost: null, brand: null, description: null, quantity: null });
  }

  // Build dropdown options — exclude the column selected for the other field
  const codeOptions = headers.filter((h) => h !== columnMapping.cost);
  const costOptions = headers.filter((h) => h !== columnMapping.id);

  function addExemptionKeyword() {
    if (!newKeyword.trim() || !newTargetColumn) return;
    setExemptionKeywords((prev) => [...prev, { keyword: newKeyword.trim(), target_column: newTargetColumn }]);
    setNewKeyword("");
    setNewTargetColumn("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) { setError("Supplier name is required."); return; }
    if (!columnMapping.id || !columnMapping.cost) { setError("Product Code and Cost Price column mappings are required."); return; }

    setSaving(true);
    const supplierData = {
      name: name.trim(),
      gst_included: gstIncluded,
      discount_type: discountType,
      discount_value: parseFloat(discountValue) || 0,
      regular_markup_type: regularMarkupType,
      regular_markup_value: parseFloat(regularMarkupValue) || 0,
      vip_markup_type: vipMarkupType,
      vip_markup_value: parseFloat(vipMarkupValue) || 0,
      column_mapping: columnMapping,
      updated_at: new Date().toISOString(),
    };

    try {
      let supplierId: string;
      if (isEditing) {
        const { error: updateError } = await supabase.from("suppliers").update(supplierData).eq("id", existingSupplier.id);
        if (updateError) throw updateError;
        supplierId = existingSupplier.id;
      } else {
        const { data, error: insertError } = await supabase.from("suppliers").insert(supplierData).select("id").single();
        if (insertError) throw insertError;
        supplierId = data.id;
      }

      await supabase.from("gst_exemption_keywords").delete().eq("supplier_id", supplierId);
      if (exemptionKeywords.length > 0) {
        const { error: kwError } = await supabase.from("gst_exemption_keywords").insert(
          exemptionKeywords.map((kw) => ({ supplier_id: supplierId, keyword: kw.keyword, target_column: kw.target_column }))
        );
        if (kwError) throw kwError;
      }

      toast.success(isEditing ? "Supplier updated" : "Supplier created");
      router.push(isEditing ? `/suppliers/${supplierId}` : "/");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-3xl">
      {error && <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-lg text-sm">{error}</div>}

      {/* Step 1: Name & File */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">1. Supplier Name & Sample File</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Supplier Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Pacific Trading Co" required className="mt-1" />
          </div>
          <div>
            <Label>Upload Sample Price Sheet (XLSX/CSV)</Label>
            <Input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} className="mt-1" />
            {isEditing && !headers.length && <p className="text-xs text-muted-foreground mt-1">Upload a new file to update column mapping, or leave as-is.</p>}
          </div>
        </CardContent>
      </Card>

      {/* Step 2: Column Mapping */}
      {(headers.length > 0 || isEditing) && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">2. Column Mapping</CardTitle></CardHeader>
          <CardContent>
            {fileBuffer && (
              <div className="flex gap-4 mb-4">
                {sheetInfos.length > 1 && (
                  <div>
                    <Label>Sheet/Tab</Label>
                    <Select value={selectedSheet} onValueChange={(v) => v && handleSheetChange(v)}>
                      <SelectTrigger className="mt-1 w-[200px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {sheetInfos.map((s) => <SelectItem key={s.name} value={s.name}>{s.name} ({s.rowCount} rows)</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div>
                  <Label>Header row</Label>
                  <Input type="number" min={1} max={20} value={headerRow} onChange={(e) => handleHeaderRowChange(parseInt(e.target.value) || 1)} className="mt-1 w-20" />
                </div>
              </div>
            )}

            {allRawRows.length > 0 && (
              <div className="mb-4 overflow-x-auto">
                <p className="text-xs text-muted-foreground mb-1">Raw preview (header row highlighted):</p>
                <table className="text-[11px] border border-border min-w-full">
                  <tbody>
                    {allRawRows.map((row, ri) => (
                      <tr key={ri} className={ri === headerRow - 1 ? "bg-primary/10 font-semibold" : ri % 2 === 1 ? "bg-muted/50" : ""}>
                        <td className="px-1 py-0.5 border-r border-border text-muted-foreground text-[10px] w-10 min-w-[40px] max-w-[40px] text-center">{ri + 1}</td>
                        {row.map((cell, ci) => (
                          <td key={ci} className="px-1.5 py-0.5 border-b border-border/50 whitespace-nowrap max-w-[150px] truncate">{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
              <div>
                <Label>Product Code / ID <span className="text-destructive">*</span></Label>
                <Select value={columnMapping.id || ""} onValueChange={(v) => setColumnMapping((prev) => ({ ...prev, id: v || null }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="-- Select column --" /></SelectTrigger>
                  <SelectContent>
                    {codeOptions.map((h) => (
                      <SelectItem key={h} value={h}>{h}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Cost Price <span className="text-destructive">*</span></Label>
                <Select value={columnMapping.cost || ""} onValueChange={(v) => setColumnMapping((prev) => ({ ...prev, cost: v || null }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="-- Select column --" /></SelectTrigger>
                  <SelectContent>
                    {costOptions.map((h) => (
                      <SelectItem key={h} value={h}>{h}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {headers.length > 0 && (
              <Button type="button" variant="ghost" size="xs" onClick={resetMapping}>Reset Mapping</Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 3: GST Setting */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">3. GST Setting</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input type="radio" checked={gstIncluded} onChange={() => setGstIncluded(true)} className="accent-primary" />
              Prices include GST
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input type="radio" checked={!gstIncluded} onChange={() => setGstIncluded(false)} className="accent-primary" />
              Prices exclude GST
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Step 4: Discount */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">4. Manufacturer Discount</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <Label>Value</Label>
              <Input type="number" step="any" min="0" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={discountType} onValueChange={(v) => v && setDiscountType(v as "percentage" | "fixed")}>
                <SelectTrigger className="mt-1 w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">%</SelectItem>
                  <SelectItem value="fixed">$</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Step 5: Regular Markup */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">5. Regular Customer Markup</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <Label>Value</Label>
              <Input type="number" step="any" min="0" value={regularMarkupValue} onChange={(e) => setRegularMarkupValue(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={regularMarkupType} onValueChange={(v) => v && setRegularMarkupType(v as "percentage" | "fixed")}>
                <SelectTrigger className="mt-1 w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">%</SelectItem>
                  <SelectItem value="fixed">$</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Step 6: VIP Markup */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">6. VIP Customer Markup</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <Label>Value</Label>
              <Input type="number" step="any" min="0" value={vipMarkupValue} onChange={(e) => setVipMarkupValue(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={vipMarkupType} onValueChange={(v) => v && setVipMarkupType(v as "percentage" | "fixed")}>
                <SelectTrigger className="mt-1 w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">%</SelectItem>
                  <SelectItem value="fixed">$</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Step 7: GST Exemptions */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">7. GST Exemption Keywords</CardTitle></CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">If a keyword is found (case-insensitive) in the specified column, that product won&apos;t have GST added.</p>
          {exemptionKeywords.length > 0 && (
            <div className="mb-3 space-y-1">
              {exemptionKeywords.map((kw, i) => (
                <div key={i} className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2 text-xs">
                  <Badge variant="outline">&quot;{kw.keyword}&quot;</Badge>
                  <span className="text-muted-foreground">in</span>
                  <span className="font-medium">{kw.target_column}</span>
                  <Button type="button" variant="ghost" size="xs" className="ml-auto text-destructive" onClick={() => setExemptionKeywords((prev) => prev.filter((_, idx) => idx !== i))}>Remove</Button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Label>Keyword</Label>
              <Input value={newKeyword} onChange={(e) => setNewKeyword(e.target.value)} placeholder="e.g. mobility accessory" className="mt-1" />
            </div>
            <div>
              <Label>Search In</Label>
              <Select value={newTargetColumn} onValueChange={(v) => setNewTargetColumn(v || "")}>
                <SelectTrigger className="mt-1 w-[160px]"><SelectValue placeholder="Column..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="id">Product Code</SelectItem>
                  <SelectItem value="cost">Cost Price</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addExemptionKeyword} disabled={!newKeyword.trim() || !newTargetColumn}>Add</Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button type="submit" disabled={saving}>{saving ? "Saving..." : isEditing ? "Update Supplier" : "Create Supplier"}</Button>
        <Button type="button" variant="outline" onClick={() => router.push(isEditing ? `/suppliers/${existingSupplier.id}` : "/")}>Cancel</Button>
      </div>
    </form>
  );
}
