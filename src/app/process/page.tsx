"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { parseFileForPreview, getSheetInfos, getCellValue, buildRowData, cleanPriceString } from "@/lib/xlsx-utils";
import { calculatePrices } from "@/lib/pricing";
import { validateRows, checkColumnMismatch } from "@/lib/validation";
import { toast } from "sonner";
import ValidationPanel from "@/components/ValidationPanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Supplier, GstExemptionKeyword, ProcessedRow, ValidationIssue, SheetInfo } from "@/lib/types";

export default function ProcessPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [exemptionKeywords, setExemptionKeywords] = useState<GstExemptionKeyword[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [sheetInfos, setSheetInfos] = useState<SheetInfo[]>([]);
  const [selectedSheet, setSelectedSheet] = useState("");
  const [processAllTabs, setProcessAllTabs] = useState(false);
  const [headers, setHeaders] = useState<string[]>([]);
  const [allRows, setAllRows] = useState<string[][]>([]);
  const [validationIssues, setValidationIssues] = useState<ValidationIssue[]>([]);
  const [validationDone, setValidationDone] = useState(false);
  const [fileMismatchError, setFileMismatchError] = useState<string | null>(null);
  const [previewRows, setPreviewRows] = useState<ProcessedRow[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [skippedRows, setSkippedRows] = useState(0);
  const [processingComplete, setProcessingComplete] = useState(false);

  useEffect(() => {
    supabase.from("suppliers").select("*").order("name").then(({ data }) => {
      setSuppliers(data || []);
      setLoading(false);
    });
  }, []);

  async function handleSupplierChange(id: string) {
    setSelectedSupplierId(id);
    setUploadedFile(null);
    setProcessingComplete(false);
    setPreviewRows([]);
    setValidationDone(false);
    setFileMismatchError(null);

    if (!id) { setSupplier(null); return; }

    const [supplierRes, keywordsRes] = await Promise.all([
      supabase.from("suppliers").select("*").eq("id", id).single(),
      supabase.from("gst_exemption_keywords").select("*").eq("supplier_id", id),
    ]);
    if (supplierRes.data) setSupplier(supplierRes.data);
    setExemptionKeywords(keywordsRes.data || []);
  }

  const runValidation = useCallback((hdrs: string[], rows: string[][]) => {
    if (!supplier) return;
    const { issues, cleanedRows } = validateRows(hdrs, rows, supplier.column_mapping);
    setAllRows(cleanedRows);
    setValidationIssues(issues);
    setValidationDone(true);
  }, [supplier]);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !supplier) return;
    setUploadedFile(file);
    setProcessingComplete(false);
    setPreviewRows([]);
    setFileMismatchError(null);
    setValidationDone(false);

    const buffer = await file.arrayBuffer();
    const infos = getSheetInfos(buffer);
    setSheetInfos(infos);
    const firstSheet = infos[0]?.name || "";
    setSelectedSheet(firstSheet);
    setProcessAllTabs(false);

    const { headers: h, rows } = parseFileForPreview(buffer, 50000, 1, firstSheet);
    setHeaders(h);
    setAllRows(rows);

    const mismatch = checkColumnMismatch(h, supplier.column_mapping, supplier.name);
    if (mismatch) { setFileMismatchError(mismatch); return; }
    runValidation(h, rows);
  }

  function handleFixRow(rowIndex: number, colIndex: number, newValue: string) {
    setAllRows((prev) => { const u = [...prev]; u[rowIndex] = [...u[rowIndex]]; u[rowIndex][colIndex] = newValue; return u; });
  }

  function handleProceed() {
    if (!supplier) return;
    setProcessing(true);
    const mapping = supplier.column_mapping;
    let skipped = 0;
    const processed: ProcessedRow[] = [];

    for (const row of allRows) {
      const mappedValues = Object.values(mapping).filter(Boolean).map((col) => getCellValue(row, headers, col).trim());
      if (mappedValues.every((v) => !v)) continue;
      const costRaw = getCellValue(row, headers, mapping.cost);
      const { value: costPrice } = cleanPriceString(costRaw);
      if (costPrice === null || costPrice <= 0) { skipped++; continue; }
      const productId = getCellValue(row, headers, mapping.id);
      if (!productId.trim()) { skipped++; continue; }
      const description = getCellValue(row, headers, mapping.description);
      const rowData = buildRowData(row, headers, mapping);
      const { regularPrice, vipPrice } = calculatePrices(costPrice, supplier, rowData, exemptionKeywords);
      processed.push({ wholesaler_code: productId, wholesaler_description: description, wholesaler_price: costPrice, bwa_code: `BWA-${productId}`, bwa_regular_price: regularPrice, bwa_vip_price: vipPrice });
    }

    setPreviewRows(processed.slice(0, 20));
    setTotalRows(processed.length);
    setSkippedRows(skipped);
    setProcessingComplete(true);
    setProcessing(false);
  }

  async function handleDownload() {
    if (!uploadedFile || !supplier) return;
    setDownloading(true);
    const formData = new FormData();
    formData.append("file", uploadedFile);
    formData.append("supplierId", selectedSupplierId);
    if (processAllTabs) formData.append("processAllTabs", "true");
    else formData.append("sheetName", selectedSheet);

    try {
      const res = await fetch("/api/process", { method: "POST", body: formData });
      if (!res.ok) { const d = await res.json(); toast.error(d.error || "Processing failed"); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] || "processed.xlsx";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("File downloaded");
    } catch { toast.error("Download failed"); }
    finally { setDownloading(false); }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading...</p>;

  return (
    <div className="max-w-5xl">
      <h1 className="text-lg font-semibold mb-6">Process Price Sheet</h1>

      {/* Supplier selector */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <Label>Select a supplier</Label>
          <Select value={selectedSupplierId} onValueChange={(v) => handleSupplierChange(v || "")}>
            <SelectTrigger className="mt-1 w-full max-w-md"><SelectValue placeholder="-- Choose supplier --" /></SelectTrigger>
            <SelectContent>
              {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Supplier summary */}
      {supplier && (
        <Card className="mb-6">
          <CardHeader className="pb-3"><CardTitle className="text-sm">{supplier.name} — Settings</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">GST: {supplier.gst_included ? "Incl" : "Excl"}</Badge>
              <Badge variant="secondary">Discount: {supplier.discount_type === "percentage" ? `${supplier.discount_value}%` : `$${Number(supplier.discount_value).toFixed(2)}`}</Badge>
              <Badge variant="secondary">Regular: {supplier.regular_markup_type === "percentage" ? `${supplier.regular_markup_value}%` : `$${Number(supplier.regular_markup_value).toFixed(2)}`}</Badge>
              <Badge variant="secondary">VIP: {supplier.vip_markup_type === "percentage" ? `${supplier.vip_markup_value}%` : `$${Number(supplier.vip_markup_value).toFixed(2)}`}</Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* File upload (only shown after supplier is selected) */}
      {supplier && (
        <Card className="mb-6">
          <CardContent className="pt-6">
            <Label>Upload Price Sheet (XLSX/CSV)</Label>
            <Input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} className="mt-1" />
          </CardContent>
        </Card>
      )}

      {/* Multi-tab selector */}
      {sheetInfos.length > 1 && (
        <Card className="mb-6">
          <CardHeader className="pb-3"><CardTitle className="text-sm">Multiple sheets detected</CardTitle></CardHeader>
          <CardContent>
            <div className="flex gap-4 items-center mb-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" checked={!processAllTabs} onChange={() => setProcessAllTabs(false)} className="accent-primary" /> Single tab
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" checked={processAllTabs} onChange={() => setProcessAllTabs(true)} className="accent-primary" /> Process all tabs
              </label>
            </div>
            {!processAllTabs && (
              <Select value={selectedSheet} onValueChange={(v) => v && setSelectedSheet(v)}>
                <SelectTrigger className="w-[250px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {sheetInfos.map((s) => <SelectItem key={s.name} value={s.name}>{s.name} ({s.rowCount} rows)</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </CardContent>
        </Card>
      )}

      {fileMismatchError && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-lg text-sm mb-6">{fileMismatchError}</div>
      )}

      {validationDone && !fileMismatchError && !processingComplete && supplier && (
        <div className="mb-6">
          <ValidationPanel issues={validationIssues} headers={headers} rows={allRows} mapping={supplier.column_mapping} onFixRow={handleFixRow} onRevalidate={() => runValidation(headers, allRows)} onProceed={handleProceed} validCount={allRows.length - validationIssues.length} />
        </div>
      )}

      {processing && <p className="text-sm text-muted-foreground">Processing...</p>}

      {processingComplete && previewRows.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm">Preview (first 20 rows)</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">{totalRows} rows processed{skippedRows > 0 && `, ${skippedRows} skipped`}</p>
              </div>
              <Button onClick={handleDownload} disabled={downloading}>{downloading ? "Generating..." : "Download XLSX"}</Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table className="border-collapse">
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs border-r border-border">Code</TableHead>
                    <TableHead className="text-xs text-right border-r border-border">Original</TableHead>
                    <TableHead className="text-xs border-r border-border">BWA Code</TableHead>
                    <TableHead className="text-xs text-right border-r border-border">Regular</TableHead>
                    <TableHead className="text-xs text-right">VIP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewRows.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-sm border-r border-border">{row.wholesaler_code}</TableCell>
                      <TableCell className="text-sm text-right border-r border-border">${row.wholesaler_price.toFixed(2)}</TableCell>
                      <TableCell className="text-sm border-r border-border">{row.bwa_code}</TableCell>
                      <TableCell className="text-sm text-right border-r border-border">${row.bwa_regular_price.toFixed(2)}</TableCell>
                      <TableCell className="text-sm text-right">${row.bwa_vip_price.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
