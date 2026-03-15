"use client";

import { useState } from "react";
import type { ValidationIssue, ColumnMapping } from "@/lib/types";
import { getColumnIndex } from "@/lib/xlsx-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface ValidationPanelProps {
  issues: ValidationIssue[];
  headers: string[];
  rows: string[][];
  mapping: ColumnMapping;
  onFixRow: (rowIndex: number, colIndex: number, newValue: string) => void;
  onRevalidate: () => void;
  onProceed: () => void;
  validCount: number;
}

const ISSUE_VARIANTS: Record<string, "destructive" | "secondary" | "outline"> = {
  missing_code: "destructive",
  duplicate_code: "secondary",
  zero_negative_price: "destructive",
  non_numeric_price: "destructive",
};

const ISSUE_LABELS: Record<string, string> = {
  missing_code: "Missing Code",
  duplicate_code: "Duplicate",
  zero_negative_price: "Bad Price",
  non_numeric_price: "Non-Numeric",
};

export default function ValidationPanel({ issues, headers, rows, mapping, onFixRow, onRevalidate, onProceed, validCount }: ValidationPanelProps) {
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);
  const [editValue, setEditValue] = useState("");

  const idColIdx = getColumnIndex(headers, mapping.id);
  const costColIdx = getColumnIndex(headers, mapping.cost);
  const descColIdx = getColumnIndex(headers, mapping.description);

  function startEdit(rowIndex: number, field: string) {
    const colIdx = field === "id" ? idColIdx : costColIdx;
    if (colIdx < 0) return;
    setEditingCell({ row: rowIndex, col: colIdx });
    setEditValue(rows[rowIndex]?.[colIdx] || "");
  }

  function commitEdit() {
    if (editingCell) { onFixRow(editingCell.row, editingCell.col, editValue); setEditingCell(null); }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm">Review Issues</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">{validCount} valid rows, {issues.length} issues found</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onRevalidate}>Re-validate</Button>
            <Button size="sm" onClick={onProceed}>{issues.length > 0 ? "Proceed (skip issues)" : "Proceed"}</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {issues.length === 0 ? (
          <p className="text-sm text-green-600">All rows are valid. You can proceed.</p>
        ) : (
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Row</TableHead>
                  <TableHead className="text-xs">Issue</TableHead>
                  <TableHead className="text-xs">Code</TableHead>
                  <TableHead className="text-xs">Description</TableHead>
                  <TableHead className="text-xs">Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {issues.map((issue, i) => {
                  const row = rows[issue.rowIndex];
                  if (!row) return null;
                  const isEditingCode = editingCell?.row === issue.rowIndex && editingCell?.col === idColIdx;
                  const isEditingCost = editingCell?.row === issue.rowIndex && editingCell?.col === costColIdx;

                  return (
                    <TableRow key={i}>
                      <TableCell className="text-xs text-muted-foreground">{issue.rowIndex + 1}</TableCell>
                      <TableCell>
                        <Badge variant={ISSUE_VARIANTS[issue.issueType] || "secondary"} className="text-[10px]">
                          {ISSUE_LABELS[issue.issueType]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {isEditingCode ? (
                          <Input autoFocus value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={commitEdit} onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditingCell(null); }} className="h-6 text-xs w-28" />
                        ) : (
                          <span className={`cursor-pointer hover:underline text-xs ${issue.field === "id" ? "text-destructive font-semibold" : ""}`} onClick={() => startEdit(issue.rowIndex, "id")}>
                            {idColIdx >= 0 ? row[idColIdx] || "(empty)" : "-"}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate">{descColIdx >= 0 ? row[descColIdx] : "-"}</TableCell>
                      <TableCell>
                        {isEditingCost ? (
                          <Input autoFocus value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={commitEdit} onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditingCell(null); }} className="h-6 text-xs w-24" />
                        ) : (
                          <span className={`cursor-pointer hover:underline text-xs ${issue.field === "cost" ? "text-destructive font-semibold" : ""}`} onClick={() => startEdit(issue.rowIndex, "cost")}>
                            {costColIdx >= 0 ? row[costColIdx] || "(empty)" : "-"}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
