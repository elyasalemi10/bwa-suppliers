"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import type { Supplier, GstExemptionKeyword, ProcessingHistoryEntry } from "@/lib/types";

export default function SupplierManagePage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();

  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [keywords, setKeywords] = useState<GstExemptionKeyword[]>([]);
  const [history, setHistory] = useState<ProcessingHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editingNotes, setEditingNotes] = useState<string | null>(null);
  const [notesValue, setNotesValue] = useState("");

  useEffect(() => {
    async function load() {
      const [supplierRes, keywordsRes, historyRes] = await Promise.all([
        supabase.from("suppliers").select("*").eq("id", id).single(),
        supabase.from("gst_exemption_keywords").select("*").eq("supplier_id", id),
        supabase.from("processing_history").select("*").eq("supplier_id", id).order("processed_at", { ascending: false }),
      ]);
      if (supplierRes.data) setSupplier(supplierRes.data);
      setKeywords(keywordsRes.data || []);
      setHistory(historyRes.data || []);
      setLoading(false);
    }
    load();
  }, [id]);

  async function handleDelete() {
    const { error } = await supabase.from("suppliers").delete().eq("id", id);
    if (error) {
      toast.error("Error deleting supplier");
    } else {
      toast.success("Supplier deleted");
      router.push("/");
    }
  }

  async function handleDuplicate() {
    const res = await fetch("/api/suppliers/duplicate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ supplierId: id }),
    });
    if (res.ok) {
      const { id: newId } = await res.json();
      toast.success("Supplier duplicated");
      router.push(`/suppliers/${newId}/edit`);
    } else {
      toast.error("Duplication failed");
    }
  }

  async function deleteHistoryEntry(entryId: string) {
    const res = await fetch("/api/history", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: entryId }),
    });
    if (res.ok) {
      setHistory((prev) => prev.filter((h) => h.id !== entryId));
      toast.success("History entry deleted");
    } else {
      toast.error("Failed to delete");
    }
  }

  async function saveNotes(entryId: string) {
    const res = await fetch("/api/history", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: entryId, notes: notesValue }),
    });
    if (res.ok) {
      setHistory((prev) => prev.map((h) => (h.id === entryId ? { ...h, notes: notesValue } : h)));
      setEditingNotes(null);
      toast.success("Notes saved");
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading...</p>;
  if (!supplier) return <p className="text-sm text-destructive">Supplier not found.</p>;

  const mapping = supplier.column_mapping;

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">{supplier.name}</h1>
          <p className="text-sm text-muted-foreground mt-1">Supplier configuration and processing history</p>
        </div>
        <div className="flex gap-2">
          <Link href={`/suppliers/${id}/edit`}>
            <Button variant="outline" size="sm">Edit Settings</Button>
          </Link>
          <Button variant="outline" size="sm" onClick={handleDuplicate}>Duplicate</Button>
          <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <DialogTrigger render={<Button variant="destructive" size="sm">Delete</Button>} />
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete &quot;{supplier.name}&quot;?</DialogTitle>
                <DialogDescription>This will permanently delete this supplier and all its processing history. This cannot be undone.</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
                <Button variant="destructive" onClick={handleDelete}>Delete</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Quick Info Card */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground text-xs mb-1">GST</p>
              <Badge variant="secondary">{supplier.gst_included ? "Included" : "Excluded"}</Badge>
            </div>
            <div>
              <p className="text-muted-foreground text-xs mb-1">Discount</p>
              <p className="font-medium">{supplier.discount_type === "percentage" ? `${supplier.discount_value}%` : `$${Number(supplier.discount_value).toFixed(2)}`}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs mb-1">Regular Markup</p>
              <p className="font-medium">{supplier.regular_markup_type === "percentage" ? `${supplier.regular_markup_value}%` : `$${Number(supplier.regular_markup_value).toFixed(2)}`}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs mb-1">VIP Markup</p>
              <p className="font-medium">{supplier.vip_markup_type === "percentage" ? `${supplier.vip_markup_value}%` : `$${Number(supplier.vip_markup_value).toFixed(2)}`}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs mb-1">Column Mapping</p>
              <p className="font-medium text-xs">
                Code → {mapping.id || "—"}, Cost → {mapping.cost || "—"}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs mb-1">GST Exemptions</p>
              {keywords.length === 0 ? (
                <p className="text-xs text-muted-foreground">None</p>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {keywords.map((kw, i) => (
                    <Badge key={i} variant="outline" className="text-xs">{kw.keyword}</Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex gap-3 mb-8">
        <Link href={`/suppliers/${id}/process`}>
          <Button>Process Price Sheet</Button>
        </Link>
        <Link href="/batch">
          <Button variant="outline">Batch Process</Button>
        </Link>
      </div>

      <Separator className="mb-6" />

      {/* Processing History */}
      <h2 className="text-sm font-semibold mb-4">Processing History</h2>

      {history.length === 0 ? (
        <p className="text-sm text-muted-foreground">No price sheets have been processed yet for this supplier.</p>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Date</TableHead>
                <TableHead className="text-xs">File</TableHead>
                <TableHead className="text-xs">Rows</TableHead>
                <TableHead className="text-xs">Skipped</TableHead>
                <TableHead className="text-xs">Notes</TableHead>
                <TableHead className="text-xs text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="text-sm whitespace-nowrap">
                    {new Date(entry.processed_at).toLocaleDateString("en-AU", { day: "2-digit", month: "2-digit", year: "numeric" })}
                  </TableCell>
                  <TableCell className="text-sm max-w-[180px] truncate">{entry.original_filename}</TableCell>
                  <TableCell className="text-sm">{entry.row_count}</TableCell>
                  <TableCell className="text-sm">{entry.skipped_rows}</TableCell>
                  <TableCell className="text-sm max-w-[180px]">
                    {editingNotes === entry.id ? (
                      <div className="flex gap-1">
                        <Input
                          value={notesValue}
                          onChange={(e) => setNotesValue(e.target.value)}
                          className="h-7 text-xs"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveNotes(entry.id);
                            if (e.key === "Escape") setEditingNotes(null);
                          }}
                        />
                        <Button size="xs" onClick={() => saveNotes(entry.id)}>Save</Button>
                      </div>
                    ) : (
                      <span
                        className="cursor-pointer hover:underline text-muted-foreground text-xs"
                        onClick={() => { setEditingNotes(entry.id); setNotesValue(entry.notes || ""); }}
                      >
                        {entry.notes || "Add note..."}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right space-x-2 whitespace-nowrap">
                    <a href={entry.original_file_url} target="_blank" rel="noopener noreferrer">
                      <Button variant="ghost" size="xs">Original</Button>
                    </a>
                    <a href={entry.processed_file_url} target="_blank" rel="noopener noreferrer">
                      <Button variant="ghost" size="xs">Processed</Button>
                    </a>
                    <Button variant="ghost" size="xs" className="text-destructive" onClick={() => deleteHistoryEntry(entry.id)}>
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
