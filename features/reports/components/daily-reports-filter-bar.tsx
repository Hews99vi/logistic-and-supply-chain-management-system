"use client";

import type { DailyReportStatus } from "@/types/domain/report";
import type { ReportPreparedByOption, RouteProgramFilterOption } from "@/features/reports/types";

type DailyReportsFilterBarProps = {
  dateFrom?: string;
  dateTo?: string;
  status?: DailyReportStatus;
  routeProgramId?: string;
  createdBy?: string;
  searchInput: string;
  routeOptions: RouteProgramFilterOption[];
  preparedByOptions: ReportPreparedByOption[];
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onStatusChange: (value: DailyReportStatus | "") => void;
  onRouteChange: (value: string) => void;
  onPreparedByChange: (value: string) => void;
  onSearchChange: (value: string) => void;
};

export function DailyReportsFilterBar({
  dateFrom,
  dateTo,
  status,
  routeProgramId,
  createdBy,
  searchInput,
  routeOptions,
  preparedByOptions,
  onDateFromChange,
  onDateToChange,
  onStatusChange,
  onRouteChange,
  onPreparedByChange,
  onSearchChange
}: DailyReportsFilterBarProps) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-card sm:p-5">
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

        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Report Status</span>
          <select
            value={status ?? ""}
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

        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Route</span>
          <select
            value={routeProgramId ?? ""}
            onChange={(event) => onRouteChange(event.target.value)}
            className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none ring-offset-2 transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200"
          >
            <option value="">All Routes</option>
            {routeOptions.map((item) => (
              <option key={item.id} value={item.id}>{item.routeName} ({item.territoryName})</option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Prepared By</span>
          <select
            value={createdBy ?? ""}
            onChange={(event) => onPreparedByChange(event.target.value)}
            className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none ring-offset-2 transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200"
          >
            <option value="">All Staff</option>
            {preparedByOptions.map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </select>
        </label>
      </div>

      <label className="mt-3 block space-y-1">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Search</span>
        <input
          value={searchInput}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Ref. ID or keyword"
          className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none ring-offset-2 transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200"
        />
      </label>
    </section>
  );
}
