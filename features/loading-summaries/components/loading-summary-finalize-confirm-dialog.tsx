"use client";

import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { LoadingSummaryListItem } from "@/features/loading-summaries/types";

type LoadingSummaryFinalizeConfirmDialogProps = {
  summary: LoadingSummaryListItem | null;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function LoadingSummaryFinalizeConfirmDialog({
  summary,
  submitting,
  onCancel,
  onConfirm
}: LoadingSummaryFinalizeConfirmDialogProps) {
  const open = Boolean(summary);

  if (!summary) {
    return null;
  }

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
        aria-labelledby="loading-summary-finalize-dialog-title"
      >
        <div className="border-b border-slate-100 p-6">
          <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-amber-50 text-amber-600">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <h2 id="loading-summary-finalize-dialog-title" className="text-xl font-bold tracking-tight text-slate-900">
            Finalize Loading Summary
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Finalizing locks the morning loading structure for operational integrity. After completion, this same sheet stays available for evening sales and lorry reconciliation, while loading quantities and product rows remain locked.
          </p>
        </div>

        <div className="space-y-3 p-6 text-sm text-slate-700">
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <p>
              <span className="font-semibold">Date:</span> {summary.reportDate}
            </p>
            <p>
              <span className="font-semibold">Route:</span> {summary.routeNameSnapshot}
            </p>
            <p>
              <span className="font-semibold">Territory:</span> {summary.territoryNameSnapshot}
            </p>
            <p>
              <span className="font-semibold">Prepared By:</span> {summary.staffName}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-100 p-6">
          <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm} disabled={submitting}>
            {submitting ? "Finalizing..." : "Finalize Loading"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
