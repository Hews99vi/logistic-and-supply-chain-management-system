"use client";

import Link from "next/link";
import { Plus, RefreshCw } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardSidebar } from "@/features/dashboard/components/dashboard-sidebar";
import { DailyReportsFilterBar } from "@/features/reports/components/daily-reports-filter-bar";
import { DailyReportsTable } from "@/features/reports/components/daily-reports-table";
import { ReportsSummaryWidgets } from "@/features/reports/components/reports-summary-widgets";
import { useDailyReportsList } from "@/features/reports/hooks/use-daily-reports-list";

export function DailyReportsView() {
  const {
    filters,
    displayedRows,
    total,
    summary,
    routeOptions,
    preparedByOptions,
    loading,
    refreshing,
    error,
    searchInput,
    weeklyChangePercent,
    activeRouteCount,
    setSearchInput,
    setStatus,
    setRoute,
    setPreparedBy,
    setDateFrom,
    setDateTo,
    setPage,
    setPageSize,
    sortBy,
    reload
  } = useDailyReportsList();

  return (
    <div className="min-h-screen lg:flex">
      <DashboardSidebar activeKey="reports" />

      <main className="flex-1 p-4 sm:p-6">
        <div className="mx-auto max-w-7xl space-y-6">
          <header className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:flex-row sm:items-end sm:justify-between sm:p-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Operations / Daily Reports</p>
              <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-slate-900">Daily Operational Reports</h1>
              <p className="mt-2 text-slate-600">Manage and monitor daily distribution metrics across all active routes.</p>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={reload} disabled={refreshing}>
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button asChild>
                <Link href="/reports/new" className="gap-2">
                  <Plus className="h-4 w-4" />
                  Create New Report
                </Link>
              </Button>
            </div>
          </header>

          <DailyReportsFilterBar
            dateFrom={filters.dateFrom}
            dateTo={filters.dateTo}
            status={filters.status}
            routeProgramId={filters.routeProgramId}
            createdBy={filters.createdBy}
            searchInput={searchInput}
            routeOptions={routeOptions}
            preparedByOptions={preparedByOptions}
            onDateFromChange={setDateFrom}
            onDateToChange={setDateTo}
            onStatusChange={setStatus}
            onRouteChange={setRoute}
            onPreparedByChange={setPreparedBy}
            onSearchChange={setSearchInput}
          />

          {error ? <Alert variant="destructive">{error}</Alert> : null}

          <DailyReportsTable
            rows={displayedRows}
            loading={loading}
            page={filters.page}
            pageSize={filters.pageSize}
            total={total}
            sortKey={filters.sortKey}
            sortDirection={filters.sortDirection}
            onSort={sortBy}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />

          {loading ? (
            <div className="grid gap-4 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-40" />)}
            </div>
          ) : (
            <ReportsSummaryWidgets
              summary={summary}
              routeCount={routeOptions.length}
              activeRouteCount={activeRouteCount}
              weeklyChangePercent={weeklyChangePercent}
            />
          )}
        </div>
      </main>
    </div>
  );
}
