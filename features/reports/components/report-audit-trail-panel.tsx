"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { DailyReportAuditEventDto } from "@/types/domain/report";

type ReportAuditTrailPanelProps = {
  rows: DailyReportAuditEventDto[];
  loading: boolean;
  error: string | null;
};

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("en-LK", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(date);
}

function actionBadgeClass(action: DailyReportAuditEventDto["action"]) {
  switch (action) {
    case "INSERT":
      return "bg-emerald-100 text-emerald-700";
    case "DELETE":
      return "bg-rose-100 text-rose-700";
    default:
      return "bg-blue-100 text-blue-700";
  }
}

function stableStringify(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "Unable to render payload.";
  }
}

export function ReportAuditTrailPanel({ rows, loading, error }: ReportAuditTrailPanelProps) {
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    [rows]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit Trail</CardTitle>
        <CardDescription>Chronological history of report and line-item changes.</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {error ? <Alert variant="destructive">{error}</Alert> : null}

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.14em] text-slate-500">
              <tr>
                <th className="w-10 px-3 py-3"></th>
                <th className="px-3 py-3">Timestamp</th>
                <th className="px-3 py-3">Actor</th>
                <th className="px-3 py-3">Action</th>
                <th className="px-3 py-3">Section</th>
                <th className="px-3 py-3">Summary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 6 }).map((_, index) => (
                  <tr key={`loading-${index}`}>
                    <td className="px-3 py-3" colSpan={6}>
                      <Skeleton className="h-9 w-full" />
                    </td>
                  </tr>
                ))
              ) : sortedRows.length === 0 ? (
                <tr>
                  <td className="px-3 py-10 text-center text-slate-500" colSpan={6}>
                    No audit events available for this report.
                  </td>
                </tr>
              ) : (
                sortedRows.map((row) => {
                  const expanded = Boolean(expandedRows[row.id]);

                  return (
                    <Fragment key={row.id}>
                      <tr>
                        <td className="px-3 py-3 align-top">
                          <button
                            type="button"
                            className="rounded p-1 text-slate-500 hover:bg-slate-100"
                            onClick={() => {
                              setExpandedRows((prev) => ({ ...prev, [row.id]: !prev[row.id] }));
                            }}
                            aria-label={expanded ? "Collapse details" : "Expand details"}
                          >
                            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                        </td>
                        <td className="px-3 py-3 text-slate-700">{formatDateTime(row.timestamp)}</td>
                        <td className="px-3 py-3 text-slate-700">{row.actorName ?? row.actorId ?? "System"}</td>
                        <td className="px-3 py-3">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${actionBadgeClass(row.action)}`}>
                            {row.action}
                          </span>
                        </td>
                        <td className="px-3 py-3 font-medium text-slate-900">{row.section}</td>
                        <td className="px-3 py-3 text-slate-700">{row.summary}</td>
                      </tr>
                      {expanded ? (
                        <tr>
                          <td className="px-3 py-3"></td>
                          <td className="px-3 py-3" colSpan={5}>
                            <div className="grid gap-3 lg:grid-cols-2">
                              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Old Data</p>
                                <pre className="max-h-56 overflow-auto text-xs text-slate-700">{stableStringify(row.oldData)}</pre>
                              </div>
                              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">New Data</p>
                                <pre className="max-h-56 overflow-auto text-xs text-slate-700">{stableStringify(row.newData)}</pre>
                              </div>
                            </div>
                          </td>
                        </tr>
                                  ) : null}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}


