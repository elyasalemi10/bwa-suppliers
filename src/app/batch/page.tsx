"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { Supplier } from "@/lib/types";

interface BatchFile {
  file: File;
  supplierId: string;
  status: "pending" | "processing" | "done" | "error";
  resultBlob?: Blob;
  resultFilename?: string;
  error?: string;
}

function normalizeForMatching(str: string): string {
  return str.toLowerCase().replace(/\.(xlsx|xls|csv)$/i, "").replace(/price\s*list/gi, "").replace(/20\d{2}/g, "").replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
}

export default function BatchPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [batchFiles, setBatchFiles] = useState<BatchFile[]>([]);
  const [running, setRunning] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(-1);
  const [zipping, setZipping] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.from("suppliers").select("*").order("name").then(({ data }) => setSuppliers(data || []));
  }, []);

  function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    const newBatch: BatchFile[] = Array.from(files).map((file) => {
      const normalizedFilename = normalizeForMatching(file.name);
      const fileWords = normalizedFilename.split(" ").filter((w) => w.length > 1);
      let bestMatch: Supplier | null = null;
      let bestScore = 0;
      for (const s of suppliers) {
        const supplierWords = normalizeForMatching(s.name).split(" ").filter((w) => w.length > 1);
        if (!supplierWords.length) continue;
        const matched = supplierWords.filter((sw) => fileWords.some((fw) => fw.includes(sw) || sw.includes(fw)));
        const score = matched.length / supplierWords.length;
        if (score > bestScore) { bestScore = score; bestMatch = s; }
      }
      return { file, supplierId: bestMatch && bestScore >= 0.5 ? bestMatch.id : "", status: "pending" as const };
    });
    setBatchFiles((prev) => [...prev, ...newBatch]);
  }

  function updateFile(index: number, updates: Partial<BatchFile>) {
    setBatchFiles((prev) => { const u = [...prev]; u[index] = { ...u[index], ...updates }; return u; });
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
        if (!res.ok) { const d = await res.json(); updateFile(i, { status: "error", error: d.error || "Failed" }); continue; }
        const blob = await res.blob();
        const disposition = res.headers.get("Content-Disposition");
        const filename = disposition?.match(/filename="(.+)"/)?.[1] ?? `processed-${i}.xlsx`;
        updateFile(i, { status: "done", resultBlob: blob, resultFilename: filename });
      } catch { updateFile(i, { status: "error", error: "Network error" }); }
    }
    setRunning(false);
    setCurrentIdx(-1);
    toast.success("Batch processing complete");
  }

  function downloadFile(bf: BatchFile) {
    if (!bf.resultBlob) return;
    const url = URL.createObjectURL(bf.resultBlob);
    const a = document.createElement("a");
    a.href = url; a.download = bf.resultFilename || "processed.xlsx"; a.click();
    URL.revokeObjectURL(url);
  }

  async function downloadAllAsZip() {
    setZipping(true);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      for (const bf of batchFiles) { if (bf.resultBlob && bf.resultFilename) zip.file(bf.resultFilename, bf.resultBlob); }
      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      const now = new Date();
      a.download = `bwa-batch-${String(now.getDate()).padStart(2, "0")}-${String(now.getMonth() + 1).padStart(2, "0")}-${now.getFullYear()}.zip`;
      a.click(); URL.revokeObjectURL(url);
    } catch { toast.error("Failed to create ZIP"); }
    finally { setZipping(false); }
  }

  return (
    <div>
      <h1 className="text-lg font-semibold mb-6">Batch Processing</h1>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div
            className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-foreground/30 transition"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const files = e.dataTransfer.files;
              if (files.length) {
                const dt = new DataTransfer();
                for (const f of Array.from(files)) dt.items.add(f);
                if (fileInputRef.current) { fileInputRef.current.files = dt.files; fileInputRef.current.dispatchEvent(new Event("change", { bubbles: true })); }
              }
            }}
          >
            <p className="text-sm text-muted-foreground mb-1">Drop files here or click to browse</p>
            <p className="text-xs text-muted-foreground/60">XLSX, XLS, or CSV files</p>
          </div>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" multiple onChange={handleFilesSelected} className="hidden" />
        </CardContent>
      </Card>

      {batchFiles.length > 0 && (
        <div className="border border-border rounded-lg overflow-hidden mb-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">File</TableHead>
                <TableHead className="text-xs">Supplier</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batchFiles.map((bf, i) => (
                <TableRow key={i}>
                  <TableCell className="text-sm">{bf.file.name}</TableCell>
                  <TableCell>
                    <Select value={bf.supplierId} onValueChange={(v) => updateFile(i, { supplierId: v || "" })} disabled={running}>
                      <SelectTrigger className="w-[200px] h-8 text-sm"><SelectValue placeholder="-- Select supplier --" /></SelectTrigger>
                      <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    {bf.status === "pending" && <Badge variant="secondary">Pending</Badge>}
                    {bf.status === "processing" && <Badge>Processing...</Badge>}
                    {bf.status === "done" && <Badge variant="outline" className="text-green-600 border-green-600">Done</Badge>}
                    {bf.status === "error" && <Badge variant="destructive">{bf.error || "Error"}</Badge>}
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    {bf.status === "done" && <Button variant="ghost" size="xs" onClick={() => downloadFile(bf)}>Download</Button>}
                    {!running && <Button variant="ghost" size="xs" className="text-destructive" onClick={() => setBatchFiles((prev) => prev.filter((_, idx) => idx !== i))}>Remove</Button>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="px-4 py-3 bg-muted/50 border-t border-border flex items-center justify-between">
            <p className="text-xs text-muted-foreground">{running && currentIdx >= 0 ? `Processing ${currentIdx + 1} of ${batchFiles.length}...` : `${batchFiles.length} files`}</p>
            <div className="flex gap-2">
              {allDone && batchFiles.some((f) => f.resultBlob) && <Button variant="outline" size="sm" onClick={downloadAllAsZip} disabled={zipping}>{zipping ? "Creating ZIP..." : "Download All as ZIP"}</Button>}
              <Button size="sm" onClick={runAll} disabled={!allMatched || running}>{running ? "Processing..." : "Run All"}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
