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
  canManageProductCosts: boolean;
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
  canManageProductCosts,
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
        <div className="divide-y divide-slate-100 md:hidden">
          {loading ? (
            Array.from({ length: Math.min(pageSize, 4) }).map((_, index) => (
              <div key={index} className="p-4">
                <Skeleton className="h-44 w-full rounded-xl" />
              </div>
            ))
          ) : products.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-slate-500">
              No products found for the selected filters.
            </div>
          ) : (
            products.map((product) => {
              const productLabel = product.display_name ?? product.product_name;
              const productSummary = buildProductStructuredSummary(product);
              const packInfo = formatPackInformation(product);
              const quantityMode = product.quantity_entry_mode === "unit" ? "Selling units entered" : "Packs / cases entered";

              return (
                <article key={product.id} className="space-y-4 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">{productLabel}</p>
                      <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Code {product.product_code}</p>
                    </div>
                    <ProductStatusBadge isActive={product.is_active} />
                  </div>

                  <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                    {productSummary && productSummary !== productLabel ? <p className="text-slate-700">{productSummary}</p> : null}
                    <p className="text-slate-700">{packInfo || "Not structured yet"}</p>
                    <p className="font-semibold text-slate-900">{formatCurrencyLkr(product.unit_price)}</p>
                    {canManageProductCosts ? (
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <p className="text-slate-500">Dist. <span className="font-semibold text-slate-900">{formatCurrencyLkr(product.distributor_price ?? 0)}</span></p>
                        <p className="text-slate-500">W/Sale <span className="font-semibold text-slate-900">{formatCurrencyLkr(product.wholesale_price ?? 0)}</span></p>
                        <p className="text-slate-500">Margin <span className="font-semibold text-emerald-700">{formatCurrencyLkr(product.piece_margin ?? 0)}</span></p>
                        <p className="text-slate-500">Sys Margin <span className="font-semibold text-emerald-700">{formatCurrencyLkr(product.unit_price - (product.distributor_price ?? 0))}</span></p>
                      </div>
                    ) : null}
                    <p className="text-slate-500">{quantityMode}</p>
                    {product.category ? <p className="text-xs uppercase tracking-wide text-slate-400">{product.category.replaceAll("_", " ")}</p> : null}
                    {!product.display_name && product.product_name ? <p className="text-xs text-slate-400">Legacy name: {product.product_name}</p> : null}
                    <p className="text-xs text-slate-500">Updated {formatDateTime(product.updated_at)}</p>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    {canManageProducts ? (
                      <>
                        <Button className="w-full" variant="outline" onClick={() => onEdit(product)}>
                          <Edit className="h-3.5 w-3.5" />
                          Edit
                        </Button>
                        <Button
                          className="w-full"
                          variant="outline"
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
                </article>
              );
            })
          )}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className={canManageProductCosts ? "min-w-[1120px] xl:min-w-full" : "min-w-[960px] xl:min-w-full"}>
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.14em] text-slate-500">
              <tr>
                <th className="px-5 py-4 font-semibold">Product Code</th>
                <th className="px-5 py-4 font-semibold">Display Name</th>
                <th className="px-5 py-4 font-semibold">Pack Info</th>
                <th className="px-5 py-4 font-semibold">Quantity Mode</th>
                <th className="px-5 py-4 text-right font-semibold">Rate</th>
                {canManageProductCosts ? <th className="px-5 py-4 text-right font-semibold">Distributor Price</th> : null}
                {canManageProductCosts ? <th className="px-5 py-4 text-right font-semibold">Wholesale Price</th> : null}
                {canManageProductCosts ? <th className="px-5 py-4 text-right font-semibold">Piece Margin</th> : null}
                {canManageProductCosts ? <th className="px-5 py-4 text-right font-semibold">Sys Margin</th> : null}
                <th className="px-5 py-4 font-semibold">Status</th>
                <th className="px-5 py-4 font-semibold">Updated At</th>
                <th className="px-5 py-4 text-right font-semibold">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
              {loading ? (
                Array.from({ length: pageSize }).map((_, index) => (
                  <tr key={index}>
                    <td className="px-5 py-4" colSpan={canManageProductCosts ? 12 : 8}><Skeleton className="h-10 w-full" /></td>
                  </tr>
                ))
              ) : products.length === 0 ? (
                <tr>
                  <td className="px-5 py-12 text-center text-slate-500" colSpan={canManageProductCosts ? 12 : 8}>
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
                      <td className="px-5 py-4 text-slate-600">{product.quantity_entry_mode === "unit" ? "Selling units entered" : "Packs / cases entered"}</td>
                      <td className="px-5 py-4 text-right font-semibold text-slate-900">{formatCurrencyLkr(product.unit_price)}</td>
                      {canManageProductCosts ? (
                        <td className="px-5 py-4 text-right font-semibold text-slate-900">{formatCurrencyLkr(product.distributor_price ?? 0)}</td>
                      ) : null}
                      {canManageProductCosts ? (
                        <td className="px-5 py-4 text-right font-semibold text-slate-900">{formatCurrencyLkr(product.wholesale_price ?? 0)}</td>
                      ) : null}
                      {canManageProductCosts ? (
                        <td className="px-5 py-4 text-right font-semibold text-emerald-700">{formatCurrencyLkr(product.piece_margin ?? 0)}</td>
                      ) : null}
                      {canManageProductCosts ? (
                        <td className="px-5 py-4 text-right font-semibold text-emerald-700">{formatCurrencyLkr(product.unit_price - (product.distributor_price ?? 0))}</td>
                      ) : null}
                      <td className="px-5 py-4"><ProductStatusBadge isActive={product.is_active} /></td>
                      <td className="px-5 py-4 text-slate-500">{formatDateTime(product.updated_at)}</td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap justify-end gap-2">
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

        <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-4 text-sm text-slate-600 sm:px-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
            <span>Rows per page</span>
            <select
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 sm:w-auto"
            >
              {[10, 25, 50].map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
            <span>{from}-{to} of {total} items</span>
          </div>

          <div className="flex items-center justify-between gap-2 sm:justify-end">
            <Button className="shrink-0" variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-20 flex-1 text-center font-semibold text-slate-700 sm:flex-none">Page {page} / {totalPages}</span>
            <Button className="shrink-0" variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
