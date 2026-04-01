"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { DailyReportReturnDamageEntryDto } from "@/types/domain/report";
import type { ProductOption, ReportReturnDamageBatchSaveItemInput } from "@/features/reports/types";
import { buildPackInfoLabel, buildQuantityModeLabel, buildUnitEquivalentLabel } from "@/lib/products/pack-helpers";

type EditableReturnDamageRow = {
  id?: string;
  clientId: string;
  productId: string;
  invoiceNo: string;
  shopName: string;
  damageQty: string;
  returnQty: string;
  freeIssueQty: string;
  notes: string;
  productCodeSnapshot?: string;
  productNameSnapshot?: string;
  productDisplayNameSnapshot?: string | null;
  unitPriceSnapshot?: number;
  unitSizeSnapshot?: number | null;
  unitMeasureSnapshot?: string | null;
  packSizeSnapshot?: number | null;
  sellingUnitSnapshot?: string | null;
  quantityEntryModeSnapshot?: "pack" | "unit" | null;
  qty?: number;
  value?: number;
};

type RowErrors = {
  productId?: string;
  invoiceNo?: string;
  shopName?: string;
  damageQty?: string;
  returnQty?: string;
  freeIssueQty?: string;
  notes?: string;
  quantityGroup?: string;
};

type ReportReturnDamageEntriesPanelProps = {
  rows: DailyReportReturnDamageEntryDto[];
  products: ProductOption[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  canEdit: boolean;
  onSave: (items: ReportReturnDamageBatchSaveItemInput[]) => Promise<void>;
};

const moneyFormat = new Intl.NumberFormat("en-LK", {
  style: "currency",
  currency: "LKR",
  maximumFractionDigits: 2
});

function toEditableRow(row: DailyReportReturnDamageEntryDto): EditableReturnDamageRow {
  return {
    id: row.id,
    clientId: row.id,
    productId: row.productId,
    invoiceNo: row.invoiceNo ?? "",
    shopName: row.shopName ?? "",
    damageQty: String(row.damageQty),
    returnQty: String(row.returnQty),
    freeIssueQty: String(row.freeIssueQty),
    notes: row.notes ?? "",
    productCodeSnapshot: row.productCodeSnapshot,
    productNameSnapshot: row.productNameSnapshot,
    productDisplayNameSnapshot: row.productDisplayNameSnapshot,
    unitPriceSnapshot: row.unitPriceSnapshot,
    unitSizeSnapshot: row.unitSizeSnapshot,
    unitMeasureSnapshot: row.unitMeasureSnapshot,
    packSizeSnapshot: row.packSizeSnapshot,
    sellingUnitSnapshot: row.sellingUnitSnapshot,
    quantityEntryModeSnapshot: row.quantityEntryModeSnapshot,
    qty: row.qty,
    value: row.value
  };
}

function createEmptyRow(seed = 0): EditableReturnDamageRow {
  const suffix = `${Date.now()}-${seed}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    clientId: `new-${suffix}`,
    productId: "",
    invoiceNo: "",
    shopName: "",
    damageQty: "0",
    returnQty: "0",
    freeIssueQty: "0",
    notes: ""
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

function resolveProduct(row: EditableReturnDamageRow, products: ProductOption[]) {
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

export function ReportReturnDamageEntriesPanel({
  rows,
  products,
  loading,
  saving,
  error,
  canEdit,
  onSave
}: ReportReturnDamageEntriesPanelProps) {
  const [editableRows, setEditableRows] = useState<EditableReturnDamageRow[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, RowErrors>>({});

  useEffect(() => {
    setEditableRows(rows.map(toEditableRow));
    setFieldErrors({});
  }, [rows]);

  const updateRow = (clientId: string, field: keyof EditableReturnDamageRow, value: string) => {
    setEditableRows((previous) => previous.map((row) => (row.clientId === clientId ? { ...row, [field]: value } : row)));
    setFieldErrors((previous) => {
      if (!previous[clientId]) return previous;
      const next = { ...previous };
      next[clientId] = { ...next[clientId], [field]: undefined, quantityGroup: undefined };
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

  const totalReturnValue = useMemo(() => {
    return editableRows.reduce((acc, row) => acc + (row.value ?? 0), 0);
  }, [editableRows]);

  const validateRows = () => {
    const errors: Record<string, RowErrors> = {};

    editableRows.forEach((row) => {
      const rowErrors: RowErrors = {};
      const productId = row.productId.trim();
      const invoiceNo = row.invoiceNo.trim();
      const shopName = row.shopName.trim();
      const notes = row.notes.trim();

      const damageQty = parseIntegerInput(row.damageQty);
      const returnQty = parseIntegerInput(row.returnQty);
      const freeIssueQty = parseIntegerInput(row.freeIssueQty);

      if (!productId) {
        rowErrors.productId = "Product is required.";
      }

      if (invoiceNo.length > 80) {
        rowErrors.invoiceNo = "Max 80 characters.";
      }

      if (shopName.length > 160) {
        rowErrors.shopName = "Max 160 characters.";
      }

      if (!Number.isFinite(damageQty) || damageQty < 0) {
        rowErrors.damageQty = "Enter a non-negative whole number for this product quantity.";
      }

      if (!Number.isFinite(returnQty) || returnQty < 0) {
        rowErrors.returnQty = "Enter a non-negative whole number for this product quantity.";
      }

      if (!Number.isFinite(freeIssueQty) || freeIssueQty < 0) {
        rowErrors.freeIssueQty = "Enter a non-negative whole number for this product quantity.";
      }

      if (Number.isFinite(damageQty) && Number.isFinite(returnQty) && Number.isFinite(freeIssueQty)) {
        if (damageQty + returnQty + freeIssueQty <= 0) {
          rowErrors.quantityGroup = "At least one of damage, return, or free issue quantities must be greater than zero.";
        }
      }

      if (notes.length > 500) {
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

    const payload: ReportReturnDamageBatchSaveItemInput[] = editableRows.map((row) => ({
      id: row.id,
      productId: row.productId,
      invoiceNo: row.invoiceNo.trim() || undefined,
      shopName: row.shopName.trim() || undefined,
      damageQty: parseIntegerInput(row.damageQty),
      returnQty: parseIntegerInput(row.returnQty),
      freeIssueQty: parseIntegerInput(row.freeIssueQty),
      notes: row.notes.trim() || undefined
    }));

    await onSave(payload);
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>Returns & Damage Entries</CardTitle>
          <CardDescription>Track return, damage, and free issue quantities using each product's configured quantity mode, with backend-generated totals and values.</CardDescription>
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
          <Alert>Return and damage entries are read-only because this report is no longer in draft.</Alert>
        ) : null}

        {!loading && products.length === 0 ? (
          <Alert>No active products found. Add products before recording return and damage entries.</Alert>
        ) : null}

        <Alert>Quantities in this section follow each product's configured quantity mode. Unit-equivalent helpers appear only when the row has structured pack metadata.</Alert>

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
                <th className="px-3 py-3 text-right">Total Quantity</th>
                <th className="px-3 py-3 text-right">Value</th>
                <th className="px-3 py-3">Invoice No</th>
                <th className="px-3 py-3">Shop Name</th>
                <th className="px-3 py-3 text-right">Damage Quantity</th>
                <th className="px-3 py-3 text-right">Return Quantity</th>
                <th className="px-3 py-3 text-right">Free Issue Quantity</th>
                <th className="px-3 py-3">Notes</th>
                <th className="px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <tr key={`loading-${index}`}>
                    <td className="px-3 py-3" colSpan={15}>
                      <Skeleton className="h-9 w-full" />
                    </td>
                  </tr>
                ))
              ) : editableRows.length === 0 ? (
                <tr>
                  <td className="px-3 py-10 text-center text-slate-500" colSpan={15}>
                    No return or damage entries yet. Add a row to start capturing movements using each product's quantity mode.
                  </td>
                </tr>
              ) : (
                editableRows.map((row, index) => {
                  const rowError = fieldErrors[row.clientId];
                  const product = resolveProduct(row, products);
                  const packInfo = buildPackInfoLabel(product);
                  const totalEquivalent = row.qty !== undefined ? buildUnitEquivalentLabel(row.qty, product) : null;
                  const damageQty = parseIntegerInput(row.damageQty);
                  const returnQty = parseIntegerInput(row.returnQty);
                  const freeIssueQty = parseIntegerInput(row.freeIssueQty);
                  const damageEquivalent = Number.isFinite(damageQty) ? buildUnitEquivalentLabel(damageQty, product) : null;
                  const returnEquivalent = Number.isFinite(returnQty) ? buildUnitEquivalentLabel(returnQty, product) : null;
                  const freeIssueEquivalent = Number.isFinite(freeIssueQty) ? buildUnitEquivalentLabel(freeIssueQty, product) : null;

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
                      </td>
                      <td className="px-3 py-3">{product.code}</td>
                      <td className="px-3 py-3 text-slate-900">
                        <p>{product.name}</p>
                        {totalEquivalent ? <p className="mt-1 text-xs text-slate-500">{totalEquivalent}</p> : null}
                      </td>
                      <td className="px-3 py-3 text-slate-600">{packInfo ?? "-"}</td>
                      <td className="px-3 py-3 text-right">{product.unitPrice === null ? "-" : moneyFormat.format(product.unitPrice)}</td>
                      <td className="px-3 py-3 text-right font-semibold text-slate-700">{row.qty ?? "-"}</td>
                      <td className="px-3 py-3 text-right font-semibold text-slate-700">{typeof row.value === "number" ? moneyFormat.format(row.value) : "-"}</td>
                      <td className="px-3 py-3 align-top">
                        <input
                          value={row.invoiceNo}
                          onChange={(event) => updateRow(row.clientId, "invoiceNo", event.target.value)}
                          className="h-9 w-40 rounded-md border border-slate-200 px-2 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200 disabled:bg-slate-100"
                          disabled={!canEdit || saving}
                        />
                        {rowError?.invoiceNo ? <p className="mt-1 text-xs text-rose-600">{rowError.invoiceNo}</p> : null}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <input
                          value={row.shopName}
                          onChange={(event) => updateRow(row.clientId, "shopName", event.target.value)}
                          className="h-9 w-44 rounded-md border border-slate-200 px-2 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200 disabled:bg-slate-100"
                          disabled={!canEdit || saving}
                        />
                        {rowError?.shopName ? <p className="mt-1 text-xs text-rose-600">{rowError.shopName}</p> : null}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <input
                          type="number"
                          step="1"
                          min="0"
                          value={row.damageQty}
                          onChange={(event) => updateRow(row.clientId, "damageQty", event.target.value)}
                          className="h-9 w-24 rounded-md border border-slate-200 px-2 text-right text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200 disabled:bg-slate-100"
                          disabled={!canEdit || saving}
                        />
                        <p className="mt-1 text-right text-xs text-slate-500">{buildQuantityModeLabel(product)}</p>{damageEquivalent ? <p className="mt-1 text-right text-xs text-slate-500">{damageEquivalent}</p> : null}
                        {rowError?.damageQty ? <p className="mt-1 text-right text-xs text-rose-600">{rowError.damageQty}</p> : null}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <input
                          type="number"
                          step="1"
                          min="0"
                          value={row.returnQty}
                          onChange={(event) => updateRow(row.clientId, "returnQty", event.target.value)}
                          className="h-9 w-24 rounded-md border border-slate-200 px-2 text-right text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200 disabled:bg-slate-100"
                          disabled={!canEdit || saving}
                        />
                        <p className="mt-1 text-right text-xs text-slate-500">{buildQuantityModeLabel(product)}</p>{returnEquivalent ? <p className="mt-1 text-right text-xs text-slate-500">{returnEquivalent}</p> : null}
                        {rowError?.returnQty ? <p className="mt-1 text-right text-xs text-rose-600">{rowError.returnQty}</p> : null}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <input
                          type="number"
                          step="1"
                          min="0"
                          value={row.freeIssueQty}
                          onChange={(event) => updateRow(row.clientId, "freeIssueQty", event.target.value)}
                          className="h-9 w-24 rounded-md border border-slate-200 px-2 text-right text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200 disabled:bg-slate-100"
                          disabled={!canEdit || saving}
                        />
                        <p className="mt-1 text-right text-xs text-slate-500">{buildQuantityModeLabel(product)}</p>{freeIssueEquivalent ? <p className="mt-1 text-right text-xs text-slate-500">{freeIssueEquivalent}</p> : null}
                        {rowError?.freeIssueQty ? <p className="mt-1 text-right text-xs text-rose-600">{rowError.freeIssueQty}</p> : null}
                        {rowError?.quantityGroup ? <p className="mt-1 text-right text-xs text-rose-600">{rowError.quantityGroup}</p> : null}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <input
                          value={row.notes}
                          onChange={(event) => updateRow(row.clientId, "notes", event.target.value)}
                          className="h-9 w-52 rounded-md border border-slate-200 px-2 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200 disabled:bg-slate-100"
                          disabled={!canEdit || saving}
                        />
                        {rowError?.notes ? <p className="mt-1 text-xs text-rose-600">{rowError.notes}</p> : null}
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
            <tfoot className="bg-slate-50 text-sm font-semibold text-slate-900">
              <tr>
                <td className="px-3 py-3" colSpan={7}>Total Return / Damage Value</td>
                <td className="px-3 py-3 text-right">{moneyFormat.format(totalReturnValue)}</td>
                <td className="px-3 py-3" colSpan={7}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}


