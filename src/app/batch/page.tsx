"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/Toast";
import type { Supplier } from "@/lib/types";

interface BatchFile {
  file: File;
  supplierId: string;
  status: "pending" | "processing" | "done" | "error";
  resultBlob?: Blob;
  resultFilename?: string;
  error?: string;
  rowCount?: number;
  skippedRows?: number;
}

export default function BatchPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [batchFiles, setBatchFiles] = useState<BatchFile[]>([]);
  const [running, setRunning] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(-1);
  const [zipping, setZipping] = useState(false);
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase
      .from("suppliers")
      .select("*")
      .order("name")
      .then(({ data }) => setSuppliers(data || []));
  }, []);

  function normalizeForMatching(str: string): string {
    return str
      .toLowerCase()
      .replace(/\.(xlsx|xls|csv)$/i, "")
      .replace(/price\s*list/gi, "")
      .replace(/20\d{2}/g, "")
      .replace(/[^a-z0-9]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;

    const newBatch: BatchFile[] = Array.from(files).map((file) => {
      const normalizedFilename = normalizeForMatching(file.name);
      const fileWords = normalizedFilename.split(" ").filter((w) => w.length > 1);

      // Score each supplier by how many words from their name appear in the filename
      let bestMatch: Supplier | null = null;
      let bestScore = 0;

      for (const s of suppliers) {
        const normalizedSupplier = normalizeForMatching(s.name);
        const supplierWords = normalizedSupplier.split(" ").filter((w) => w.length > 1);
        if (supplierWords.length === 0) continue;

        const matchedWords = supplierWords.filter((sw) =>
          fileWords.some((fw) => fw.includes(sw) || sw.includes(fw))
        );
        const score = matchedWords.length / supplierWords.length;

        if (score > bestScore) {
          bestScore = score;
          bestMatch = s;
        }
      }

      // Only auto-select if at least 50% of supplier name words match
      return {
        file,
        supplierId: bestMatch && bestScore >= 0.5 ? bestMatch.id : "",
        status: "pending" as const,
      };
    });

    setBatchFiles((prev) => [...prev, ...newBatch]);
  }

  function updateFile(index: number, updates: Partial<BatchFile>) {
    setBatchFiles((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], ...updates };
      return updated;
    });
  }

  function removeFile(index: number) {
    setBatchFiles((prev) => prev.filter((_, i) => i !== index));
  }

  const allMatched = batchFiles.length > 0 && batchFiles.every((f) => f.supplierId);
  const allDone = batchFiles.length > 0 && batchFiles.every((f) => f.status === "done" || f.status === "error");

  async function runAll() {
    setRunning(true);
    for (let i = 0; i < batchFiles.length; i++) {
      if (batchFiles[i].status !== "pending") continue;
      setCurrentIdx(i);
      updateFile(i, { status: "processing" });

      const formData = new FormData();
      formData.append("file", batchFiles[i].file);
      formData.append("supplierId", batchFiles[i].supplierId);

      try {
        const res = await fetch("/api/process", { method: "POST", body: formData });

        if (!res.ok) {
          const errData = await res.json();
          updateFile(i, { status: "error", error: errData.error || "Failed" });
          continue;
        }

        const blob = await res.blob();
        const disposition = res.headers.get("Content-Disposition");
        const filenameMatch = disposition?.match(/filename="(.+)"/);
        const filename = filenameMatch?.[1] || `processed-${i}.xlsx`;

        updateFile(i, {
          status: "done",
          resultBlob: blob,
          resultFilename: filename,
        });
      } catch {
        updateFile(i, { status: "error", error: "Network error" });
      }
    }
    setRunning(false);
    setCurrentIdx(-1);
    showToast("Batch processing complete");
  }

  function downloadFile(bf: BatchFile) {
    if (!bf.resultBlob) return;
    const url = URL.createObjectURL(bf.resultBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = bf.resultFilename || "processed.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function downloadAllAsZip() {
    setZipping(true);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();

      for (const bf of batchFiles) {
        if (bf.resultBlob && bf.resultFilename) {
          zip.file(bf.resultFilename, bf.resultBlob);
        }
      }

      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      const now = new Date();
      const dd = String(now.getDate()).padStart(2, "0");
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const yyyy = now.getFullYear();
      a.download = `bwa-batch-${dd}-${mm}-${yyyy}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showToast("Failed to create ZIP", "error");
    } finally {
      setZipping(false);
    }
  }

  return (
    <div>
      <h1 className="text-lg font-bold mb-6">Batch Processing</h1>

      <div className="border border-[#E5E5E5] rounded-lg p-5 mb-6">
        <div
          className="border-2 border-dashed border-[#E5E5E5] rounded-lg p-8 text-center cursor-pointer hover:border-[#111] transition"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const files = e.dataTransfer.files;
            if (files.length) {
              const dt = new DataTransfer();
              for (const f of Array.from(files)) dt.items.add(f);
              if (fileInputRef.current) {
                fileInputRef.current.files = dt.files;
                fileInputRef.current.dispatchEvent(new Event("change", { bubbles: true }));
              }
            }
          }}
        >
          <p className="text-sm text-gray-500 mb-1">
            Drop files here or click to browse
          </p>
          <p className="text-xs text-gray-400">XLSX, XLS, or CSV files</p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          multiple
          onChange={handleFilesSelected}
          className="hidden"
        />
      </div>

      {batchFiles.length > 0 && (
        <div className="border border-[#E5E5E5] rounded-lg overflow-hidden mb-6">
          <table className="w-full text-sm">
            <thead className="bg-[#f9f9f9] border-b border-[#E5E5E5]">
              <tr>
                <th className="text-left px-4 py-3 font-bold text-xs">File</th>
                <th className="text-left px-4 py-3 font-bold text-xs">Supplier</th>
                <th className="text-left px-4 py-3 font-bold text-xs">Status</th>
                <th className="text-right px-4 py-3 font-bold text-xs">Actions</th>
              </tr>
            </thead>
            <tbody>
              {batchFiles.map((bf, i) => (
                <tr key={i} className={`border-b border-[#f0f0f0] ${i % 2 === 1 ? "bg-[#fafafa]" : ""}`}>
                  <td className="px-4 py-3 text-sm">{bf.file.name}</td>
                  <td className="px-4 py-3">
                    <select
                      value={bf.supplierId}
                      onChange={(e) => updateFile(i, { supplierId: e.target.value })}
                      disabled={running}
                      className="border border-[#E5E5E5] rounded px-2 py-1 text-sm w-full max-w-[200px]"
                    >
                      <option value="">-- Select supplier --</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {bf.status === "pending" && <span className="text-gray-500">Pending</span>}
                    {bf.status === "processing" && <span className="text-[#111] font-bold">Processing...</span>}
                    {bf.status === "done" && <span className="text-[#16A34A] font-bold">Done</span>}
                    {bf.status === "error" && (
                      <span className="text-[#DC2626] font-bold" title={bf.error}>Error</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    {bf.status === "done" && (
                      <button onClick={() => downloadFile(bf)} className="text-sm hover:underline">
                        Download
                      </button>
                    )}
                    {!running && (
                      <button onClick={() => removeFile(i)} className="text-sm text-[#DC2626] hover:underline">
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="px-4 py-3 bg-[#f9f9f9] border-t border-[#E5E5E5] flex items-center justify-between">
            <div className="text-xs text-gray-500">
              {running && currentIdx >= 0
                ? `Processing ${currentIdx + 1} of ${batchFiles.length}...`
                : `${batchFiles.length} files`}
            </div>
            <div className="flex gap-2">
              {allDone && batchFiles.some((f) => f.resultBlob) && (
                <button
                  onClick={downloadAllAsZip}
                  disabled={zipping}
                  className="border border-[#E5E5E5] px-4 py-1.5 rounded text-sm hover:bg-[#f5f5f5] disabled:opacity-50 transition"
                >
                  {zipping ? "Creating ZIP..." : "Download All as ZIP"}
                </button>
              )}
              <button
                onClick={runAll}
                disabled={!allMatched || running}
                className="bg-[#111] text-white px-4 py-1.5 rounded text-sm font-bold hover:bg-black disabled:opacity-50 transition"
              >
                {running ? "Processing..." : "Run All"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
