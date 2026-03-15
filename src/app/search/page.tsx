"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Supplier, ProductIndexEntry } from "@/lib/types";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductIndexEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    supabase.from("suppliers").select("*").order("name").then(({ data }) => setSuppliers(data || []));
  }, []);

  const doSearch = useCallback(async (q: string, p: number, supplier: string) => {
    if (!q.trim()) { setResults([]); setTotal(0); return; }
    setLoading(true);
    const params = new URLSearchParams({ q, page: String(p) });
    if (supplier && supplier !== "all") params.set("supplier", supplier);
    try {
      const res = await fetch(`/api/search?${params}`);
      const data = await res.json();
      setResults(data.results || []); setTotal(data.total || 0);
    } catch { setResults([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setPage(1); doSearch(query, 1, supplierFilter); }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query, supplierFilter, doSearch]);

  const totalPages = Math.ceil(total / 50);

  return (
    <div>
      <h1 className="text-lg font-semibold mb-6">Product Search</h1>
      <div className="flex gap-3 mb-6">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by code, description, or brand..." className="flex-1" autoFocus />
        <Select value={supplierFilter} onValueChange={(v) => setSupplierFilter(v || "all")}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="All suppliers" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All suppliers</SelectItem>
            {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading && <p className="text-sm text-muted-foreground mb-4">Searching...</p>}
      {!loading && query && results.length === 0 && <p className="text-sm text-muted-foreground">No results found.</p>}

      {results.length > 0 && (
        <>
          <p className="text-xs text-muted-foreground mb-3">{total} result{total !== 1 ? "s" : ""} (page {page}/{totalPages})</p>
          <div className="border border-border rounded-lg overflow-hidden mb-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">BWA Code</TableHead>
                  <TableHead className="text-xs">Description</TableHead>
                  <TableHead className="text-xs">Brand</TableHead>
                  <TableHead className="text-xs">Supplier</TableHead>
                  <TableHead className="text-xs text-right">Regular</TableHead>
                  <TableHead className="text-xs text-right">VIP</TableHead>
                  <TableHead className="text-xs">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((r) => (
                  <>
                    <TableRow key={r.id} className="cursor-pointer" onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}>
                      <TableCell className="font-medium text-sm">{r.bwa_code}</TableCell>
                      <TableCell className="text-sm max-w-[250px] truncate">{r.description}</TableCell>
                      <TableCell className="text-sm">{r.brand}</TableCell>
                      <TableCell className="text-sm">{r.supplier_name}</TableCell>
                      <TableCell className="text-sm text-right">${r.regular_price?.toFixed(2)}</TableCell>
                      <TableCell className="text-sm text-right">${r.vip_price?.toFixed(2)}</TableCell>
                      <TableCell className="text-sm whitespace-nowrap">{new Date(r.processed_at).toLocaleDateString("en-AU")}</TableCell>
                    </TableRow>
                    {expandedId === r.id && (
                      <TableRow key={`${r.id}-detail`} className="bg-muted/50">
                        <TableCell colSpan={7} className="text-xs">
                          <div className="grid grid-cols-2 gap-2 max-w-md">
                            <span className="text-muted-foreground">Original Code:</span><span>{r.original_code}</span>
                            <span className="text-muted-foreground">Original Price:</span><span>${r.original_price?.toFixed(2)}</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
              </TableBody>
            </Table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => { setPage(page - 1); doSearch(query, page - 1, supplierFilter); }}>Previous</Button>
              <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => { setPage(page + 1); doSearch(query, page + 1, supplierFilter); }}>Next</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
