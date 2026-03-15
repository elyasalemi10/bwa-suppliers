"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import SupplierForm from "@/components/SupplierForm";
import type { Supplier, GstExemptionKeyword } from "@/lib/types";

export default function EditSupplierPage() {
  const params = useParams();
  const id = params.id as string;
  const [supplier, setSupplier] = useState<(Supplier & { gst_exemption_keywords: GstExemptionKeyword[] }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const [supplierRes, keywordsRes] = await Promise.all([
        supabase.from("suppliers").select("*").eq("id", id).single(),
        supabase.from("gst_exemption_keywords").select("*").eq("supplier_id", id),
      ]);
      if (supplierRes.error) setError("Supplier not found.");
      else setSupplier({ ...supplierRes.data, gst_exemption_keywords: keywordsRes.data || [] });
      setLoading(false);
    }
    load();
  }, [id]);

  if (loading) return <p className="text-sm text-muted-foreground">Loading...</p>;
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!supplier) return null;

  return (
    <div>
      <h1 className="text-lg font-semibold mb-6">Edit Supplier: {supplier.name}</h1>
      <SupplierForm existingSupplier={supplier} />
    </div>
  );
}
