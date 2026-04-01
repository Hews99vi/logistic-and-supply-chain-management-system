"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { buildPackInfoLabel, buildQuantityModeLabel, buildUnitEquivalentLabel } from "@/lib/products/pack-helpers";
import type {
  LoadingSummaryItem,
  LoadingSummaryItemBatchSaveInput,
  ProductOption
} from "@/features/loading-summaries/types";

type EditableLoadingRow = {
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
};

type RowErrors = {
  productId?: string;
  loadingQty?: string;
  salesQty?: string;
  lorryQty?: string;
  duplicate?: string;
};

type LoadingSummaryItemsPanelProps = {
  rows: LoadingSummaryItem[];
  products: ProductOption[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  canEdit: boolean;
  canEditStructure: boolean;
  canEditMorningLoading: boolean;
  canEditEveningReconciliation: boolean;
  onSave: (items: LoadingSummaryItemBatchSaveInput[]) => Promise<void>;
};

const moneyFormat = new Intl.NumberFormat("en-LK", {
  style: "currency",
  currency: "LKR",
  maximumFractionDigits: 2
});

function toEditableRow(row: LoadingSummaryItem): EditableLoadingRow {
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
    quantityEntryModeSnapshot: row.quantityEntryModeSnapshot
  };
}

function createEmptyRow(seed = 0): EditableLoadingRow {
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

function resolveProduct(row: EditableLoadingRow, products: ProductOption[]) {
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
    sellingUnit: selected.sellingUnit,
    quantityEntryMode: selected.quantityEntryMode
  };
}

function calculateBalanceQty(loadingQty: number, salesQty: number) {
  if (!Number.isFinite(loadingQty) || !Number.isFinite(salesQty)) {
    return null;
  }

  return loadingQty - salesQty;
}

function calculateVarianceQty(balanceQty: number | null, lorryQty: number) {
  if (balanceQty === null || !Number.isFinite(lorryQty)) {
    return null;
  }

  return lorryQty - balanceQty;
}

function buildVarianceLabel(varianceQty: number | null) {
  if (varianceQty === null) return null;
  if (varianceQty > 0) return "More";
  if (varianceQty < 0) return "Less";
  return "Matched";
}

