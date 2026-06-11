"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { Alert } from "@/components/ui/alert";
import { DashboardSidebar } from "@/features/dashboard/components/dashboard-sidebar";
import { LoadingSummaryFinalizeConfirmDialog } from "@/features/loading-summaries/components/loading-summary-finalize-confirm-dialog";
import { LoadingSummaryDeleteConfirmDialog } from "@/features/loading-summaries/components/loading-summary-delete-confirm-dialog";
import { LoadingSummariesFilterToolbar } from "@/features/loading-summaries/components/loading-summaries-filter-toolbar";
import { LoadingSummaryFormPanel } from "@/features/loading-summaries/components/loading-summary-form-panel";
import { LoadingSummariesTable } from "@/features/loading-summaries/components/loading-summaries-table";
import { useLoadingSummariesManagement } from "@/features/loading-summaries/hooks/use-loading-summaries-management";
import type { LoadingSummaryListItem } from "@/features/loading-summaries/types";

export function LoadingSummariesManagementView() {
  const {
    filters,
    items,
    total,
    loading,
    refreshing,
    error,
    successMessage,
    routeOptions,
    searchInput,
    formState,
    formError,
    formSubmitting,
    finalizingId,
    canCreate,
    setSearchInput,
    setDateFrom,
    setDateTo,
    setRouteProgramId,
    setStatus,
    clearFilters,
    setPage,
    setPageSize,
    reload,
    openCreate,
    closeCreate,
    updateFormValues,
    submitCreate,
    finalizeSummary,
    canFinalize,
    deleteSummary,
    deletingId
  } = useLoadingSummariesManagement();

  const [pendingFinalizeSummary, setPendingFinalizeSummary] = useState<LoadingSummaryListItem | null>(null);
  const [pendingDeleteSummary, setPendingDeleteSummary] = useState<LoadingSummaryListItem | null>(null);

  const handleRequestFinalize = (item: LoadingSummaryListItem) => {
    if (!canFinalize(item)) return;
    setPendingFinalizeSummary(item);
  };

  const handleConfirmFinalize = async () => {
    if (!pendingFinalizeSummary) return;

    const didFinalize = await finalizeSummary(pendingFinalizeSummary);
    if (didFinalize) {
      setPendingFinalizeSummary(null);
    }
  };

  const handleCancelFinalize = () => {
    if (pendingFinalizeSummary && finalizingId === pendingFinalizeSummary.id) {
      return;
    }

    setPendingFinalizeSummary(null);
  };

  const handleRequestDelete = (item: LoadingSummaryListItem) => {
    if (item.status !== "draft" || !canCreate) return;
    setPendingDeleteSummary(item);
  };

  const handleConfirmDelete = async () => {
    if (!pendingDeleteSummary) return;

    const didDelete = await deleteSummary(pendingDeleteSummary);
    if (didDelete) {
      setPendingDeleteSummary(null);
    }
  };

  const handleCancelDelete = () => {
    if (pendingDeleteSummary && deletingId === pendingDeleteSummary.id) {
      return;
    }

    setPendingDeleteSummary(null);
  };

  const isFinalizeSubmitting = Boolean(pendingFinalizeSummary && finalizingId === pendingFinalizeSummary.id);
  const isDeleteSubmitting = Boolean(pendingDeleteSummary && deletingId === pendingDeleteSummary.id);

  return (
    <AppShell sidebar={<DashboardSidebar activeKey="loading-summaries" />}>
      <header className="app-page-header">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Operations / Route Day Sheets</p>
        <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-slate-900">Route Day Sheets</h1>
        <p className="mt-2 text-slate-600">
          Create a route-day sheet, open it, add morning loading products, then finalize the lorry loading.
        </p>
      </header>

      <LoadingSummariesFilterToolbar
        dateFrom={filters.dateFrom}
        dateTo={filters.dateTo}
        routeProgramId={filters.routeProgramId}
        status={filters.status ?? ""}
        searchInput={searchInput}
        routeOptions={routeOptions}
        refreshing={refreshing}
        canCreate={canCreate}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        onRouteProgramChange={setRouteProgramId}
        onStatusChange={setStatus}
        onSearchChange={setSearchInput}
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
        <LoadingSummaryFormPanel
          formState={formState}
          routeOptions={routeOptions}
          formError={formError}
          submitting={formSubmitting}
          onClose={closeCreate}
          onChange={updateFormValues}
          onSubmit={submitCreate}
        />
      ) : null}

      <Alert className="border-blue-200 bg-blue-50 text-blue-800">
        After creating a loading summary, click <span className="font-semibold">Open Route Sheet</span>. Add products in the{" "}
        <span className="font-semibold">Route Stock Movement</span> section, set the loading quantities, save the draft, then finalize morning loading.
      </Alert>

      <LoadingSummariesTable
        items={items}
        loading={loading}
        page={filters.page}
        pageSize={filters.pageSize}
        total={total}
        finalizingId={finalizingId}
        canFinalize={canFinalize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        onFinalize={handleRequestFinalize}
        deletingId={deletingId}
        onDelete={handleRequestDelete}
      />

      <LoadingSummaryFinalizeConfirmDialog
        summary={pendingFinalizeSummary}
        submitting={isFinalizeSubmitting}
        onCancel={handleCancelFinalize}
        onConfirm={handleConfirmFinalize}
      />

      <LoadingSummaryDeleteConfirmDialog
        summary={pendingDeleteSummary}
        submitting={isDeleteSubmitting}
        onCancel={handleCancelDelete}
        onConfirm={handleConfirmDelete}
      />
    </AppShell>
  );
}
