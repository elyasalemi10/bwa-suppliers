"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { parseFileForPreview, getSheetInfos } from "@/lib/xlsx-utils";
import { useToast } from "./Toast";
import type { Supplier, ColumnMapping, GstExemptionKeyword, SheetInfo } from "@/lib/types";

const MAPPED_FIELDS = [
  { key: "id", label: "Product ID/Code", required: true },
  { key: "cost", label: "Cost Price", required: true },
  { key: "brand", label: "Brand", required: false },
  { key: "description", label: "Description", required: false },
  { key: "quantity", label: "Quantity", required: false },
] as const;

interface SupplierFormProps {
  existingSupplier?: Supplier & { gst_exemption_keywords?: GstExemptionKeyword[] };
}

export default function SupplierForm({ existingSupplier }: SupplierFormProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const isEditing = !!existingSupplier;

  const [name, setName] = useState(existingSupplier?.name || "");
  const [gstIncluded, setGstIncluded] = useState(existingSupplier?.gst_included ?? true);
  const [discountType, setDiscountType] = useState<"percentage" | "fixed">(
    existingSupplier?.discount_type || "percentage"
  );
  const [discountValue, setDiscountValue] = useState(
    existingSupplier?.discount_value?.toString() || "0"
  );
  const [regularMarkupType, setRegularMarkupType] = useState<"percentage" | "fixed">(
    existingSupplier?.regular_markup_type || "percentage"
  );
  const [regularMarkupValue, setRegularMarkupValue] = useState(
    existingSupplier?.regular_markup_value?.toString() || "0"
  );
  const [vipMarkupType, setVipMarkupType] = useState<"percentage" | "fixed">(
    existingSupplier?.vip_markup_type || "percentage"
  );
  const [vipMarkupValue, setVipMarkupValue] = useState(
    existingSupplier?.vip_markup_value?.toString() || "0"
  );
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>(
    existingSupplier?.column_mapping || { id: null, cost: null, brand: null, description: null, quantity: null }
  );
  const [headers, setHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<string[][]>([]);
  const [allRawRows, setAllRawRows] = useState<string[][]>([]);
  const [fileBuffer, setFileBuffer] = useState<ArrayBuffer | null>(null);
  const [fileUploaded, setFileUploaded] = useState(isEditing);
  const [sheetInfos, setSheetInfos] = useState<SheetInfo[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>("");
  const [headerRow, setHeaderRow] = useState(1);
  const [exemptionKeywords, setExemptionKeywords] = useState<GstExemptionKeyword[]>(
    existingSupplier?.gst_exemption_keywords || []
  );
  const [newKeyword, setNewKeyword] = useState("");
  const [newTargetColumn, setNewTargetColumn] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (existingSupplier?.id && !existingSupplier.gst_exemption_keywords) {
      supabase
        .from("gst_exemption_keywords")
        .select("*")
        .eq("supplier_id", existingSupplier.id)
        .then(({ data }) => {
          if (data) setExemptionKeywords(data);
        });
    }
  }, [existingSupplier]);

  function reparseFile(buffer: ArrayBuffer, hRow: number, sheet?: string) {
    const { headers: h, rows, allRawRows: rawRows } = parseFileForPreview(buffer, 10, hRow, sheet);
    setHeaders(h);
    setPreviewRows(rows);
    setAllRawRows(rawRows);
    setColumnMapping({ id: null, cost: null, brand: null, description: null, quantity: null });
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
    setFileUploaded(true);
  }

  function handleHeaderRowChange(val: number) {
    setHeaderRow(val);
    if (fileBuffer) reparseFile(fileBuffer, val, selectedSheet);
  }

  function handleSheetChange(sheetName: string) {
    setSelectedSheet(sheetName);
    if (fileBuffer) reparseFile(fileBuffer, headerRow, sheetName);
  }

  function updateMapping(field: string, value: string) {
    setColumnMapping((prev) => ({ ...prev, [field]: value || null }));
  }

  function addExemptionKeyword() {
    if (!newKeyword.trim() || !newTargetColumn) return;
    setExemptionKeywords((prev) => [
      ...prev,
      { keyword: newKeyword.trim(), target_column: newTargetColumn },
    ]);
    setNewKeyword("");
    setNewTargetColumn("");
  }

  function removeExemptionKeyword(index: number) {
    setExemptionKeywords((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Supplier name is required.");
      return;
    }
    if (!columnMapping.id || !columnMapping.cost) {
      setError("Product ID/Code and Cost Price column mappings are required.");
      return;
    }

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
        const { error: updateError } = await supabase
          .from("suppliers")
          .update(supplierData)
          .eq("id", existingSupplier.id);
        if (updateError) throw updateError;
        supplierId = existingSupplier.id;
      } else {
        const { data, error: insertError } = await supabase
          .from("suppliers")
          .insert(supplierData)
          .select("id")
          .single();
        if (insertError) throw insertError;
        supplierId = data.id;
      }

      await supabase.from("gst_exemption_keywords").delete().eq("supplier_id", supplierId);

      if (exemptionKeywords.length > 0) {
        const { error: kwError } = await supabase
          .from("gst_exemption_keywords")
          .insert(
            exemptionKeywords.map((kw) => ({
              supplier_id: supplierId,
              keyword: kw.keyword,
              target_column: kw.target_column,
            }))
          );
        if (kwError) throw kwError;
      }

      showToast(isEditing ? "Supplier updated" : "Supplier created");
      router.push("/");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "An error occurred";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  const mappedColumnOptions = MAPPED_FIELDS.filter(
    (f) => columnMapping[f.key as keyof ColumnMapping]
  ).map((f) => ({ value: f.key, label: f.label }));

  const inputClass = "w-full border border-[#E5E5E5] rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#111] focus:border-transparent";
  const selectClass = "border border-[#E5E5E5] rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#111] focus:border-transparent";

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-3xl">
      {error && (
        <div className="bg-red-50 border border-red-200 text-[#DC2626] px-4 py-3 rounded text-sm">
          {error}
        </div>
      )}

      {/* Step 1: Name & File Upload */}
      <section className="border border-[#E5E5E5] rounded-lg p-5">
        <h2 className="font-bold text-sm mb-4">1. Supplier Name & Sample File</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold mb-1">Supplier Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
              placeholder="e.g. Supplier Co."
              required
            />
          </div>
          <div>
            <label className="block text-xs font-bold mb-1">Upload Sample Price Sheet (XLSX/CSV)</label>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileUpload}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border file:border-[#E5E5E5] file:text-xs file:font-bold file:bg-white file:text-[#111] hover:file:bg-[#f5f5f5]"
            />
            {isEditing && !headers.length && (
              <p className="text-xs text-gray-500 mt-1">
                Upload a new file to update column mapping, or leave as-is.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Step 2: Sheet Selection, Header Row, Preview & Column Mapping */}
      {(headers.length > 0 || isEditing) && (
        <section className="border border-[#E5E5E5] rounded-lg p-5">
          <h2 className="font-bold text-sm mb-4">2. Column Mapping</h2>

          {fileBuffer && (
            <div className="flex gap-4 mb-4">
              {sheetInfos.length > 1 && (
                <div>
                  <label className="block text-xs font-bold mb-1">Sheet/Tab</label>
                  <select
                    value={selectedSheet}
                    onChange={(e) => handleSheetChange(e.target.value)}
                    className={selectClass}
                  >
                    {sheetInfos.map((s) => (
                      <option key={s.name} value={s.name}>
                        {s.name} ({s.rowCount} rows)
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-bold mb-1">Header row</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={headerRow}
                  onChange={(e) => handleHeaderRowChange(parseInt(e.target.value) || 1)}
                  className={selectClass + " w-20"}
                />
              </div>
            </div>
          )}

          {allRawRows.length > 0 && (
            <div className="mb-4 overflow-x-auto">
              <p className="text-xs text-gray-500 mb-1">Raw preview (first ~15 rows, header row highlighted):</p>
              <table className="text-[11px] border border-[#E5E5E5] min-w-full">
                <tbody>
                  {allRawRows.map((row, ri) => (
                    <tr
                      key={ri}
                      className={ri === headerRow - 1 ? "bg-yellow-100 font-bold" : ri % 2 === 1 ? "bg-[#fafafa]" : ""}
                    >
                      <td className="px-1.5 py-0.5 border-r border-[#E5E5E5] text-gray-400 text-[10px]">
                        {ri + 1}
                      </td>
                      {row.map((cell, ci) => (
                        <td key={ci} className="px-1.5 py-0.5 border-b border-[#f0f0f0] whitespace-nowrap max-w-[150px] truncate">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {headers.length > 0 && (
            <>
              <p className="text-xs text-gray-500 mb-2">
                Data preview (first 10 rows after header row {headerRow}):
              </p>
              <div className="mb-4 overflow-x-auto">
                <table className="text-[11px] border border-[#E5E5E5] min-w-full">
                  <thead className="bg-[#f9f9f9]">
                    <tr>
                      {headers.map((h, i) => (
                        <th key={i} className="px-1.5 py-1 border-b border-[#E5E5E5] text-left whitespace-nowrap font-bold">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, ri) => (
                      <tr key={ri} className={ri % 2 === 1 ? "bg-[#fafafa]" : ""}>
                        {row.map((cell, ci) => (
                          <td key={ci} className="px-1.5 py-0.5 border-b border-[#f0f0f0] whitespace-nowrap max-w-[150px] truncate">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {MAPPED_FIELDS.map((field) => (
              <div key={field.key}>
                <label className="block text-xs font-bold mb-1">
                  {field.label} {field.required && <span className="text-[#DC2626]">*</span>}
                </label>
                <select
                  value={columnMapping[field.key as keyof ColumnMapping] || ""}
                  onChange={(e) => updateMapping(field.key, e.target.value)}
                  className={selectClass + " w-full"}
                >
                  <option value="">-- Not Mapped --</option>
                  {headers.length > 0
                    ? headers.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))
                    : columnMapping[field.key as keyof ColumnMapping] && (
                        <option value={columnMapping[field.key as keyof ColumnMapping]!}>
                          {columnMapping[field.key as keyof ColumnMapping]}
                        </option>
                      )}
                </select>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Step 3: GST Setting */}
      <section className="border border-[#E5E5E5] rounded-lg p-5">
        <h2 className="font-bold text-sm mb-3">3. GST Setting</h2>
        <div className="flex gap-6">
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input type="radio" checked={gstIncluded} onChange={() => setGstIncluded(true)} className="accent-[#111]" />
            Prices include GST
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input type="radio" checked={!gstIncluded} onChange={() => setGstIncluded(false)} className="accent-[#111]" />
            Prices exclude GST
          </label>
        </div>
      </section>

      {/* Step 4: Manufacturer Discount */}
      <section className="border border-[#E5E5E5] rounded-lg p-5">
        <h2 className="font-bold text-sm mb-3">4. Manufacturer Discount</h2>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-xs font-bold mb-1">Value</label>
            <input type="number" step="any" min="0" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-bold mb-1">Type</label>
            <select value={discountType} onChange={(e) => setDiscountType(e.target.value as "percentage" | "fixed")} className={selectClass}>
              <option value="percentage">Percentage (%)</option>
              <option value="fixed">Fixed ($)</option>
            </select>
          </div>
        </div>
      </section>

      {/* Step 5: Regular Customer Markup */}
      <section className="border border-[#E5E5E5] rounded-lg p-5">
        <h2 className="font-bold text-sm mb-3">5. Regular Customer Markup</h2>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-xs font-bold mb-1">Value</label>
            <input type="number" step="any" min="0" value={regularMarkupValue} onChange={(e) => setRegularMarkupValue(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-bold mb-1">Type</label>
            <select value={regularMarkupType} onChange={(e) => setRegularMarkupType(e.target.value as "percentage" | "fixed")} className={selectClass}>
              <option value="percentage">Percentage (%)</option>
              <option value="fixed">Fixed ($)</option>
            </select>
          </div>
        </div>
      </section>

      {/* Step 6: VIP Customer Markup */}
      <section className="border border-[#E5E5E5] rounded-lg p-5">
        <h2 className="font-bold text-sm mb-3">6. VIP Customer Markup</h2>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-xs font-bold mb-1">Value</label>
            <input type="number" step="any" min="0" value={vipMarkupValue} onChange={(e) => setVipMarkupValue(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-bold mb-1">Type</label>
            <select value={vipMarkupType} onChange={(e) => setVipMarkupType(e.target.value as "percentage" | "fixed")} className={selectClass}>
              <option value="percentage">Percentage (%)</option>
              <option value="fixed">Fixed ($)</option>
            </select>
          </div>
        </div>
      </section>

      {/* Step 7: GST Exemption Keywords */}
      <section className="border border-[#E5E5E5] rounded-lg p-5">
        <h2 className="font-bold text-sm mb-3">7. GST Exemption Keywords</h2>
        <p className="text-xs text-gray-500 mb-3">
          If a keyword is found (case-insensitive) in the specified column, that product won&apos;t have GST added.
        </p>

        {exemptionKeywords.length > 0 && (
          <div className="mb-3 space-y-1">
            {exemptionKeywords.map((kw, i) => (
              <div key={i} className="flex items-center gap-2 bg-[#f9f9f9] rounded px-3 py-2 text-xs">
                <span className="font-bold">&quot;{kw.keyword}&quot;</span>
                <span className="text-gray-500">in</span>
                <span className="font-bold">
                  {MAPPED_FIELDS.find((f) => f.key === kw.target_column)?.label || kw.target_column}
                </span>
                <button type="button" onClick={() => removeExemptionKeyword(i)} className="ml-auto text-[#DC2626] hover:underline text-xs">
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="block text-xs font-bold mb-1">Keyword</label>
            <input
              type="text"
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              placeholder="e.g. mobility accessory"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-bold mb-1">Search In</label>
            <select value={newTargetColumn} onChange={(e) => setNewTargetColumn(e.target.value)} className={selectClass}>
              <option value="">Select column...</option>
              {mappedColumnOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={addExemptionKeyword}
            disabled={!newKeyword.trim() || !newTargetColumn}
            className="border border-[#E5E5E5] px-3 py-2 rounded text-sm hover:bg-[#f5f5f5] disabled:opacity-50 transition"
          >
            Add
          </button>
        </div>
      </section>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="bg-[#111] text-white px-6 py-2 rounded font-bold text-sm hover:bg-black disabled:opacity-50 transition"
        >
          {saving ? "Saving..." : isEditing ? "Update Supplier" : "Create Supplier"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="border border-[#E5E5E5] px-6 py-2 rounded text-sm hover:bg-[#f5f5f5] transition"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
