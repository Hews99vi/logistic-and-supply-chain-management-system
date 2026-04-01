"use client";

import { Plus, RefreshCw, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { RouteProgramFilterOption } from "@/features/loading-summaries/types";
import type { DailyReportStatus } from "@/types/domain/report";

type LoadingSummariesFilterToolbarProps = {
  dateFrom?: string;
  dateTo?: string;
  routeProgramId?: string;
  status: DailyReportStatus | "";
  searchInput: string;
  routeOptions: RouteProgramFilterOption[];
  refreshing: boolean;
  canCreate: boolean;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onRouteProgramChange: (value: string) => void;
  onStatusChange: (value: DailyReportStatus | "") => void;
  onSearchChange: (value: string) => void;
  onClearFilters: () => void;
  onReload: () => void;
  onOpenCreate: () => void;
};

export function LoadingSummariesFilterToolbar({
  dateFrom,
  dateTo,
  routeProgramId,
  status,
  searchInput,
  routeOptions,
  refreshing,
  canCreate,
  onDateFromChange,
  onDateToChange,
  onRouteProgramChange,
  onStatusChange,
  onSearchChange,
  onClearFilters,
  onReload,
  onOpenCreate
}: LoadingSummariesFilterToolbarProps) {
  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-card sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Operations / Morning Dispatch</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={onReload} disabled={refreshing}>
            <RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            {refreshing ? "Refreshing..." : "Refresh"}
          </Button>
          {canCreate ? (
            <Button onClick={onOpenCreate}>
              <Plus className="h-4 w-4" />
              Create New Loading Summary
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Date From</span>
          <input
            type="date"
            value={dateFrom ?? ""}
            onChange={(event) => onDateFromChange(event.target.value)}
            className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none ring-offset-2 transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200"
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Date To</span>
          <input
            type="date"
            value={dateTo ?? ""}
            onChange={(event) => onDateToChange(event.target.value)}
            className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none ring-offset-2 transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200"
          />
        </label>

        <label className="space-y-1 xl:col-span-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Route</span>
          <select
            value={routeProgramId ?? ""}
            onChange={(event) => onRouteProgramChange(event.target.value)}
            className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none ring-offset-2 transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200"
          >
            <option value="">All Routes</option>
            {routeOptions.map((route) => (
              <option key={route.id} value={route.id}>{route.routeName} ({route.territoryName})</option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Status</span>
          <select
            value={status}
            onChange={(event) => onStatusChange(event.target.value as DailyReportStatus | "")}
            className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none ring-offset-2 transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200"
          >
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="submitted">Submitted</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Search</span>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={searchInput}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search by route, territory, or staff name"
            className="h-10 w-full rounded-md border border-slate-200 pl-10 pr-3 text-sm outline-none ring-offset-2 transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200"
          />
        </div>
      </label>

      <div className="flex justify-end">
        <Button variant="ghost" onClick={onClearFilters}>
          <X className="h-4 w-4" />
          Clear All Filters
        </Button>
      </div>
    </section>
  );
}
