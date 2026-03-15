"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/Toast";
import type { ProcessingHistoryEntry } from "@/lib/types";

export default function SupplierHistoryPage() {
  const params = useParams();
  const id = params.id as string;
  const { showToast } = useToast();

  const [supplierName, setSupplierName] = useState("");
  const [history, setHistory] = useState<ProcessingHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingNotes, setEditingNotes] = useState<string | null>(null);
  const [notesValue, setNotesValue] = useState("");

  useEffect(() => {
    async function load() {
      const [supplierRes, historyRes] = await Promise.all([
        supabase.from("suppliers").select("name").eq("id", id).single(),
        supabase
          .from("processing_history")
          .select("*")
          .eq("supplier_id", id)
          .order("processed_at", { ascending: false }),
      ]);

      setSupplierName(supplierRes.data?.name || "Unknown");
      setHistory(historyRes.data || []);
      setLoading(false);
    }
    load();
  }, [id]);

  async function deleteEntry(entryId: string) {
    if (!confirm("Delete this history entry? Files will be removed from storage.")) return;

    const res = await fetch("/api/history", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: entryId }),
    });

    if (res.ok) {
      setHistory((prev) => prev.filter((h) => h.id !== entryId));
      showToast("History entry deleted");
    } else {
      showToast("Failed to delete entry", "error");
    }
  }

  async function saveNotes(entryId: string) {
    const res = await fetch("/api/history", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: entryId, notes: notesValue }),
    });

    if (res.ok) {
      setHistory((prev) =>
        prev.map((h) => (h.id === entryId ? { ...h, notes: notesValue } : h))
      );
      setEditingNotes(null);
      showToast("Notes saved");
    } else {
      showToast("Failed to save notes", "error");
    }
  }

  if (loading) return <p className="text-sm text-gray-500">Loading...</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-bold">Processing History: {supplierName}</h1>
          <Link href={`/suppliers/${id}/process`} className="text-xs hover:underline">
            Process new sheet
          </Link>
        </div>
      </div>

      {history.length === 0 ? (
        <div className="border border-[#E5E5E5] rounded-lg p-8 text-center text-sm text-gray-500">
          No processing history yet.
        </div>
      ) : (
        <div className="border border-[#E5E5E5] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#f9f9f9] border-b border-[#E5E5E5]">
              <tr>
                <th className="text-left px-4 py-3 font-bold text-xs">Date</th>
                <th className="text-left px-4 py-3 font-bold text-xs">Original File</th>
                <th className="text-left px-4 py-3 font-bold text-xs">Rows</th>
                <th className="text-left px-4 py-3 font-bold text-xs">Skipped</th>
                <th className="text-left px-4 py-3 font-bold text-xs">Notes</th>
                <th className="text-right px-4 py-3 font-bold text-xs">Actions</th>
              </tr>
            </thead>
            <tbody>
              {history.map((entry, i) => (
                <tr key={entry.id} className={`border-b border-[#f0f0f0] ${i % 2 === 1 ? "bg-[#fafafa]" : ""}`}>
                  <td className="px-4 py-3 text-sm whitespace-nowrap">
                    {new Date(entry.processed_at).toLocaleDateString("en-AU", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-4 py-3 text-sm max-w-[200px] truncate">{entry.original_filename}</td>
                  <td className="px-4 py-3 text-sm">{entry.row_count}</td>
                  <td className="px-4 py-3 text-sm">{entry.skipped_rows}</td>
                  <td className="px-4 py-3 text-sm max-w-[200px]">
                    {editingNotes === entry.id ? (
                      <div className="flex gap-1">
                        <input
                          value={notesValue}
                          onChange={(e) => setNotesValue(e.target.value)}
                          className="border border-[#E5E5E5] rounded px-2 py-0.5 text-xs flex-1"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveNotes(entry.id);
                            if (e.key === "Escape") setEditingNotes(null);
                          }}
                        />
                        <button onClick={() => saveNotes(entry.id)} className="text-xs hover:underline">Save</button>
                      </div>
                    ) : (
                      <span
                        className="cursor-pointer hover:underline text-gray-500"
                        onClick={() => {
                          setEditingNotes(entry.id);
                          setNotesValue(entry.notes || "");
                        }}
                      >
                        {entry.notes || "Add note..."}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                    <a
                      href={entry.original_file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm hover:underline"
                    >
                      Original
                    </a>
                    <a
                      href={entry.processed_file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm hover:underline"
                    >
                      Processed
                    </a>
                    <button
                      onClick={() => deleteEntry(entry.id)}
                      className="text-sm text-[#DC2626] hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
