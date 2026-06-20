"use client";

import { AlertCircle, CheckCircle2 } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { Alert } from "@/components/ui/alert";
import { DashboardSidebar } from "@/features/dashboard/components/dashboard-sidebar";
import { CustomerFormPanel } from "@/features/customers/components/customer-form-panel";
import { CustomerPreviewDialog } from "@/features/customers/components/customer-preview-dialog";
import { CustomerStatusConfirmDialog } from "@/features/customers/components/customer-status-confirm-dialog";
import { CustomersFilterToolbar } from "@/features/customers/components/customers-filter-toolbar";
import { CustomersTable } from "@/features/customers/components/customers-table";
import { useCustomersManagement } from "@/features/customers/hooks/use-customers-management";

function resolveStatusFilter(status: "ACTIVE" | "INACTIVE" | undefined): "active" | "inactive" | "" {
  if (!status) {
    return "";
  }

  return status === "ACTIVE" ? "active" : "inactive";
}

export function CustomersManagementView() {
  const {
    filters,
    customers,
    unmatchedCustomers,
    total,
    loading,
    refreshing,
    error,
    successMessage,
    searchInput,
    territoryInput,
    formState,
    previewTarget,
    formError,
    formSubmitting,
    statusTarget,
    togglingCustomerId,
    canManageCustomers,
    setSearchInput,
    setTerritoryInput,
    setStatus,
    clearFilters,
    setPage,
    setPageSize,
    reload,
    resolveUnmatched,
    openCreate,
    openPreview,
    closePreview,
    openEdit,
    closeForm,
    updateFormValues,
    submitForm,
    requestCustomerStatusToggle,
    cancelCustomerStatusToggle,
    confirmCustomerStatusToggle
  } = useCustomersManagement();

  return (
    <AppShell sidebar={<DashboardSidebar activeKey="customers" />}>
      <header className="app-page-header">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Operations / Customers</p>
        <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-slate-900">Customers</h1>
        <p className="mt-2 text-slate-600">Manage shop and customer master records used across route operations, returns, and reporting workflows.</p>
      </header>

      <CustomersFilterToolbar
        searchInput={searchInput}
        territoryInput={territoryInput}
        status={resolveStatusFilter(filters.status)}
        refreshing={refreshing}
        canManageCustomers={canManageCustomers}
        onSearchChange={setSearchInput}
        onTerritoryChange={setTerritoryInput}
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

      {canManageCustomers && unmatchedCustomers.filter((row) => row.status === "pending").length > 0 ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Unmatched Flat Data Customers</h2>
              <p className="mt-1 text-sm text-amber-800">Review outlet names imported from Flat Data that are not linked to customer master records yet.</p>
            </div>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800">
              {unmatchedCustomers.filter((row) => row.status === "pending").length} pending
            </span>
          </div>
          <div className="mt-4 grid gap-2">
            {unmatchedCustomers.filter((row) => row.status === "pending").slice(0, 5).map((row) => (
              <div key={row.id} className="flex flex-col gap-2 rounded-xl border border-amber-100 bg-white p-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-semibold text-slate-900">{row.outletName}</p>
                  <p className="text-xs text-slate-500">{row.routeName ?? "Route unknown"} / last seen {new Date(row.updatedAt).toLocaleDateString("en-LK")}</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white" onClick={() => resolveUnmatched(row.id, "create")}>
                    Create Customer
                  </button>
                  <button type="button" className="rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700" onClick={() => resolveUnmatched(row.id, "ignore")}>
                    Ignore
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {error ? (
        <Alert variant="destructive" className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          <span>{error}</span>
        </Alert>
      ) : null}

      {formState ? (
        <CustomerFormPanel
          formState={formState}
          formError={formError}
          submitting={formSubmitting}
          onClose={closeForm}
          onChange={updateFormValues}
          onSubmit={submitForm}
        />
      ) : null}

      <CustomerPreviewDialog customer={previewTarget} onClose={closePreview} />

      <CustomerStatusConfirmDialog
        customer={statusTarget}
        submitting={Boolean(togglingCustomerId)}
        onCancel={cancelCustomerStatusToggle}
        onConfirm={confirmCustomerStatusToggle}
      />

      <CustomersTable
        customers={customers}
        loading={loading}
        page={filters.page}
        pageSize={filters.pageSize}
        total={total}
        canManageCustomers={canManageCustomers}
        togglingCustomerId={togglingCustomerId}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        onView={openPreview}
        onEdit={openEdit}
        onToggleStatus={requestCustomerStatusToggle}
      />
    </AppShell>
  );
}
