"use client";

import Link from "next/link";
import { CheckCircle2, ChevronLeft, ChevronRight, ExternalLink, FileText, Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DailyReportStatusBadge } from "@/features/reports/components/daily-report-status-badge";
import type { LoadingSummaryListItem } from "@/features/loading-summaries/types";

function formatDate(dateString: string) {
  return new Intl.DateTimeFormat("en-LK", {
    year: "numeric",
    month: "short",
    day: "2-digit"
  }).format(new Date(dateString));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-LK", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

type LoadingSummariesTableProps = {
  items: LoadingSummaryListItem[];
  loading: boolean;
  page: number;
  pageSize: number;
  total: number;
  finalizingId: string | null;
  canFinalize: (item: LoadingSummaryListItem) => boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onFinalize: (item: LoadingSummaryListItem) => void;
  deletingId: string | null;
  onDelete: (item: LoadingSummaryListItem) => void;
};

export function LoadingSummariesTable({
  items,
  loading,
  page,
  pageSize,
  total,
  finalizingId,
  canFinalize,
  onPageChange,
  onPageSizeChange,
  onFinalize,
  deletingId,
  onDelete
}: LoadingSummariesTableProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <Card>
      <CardContent className="p-0">
        <div className="divide-y divide-slate-100 md:hidden">
          {loading ? (
            Array.from({ length: Math.min(pageSize, 4) }).map((_, index) => (
              <div key={index} className="p-4">
                <Skeleton className="h-32 w-full rounded-xl" />
              </div>
            ))
          ) : items.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-slate-500">
              No loading summaries found for the selected filters.
            </div>
          ) : (
            items.map((item) => (
              <article key={item.id} className="space-y-4 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{formatDate(item.reportDate)}</p>
                    <p className="mt-1 text-sm font-medium text-slate-700">{item.routeNameSnapshot}</p>
                    <p className="text-sm text-slate-500">{item.territoryNameSnapshot}</p>
                  </div>
                  <DailyReportStatusBadge status={item.status} />
                </div>

                <dl className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Prepared By</dt>
                    <dd className="mt-1 text-slate-900">{item.staffName}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Updated</dt>
                    <dd className="mt-1 text-slate-900">{formatDateTime(item.updatedAt)}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Morning Loading</dt>
                    <dd className="mt-1 text-slate-900">
                      {item.loadingCompletedAt ? (
                        <span className="inline-flex items-center gap-1.5 text-emerald-700">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {formatDateTime(item.loadingCompletedAt)}
                        </span>
                      ) : (
                        <span className="text-slate-400">Pending</span>
                      )}
                    </dd>
                  </div>
                </dl>

                <div className="grid gap-2 sm:grid-cols-2">
                  <Button asChild className="w-full" variant="outline">
                    <Link href={`/loading-summaries/${item.id}`}>
                      <ExternalLink className="h-3.5 w-3.5" />
                      Open Route Sheet
                    </Link>
                  </Button>
                  <Button asChild className="w-full" variant="outline">
                    <Link href={`/reports/${item.dateReportId}/date`}>
                      <FileText className="h-3.5 w-3.5" />
                      Open DATE
                    </Link>
                  </Button>
                  {canFinalize(item) ? (
                    <Button
                      className="w-full sm:col-span-2"
                      onClick={() => onFinalize(item)}
                      disabled={finalizingId === item.id || deletingId === item.id}
                    >
                      {finalizingId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                      Finalize Loading
                    </Button>
                  ) : null}
                  {item.status === "draft" ? (
                    <Button
                      className="w-full sm:col-span-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                      variant="outline"
                      onClick={() => onDelete(item)}
                      disabled={deletingId === item.id || finalizingId === item.id}
                    >
                      {deletingId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      Delete
                    </Button>
                  ) : null}
                </div>
              </article>
            ))
          )}
        </div>

        <div className="hidden md:block">
          <table className="w-full table-fixed">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.14em] text-slate-500">
              <tr>
                <th className="w-[92px] px-4 py-4 font-semibold">Date</th>
                <th className="w-[25%] px-4 py-4 font-semibold">Route</th>
                <th className="w-[12%] px-4 py-4 font-semibold">Territory</th>
                <th className="w-[11%] px-4 py-4 font-semibold">Prepared By</th>
                <th className="w-[92px] px-4 py-4 font-semibold">Status</th>
                <th className="w-[128px] px-4 py-4 font-semibold">Morning Loading</th>
                <th className="w-[122px] px-4 py-4 font-semibold">Updated</th>
                <th className="w-[142px] px-4 py-4 text-right font-semibold">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
              {loading ? (
                Array.from({ length: pageSize }).map((_, index) => (
                  <tr key={index}>
                    <td className="px-4 py-4" colSpan={8}><Skeleton className="h-10 w-full" /></td>
                  </tr>
                ))
              ) : items.length === 0 ? (
                <tr>
                  <td className="px-5 py-12 text-center text-slate-500" colSpan={8}>
                    No loading summaries found for the selected filters.
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-4 align-top font-semibold text-slate-900">{formatDate(item.reportDate)}</td>
                    <td className="px-4 py-4 align-top">
                      <p className="break-words leading-snug text-slate-800">{item.routeNameSnapshot}</p>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <p className="break-words leading-snug">{item.territoryNameSnapshot}</p>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <p className="break-words leading-snug">{item.staffName}</p>
                    </td>
                    <td className="px-4 py-4 align-top"><DailyReportStatusBadge status={item.status} /></td>
                    <td className="px-4 py-4 align-top">
                      {item.loadingCompletedAt ? (
                        <span className="inline-flex items-start gap-1.5 leading-snug text-emerald-700">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {formatDateTime(item.loadingCompletedAt)}
                        </span>
                      ) : (
                        <span className="text-slate-400">Pending</span>
                      )}
                    </td>
                    <td className="px-4 py-4 align-top text-slate-500">{formatDateTime(item.updatedAt)}</td>
                    <td className="px-4 py-4 align-top">
                      <div className="grid justify-items-stretch gap-2">
                        <Button asChild variant="outline" size="sm" className="w-full justify-center">
                          <Link href={`/loading-summaries/${item.id}`}>
                            <ExternalLink className="h-3.5 w-3.5" />
                            Open
                          </Link>
                        </Button>
                        <Button asChild variant="outline" size="sm" className="w-full justify-center">
                          <Link href={`/reports/${item.dateReportId}/date`}>
                            <FileText className="h-3.5 w-3.5" />
                            DATE
                          </Link>
                        </Button>
                        {canFinalize(item) ? (
                          <Button
                            size="sm"
                            className="w-full justify-center"
                            onClick={() => onFinalize(item)}
                            disabled={finalizingId === item.id || deletingId === item.id}
                          >
                            {finalizingId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                            Finalize
                          </Button>
                        ) : null}
                        {item.status === "draft" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full justify-center text-red-600 hover:bg-red-50 hover:text-red-700"
                            onClick={() => onDelete(item)}
                            disabled={deletingId === item.id || finalizingId === item.id}
                          >
                            {deletingId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                            Delete
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-4 text-sm text-slate-600 sm:px-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
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

          <div className="flex items-center justify-between gap-2 sm:justify-end">
            <Button className="shrink-0" variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-20 flex-1 text-center font-semibold text-slate-700 sm:flex-none">Page {page} / {totalPages}</span>
            <Button className="shrink-0" variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
