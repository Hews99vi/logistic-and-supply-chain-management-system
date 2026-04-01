"use client";

import { ChevronLeft, ChevronRight, Edit, Eye, Power } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { RouteProgramStatusBadge } from "@/features/route-programs/components/route-program-status-badge";
import { getDayLabel, type RouteProgramListItem } from "@/features/route-programs/types";

type RouteProgramsTableProps = {
  routePrograms: RouteProgramListItem[];
  loading: boolean;
  page: number;
  pageSize: number;
  total: number;
  canManageRoutePrograms: boolean;
  togglingRouteProgramId: string | null;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onView: (routeProgram: RouteProgramListItem) => void;
  onEdit: (routeProgram: RouteProgramListItem) => void;
  onToggleStatus: (routeProgram: RouteProgramListItem) => void;
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-LK", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function RouteProgramsTable({
  routePrograms,
  loading,
  page,
  pageSize,
  total,
  canManageRoutePrograms,
  togglingRouteProgramId,
  onPageChange,
  onPageSizeChange,
  onView,
  onEdit,
  onToggleStatus
}: RouteProgramsTableProps) {
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
                <th className="px-5 py-4 font-semibold">Territory Name</th>
                <th className="px-5 py-4 font-semibold">Day Of Week</th>
                <th className="px-5 py-4 font-semibold">Frequency Label</th>
                <th className="px-5 py-4 font-semibold">Route Name</th>
                <th className="px-5 py-4 font-semibold">Route Description</th>
                <th className="px-5 py-4 font-semibold">Status</th>
                <th className="px-5 py-4 font-semibold">Updated At</th>
                <th className="px-5 py-4 text-right font-semibold">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
              {loading ? (
                Array.from({ length: pageSize }).map((_, index) => (
                  <tr key={index}>
                    <td className="px-5 py-4" colSpan={8}><Skeleton className="h-10 w-full" /></td>
                  </tr>
                ))
              ) : routePrograms.length === 0 ? (
                <tr>
                  <td className="px-5 py-12 text-center text-slate-500" colSpan={8}>
                    No route programs found for the selected filters.
                  </td>
                </tr>
              ) : (
                routePrograms.map((routeProgram) => (
                  <tr key={routeProgram.id} className="hover:bg-slate-50/70">
                    <td className="px-5 py-4 font-semibold text-slate-900">{routeProgram.territory_name}</td>
                    <td className="px-5 py-4">{getDayLabel(routeProgram.day_of_week)}</td>
                    <td className="px-5 py-4">{routeProgram.frequency_label}</td>
                    <td className="px-5 py-4">{routeProgram.route_name}</td>
                    <td className="px-5 py-4 max-w-[280px] truncate text-slate-600" title={routeProgram.route_description ?? undefined}>
                      {routeProgram.route_description ?? "-"}
                    </td>
                    <td className="px-5 py-4"><RouteProgramStatusBadge isActive={routeProgram.is_active} /></td>
                    <td className="px-5 py-4 text-slate-500">{formatDateTime(routeProgram.updated_at)}</td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onView(routeProgram)}
                          aria-label={`View ${routeProgram.route_name}`}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          View
                        </Button>

                        {canManageRoutePrograms ? (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => onEdit(routeProgram)}
                              aria-label={`Edit ${routeProgram.route_name}`}
                            >
                              <Edit className="h-3.5 w-3.5" />
                              Edit
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => onToggleStatus(routeProgram)}
                              disabled={togglingRouteProgramId === routeProgram.id}
                              aria-label={`${routeProgram.is_active ? "Deactivate" : "Activate"} ${routeProgram.route_name}`}
                            >
                              <Power className="h-3.5 w-3.5" />
                              {routeProgram.is_active ? "Deactivate" : "Activate"}
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </td>
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
