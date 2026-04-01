"use client";

import { Plus, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PRODUCT_CATEGORY_OPTIONS, type ProductCategory } from "@/features/products/types";

type ProductsFilterToolbarProps = {
  searchInput: string;
  category?: ProductCategory;
  status: "active" | "inactive" | "";
  refreshing: boolean;
  canManageProducts: boolean;
  onSearchChange: (value: string) => void;
  onCategoryChange: (value: ProductCategory | "") => void;
  onStatusChange: (value: "active" | "inactive" | "") => void;
  onClearFilters: () => void;
  onReload: () => void;
  onOpenCreate: () => void;
};

export function ProductsFilterToolbar({
  searchInput,
  category,
  status,
  refreshing,
  canManageProducts,
  onSearchChange,
  onCategoryChange,
  onStatusChange,
  onClearFilters,
  onReload,
  onOpenCreate
}: ProductsFilterToolbarProps) {
  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-card sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Inventory / Products</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={onReload} disabled={refreshing}>
            {refreshing ? "Refreshing..." : "Refresh"}
          </Button>
          {canManageProducts ? (
            <Button onClick={onOpenCreate}>
              <Plus className="h-4 w-4" />
              Add New Product
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="space-y-1 xl:col-span-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Search</span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={searchInput}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search by product code, name, or SKU"
              className="h-10 w-full rounded-md border border-slate-200 pl-10 pr-3 text-sm outline-none ring-offset-2 transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200"
            />
          </div>
        </label>

        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Category</span>
          <select
            value={category ?? ""}
            onChange={(event) => onCategoryChange(event.target.value as ProductCategory | "")}
            className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none ring-offset-2 transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200"
          >
            <option value="">All Categories</option>
            {PRODUCT_CATEGORY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Status</span>
          <select
            value={status}
            onChange={(event) => onStatusChange(event.target.value as "active" | "inactive" | "")}
            className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none ring-offset-2 transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200"
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
      </div>

      <div className="flex justify-end">
        <Button variant="ghost" onClick={onClearFilters}>
          <X className="h-4 w-4" />
          Clear All Filters
        </Button>
      </div>
    </section>
  );
}