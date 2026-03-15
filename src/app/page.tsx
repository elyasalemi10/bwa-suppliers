"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/Toast";
import type { Supplier } from "@/lib/types";

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();
  const router = useRouter();

  useEffect(() => {
    loadSuppliers();
  }, []);

  async function loadSuppliers() {
    const { data, error } = await supabase
      .from("suppliers")
      .select("*")
      .order("name");

    if (error) {
      showToast("Error loading suppliers", "error");
    } else {
      setSuppliers(data || []);
    }
    setLoading(false);
  }

  async function deleteSupplier(id: string, name: string) {
    if (!confirm(`Delete supplier "${name}"? This cannot be undone.`)) return;

    const { error } = await supabase.from("suppliers").delete().eq("id", id);
    if (error) {
      showToast("Error deleting supplier: " + error.message, "error");
    } else {
      setSuppliers((prev) => prev.filter((s) => s.id !== id));
      showToast(`Supplier "${name}" deleted`);
    }
  }

  async function duplicateSupplier(supplier: Supplier) {
    try {
      const res = await fetch("/api/suppliers/duplicate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplierId: supplier.id }),
      });

      if (!res.ok) {
        const data = await res.json();
        showToast(data.error || "Duplication failed", "error");
        return;
      }

      const { id } = await res.json();
      showToast(`Supplier duplicated`);
      router.push(`/suppliers/${id}/edit`);
    } catch {
      showToast("Duplication failed", "error");
    }
  }

  if (loading) {
    return <p className="text-gray-500 text-sm">Loading suppliers...</p>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-bold">Suppliers</h1>
        <Link
          href="/suppliers/new"
          className="bg-[#111] text-white px-4 py-2 rounded text-sm font-bold hover:bg-black transition"
        >
          + Add New Supplier
        </Link>
      </div>

      {suppliers.length === 0 ? (
        <div className="border border-[#E5E5E5] rounded-lg p-8 text-center text-gray-500 text-sm">
          No suppliers yet. Add your first supplier to get started.
        </div>
      ) : (
        <div className="border border-[#E5E5E5] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#f9f9f9] border-b border-[#E5E5E5]">
              <tr>
                <th className="text-left px-4 py-3 font-bold text-xs">Name</th>
                <th className="text-left px-4 py-3 font-bold text-xs">GST</th>
                <th className="text-left px-4 py-3 font-bold text-xs">Discount</th>
                <th className="text-left px-4 py-3 font-bold text-xs">Regular Markup</th>
                <th className="text-left px-4 py-3 font-bold text-xs">VIP Markup</th>
                <th className="text-right px-4 py-3 font-bold text-xs">Actions</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((supplier, i) => (
                <tr
                  key={supplier.id}
                  className={`border-b border-[#f0f0f0] hover:bg-[#fafafa] ${
                    i % 2 === 1 ? "bg-[#fafafa]" : ""
                  }`}
                >
                  <td className="px-4 py-3 font-bold text-sm">{supplier.name}</td>
                  <td className="px-4 py-3 text-sm">
                    {supplier.gst_included ? "Included" : "Excluded"}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {supplier.discount_value}
                    {supplier.discount_type === "percentage" ? "%" : "$"}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {supplier.regular_markup_value}
                    {supplier.regular_markup_type === "percentage" ? "%" : "$"}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {supplier.vip_markup_value}
                    {supplier.vip_markup_type === "percentage" ? "%" : "$"}
                  </td>
                  <td className="px-4 py-3 text-right space-x-3 text-sm">
                    <Link
                      href={`/suppliers/${supplier.id}/edit`}
                      className="hover:underline"
                    >
                      Edit
                    </Link>
                    <Link
                      href={`/suppliers/${supplier.id}/process`}
                      className="hover:underline"
                    >
                      Process
                    </Link>
                    <Link
                      href={`/suppliers/${supplier.id}/history`}
                      className="hover:underline"
                    >
                      History
                    </Link>
                    <button
                      onClick={() => duplicateSupplier(supplier)}
                      className="hover:underline"
                    >
                      Duplicate
                    </button>
                    <button
                      onClick={() => deleteSupplier(supplier.id, supplier.name)}
                      className="text-[#DC2626] hover:underline"
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
