"use client";

import { AlertCircle, CheckCircle2 } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { DashboardSidebar } from "@/features/dashboard/components/dashboard-sidebar";
import { ProductFormPanel } from "@/features/products/components/product-form-panel";
import { ProductsFilterToolbar } from "@/features/products/components/products-filter-toolbar";
import { ProductsTable } from "@/features/products/components/products-table";
import { useProductsManagement } from "@/features/products/hooks/use-products-management";

function resolveStatusFilter(isActive: boolean | undefined): "active" | "inactive" | "" {
  if (typeof isActive !== "boolean") {
    return "";
  }

  return isActive ? "active" : "inactive";
}

export function ProductsManagementView() {
  const {
    filters,
    products,
    total,
    loading,
    refreshing,
    error,
    successMessage,
    searchInput,
    formState,
    formError,
    formSubmitting,
    togglingProductId,
    canManageProducts,
    setSearchInput,
    setCategory,
    setStatus,
    clearFilters,
    setPage,
    setPageSize,
    reload,
    openCreate,
    openEdit,
    closeForm,
    updateFormValues,
    submitForm,
    toggleProductStatus
  } = useProductsManagement();

  return (
    <div className="min-h-screen lg:flex">
      <DashboardSidebar activeKey="products" />

      <main className="flex-1 p-4 sm:p-6">
        <div className="mx-auto max-w-7xl space-y-6">
          <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Operations / Products</p>
            <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-slate-900">Product Management</h1>
            <p className="mt-2 text-slate-600">Manage catalog products, pricing, and active lifecycle status for daily distribution workflows.</p>
          </header>

          <ProductsFilterToolbar
            searchInput={searchInput}
            category={filters.category}
            status={resolveStatusFilter(filters.isActive)}
            refreshing={refreshing}
            canManageProducts={canManageProducts}
            onSearchChange={setSearchInput}
            onCategoryChange={setCategory}
            onStatusChange={setStatus}
            onClearFilters={clearFilters}
            onReload={reload}
            onOpenCreate={openCreate}
          />

          {successMessage ? (
            <Alert className="flex items-center gap-2 border-emerald-200 bg-emerald-50 text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              <span>{successMessage}</span>
            </Alert>
          ) : null}

          {error ? (
            <Alert variant="destructive" className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              <span>{error}</span>
            </Alert>
          ) : null}

          {formState ? (
            <ProductFormPanel
              formState={formState}
              formError={formError}
              submitting={formSubmitting}
              onClose={closeForm}
              onChange={updateFormValues}
              onSubmit={submitForm}
            />
          ) : null}

          <ProductsTable
            products={products}
            loading={loading}
            page={filters.page}
            pageSize={filters.pageSize}
            total={total}
            canManageProducts={canManageProducts}
            togglingProductId={togglingProductId}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            onEdit={openEdit}
            onToggleStatus={toggleProductStatus}
          />
        </div>
      </main>
    </div>
  );
}