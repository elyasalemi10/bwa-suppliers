"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export default function ConfigPage() {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{
    supplierCount: number;
    suppliers: { code: string; name: string; categories: string[] }[];
  } | null>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/config", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Upload failed");
        return;
      }

      setResult({ supplierCount: data.supplierCount, suppliers: data.suppliers });
      toast.success(`Config uploaded — ${data.supplierCount} suppliers found`);
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-lg font-semibold mb-6">Upload Config File</h1>

      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Config Workbook</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-4">
            Upload your supplier config Excel file. It should contain sheets for: Supplier Markups,
            Category Rules, Column Mapping, and Special Handling.
          </p>
          <Label>Select file (XLSX)</Label>
          <Input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleUpload}
            disabled={uploading}
            className="mt-1"
          />
          {uploading && <p className="text-xs text-muted-foreground mt-2">Uploading and parsing...</p>}
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Config Loaded</CardTitle>
              <Badge variant="secondary">{result.supplierCount} suppliers</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {result.suppliers.map((s) => (
                <div key={s.code} className="flex items-center gap-2 text-sm">
                  <span className="font-mono text-xs text-muted-foreground w-8">{s.code}</span>
                  <span className="font-medium">{s.name}</span>
                  <div className="flex gap-1 ml-auto">
                    {s.categories.map((cat) => (
                      <Badge key={cat} variant="outline" className="text-xs">{cat}</Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4">
              <Button onClick={() => router.push("/")} size="sm">Go to Dashboard</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
