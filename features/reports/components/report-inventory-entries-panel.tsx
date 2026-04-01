"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { DailyReportInventoryEntryDto } from "@/types/domain/report";
import type { ProductOption, ReportInventoryBatchSaveItemInput } from "@/features/reports/types";
import { buildPackInfoLabel, buildQuantityModeLabel, buildUnitEquivalentLabel } from "@/lib/products/pack-helpers";

type EditableInventoryRow = {
  id?: string;
  clientId: string;
  productId: string;
  loadingQty: string;
  salesQty: string;
  lorryQty: string;
  productCodeSnapshot?: string;
  productNameSnapshot?: string;
  productDisplayNameSnapshot?: string | null;
  unitPriceSnapshot?: number;
  unitSizeSnapshot?: number | null;
  unitMeasureSnapshot?: string | null;
  packSizeSnapshot?: number | null;
  sellingUnitSnapshot?: string | null;
  quantityEntryModeSnapshot?: "pack" | "unit" | null;
  balanceQty?: number;
  varianceQty?: number;
};

type RowErrors = {
  productId?: string;
  loadingQty?: string;
  salesQty?: string;
  lorryQty?: string;
  duplicate?: string;
};

type ReportInventoryEntriesPanelProps = {
  rows: DailyReportInventoryEntryDto[];
  products: ProductOption[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  canEdit: boolean;
  onSave: (items: ReportInventoryBatchSaveItemInput[]) => Promise<void>;
};

const moneyFormat = new Intl.NumberFormat("en-LK", {
  style: "currency",
  currency: "LKR",
  maximumFractionDigits: 2
});

function toEditableRow(row: DailyReportInventoryEntryDto): EditableInventoryRow {
  return {
    id: row.id,
    clientId: row.id,
    productId: row.productId,
    loadingQty: String(row.loadingQty),
    salesQty: String(row.salesQty),
    lorryQty: String(row.lorryQty),
    productCodeSnapshot: row.productCodeSnapshot,
    productNameSnapshot: row.productNameSnapshot,
    productDisplayNameSnapshot: row.productDisplayNameSnapshot,
    unitPriceSnapshot: row.unitPriceSnapshot,
    unitSizeSnapshot: row.unitSizeSnapshot,
    unitMeasureSnapshot: row.unitMeasureSnapshot,
    packSizeSnapshot: row.packSizeSnapshot,
    sellingUnitSnapshot: row.sellingUnitSnapshot,
    quantityEntryModeSnapshot: row.quantityEntryModeSnapshot,
    balanceQty: row.balanceQty,
    varianceQty: row.varianceQty
  };
}

function createEmptyRow(seed = 0): EditableInventoryRow {
  const suffix = `${Date.now()}-${seed}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    clientId: `new-${suffix}`,
    productId: "",
    loadingQty: "0",
    salesQty: "0",
    lorryQty: "0"
  };
}

function parseIntegerInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return 0;
  }

  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed)) {
    return Number.NaN;
  }

  return parsed;
}

function resolveProduct(row: EditableInventoryRow, products: ProductOption[]) {
  const selected = products.find((product) => product.id === row.productId) ?? null;

  if (!selected) {
    return {
      code: row.productCodeSnapshot ?? "-",
      name: row.productDisplayNameSnapshot ?? row.productNameSnapshot ?? "-",
      unitPrice: row.unitPriceSnapshot ?? null,
      unitSize: row.unitSizeSnapshot ?? null,
      unitMeasure: row.unitMeasureSnapshot ?? null,
      packSize: row.packSizeSnapshot ?? null,
      sellingUnit: row.sellingUnitSnapshot ?? null,
      quantityEntryMode: row.quantityEntryModeSnapshot ?? null
    };
  }

  return {
    code: selected.productCode,
    name: selected.productName,
    unitPrice: selected.unitPrice,
    unitSize: selected.unitSize,
    unitMeasure: selected.unitMeasure,
    packSize: selected.packSize,
    sellingUnit: selected.sellingUnit

  };
}

export function ReportInventoryEntriesPanel({
  rows,
  products,
  loading,
  saving,
  error,
  canEdit,
  onSave
}: ReportInventoryEntriesPanelProps) {
  const [editableRows, setEditableRows] = useState<EditableInventoryRow[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, RowErrors>>({});

  useEffect(() => {
    setEditableRows(rows.map(toEditableRow));
    setFieldErrors({});
  }, [rows]);

  const updateRow = (clientId: string, field: keyof EditableInventoryRow, value: string) => {
    setEditableRows((previous) => previous.map((row) => (row.clientId === clientId ? { ...row, [field]: value } : row)));
    setFieldErrors((previous) => {
      if (!previous[clientId]) return previous;
      const next = { ...previous };
      next[clientId] = { ...next[clientId], [field]: undefined, duplicate: undefined };
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

  const validateRows = () => {
    const errors: Record<string, RowErrors> = {};
    const seenProducts = new Set<string>();

    editableRows.forEach((row) => {
      const rowErrors: RowErrors = {};

      const productId = row.productId.trim();
      const loadingQty = parseIntegerInput(row.loadingQty);
      const salesQty = parseIntegerInput(row.salesQty);
      const lorryQty = parseIntegerInput(row.lorryQty);

      if (!productId) {
        rowErrors.productId = "Product is required.";
      } else if (seenProducts.has(productId)) {
        rowErrors.duplicate = "This product is already added in another row.";
      } else {
        seenProducts.add(productId);
      }

      if (!Number.isFinite(loadingQty) || loadingQty < 0) {
        rowErrors.loadingQty = "Enter a non-negative whole number for this product quantity.";
      }

      if (!Number.isFinite(salesQty) || salesQty < 0) {
        rowErrors.salesQty = "Enter a non-negative whole number for this product quantity.";
      }

      if (!Number.isFinite(lorryQty) || lorryQty < 0) {
        rowErrors.lorryQty = "Enter a non-negative whole number for this product quantity.";
      }

      if (Number.isFinite(loadingQty) && Number.isFinite(salesQty) && salesQty > loadingQty) {
        rowErrors.salesQty = "Sold quantity cannot exceed loaded quantity.";
      }

      if (Object.values(rowErrors).some(Boolean)) {
        errors[row.clientId] = rowErrors;
      }
    });

    return errors;
  };

  const duplicateWarnings = useMemo(() => {
    return Object.values(fieldErrors).filter((item) => item.duplicate).length;
  }, [fieldErrors]);

  const handleSave = async () => {
    const nextErrors = validateRows();
    setFieldErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    const payload: ReportInventoryBatchSaveItemInput[] = editableRows.map((row) => ({
      id: row.id,
      productId: row.productId,
      loadingQty: parseIntegerInput(row.loadingQty),
      salesQty: parseIntegerInput(row.salesQty),
      lorryQty: parseIntegerInput(row.lorryQty)
    }));

    await onSave(payload);
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>Inventory Entries</CardTitle>
          <CardDescription>Capture loaded, sold, balance, lorry, and variance quantities using each product's configured quantity mode. Backend calculations remain unchanged.</CardDescription>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={addRow} disabled={!canEdit || saving || loading || products.length === 0}>
            <Plus className="h-4 w-4" />
            Add Row
          </Button>
          <Button onClick={handleSave} disabled={!canEdit || saving || loading || products.length === 0}>
            <Save className={`h-4 w-4 ${saving ? "animate-pulse" : ""}`} />
            Save Entries
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {error ? <Alert variant="destructive">{error}</Alert> : null}

        {!canEdit ? (
          <Alert>Inventory entries are read-only because this report is no longer in draft.</Alert>
        ) : null}

        {!loading && products.length === 0 ? (
          <Alert>No active products found. Add products before recording inventory entries.</Alert>
        ) : null}

        {duplicateWarnings > 0 ? (
          <Alert className="border-amber-200 bg-amber-50 text-amber-800">
            Duplicate product selections detected. Each product can appear once per report.
          </Alert>
        ) : null}

        <Alert>Quantities follow each product's configured quantity mode. Unit-equivalent helpers are shown only when the row has structured pack metadata.</Alert>

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.14em] text-slate-500">
              <tr>
                <th className="px-3 py-3">Line #</th>
                <th className="px-3 py-3">Product</th>
                <th className="px-3 py-3">Product Code</th>
                <th className="px-3 py-3">Display Name</th>
                <th className="px-3 py-3">Pack Info</th>
                <th className="px-3 py-3 text-right">Rate</th>
                <th className="px-3 py-3 text-right">Loaded Quantity</th>
                <th className="px-3 py-3 text-right">Sold Quantity</th>
                <th className="px-3 py-3 text-right">Balance Quantity</th>
                <th className="px-3 py-3 text-right">Lorry Quantity</th>
                <th className="px-3 py-3 text-right">Variance Quantity</th>
                <th className="px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <tr key={`loading-${index}`}>
                    <td className="px-3 py-3" colSpan={12}>
                      <Skeleton className="h-9 w-full" />
                    </td>
                  </tr>
                ))
              ) : editableRows.length === 0 ? (
                <tr>
                  <td className="px-3 py-10 text-center text-slate-500" colSpan={12}>
                    No inventory entries yet. Add a row to start capturing stock movement using each product's quantity mode.
                  </td>
                </tr>
              ) : (
                editableRows.map((row, index) => {
                  const rowError = fieldErrors[row.clientId];
                  const product = resolveProduct(row, products);
                  const loadingQty = parseIntegerInput(row.loadingQty);
                  const salesQty = parseIntegerInput(row.salesQty);
                  const lorryQty = parseIntegerInput(row.lorryQty);
                  const packInfo = buildPackInfoLabel(product);
                  const loadingEquivalent = Number.isFinite(loadingQty) ? buildUnitEquivalentLabel(loadingQty, product) : null;
                  const salesEquivalent = Number.isFinite(salesQty) ? buildUnitEquivalentLabel(salesQty, product) : null;
                  const lorryEquivalent = Number.isFinite(lorryQty) ? buildUnitEquivalentLabel(lorryQty, product) : null;
                  const balanceEquivalent = row.balanceQty !== undefined ? buildUnitEquivalentLabel(row.balanceQty, product) : null;
                  const varianceEquivalent = row.varianceQty !== undefined ? buildUnitEquivalentLabel(Math.abs(row.varianceQty), product) : null;

                  return (
                    <tr key={row.clientId}>
                      <td className="px-3 py-3 font-semibold text-slate-900">{index + 1}</td>
                      <td className="px-3 py-3 align-top">
                        <select
                          value={row.productId}
                          onChange={(event) => updateRow(row.clientId, "productId", event.target.value)}
                          className="h-9 w-56 rounded-md border border-slate-200 bg-white px-2 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200 disabled:bg-slate-100"
                          disabled={!canEdit || saving}
                        >
                          <option value="">Select product</option>
                          {products.map((option) => (
                            <option key={option.id} value={option.id}>{option.productName}</option>
                          ))}
                        </select>
                        {rowError?.productId ? <p className="mt-1 text-xs text-rose-600">{rowError.productId}</p> : null}
                        {rowError?.duplicate ? <p className="mt-1 text-xs text-rose-600">{rowError.duplicate}</p> : null}
                      </td>
                      <td className="px-3 py-3">{product.code}</td>
                      <td className="px-3 py-3 text-slate-900">{product.name}</td>
                      <td className="px-3 py-3 text-slate-600">{packInfo ?? "-"}</td>
                      <td className="px-3 py-3 text-right">{product.unitPrice === null ? "-" : moneyFormat.format(product.unitPrice)}</td>
                      <td className="px-3 py-3 align-top">
                        <input
                          type="number"
                          step="1"
                          min="0"
                          value={row.loadingQty}
                          onChange={(event) => updateRow(row.clientId, "loadingQty", event.target.value)}
                          className="h-9 w-24 rounded-md border border-slate-200 px-2 text-right text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200 disabled:bg-slate-100"
                          disabled={!canEdit || saving}
                        />
                        <p className="mt-1 text-right text-xs text-slate-500">{buildQuantityModeLabel(product)}</p>{loadingEquivalent ? <p className="mt-1 text-right text-xs text-slate-500">{loadingEquivalent}</p> : null}
                        {rowError?.loadingQty ? <p className="mt-1 text-right text-xs text-rose-600">{rowError.loadingQty}</p> : null}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <input
                          type="number"
                          step="1"
                          min="0"
                          value={row.salesQty}
                          onChange={(event) => updateRow(row.clientId, "salesQty", event.target.value)}
                          className="h-9 w-24 rounded-md border border-slate-200 px-2 text-right text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200 disabled:bg-slate-100"
                          disabled={!canEdit || saving}
                        />
                        <p className="mt-1 text-right text-xs text-slate-500">{buildQuantityModeLabel(product)}</p>{salesEquivalent ? <p className="mt-1 text-right text-xs text-slate-500">{salesEquivalent}</p> : null}
                        {rowError?.salesQty ? <p className="mt-1 text-right text-xs text-rose-600">{rowError.salesQty}</p> : null}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-slate-700">
                        <div>{row.balanceQty ?? "-"}</div>
                        {balanceEquivalent ? <p className="mt-1 text-xs font-normal text-slate-500">{balanceEquivalent}</p> : null}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <input
                          type="number"
                          step="1"
                          min="0"
                          value={row.lorryQty}
                          onChange={(event) => updateRow(row.clientId, "lorryQty", event.target.value)}
                          className="h-9 w-24 rounded-md border border-slate-200 px-2 text-right text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200 disabled:bg-slate-100"
                          disabled={!canEdit || saving}
                        />
                        <p className="mt-1 text-right text-xs text-slate-500">{buildQuantityModeLabel(product)}</p>{lorryEquivalent ? <p className="mt-1 text-right text-xs text-slate-500">{lorryEquivalent}</p> : null}
                        {rowError?.lorryQty ? <p className="mt-1 text-right text-xs text-rose-600">{rowError.lorryQty}</p> : null}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-slate-700">
                        <div>{row.varianceQty ?? "-"}</div>
                        {varianceEquivalent ? <p className="mt-1 text-xs font-normal text-slate-500">{varianceEquivalent}</p> : null}
                      </td>
                      <td className="px-3 py-3 text-right align-top">
                        <Button variant="outline" size="sm" onClick={() => removeRow(row.clientId)} disabled={!canEdit || saving}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}



