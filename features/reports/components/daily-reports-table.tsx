"use client";

import Link from "next/link";
import { ArrowDownUp, ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DailyReportStatusBadge } from "@/features/reports/components/daily-report-status-badge";
import type { ReportsSortDirection, ReportsSortKey } from "@/features/reports/types";
import type { DailyReportBaseDto } from "@/types/domain/report";

function formatCurrencyLkr(amount: number) {
  return new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency: "LKR",
    maximumFractionDigits: 2
  }).format(amount);
}

function formatReportDate(dateString: string) {
  return new Intl.DateTimeFormat("en-LK", {
    year: "numeric",
    month: "short",
    day: "2-digit"
  }).format(new Date(dateString));
}

function formatRelativeDate(dateString: string) {
  const updated = new Date(dateString);
  const diffMs = Date.now() - updated.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffHours < 1) return "just now";
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

type DailyReportsTableProps = {
  rows: DailyReportBaseDto[];
  loading: boolean;
  page: number;
  pageSize: number;
  total: number;
  sortKey: ReportsSortKey;
  sortDirection: ReportsSortDirection;
  onSort: (key: ReportsSortKey) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
};

const sortableColumns: Array<{ label: string; key: ReportsSortKey }> = [
  { label: "Report Date", key: "reportDate" },
  { label: "Route Name", key: "routeNameSnapshot" },
  { label: "Territory", key: "territoryNameSnapshot" },
  { label: "Prepared By", key: "staffName" },
  { label: "Status", key: "status" },
  { label: "Total Sale (LKR)", key: "totalSale" },
  { label: "Net Profit", key: "netProfit" },
  { label: "Updated At", key: "updatedAt" }
];

export function DailyReportsTable({
  rows,
  loading,
  page,
  pageSize,
  total,
  sortKey,
  sortDirection,
  onSort,
  onPageChange,
  onPageSizeChange
}: DailyReportsTableProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.14em] text-slate-500">
              <tr>
                {sortableColumns.map((column) => (
                  <th key={column.key} className="px-5 py-4 font-semibold">
                    <button
                      type="button"
                      onClick={() => onSort(column.key)}
                      className="inline-flex items-center gap-1.5 text-left"
                    >
                      <span>{column.label}</span>
                      <ArrowDownUp className={`h-3.5 w-3.5 ${sortKey === column.key ? "text-blue-700" : "text-slate-400"} ${sortKey === column.key && sortDirection === "desc" ? "rotate-180" : ""}`} />
                    </button>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
              {loading ? (
                Array.from({ length: pageSize }).map((_, index) => (
                  <tr key={index}>
                    <td className="px-5 py-4" colSpan={8}><Skeleton className="h-10 w-full" /></td>
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td className="px-5 py-12 text-center text-slate-500" colSpan={8}>
                    No daily reports found for the selected filters.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/70">
                    <td className="px-5 py-4 font-semibold text-slate-900">
                      <Link className="hover:text-blue-700" href={`/reports/${row.id}`}>
                        {formatReportDate(row.reportDate)}
                      </Link>
                    </td>
                    <td className="px-5 py-4">{row.routeNameSnapshot}</td>
                    <td className="px-5 py-4">{row.territoryNameSnapshot}</td>
                    <td className="px-5 py-4">{row.staffName}</td>
                    <td className="px-5 py-4"><DailyReportStatusBadge status={row.status} /></td>
                    <td className="px-5 py-4 font-semibold text-slate-900">{formatCurrencyLkr(row.totalSale)}</td>
                    <td className="px-5 py-4 font-semibold text-blue-700">{formatCurrencyLkr(row.netProfit)}</td>
                    <td className="px-5 py-4 text-slate-500">{formatRelativeDate(row.updatedAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-4 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span>Rows per page</span>
            <select
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              className="h-9 rounded-md border border-slate-200 bg-white px-2"
            >
              {[10, 25, 50].map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
            <span>{from}-{to} of {total} items</span>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-20 text-center font-semibold text-slate-700">Page {page} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
