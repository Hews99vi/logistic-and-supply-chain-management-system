"use client";

import { AlertCircle, CheckCircle2 } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { DashboardSidebar } from "@/features/dashboard/components/dashboard-sidebar";
import { RouteProgramFormPanel } from "@/features/route-programs/components/route-program-form-panel";
import { RouteProgramPreviewDialog } from "@/features/route-programs/components/route-program-preview-dialog";
import { RouteProgramStatusConfirmDialog } from "@/features/route-programs/components/route-program-status-confirm-dialog";
import { RouteProgramsFilterToolbar } from "@/features/route-programs/components/route-programs-filter-toolbar";
import { RouteProgramsTable } from "@/features/route-programs/components/route-programs-table";
import { useRouteProgramsManagement } from "@/features/route-programs/hooks/use-route-programs-management";

function resolveStatusFilter(isActive: boolean | undefined): "active" | "inactive" | "" {
  if (typeof isActive !== "boolean") {
    return "";
  }

  return isActive ? "active" : "inactive";
}

export function RouteProgramsManagementView() {
  const {
    filters,
    routePrograms,
    total,
    loading,
    refreshing,
    error,
    successMessage,
    searchInput,
    territoryInput,
    territoryOptions,
    formState,
    previewTarget,
    formError,
    formSubmitting,
    statusTarget,
    togglingRouteProgramId,
    canManageRoutePrograms,
    setSearchInput,
    setTerritoryInput,
    setDayOfWeek,
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
    requestRouteProgramStatusToggle,
    cancelRouteProgramStatusToggle,
    confirmRouteProgramStatusToggle
  } = useRouteProgramsManagement();

  return (
    <div className="min-h-screen lg:flex">
      <DashboardSidebar activeKey="route-programs" />

      <main className="flex-1 p-4 sm:p-6">
        <div className="mx-auto max-w-7xl space-y-6">
          <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Operations / Route Programs</p>
            <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-slate-900">Route Programs</h1>
            <p className="mt-2 text-slate-600">Manage territory, day, frequency, and route definitions used across daily distribution operations.</p>
          </header>

          <RouteProgramsFilterToolbar
            searchInput={searchInput}
            territoryInput={territoryInput}
            territoryOptions={territoryOptions}
            dayOfWeek={filters.dayOfWeek}
            status={resolveStatusFilter(filters.isActive)}
            refreshing={refreshing}
            canManageRoutePrograms={canManageRoutePrograms}
            onSearchChange={setSearchInput}
            onTerritoryChange={setTerritoryInput}
            onDayOfWeekChange={setDayOfWeek}
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
            <RouteProgramFormPanel
              formState={formState}
              formError={formError}
              submitting={formSubmitting}
              onClose={closeForm}
              onChange={updateFormValues}
              onSubmit={submitForm}
            />
          ) : null}

          <RouteProgramPreviewDialog routeProgram={previewTarget} onClose={closePreview} />

          <RouteProgramStatusConfirmDialog
            routeProgram={statusTarget}
            submitting={Boolean(togglingRouteProgramId)}
            onCancel={cancelRouteProgramStatusToggle}
            onConfirm={confirmRouteProgramStatusToggle}
          />

          <RouteProgramsTable
            routePrograms={routePrograms}
            loading={loading}
            page={filters.page}
            pageSize={filters.pageSize}
            total={total}
            canManageRoutePrograms={canManageRoutePrograms}
            togglingRouteProgramId={togglingRouteProgramId}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            onView={openPreview}
            onEdit={openEdit}
            onToggleStatus={requestRouteProgramStatusToggle}
          />
        </div>
      </main>
    </div>
  );
}
