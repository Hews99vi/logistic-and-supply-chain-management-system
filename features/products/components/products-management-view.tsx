"use client";

import { AlertCircle, CheckCircle2 } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
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
    canManageProductCosts,
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
    <AppShell sidebar={<DashboardSidebar activeKey="products" />}>
      <header className="app-page-header">
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
          canManageProductCosts={canManageProductCosts}
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
        canManageProductCosts={canManageProductCosts}
        togglingProductId={togglingProductId}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        onEdit={openEdit}
        onToggleStatus={toggleProductStatus}
      />
    </AppShell>
  );
}
