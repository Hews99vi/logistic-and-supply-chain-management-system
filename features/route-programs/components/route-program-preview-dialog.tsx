"use client";

import { CalendarDays, Clock3, MapPinned, Route } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { RouteProgramStatusBadge } from "@/features/route-programs/components/route-program-status-badge";
import { getDayLabel, type RouteProgramListItem } from "@/features/route-programs/types";

type RouteProgramPreviewDialogProps = {
  routeProgram: RouteProgramListItem | null;
  onClose: () => void;
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

export function RouteProgramPreviewDialog({ routeProgram, onClose }: RouteProgramPreviewDialogProps) {
  if (!routeProgram) {
    return null;
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl" aria-labelledby="route-program-preview-title">
        <div className="border-b border-slate-200 px-6 py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Route Program Details</p>
          <h2 id="route-program-preview-title" className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
            {routeProgram.route_name}
          </h2>
          <p className="mt-1 text-sm text-slate-600">Read-only operational preview.</p>
        </div>

        <div className="space-y-4 px-6 py-5 text-sm text-slate-700">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Territory Name</p>
              <p className="mt-1 font-medium text-slate-900">{routeProgram.territory_name}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Status</p>
              <div className="mt-1"><RouteProgramStatusBadge isActive={routeProgram.is_active} /></div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-start gap-3 rounded-lg border border-slate-200 p-3">
              <CalendarDays className="mt-0.5 h-4 w-4 text-slate-500" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Day Of Week</p>
                <p className="font-medium text-slate-900">{getDayLabel(routeProgram.day_of_week)}</p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-lg border border-slate-200 p-3">
              <Clock3 className="mt-0.5 h-4 w-4 text-slate-500" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Frequency Label</p>
                <p className="font-medium text-slate-900">{routeProgram.frequency_label}</p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 sm:col-span-2">
              <Route className="mt-0.5 h-4 w-4 text-slate-500" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Route Name</p>
                <p className="font-medium text-slate-900">{routeProgram.route_name}</p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 sm:col-span-2">
              <MapPinned className="mt-0.5 h-4 w-4 text-slate-500" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Route Description</p>
                <p className="font-medium text-slate-900">{routeProgram.route_description ?? "-"}</p>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Created At</p>
              <p className="mt-1 font-medium text-slate-900">{formatDateTime(routeProgram.created_at)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Updated At</p>
              <p className="mt-1 font-medium text-slate-900">{formatDateTime(routeProgram.updated_at)}</p>
            </div>
          </div>
        </div>

        <div className="flex justify-end border-t border-slate-200 px-6 py-4">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
