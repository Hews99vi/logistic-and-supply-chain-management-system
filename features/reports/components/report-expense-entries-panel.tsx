"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Save, Tag, Trash2 } from "lucide-react";

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
  onCreateCategory?: (categoryName: string) => Promise<ExpenseCategoryOption>;
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
  onSave,
  onCreateCategory
}: ReportExpenseEntriesPanelProps) {
  const [editableRows, setEditableRows] = useState<EditableExpenseRow[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, RowErrors>>({});
  const [newCategoryName, setNewCategoryName] = useState("");
  const [categorySaving, setCategorySaving] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [categoryMessage, setCategoryMessage] = useState<string | null>(null);

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

  const handleCreateCategory = async () => {
    const cleanedName = newCategoryName.trim();
    setCategoryError(null);
    setCategoryMessage(null);

    if (cleanedName.length < 2) {
      setCategoryError("Enter a category name with at least 2 characters.");
      return;
    }

    if (!onCreateCategory) {
      setCategoryError("Category creation is not available here.");
      return;
    }

    setCategorySaving(true);
    try {
      const createdCategory = await onCreateCategory(cleanedName);
      setNewCategoryName("");
      setCategoryMessage(`${createdCategory.categoryName} added.`);

      setEditableRows((previous) => {
        const firstEmptyIndex = previous.findIndex((row) => !row.expenseCategoryId.trim() && !row.customExpenseName.trim());
        if (firstEmptyIndex === -1) return previous;

        return previous.map((row, index) => (
          index === firstEmptyIndex ? { ...row, expenseCategoryId: createdCategory.id } : row
        ));
      });
    } catch (requestError) {
      setCategoryError(requestError instanceof Error ? requestError.message : "Failed to create expense category.");
    } finally {
      setCategorySaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle>Expense Entries</CardTitle>
            <CardDescription>Capture per-line operational expenses for this report.</CardDescription>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:flex print:hidden">
            <Button className="w-full lg:w-auto" variant="outline" onClick={addRow} disabled={!canEdit || saving || loading}>
              <Plus className="h-4 w-4" />
              Add Row
            </Button>
            <Button className="w-full lg:w-auto" onClick={handleSave} disabled={!canEdit || saving || loading}>
              <Save className={`h-4 w-4 ${saving ? "animate-pulse" : ""}`} />
              Save Entries
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {error ? <Alert variant="destructive">{error}</Alert> : null}
        {categoryError ? <Alert variant="destructive">{categoryError}</Alert> : null}
        {categoryMessage ? <Alert className="border-emerald-200 bg-emerald-50 text-emerald-700">{categoryMessage}</Alert> : null}

        {!canEdit ? (
          <Alert>Expense entries are read-only because this report is no longer in draft.</Alert>
        ) : null}

        <div className="rounded-xl border border-slate-200 bg-white p-3 print:hidden">
          <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Add Expense Category</span>
              <input
                value={newCategoryName}
                onChange={(event) => {
                  setNewCategoryName(event.target.value);
                  setCategoryError(null);
                  setCategoryMessage(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleCreateCategory();
                  }
                }}
                className="h-11 w-full rounded-md border border-slate-200 px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200 disabled:bg-slate-100"
                disabled={!canEdit || saving || loading || categorySaving}
                placeholder="Fuel, maintenance, tolls..."
              />
            </label>
            <Button
              className="w-full lg:w-auto"
              variant="outline"
              onClick={handleCreateCategory}
              disabled={!canEdit || saving || loading || categorySaving || !onCreateCategory}
            >
              <Tag className={`h-4 w-4 ${categorySaving ? "animate-pulse" : ""}`} />
              Add Category
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
          <p className="text-xs uppercase tracking-wider text-slate-500">Total Expenses</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">{moneyFormat.format(totalExpenses)}</p>
        </div>

        <div className="space-y-4 md:hidden">
          {loading ? (
            Array.from({ length: 3 }).map((_, index) => <Skeleton key={`expense-mobile-${index}`} className="h-80 w-full rounded-xl" />)
          ) : editableRows.length === 0 ? (
            <div className="rounded-lg border border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
              No expense entries yet. Add a row to capture expenses.
            </div>
          ) : (
            editableRows.map((row, index) => {
              const rowError = fieldErrors[row.clientId];

              return (
                <article key={row.clientId} className="space-y-4 rounded-xl border border-slate-200 p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Expense Line {index + 1}</p>
                      <p className="mt-1 text-sm text-slate-500">Record category, amount, and notes for this expense.</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => removeRow(row.clientId)} disabled={!canEdit || saving}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <label className="space-y-1.5 block">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Expense Category</span>
                    <select
                      value={row.expenseCategoryId}
                      onChange={(event) => updateRow(row.clientId, "expenseCategoryId", event.target.value)}
                      className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200 disabled:bg-slate-100"
                      disabled={!canEdit || saving}
                    >
                      <option value="">Select category</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>{category.categoryName}</option>
                      ))}
                    </select>
                    {rowError?.expenseCategoryId ? <p className="text-xs text-rose-600">{rowError.expenseCategoryId}</p> : null}
                  </label>

                  <label className="space-y-1.5 block">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Custom Expense Name</span>
                    <input
                      value={row.customExpenseName}
                      onChange={(event) => updateRow(row.clientId, "customExpenseName", event.target.value)}
                      className="h-11 w-full rounded-md border border-slate-200 px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200 disabled:bg-slate-100"
                      disabled={!canEdit || saving}
                      placeholder="Optional custom name"
                    />
                    {rowError?.customExpenseName ? <p className="text-xs text-rose-600">{rowError.customExpenseName}</p> : null}
                    {rowError?.source ? <p className="text-xs text-rose-600">{rowError.source}</p> : null}
                  </label>

                  <label className="space-y-1.5 block">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Amount (LKR)</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={row.amount}
                      onChange={(event) => updateRow(row.clientId, "amount", event.target.value)}
                      className="h-11 w-full rounded-md border border-slate-200 px-3 text-right text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200 disabled:bg-slate-100"
                      disabled={!canEdit || saving}
                    />
                    {rowError?.amount ? <p className="text-xs text-rose-600">{rowError.amount}</p> : null}
                  </label>

                  <label className="space-y-1.5 block">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Notes</span>
                    <textarea
                      rows={3}
                      value={row.notes}
                      onChange={(event) => updateRow(row.clientId, "notes", event.target.value)}
                      className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200 disabled:bg-slate-100"
                      disabled={!canEdit || saving}
                    />
                    {rowError?.notes ? <p className="text-xs text-rose-600">{rowError.notes}</p> : null}
                  </label>
                </article>
              );
            })
          )}
        </div>

        <div className="hidden overflow-x-auto rounded-lg border border-slate-200 md:block">
          <table className="min-w-[920px] text-sm xl:min-w-full">
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
