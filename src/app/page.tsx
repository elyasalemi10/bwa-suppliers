"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface SupplierInfo {
  code: string;
  name: string;
  categories: string[];
}

interface ConfigInfo {
  filename: string;
  uploadedAt: string;
  supplierCount: number;
  suppliers: SupplierInfo[];
}

export default function HomePage() {
  const [config, setConfig] = useState<ConfigInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((data) => {
        setConfig(data.config);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-sm text-muted-foreground">Loading...</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold">BWA Supplier Pricing</h1>
        <div className="flex gap-2">
          <Link href="/config">
            <Button variant="outline" size="sm">
              {config ? "Update Config" : "Upload Config"}
            </Button>
          </Link>
          {config && (
            <Link href="/process">
              <Button size="sm">Process File</Button>
            </Link>
          )}
        </div>
      </div>

      {!config ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground mb-4">
              No config file uploaded yet. Upload your supplier config workbook to get started.
            </p>
            <Link href="/config">
              <Button>Upload Config File</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="mb-6">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Active Config</CardTitle>
                <Badge variant="secondary">{config.supplierCount} suppliers</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-sm">
                <p className="text-muted-foreground text-xs">
                  {config.filename} — uploaded{" "}
                  {new Date(config.uploadedAt).toLocaleDateString("en-AU", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  })}
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="border border-border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs w-[80px]">Code</TableHead>
                  <TableHead className="text-xs">Supplier</TableHead>
                  <TableHead className="text-xs">Categories</TableHead>
                  <TableHead className="text-xs text-right w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {config.suppliers.map((s) => (
                  <TableRow key={s.code}>
                    <TableCell className="font-mono text-sm">{s.code}</TableCell>
                    <TableCell className="font-medium text-sm">{s.name}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {s.categories.map((cat) => (
                          <Badge key={cat} variant="outline" className="text-xs">
                            {cat}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/process?supplier=${s.code}`}>
                        <Button variant="ghost" size="xs">Process →</Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
