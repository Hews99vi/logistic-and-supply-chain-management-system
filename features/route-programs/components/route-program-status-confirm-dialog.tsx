"use client";

import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { RouteProgramListItem } from "@/features/route-programs/types";

type RouteProgramStatusConfirmDialogProps = {
  routeProgram: RouteProgramListItem | null;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function RouteProgramStatusConfirmDialog({
  routeProgram,
  submitting,
  onCancel,
  onConfirm
}: RouteProgramStatusConfirmDialogProps) {
  const open = Boolean(routeProgram);

  if (!routeProgram) {
    return null;
  }

  const isDeactivation = routeProgram.is_active;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !submitting) {
          onCancel();
        }
      }}
    >
      <DialogContent
        className="max-w-lg rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl"
        aria-labelledby="route-program-status-dialog-title"
      >
        <div className="border-b border-slate-100 p-6">
          <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-amber-50 text-amber-600">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <h2 id="route-program-status-dialog-title" className="text-xl font-bold tracking-tight text-slate-900">
            {isDeactivation ? "Deactivate Route Program" : "Activate Route Program"}
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            {isDeactivation
              ? "This route program will no longer be available for active operational selection."
              : "This route program will become available again for operational use."}
          </p>
        </div>

        <div className="space-y-3 p-6 text-sm text-slate-700">
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <p>
              <span className="font-semibold">Territory:</span> {routeProgram.territory_name}
            </p>
            <p>
              <span className="font-semibold">Route:</span> {routeProgram.route_name}
            </p>
            <p>
              <span className="font-semibold">Frequency:</span> {routeProgram.frequency_label}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-100 p-6">
          <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm} disabled={submitting}>
            {submitting ? "Saving..." : isDeactivation ? "Deactivate" : "Activate"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