export function LoadingSummaryItemsPanel({
  rows,
  products,
  loading,
  saving,
  error,
  canEdit,
  canEditStructure,
  canEditMorningLoading,
  canEditEveningReconciliation,
  onSave
}: LoadingSummaryItemsPanelProps) {
  const [editableRows, setEditableRows] = useState<EditableLoadingRow[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, RowErrors>>({});

  useEffect(() => {
    setEditableRows(rows.map(toEditableRow));
    setFieldErrors({});
  }, [rows]);

  const updateRow = (clientId: string, field: keyof EditableLoadingRow, value: string) => {
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
        rowErrors.loadingQty = "Enter a non-negative whole number for loading quantity.";
      }

      if (!Number.isFinite(salesQty) || salesQty < 0) {
        rowErrors.salesQty = "Enter a non-negative whole number for sales quantity.";
      }

      if (!Number.isFinite(lorryQty) || lorryQty < 0) {
        rowErrors.lorryQty = "Enter a non-negative whole number for lorry quantity.";
      }

      if (Number.isFinite(loadingQty) && Number.isFinite(salesQty) && salesQty > loadingQty) {
        rowErrors.salesQty = "Sales quantity cannot exceed loading quantity.";
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

    const payload: LoadingSummaryItemBatchSaveInput[] = editableRows.map((row) => ({
      id: row.id,
      productId: row.productId,
      loadingQty: parseIntegerInput(row.loadingQty),
      salesQty: parseIntegerInput(row.salesQty),
      lorryQty: parseIntegerInput(row.lorryQty)
    }));

    await onSave(payload);
  };

  const totals = useMemo(() => {
    return editableRows.reduce(
      (summary, row) => {
        const loadingQty = parseIntegerInput(row.loadingQty);
        const salesQty = parseIntegerInput(row.salesQty);
        const lorryQty = parseIntegerInput(row.lorryQty);
        const balanceQty = calculateBalanceQty(loadingQty, salesQty);
        const varianceQty = calculateVarianceQty(balanceQty, lorryQty);
        const product = resolveProduct(row, products);

        if (row.productId.trim().length > 0) {
          summary.lineCount += 1;
        }
        if (Number.isFinite(loadingQty) && loadingQty > 0) {
          summary.loadingQty += loadingQty;
        }
        if (Number.isFinite(salesQty) && salesQty > 0) {
          summary.salesQty += salesQty;
        }
        if (balanceQty !== null) {
          summary.balanceQty += balanceQty;
        }
        if (Number.isFinite(lorryQty) && lorryQty > 0) {
          summary.lorryQty += lorryQty;
        }
        if (varianceQty !== null) {
          summary.varianceQty += varianceQty;
        }
        if (Number.isFinite(loadingQty) && loadingQty > 0 && product.unitPrice !== null) {
          summary.totalValue += loadingQty * product.unitPrice;
        }

        return summary;
      },
      {
        lineCount: 0,
        loadingQty: 0,
        salesQty: 0,
        balanceQty: 0,
        lorryQty: 0,
        varianceQty: 0,
        totalValue: 0
      }
    );
  }, [editableRows, products]);

  const stageLabel = canEditEveningReconciliation ? "Evening Reconciliation" : "Morning Loading";
  const duplicateWarnings = useMemo(() => Object.values(fieldErrors).filter((item) => item.duplicate).length, [fieldErrors]);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>Route Product Movement Sheet</CardTitle>
          <CardDescription>
            Morning loading and evening reconciliation live on the same route-wise sheet. Save product movement here, then use DATE only for financial close.
          </CardDescription>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={addRow} disabled={!canEditStructure || saving || loading || products.length === 0}>
            <Plus className="h-4 w-4" />
            Add Row
          </Button>
          <Button onClick={handleSave} disabled={!canEdit || saving || loading || (products.length === 0 && editableRows.length === 0)}>
            <Save className={`h-4 w-4 ${saving ? "animate-pulse" : ""}`} />
            {canEditEveningReconciliation ? "Save Reconciliation" : "Save Morning Loading"}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {error ? <Alert variant="destructive">{error}</Alert> : null}

        {!canEdit ? (
          <Alert>This route sheet is read-only because this route-day record is no longer editable in its current state.</Alert>
        ) : null}

        {!loading && products.length === 0 && editableRows.length === 0 ? (
          <Alert>No active products found. Add products before recording route-wise stock movement.</Alert>
        ) : null}

        {duplicateWarnings > 0 ? (
          <Alert className="border-amber-200 bg-amber-50 text-amber-800">
            Duplicate product selections detected. Each product can appear once per route sheet.
          </Alert>
        ) : null}

        {canEditEveningReconciliation ? (
          <Alert className="border-emerald-200 bg-emerald-50 text-emerald-700">
            Evening reconciliation is active. Loading quantities and product structure are locked; enter only sales quantity and lorry quantity for the returned route sheet.
          </Alert>
        ) : (
          <Alert className="border-amber-200 bg-amber-50 text-amber-800">
            Morning stage is active. Enter loading quantities now, then finalize morning loading before this same sheet can be used for evening sales and lorry reconciliation.
          </Alert>
        )}

        <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm md:grid-cols-3 xl:grid-cols-6">
          <div>
            <p className="text-xs uppercase tracking-wider text-slate-500">Current Stage</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{stageLabel}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-slate-500">Loading Qty</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{totals.loadingQty}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-slate-500">Sales Qty</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{totals.salesQty}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-slate-500">Balance Qty</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{totals.balanceQty}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-slate-500">Lorry Qty</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{totals.lorryQty}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-slate-500">More / Less</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{totals.varianceQty}</p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.14em] text-slate-500">
              <tr>
                <th className="px-3 py-3">Line #</th>
                <th className="px-3 py-3">Product</th>
                <th className="px-3 py-3">Product Code</th>
                <th className="px-3 py-3">Product Name</th>
                <th className="px-3 py-3 text-right">Loading Qty</th>
                <th className="px-3 py-3 text-right">Sales Qty</th>
                <th className="px-3 py-3 text-right">L/Q - S/Q</th>
                <th className="px-3 py-3 text-right">Lorry Qty</th>
                <th className="px-3 py-3 text-right">More / Less</th>
                <th className="px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <tr key={`loading-${index}`}>
                    <td className="px-3 py-3" colSpan={10}>
                      <Skeleton className="h-9 w-full" />
                    </td>
                  </tr>
                ))
              ) : editableRows.length === 0 ? (
                <tr>
                  <td className="px-3 py-10 text-center text-slate-500" colSpan={10}>
                    No product rows yet. Add a row to start recording this route's movement sheet.
                  </td>
                </tr>
              ) : (
                editableRows.map((row, index) => {
                  const rowError = fieldErrors[row.clientId];
                  const product = resolveProduct(row, products);
                  const loadingQty = parseIntegerInput(row.loadingQty);
                  const salesQty = parseIntegerInput(row.salesQty);
                  const lorryQty = parseIntegerInput(row.lorryQty);
                  const balanceQty = calculateBalanceQty(loadingQty, salesQty);
                  const varianceQty = calculateVarianceQty(balanceQty, lorryQty);
                  const quantityModeLabel = buildQuantityModeLabel(product);
                  const packInfo = buildPackInfoLabel(product);
                  const loadingEquivalent = Number.isFinite(loadingQty) ? buildUnitEquivalentLabel(loadingQty, product) : null;
                  const salesEquivalent = Number.isFinite(salesQty) ? buildUnitEquivalentLabel(salesQty, product) : null;
                  const balanceEquivalent = balanceQty !== null ? buildUnitEquivalentLabel(Math.abs(balanceQty), product) : null;
                  const lorryEquivalent = Number.isFinite(lorryQty) ? buildUnitEquivalentLabel(lorryQty, product) : null;
                  const varianceEquivalent = varianceQty !== null && varianceQty !== 0 ? buildUnitEquivalentLabel(Math.abs(varianceQty), product) : null;
                  const varianceLabel = buildVarianceLabel(varianceQty);

                  return (
                    <tr key={row.clientId}>
                      <td className="px-3 py-3 font-semibold text-slate-900">{index + 1}</td>
                      <td className="px-3 py-3 align-top">
                        {canEditStructure ? (
                          <>
                            <select
                              value={row.productId}
                              onChange={(event) => updateRow(row.clientId, "productId", event.target.value)}
                              className="h-9 w-56 rounded-md border border-slate-200 bg-white px-2 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200 disabled:bg-slate-100"
                              disabled={!canEditStructure || saving}
                            >
                              <option value="">Select product</option>
                              {products.map((option) => (
                                <option key={option.id} value={option.id}>{option.productName}</option>
                              ))}
                            </select>
                            {rowError?.productId ? <p className="mt-1 text-xs text-rose-600">{rowError.productId}</p> : null}
                            {rowError?.duplicate ? <p className="mt-1 text-xs text-rose-600">{rowError.duplicate}</p> : null}
                          </>
                        ) : (
                          <div className="font-medium text-slate-900">{product.name}</div>
                        )}
                      </td>
                      <td className="px-3 py-3 font-medium text-slate-700">{product.code}</td>
                      <td className="px-3 py-3 align-top">
                        <p className="text-slate-900">{product.name}</p>
                        <p className="mt-1 text-xs text-slate-500">{packInfo ?? "Legacy product"}</p>
                        {product.unitPrice !== null ? <p className="mt-1 text-xs text-slate-500">Rate {moneyFormat.format(product.unitPrice)}</p> : null}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <input
                          type="number"
                          step="1"
                          min="0"
                          value={row.loadingQty}
                          onChange={(event) => updateRow(row.clientId, "loadingQty", event.target.value)}
                          className="h-9 w-24 rounded-md border border-slate-200 px-2 text-right text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200 disabled:bg-slate-100"
                          disabled={!canEditMorningLoading || saving}
                        />
                        <p className="mt-1 text-right text-xs text-slate-500">{quantityModeLabel}</p>
                        {loadingEquivalent ? <p className="mt-1 text-right text-xs text-slate-500">{loadingEquivalent}</p> : null}
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
                          disabled={!canEditEveningReconciliation || saving}
                        />
                        <p className="mt-1 text-right text-xs text-slate-500">{quantityModeLabel}</p>
                        {salesEquivalent ? <p className="mt-1 text-right text-xs text-slate-500">{salesEquivalent}</p> : null}
                        {rowError?.salesQty ? <p className="mt-1 text-right text-xs text-rose-600">{rowError.salesQty}</p> : null}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-slate-700">
                        <div>{balanceQty ?? "-"}</div>
                        <p className="mt-1 text-xs font-normal text-slate-500">{quantityModeLabel}</p>
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
                          disabled={!canEditEveningReconciliation || saving}
                        />
                        <p className="mt-1 text-right text-xs text-slate-500">{quantityModeLabel}</p>
                        {lorryEquivalent ? <p className="mt-1 text-right text-xs text-slate-500">{lorryEquivalent}</p> : null}
                        {rowError?.lorryQty ? <p className="mt-1 text-right text-xs text-rose-600">{rowError.lorryQty}</p> : null}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-slate-700">
                        <div>{varianceQty ?? "-"}</div>
                        <p className="mt-1 text-xs font-normal text-slate-500">{varianceLabel}</p>
                        {varianceEquivalent ? <p className="mt-1 text-xs font-normal text-slate-500">{varianceEquivalent}</p> : null}
                      </td>
                      <td className="px-3 py-3 text-right align-top">
                        <Button variant="outline" size="sm" onClick={() => removeRow(row.clientId)} disabled={!canEditStructure || saving}>
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
