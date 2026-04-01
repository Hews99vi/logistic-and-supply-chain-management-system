"use client";

import { Filter, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { DashboardFilters } from "@/features/dashboard/types";

type DashboardHeaderProps = {
  filters: DashboardFilters;
  refreshing: boolean;
  onApplyFilters: (filters: DashboardFilters) => void;
  onRefresh: () => void;
};

export function DashboardHeader({ filters, refreshing, onApplyFilters, onRefresh }: DashboardHeaderProps) {
  const today = new Date();
  const past = new Date(today);
  past.setDate(today.getDate() - 6);

  return (
    <header className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-card sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Operations / Dashboard</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">Dashboard Overview</h1>
        </div>

        <Button variant="outline" onClick={onRefresh} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:flex lg:items-end">
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Date From</span>
          <input
            type="date"
            className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none ring-offset-2 transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200"
            value={filters.dateFrom ?? past.toISOString().slice(0, 10)}
            onChange={(event) => onApplyFilters({ ...filters, dateFrom: event.target.value })}
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Date To</span>
          <input
            type="date"
            className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none ring-offset-2 transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200"
            value={filters.dateTo ?? today.toISOString().slice(0, 10)}
            onChange={(event) => onApplyFilters({ ...filters, dateTo: event.target.value })}
          />
        </label>

        <label className="space-y-1 sm:max-w-[120px]">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Top N</span>
          <input
            type="number"
            min={1}
            max={100}
            className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none ring-offset-2 transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200"
            value={filters.top ?? 5}
            onChange={(event) => onApplyFilters({ ...filters, top: Number(event.target.value) || 5 })}
          />
        </label>

        <Button variant="secondary" className="gap-2 lg:ml-auto">
          <Filter className="h-4 w-4" />
          Filters
        </Button>
      </div>
    </header>
  );
}
