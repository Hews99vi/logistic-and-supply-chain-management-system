"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { DailyReportExpenseEntryDto } from "@/types/domain/report";
import type { ExpenseCategoryOption, ReportExpenseBatchSaveItemInput } from "@/features/reports/types";

type EditableExpenseRow = {
  id?: string;
  clientId: string;
  expenseCategoryId: string;
  customExpenseName: string;
  amount: string;
  notes: string;
};

type RowErrors = {
  expenseCategoryId?: string;
  customExpenseName?: string;
  amount?: string;
  notes?: string;
  source?: string;
};

type ReportExpenseEntriesPanelProps = {
  rows: DailyReportExpenseEntryDto[];
  categories: ExpenseCategoryOption[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  canEdit: boolean;
  onSave: (items: ReportExpenseBatchSaveItemInput[]) => Promise<void>;
};

const moneyFormat = new Intl.NumberFormat("en-LK", {
  style: "currency",
  currency: "LKR",
  maximumFractionDigits: 2
});

function toEditableRow(row: DailyReportExpenseEntryDto): EditableExpenseRow {
  return {
    id: row.id,
    clientId: row.id,
    expenseCategoryId: row.expenseCategoryId ?? "",
    customExpenseName: row.customExpenseName ?? "",
    amount: String(row.amount),
    notes: row.notes ?? ""
  };
}

function createEmptyRow(seed = 0): EditableExpenseRow {
  const suffix = `${Date.now()}-${seed}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    clientId: `new-${suffix}`,
    expenseCategoryId: "",
    customExpenseName: "",
    amount: "0",
    notes: ""
  };
}

function parseMoneyInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return 0;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return Number.NaN;
  }

  return parsed;
}

function normalizeMoney(value: number) {
  return Number(value.toFixed(2));
}

export function ReportExpenseEntriesPanel({
  rows,
  categories,
  loading,
  saving,
  error,
  canEdit,
  onSave
}: ReportExpenseEntriesPanelProps) {
  const [editableRows, setEditableRows] = useState<EditableExpenseRow[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, RowErrors>>({});

  useEffect(() => {
    setEditableRows(rows.map(toEditableRow));
    setFieldErrors({});
  }, [rows]);

  const updateRow = (clientId: string, field: keyof EditableExpenseRow, value: string) => {
    setEditableRows((previous) => previous.map((row) => (row.clientId === clientId ? { ...row, [field]: value } : row)));
    setFieldErrors((previous) => {
      if (!previous[clientId]) return previous;
      const next = { ...previous };
      next[clientId] = { ...next[clientId], [field]: undefined, source: undefined };
      return next;
    });
  };

  const addRow = () => {
    setEditableRows((previous) => [...previous, createEmptyRow(previous.length)]);
  };

  const removeRow = (clientId: string) => {
    setEditableRows((previous) => previous.filter((row) => row.clientId !== clientId));
    setFieldErrors((previous) => {
      if (!previous[clientId]) return previous;
      const next = { ...previous };
      delete next[clientId];
      return next;
    });
  };

  const totalExpenses = useMemo(() => {
    return editableRows.reduce((acc, row) => {
      const amount = parseMoneyInput(row.amount);
      return acc + (Number.isFinite(amount) ? amount : 0);
    }, 0);
  }, [editableRows]);

  const validateRows = () => {
    const errors: Record<string, RowErrors> = {};

    editableRows.forEach((row) => {
      const rowErrors: RowErrors = {};
      const expenseCategoryId = row.expenseCategoryId.trim();
      const customExpenseName = row.customExpenseName.trim();
      const amount = parseMoneyInput(row.amount);

      if (!expenseCategoryId && !customExpenseName) {
        rowErrors.source = "Select a category or enter a custom expense name.";
      }

      if (customExpenseName.length > 160) {
        rowErrors.customExpenseName = "Max 160 characters.";
      }

      if (!Number.isFinite(amount) || amount < 0) {
        rowErrors.amount = "Enter a non-negative amount.";
      }

      if (row.notes.trim().length > 500) {
        rowErrors.notes = "Max 500 characters.";
      }

      if (Object.values(rowErrors).some(Boolean)) {
        errors[row.clientId] = rowErrors;
      }
    });

    return errors;
  };

  const handleSave = async () => {
    const nextErrors = validateRows();
    setFieldErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    const payload: ReportExpenseBatchSaveItemInput[] = editableRows.map((row) => {
      const expenseCategoryId = row.expenseCategoryId.trim();
      const customExpenseName = row.customExpenseName.trim();

      return {
        id: row.id,
        expenseCategoryId: expenseCategoryId || null,
        customExpenseName: customExpenseName || undefined,
        amount: normalizeMoney(parseMoneyInput(row.amount)),
        notes: row.notes.trim() || undefined
      };
    });

    await onSave(payload);
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>Expense Entries</CardTitle>
          <CardDescription>Capture per-line operational expenses for this report.</CardDescription>
        </div>

        <div className="flex gap-2 print:hidden">
          <Button variant="outline" onClick={addRow} disabled={!canEdit || saving || loading}>
            <Plus className="h-4 w-4" />
            Add Row
          </Button>
          <Button onClick={handleSave} disabled={!canEdit || saving || loading}>
            <Save className={`h-4 w-4 ${saving ? "animate-pulse" : ""}`} />
            Save Entries
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {error ? <Alert variant="destructive">{error}</Alert> : null}

        {!canEdit ? (
          <Alert>Expense entries are read-only because this report is no longer in draft.</Alert>
        ) : null}

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.14em] text-slate-500">
              <tr>
                <th className="px-3 py-3">Line #</th>
                <th className="px-3 py-3">Expense Category</th>
                <th className="px-3 py-3">Custom Expense Name</th>
                <th className="px-3 py-3 text-right">Amount (LKR)</th>
                <th className="px-3 py-3">Notes</th>
                <th className="px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <tr key={`loading-${index}`}>
                    <td className="px-3 py-3" colSpan={6}>
                      <Skeleton className="h-9 w-full" />
                    </td>
                  </tr>
                ))
              ) : editableRows.length === 0 ? (
                <tr>
                  <td className="px-3 py-10 text-center text-slate-500" colSpan={6}>
                    No expense entries yet. Add a row to capture expenses.
                  </td>
                </tr>
              ) : (
                editableRows.map((row, index) => {
                  const rowError = fieldErrors[row.clientId];

                  return (
                    <tr key={row.clientId}>
                      <td className="px-3 py-3 font-semibold text-slate-900">{index + 1}</td>
                      <td className="px-3 py-3 align-top">
                        <select
                          value={row.expenseCategoryId}
                          onChange={(event) => updateRow(row.clientId, "expenseCategoryId", event.target.value)}
                          className="h-9 w-52 rounded-md border border-slate-200 bg-white px-2 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200 disabled:bg-slate-100"
                          disabled={!canEdit || saving}
                        >
                          <option value="">Select category</option>
                          {categories.map((category) => (
                            <option key={category.id} value={category.id}>{category.categoryName}</option>
                          ))}
                        </select>
                        {rowError?.expenseCategoryId ? <p className="mt-1 text-xs text-rose-600">{rowError.expenseCategoryId}</p> : null}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <input
                          value={row.customExpenseName}
                          onChange={(event) => updateRow(row.clientId, "customExpenseName", event.target.value)}
                          className="h-9 w-56 rounded-md border border-slate-200 px-2 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200 disabled:bg-slate-100"
                          disabled={!canEdit || saving}
                          placeholder="Optional custom name"
                        />
                        {rowError?.customExpenseName ? <p className="mt-1 text-xs text-rose-600">{rowError.customExpenseName}</p> : null}
                        {rowError?.source ? <p className="mt-1 text-xs text-rose-600">{rowError.source}</p> : null}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={row.amount}
                          onChange={(event) => updateRow(row.clientId, "amount", event.target.value)}
                          className="h-9 w-32 rounded-md border border-slate-200 px-2 text-right text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200 disabled:bg-slate-100"
                          disabled={!canEdit || saving}
                        />
                        {rowError?.amount ? <p className="mt-1 text-right text-xs text-rose-600">{rowError.amount}</p> : null}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <input
                          value={row.notes}
                          onChange={(event) => updateRow(row.clientId, "notes", event.target.value)}
                          className="h-9 w-56 rounded-md border border-slate-200 px-2 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200 disabled:bg-slate-100"
                          disabled={!canEdit || saving}
                        />
                        {rowError?.notes ? <p className="mt-1 text-xs text-rose-600">{rowError.notes}</p> : null}
                      </td>
                      <td className="px-3 py-3 text-right align-top">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => removeRow(row.clientId)}
                          disabled={!canEdit || saving}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            <tfoot className="bg-slate-50 text-sm font-semibold text-slate-900">
              <tr>
                <td className="px-3 py-3" colSpan={3}>Total Expenses</td>
                <td className="px-3 py-3 text-right">{moneyFormat.format(totalExpenses)}</td>
                <td className="px-3 py-3" colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

