"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { Supplier, ProductIndexEntry } from "@/lib/types";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductIndexEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierFilter, setSupplierFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    supabase
      .from("suppliers")
      .select("*")
      .order("name")
      .then(({ data }) => setSuppliers(data || []));
  }, []);

  const doSearch = useCallback(async (q: string, p: number, supplier: string) => {
    if (!q.trim()) {
      setResults([]);
      setTotal(0);
      return;
    }

    setLoading(true);
    const params = new URLSearchParams({ q, page: String(p) });
    if (supplier) params.set("supplier", supplier);

    try {
      const res = await fetch(`/api/search?${params}`);
      const data = await res.json();
      setResults(data.results || []);
      setTotal(data.total || 0);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      doSearch(query, 1, supplierFilter);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query, supplierFilter, doSearch]);

  function handlePageChange(newPage: number) {
    setPage(newPage);
    doSearch(query, newPage, supplierFilter);
  }

  const totalPages = Math.ceil(total / 50);

  return (
    <div>
      <h1 className="text-lg font-bold mb-6">Product Search</h1>

      <div className="flex gap-3 mb-6">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by code, description, or brand..."
          className="flex-1 border border-[#E5E5E5] rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#111]"
          autoFocus
        />
        <select
          value={supplierFilter}
          onChange={(e) => setSupplierFilter(e.target.value)}
          className="border border-[#E5E5E5] rounded px-3 py-2 text-sm"
        >
          <option value="">All suppliers</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      {loading && <p className="text-sm text-gray-500 mb-4">Searching...</p>}

      {!loading && query && results.length === 0 && (
        <p className="text-sm text-gray-500">No results found.</p>
      )}

      {results.length > 0 && (
        <>
          <p className="text-xs text-gray-500 mb-3">
            {total} result{total !== 1 ? "s" : ""} found (page {page} of {totalPages})
          </p>

          <div className="border border-[#E5E5E5] rounded-lg overflow-hidden mb-4">
            <table className="w-full text-sm">
              <thead className="bg-[#f9f9f9] border-b border-[#E5E5E5]">
                <tr>
                  <th className="text-left px-4 py-3 font-bold text-xs">BWA Code</th>
                  <th className="text-left px-4 py-3 font-bold text-xs">Description</th>
                  <th className="text-left px-4 py-3 font-bold text-xs">Brand</th>
                  <th className="text-left px-4 py-3 font-bold text-xs">Supplier</th>
                  <th className="text-right px-4 py-3 font-bold text-xs">Regular Price</th>
                  <th className="text-right px-4 py-3 font-bold text-xs">VIP Price</th>
                  <th className="text-left px-4 py-3 font-bold text-xs">Date</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <>
                    <tr
                      key={r.id}
                      className={`border-b border-[#f0f0f0] cursor-pointer hover:bg-[#f5f5f5] ${
                        i % 2 === 1 ? "bg-[#fafafa]" : ""
                      }`}
                      onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                    >
                      <td className="px-4 py-3 font-bold text-sm">{r.bwa_code}</td>
                      <td className="px-4 py-3 text-sm max-w-[250px] truncate">{r.description}</td>
                      <td className="px-4 py-3 text-sm">{r.brand}</td>
                      <td className="px-4 py-3 text-sm">{r.supplier_name}</td>
                      <td className="px-4 py-3 text-sm text-right">
                        ${r.regular_price?.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right">
                        ${r.vip_price?.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-sm whitespace-nowrap">
                        {new Date(r.processed_at).toLocaleDateString("en-AU")}
                      </td>
                    </tr>
                    {expandedId === r.id && (
                      <tr key={`${r.id}-detail`} className="bg-[#f9f9f9]">
                        <td colSpan={7} className="px-4 py-3 text-xs">
                          <div className="grid grid-cols-2 gap-2 max-w-md">
                            <span className="text-gray-500">Original Code:</span>
                            <span>{r.original_code}</span>
                            <span className="text-gray-500">Original Price:</span>
                            <span>${r.original_price?.toFixed(2)}</span>
                            <span className="text-gray-500">Processing Run:</span>
                            <span>{r.processing_history_id}</span>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => handlePageChange(page - 1)}
                disabled={page <= 1}
                className="px-3 py-1 border border-[#E5E5E5] rounded text-sm disabled:opacity-50 hover:bg-[#f5f5f5]"
              >
                Previous
              </button>
              <span className="text-sm text-gray-500">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => handlePageChange(page + 1)}
                disabled={page >= totalPages}
                className="px-3 py-1 border border-[#E5E5E5] rounded text-sm disabled:opacity-50 hover:bg-[#f5f5f5]"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
