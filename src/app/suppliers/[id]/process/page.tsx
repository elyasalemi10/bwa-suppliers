"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { parseFileForPreview, getSheetInfos, getCellValue, buildRowData, cleanPriceString } from "@/lib/xlsx-utils";
import { calculatePrices } from "@/lib/pricing";
import { validateRows, checkColumnMismatch } from "@/lib/validation";
import { useToast } from "@/components/Toast";
import ValidationPanel from "@/components/ValidationPanel";
import type { Supplier, GstExemptionKeyword, ProcessedRow, ValidationIssue, SheetInfo } from "@/lib/types";

export default function ProcessSheetPage() {
  const params = useParams();
  const id = params.id as string;
  const { showToast } = useToast();

  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [exemptionKeywords, setExemptionKeywords] = useState<GstExemptionKeyword[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // File state
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [sheetInfos, setSheetInfos] = useState<SheetInfo[]>([]);
  const [selectedSheet, setSelectedSheet] = useState("");
  const [processAllTabs, setProcessAllTabs] = useState(false);

  // Validation state
  const [headers, setHeaders] = useState<string[]>([]);
  const [allRows, setAllRows] = useState<string[][]>([]);
  const [validationIssues, setValidationIssues] = useState<ValidationIssue[]>([]);
  const [validationDone, setValidationDone] = useState(false);
  const [fileMismatchError, setFileMismatchError] = useState<string | null>(null);

  // Processing state
  const [previewRows, setPreviewRows] = useState<ProcessedRow[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [skippedRows, setSkippedRows] = useState(0);
  const [processingComplete, setProcessingComplete] = useState(false);

  useEffect(() => {
    async function load() {
      const [supplierRes, keywordsRes] = await Promise.all([
        supabase.from("suppliers").select("*").eq("id", id).single(),
        supabase.from("gst_exemption_keywords").select("*").eq("supplier_id", id),
      ]);
      if (supplierRes.error) {
        showToast("Supplier not found", "error");
      } else {
        setSupplier(supplierRes.data);
      }
      setExemptionKeywords(keywordsRes.data || []);
      setLoading(false);
    }
    load();
  }, [id, showToast]);

  const runValidation = useCallback(
    (hdrs: string[], rows: string[][]) => {
      if (!supplier) return;
      const { issues, cleanedRows } = validateRows(hdrs, rows, supplier.column_mapping);
      setAllRows(cleanedRows);
      setValidationIssues(issues);
      setValidationDone(true);
    },
    [supplier]
  );

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

    // Parse and check for column mismatch
    const { headers: h, rows } = parseFileForPreview(buffer, 50000, 1, firstSheet);
    setHeaders(h);
    setAllRows(rows);

    const mismatch = checkColumnMismatch(h, supplier.column_mapping, supplier.name);
    if (mismatch) {
      setFileMismatchError(mismatch);
      return;
    }

    runValidation(h, rows);
  }

  function handleFixRow(rowIndex: number, colIndex: number, newValue: string) {
    setAllRows((prev) => {
      const updated = [...prev];
      updated[rowIndex] = [...updated[rowIndex]];
      updated[rowIndex][colIndex] = newValue;
      return updated;
    });
  }

  function handleRevalidate() {
    runValidation(headers, allRows);
  }

  function handleProceed() {
    if (!supplier) return;
    setProcessing(true);

    const mapping = supplier.column_mapping;
    let skipped = 0;
    const processed: ProcessedRow[] = [];

    for (const row of allRows) {
      // Skip empty rows
      const mappedValues = Object.values(mapping)
        .filter(Boolean)
        .map((col) => getCellValue(row, headers, col).trim());
      if (mappedValues.every((v) => !v)) continue;

      const costRaw = getCellValue(row, headers, mapping.cost);
      const { value: costPrice } = cleanPriceString(costRaw);

      if (costPrice === null || costPrice <= 0) {
        skipped++;
        continue;
      }

      const productId = getCellValue(row, headers, mapping.id);
      if (!productId.trim()) {
        skipped++;
        continue;
      }

      const description = getCellValue(row, headers, mapping.description);
      const rowData = buildRowData(row, headers, mapping);
      const { regularPrice, vipPrice } = calculatePrices(costPrice, supplier, rowData, exemptionKeywords);

      processed.push({
        wholesaler_code: productId,
        wholesaler_description: description,
        wholesaler_price: costPrice,
        bwa_code: `BWA-${productId}`,
        bwa_regular_price: regularPrice,
        bwa_vip_price: vipPrice,
      });
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
    formData.append("supplierId", id);
    if (processAllTabs) {
      formData.append("processAllTabs", "true");
    } else {
      formData.append("sheetName", selectedSheet);
    }

    try {
      const res = await fetch("/api/process", { method: "POST", body: formData });

      if (!res.ok) {
        const errData = await res.json();
        showToast(errData.error || "Processing failed", "error");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // Use the filename from Content-Disposition header
      const disposition = res.headers.get("Content-Disposition");
      const filenameMatch = disposition?.match(/filename="(.+)"/);
      a.download = filenameMatch?.[1] || "processed.xlsx";
      a.click();
      URL.revokeObjectURL(url);
      showToast("File downloaded successfully");
    } catch {
      showToast("Download failed", "error");
    } finally {
      setDownloading(false);
    }
  }

  if (loading) return <p className="text-sm text-gray-500">Loading...</p>;
  if (!supplier) return <p className="text-sm text-[#DC2626]">Supplier not found.</p>;

  return (
    <div>
      <h1 className="text-lg font-bold mb-1">Process Sheet: {supplier.name}</h1>
      <p className="text-xs text-gray-500 mb-6">
        GST: {supplier.gst_included ? "Included" : "Excluded"} | Discount: {supplier.discount_value}
        {supplier.discount_type === "percentage" ? "%" : "$"} | Regular: {supplier.regular_markup_value}
        {supplier.regular_markup_type === "percentage" ? "%" : "$"} | VIP: {supplier.vip_markup_value}
        {supplier.vip_markup_type === "percentage" ? "%" : "$"}
      </p>

      {/* File Upload */}
      <div className="border border-[#E5E5E5] rounded-lg p-5 mb-6">
        <label className="block text-xs font-bold mb-2">Upload Price Sheet (XLSX/CSV)</label>
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={handleFileUpload}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border file:border-[#E5E5E5] file:text-xs file:font-bold file:bg-white file:text-[#111] hover:file:bg-[#f5f5f5]"
        />
      </div>

      {/* Sheet selector for multi-tab files */}
      {sheetInfos.length > 1 && (
        <div className="border border-[#E5E5E5] rounded-lg p-5 mb-6">
          <h3 className="text-xs font-bold mb-2">Multiple sheets detected</h3>
          <div className="flex gap-4 items-center mb-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                checked={!processAllTabs}
                onChange={() => setProcessAllTabs(false)}
                className="accent-[#111]"
              />
              Single tab
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                checked={processAllTabs}
                onChange={() => setProcessAllTabs(true)}
                className="accent-[#111]"
              />
              Process all tabs
            </label>
          </div>
          {!processAllTabs && (
            <select
              value={selectedSheet}
              onChange={(e) => setSelectedSheet(e.target.value)}
              className="border border-[#E5E5E5] rounded px-3 py-2 text-sm"
            >
              {sheetInfos.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name} ({s.rowCount} rows)
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* File mismatch error */}
      {fileMismatchError && (
        <div className="bg-red-50 border border-red-200 text-[#DC2626] px-4 py-3 rounded text-sm mb-6">
          {fileMismatchError}
        </div>
      )}

      {/* Validation Panel */}
      {validationDone && !fileMismatchError && !processingComplete && (
        <div className="mb-6">
          <ValidationPanel
            issues={validationIssues}
            headers={headers}
            rows={allRows}
            mapping={supplier.column_mapping}
            onFixRow={handleFixRow}
            onRevalidate={handleRevalidate}
            onProceed={handleProceed}
            validCount={allRows.length - validationIssues.length}
          />
        </div>
      )}

      {processing && <p className="text-sm text-gray-500">Processing...</p>}

      {/* Preview */}
      {processingComplete && previewRows.length > 0 && (
        <div className="border border-[#E5E5E5] rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-bold text-sm">Preview (first 20 rows)</h2>
              <p className="text-xs text-gray-500">
                {totalRows} rows processed
                {skippedRows > 0 && `, ${skippedRows} skipped`}
              </p>
            </div>
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="bg-[#111] text-white px-4 py-2 rounded text-sm font-bold hover:bg-black disabled:opacity-50 transition"
            >
              {downloading ? "Generating..." : "Download XLSX"}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs border border-[#E5E5E5]">
              <thead className="bg-[#f9f9f9]">
                <tr>
                  <th className="px-3 py-2 text-left border-b border-[#E5E5E5] font-bold">Wholesaler Code</th>
                  <th className="px-3 py-2 text-left border-b border-[#E5E5E5] font-bold">Description</th>
                  <th className="px-3 py-2 text-right border-b border-[#E5E5E5] font-bold">Original Price</th>
                  <th className="px-3 py-2 text-left border-b border-[#E5E5E5] font-bold">BWA Code</th>
                  <th className="px-3 py-2 text-right border-b border-[#E5E5E5] font-bold">Regular Price</th>
                  <th className="px-3 py-2 text-right border-b border-[#E5E5E5] font-bold">VIP Price</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, i) => (
                  <tr key={i} className={i % 2 === 1 ? "bg-[#fafafa]" : ""}>
                    <td className="px-3 py-2 border-b border-[#f0f0f0]">{row.wholesaler_code}</td>
                    <td className="px-3 py-2 border-b border-[#f0f0f0] max-w-[250px] truncate">{row.wholesaler_description}</td>
                    <td className="px-3 py-2 border-b border-[#f0f0f0] text-right">${row.wholesaler_price.toFixed(2)}</td>
                    <td className="px-3 py-2 border-b border-[#f0f0f0]">{row.bwa_code}</td>
                    <td className="px-3 py-2 border-b border-[#f0f0f0] text-right">${row.bwa_regular_price.toFixed(2)}</td>
                    <td className="px-3 py-2 border-b border-[#f0f0f0] text-right">${row.bwa_vip_price.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
