"use client";

import { useState } from "react";
import type { ValidationIssue, ColumnMapping } from "@/lib/types";
import { getColumnIndex } from "@/lib/xlsx-utils";

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

const ISSUE_LABELS: Record<string, string> = {
  missing_code: "Missing Code",
  duplicate_code: "Duplicate Code",
  zero_negative_price: "Zero/Negative Price",
  non_numeric_price: "Non-Numeric Price",
};

const ISSUE_COLORS: Record<string, string> = {
  missing_code: "bg-red-50 text-[#DC2626]",
  duplicate_code: "bg-yellow-50 text-yellow-700",
  zero_negative_price: "bg-red-50 text-[#DC2626]",
  non_numeric_price: "bg-red-50 text-[#DC2626]",
};

export default function ValidationPanel({
  issues,
  headers,
  rows,
  mapping,
  onFixRow,
  onRevalidate,
  onProceed,
  validCount,
}: ValidationPanelProps) {
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
    if (editingCell) {
      onFixRow(editingCell.row, editingCell.col, editValue);
      setEditingCell(null);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") commitEdit();
    if (e.key === "Escape") setEditingCell(null);
  }

  return (
    <div className="border border-[#E5E5E5] rounded-lg overflow-hidden">
      <div className="bg-[#f9f9f9] px-4 py-3 flex items-center justify-between border-b border-[#E5E5E5]">
        <div>
          <h3 className="font-bold text-sm">Review Issues</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {validCount} valid rows, {issues.length} issues found
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onRevalidate}
            className="px-3 py-1.5 text-xs border border-[#E5E5E5] rounded hover:bg-[#f5f5f5] transition"
          >
            Re-validate
          </button>
          <button
            onClick={onProceed}
            className="px-3 py-1.5 text-xs bg-[#111] text-white rounded hover:bg-black transition"
          >
            {issues.length > 0 ? "Proceed (skip problem rows)" : "Proceed"}
          </button>
        </div>
      </div>

      {issues.length === 0 ? (
        <div className="p-4 text-sm text-[#16A34A]">
          All rows are valid. You can proceed to processing.
        </div>
      ) : (
        <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="bg-[#f9f9f9] sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left font-bold border-b border-[#E5E5E5]">Row</th>
                <th className="px-3 py-2 text-left font-bold border-b border-[#E5E5E5]">Issue</th>
                <th className="px-3 py-2 text-left font-bold border-b border-[#E5E5E5]">Code</th>
                <th className="px-3 py-2 text-left font-bold border-b border-[#E5E5E5]">Description</th>
                <th className="px-3 py-2 text-left font-bold border-b border-[#E5E5E5]">Cost</th>
              </tr>
            </thead>
            <tbody>
              {issues.map((issue, i) => {
                const row = rows[issue.rowIndex];
                if (!row) return null;
                const isEditingCode = editingCell?.row === issue.rowIndex && editingCell?.col === idColIdx;
                const isEditingCost = editingCell?.row === issue.rowIndex && editingCell?.col === costColIdx;

                return (
                  <tr key={i} className="border-b border-[#f0f0f0] hover:bg-[#fafafa]">
                    <td className="px-3 py-2 text-gray-500">{issue.rowIndex + 1}</td>
                    <td className="px-3 py-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${ISSUE_COLORS[issue.issueType]}`}>
                        {ISSUE_LABELS[issue.issueType]}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {isEditingCode ? (
                        <input
                          autoFocus
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={commitEdit}
                          onKeyDown={handleKeyDown}
                          className="border border-[#111] rounded px-1.5 py-0.5 text-xs w-28 focus:outline-none"
                        />
                      ) : (
                        <span
                          className={`cursor-pointer hover:underline ${issue.field === "id" ? "text-[#DC2626] font-bold" : ""}`}
                          onClick={() => startEdit(issue.rowIndex, "id")}
                        >
                          {idColIdx >= 0 ? row[idColIdx] || "(empty)" : "-"}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 max-w-[200px] truncate">
                      {descColIdx >= 0 ? row[descColIdx] : "-"}
                    </td>
                    <td className="px-3 py-2">
                      {isEditingCost ? (
                        <input
                          autoFocus
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={commitEdit}
                          onKeyDown={handleKeyDown}
                          className="border border-[#111] rounded px-1.5 py-0.5 text-xs w-24 focus:outline-none"
                        />
                      ) : (
                        <span
                          className={`cursor-pointer hover:underline ${issue.field === "cost" ? "text-[#DC2626] font-bold" : ""}`}
                          onClick={() => startEdit(issue.rowIndex, "cost")}
                        >
                          {costColIdx >= 0 ? row[costColIdx] || "(empty)" : "-"}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
