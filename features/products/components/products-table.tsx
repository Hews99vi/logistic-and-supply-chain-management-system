"use client";

import { ChevronLeft, ChevronRight, Edit, Power } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductStatusBadge } from "@/features/products/components/product-status-badge";
import { buildProductStructuredSummary, type ProductListItem } from "@/features/products/types";

function formatCurrencyLkr(amount: number) {
  return new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency: "LKR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-LK", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatPackInformation(product: ProductListItem) {
  const parts: string[] = [];

  const size = [
    product.unit_size !== null && product.unit_size !== undefined ? String(product.unit_size) : "",
    product.unit_measure ?? ""
  ].filter(Boolean).join(" ").trim();

  if (size) {
    parts.push(size);
  }

  if (product.pack_size !== null && product.pack_size !== undefined) {
    parts.push(`x ${product.pack_size}`);
  }

  if (product.selling_unit) {
    parts.push(product.selling_unit);
  }

  return parts.join(" ").trim();
}

type ProductsTableProps = {
  products: ProductListItem[];
  loading: boolean;
  page: number;
  pageSize: number;
  total: number;
  canManageProducts: boolean;
  togglingProductId: string | null;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onEdit: (product: ProductListItem) => void;
  onToggleStatus: (product: ProductListItem) => void;
};

export function ProductsTable({
  products,
  loading,
  page,
  pageSize,
  total,
  canManageProducts,
  togglingProductId,
  onPageChange,
  onPageSizeChange,
  onEdit,
  onToggleStatus
}: ProductsTableProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.14em] text-slate-500">
              <tr>
                <th className="px-5 py-4 font-semibold">Product Code</th>
                <th className="px-5 py-4 font-semibold">Display Name</th>
                <th className="px-5 py-4 font-semibold">Pack Info</th>
                <th className="px-5 py-4 text-right font-semibold">Rate</th>
                <th className="px-5 py-4 font-semibold">Status</th>
                <th className="px-5 py-4 font-semibold">Updated At</th>
                <th className="px-5 py-4 text-right font-semibold">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
              {loading ? (
                Array.from({ length: pageSize }).map((_, index) => (
                  <tr key={index}>
                    <td className="px-5 py-4" colSpan={7}><Skeleton className="h-10 w-full" /></td>
                  </tr>
                ))
              ) : products.length === 0 ? (
                <tr>
                  <td className="px-5 py-12 text-center text-slate-500" colSpan={7}>
                    No products found for the selected filters.
                  </td>
                </tr>
              ) : (
                products.map((product) => {
                  const productLabel = product.display_name ?? product.product_name;
                  const productSummary = buildProductStructuredSummary(product);
                  const packInfo = formatPackInformation(product);

                  return (
                    <tr key={product.id} className="hover:bg-slate-50/70">
                      <td className="px-5 py-4 font-semibold text-slate-900">{product.product_code}</td>
                      <td className="px-5 py-4 align-top">
                        <p className="font-medium text-slate-900">{productLabel}</p>
                        {productSummary && productSummary !== productLabel ? (
                          <p className="mt-1 text-xs text-slate-500">{productSummary}</p>
                        ) : null}
                        {product.category ? (
                          <p className="mt-1 text-xs uppercase tracking-wide text-slate-400">{product.category.replaceAll("_", " ")}</p>
                        ) : null}
                        {!product.display_name && product.product_name ? (
                          <p className="mt-1 text-xs text-slate-400">Legacy name: {product.product_name}</p>
                        ) : null}
                      </td>
                      <td className="px-5 py-4 align-top">
                        {packInfo ? (
                          <p className="font-medium text-slate-900">{packInfo}</p>
                        ) : (
                          <p className="text-slate-400">Not structured yet</p>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right font-semibold text-slate-900">{formatCurrencyLkr(product.unit_price)}</td>
                      <td className="px-5 py-4"><ProductStatusBadge isActive={product.is_active} /></td>
                      <td className="px-5 py-4 text-slate-500">{formatDateTime(product.updated_at)}</td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          {canManageProducts ? (
                            <>
                              <Button variant="outline" size="sm" onClick={() => onEdit(product)}>
                                <Edit className="h-3.5 w-3.5" />
                                Edit
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => onToggleStatus(product)}
                                disabled={togglingProductId === product.id}
                              >
                                <Power className="h-3.5 w-3.5" />
                                {product.is_active ? "Deactivate" : "Activate"}
                              </Button>
                            </>
                          ) : (
                            <span className="text-xs text-slate-400">No actions</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-4 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span>Rows per page</span>
            <select
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              className="h-9 rounded-md border border-slate-200 bg-white px-2"
            >
              {[10, 25, 50].map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
            <span>{from}-{to} of {total} items</span>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-20 text-center font-semibold text-slate-700">Page {page} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
