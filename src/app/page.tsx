"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Supplier } from "@/lib/types";

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    supabase
      .from("suppliers")
      .select("*")
      .order("name")
      .then(({ data }) => {
        setSuppliers(data || []);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading suppliers...</p>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold">Suppliers</h1>
        <Link href="/suppliers/new">
          <Button>+ Add New Supplier</Button>
        </Link>
      </div>

      {suppliers.length === 0 ? (
        <div className="border border-border rounded-lg p-8 text-center text-sm text-muted-foreground">
          No suppliers yet. Add your first supplier to get started.
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Supplier Name</TableHead>
                <TableHead className="text-right w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers.map((supplier) => (
                <TableRow
                  key={supplier.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/suppliers/${supplier.id}`)}
                >
                  <TableCell className="font-medium">{supplier.name}</TableCell>
                  <TableCell className="text-right">
                    <span className="text-sm text-muted-foreground">Manage →</span>
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
