"use client";

import { AlertCircle, CheckCircle2 } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { DashboardSidebar } from "@/features/dashboard/components/dashboard-sidebar";
import { CustomerFormPanel } from "@/features/customers/components/customer-form-panel";
import { CustomerPreviewDialog } from "@/features/customers/components/customer-preview-dialog";
import { CustomersFilterToolbar } from "@/features/customers/components/customers-filter-toolbar";
import { CustomersTable } from "@/features/customers/components/customers-table";
import { CustomerStatusConfirmDialog } from "@/features/customers/components/customer-status-confirm-dialog";
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
    <div className="min-h-screen lg:flex">
      <DashboardSidebar activeKey="customers" />

      <main className="flex-1 p-4 sm:p-6">
        <div className="mx-auto max-w-7xl space-y-6">
          <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-6">
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
        </div>
      </main>
    </div>
  );
}
