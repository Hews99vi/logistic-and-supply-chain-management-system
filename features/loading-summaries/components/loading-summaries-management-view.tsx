"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { DashboardSidebar } from "@/features/dashboard/components/dashboard-sidebar";
import { LoadingSummaryFinalizeConfirmDialog } from "@/features/loading-summaries/components/loading-summary-finalize-confirm-dialog";
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
    canFinalize
  } = useLoadingSummariesManagement();

  const [pendingFinalizeSummary, setPendingFinalizeSummary] = useState<LoadingSummaryListItem | null>(null);

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

  const isFinalizeSubmitting = Boolean(pendingFinalizeSummary && finalizingId === pendingFinalizeSummary.id);

  return (
    <div className="min-h-screen lg:flex">
      <DashboardSidebar activeKey="loading-summaries" />

      <main className="flex-1 p-4 sm:p-6">
        <div className="mx-auto max-w-7xl space-y-6">
          <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Operations / Loading Summaries</p>
            <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-slate-900">Daily Loading Summary</h1>
            <p className="mt-2 text-slate-600">Manage morning dispatch loading sheets by date and route before lorry departure.</p>
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
          />

          <LoadingSummaryFinalizeConfirmDialog
            summary={pendingFinalizeSummary}
            submitting={isFinalizeSubmitting}
            onCancel={handleCancelFinalize}
            onConfirm={handleConfirmFinalize}
          />
        </div>
      </main>
    </div>
  );
}
