"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { z } from "zod";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { LoadingSummaryFormState, LoadingSummaryFormValues, RouteProgramFilterOption } from "@/features/loading-summaries/types";

const createFormSchema = z.object({
  reportDate: z.string().date("Report date is required."),
  routeProgramId: z.string().uuid("Route program is required."),
  staffName: z.string().trim().min(2, "Staff name must be at least 2 characters.").max(160),
  remarks: z.string().trim().max(1000).optional(),
  loadingNotes: z.string().trim().max(2000).optional()
});

type LoadingSummaryFormPanelProps = {
  formState: LoadingSummaryFormState;
  routeOptions: RouteProgramFilterOption[];
  formError: string | null;
  submitting: boolean;
  onClose: () => void;
  onChange: (next: LoadingSummaryFormValues) => void;
  onSubmit: () => Promise<void> | void;
};

export function LoadingSummaryFormPanel({
  formState,
  routeOptions,
  formError,
  submitting,
  onClose,
  onChange,
  onSubmit
}: LoadingSummaryFormPanelProps) {
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof LoadingSummaryFormValues, string>>>({});
  const routeSelectRef = useRef<HTMLSelectElement | null>(null);

  useEffect(() => {
    setFieldErrors({});
  }, []);

  const selectedRoute = useMemo(() => {
    return routeOptions.find((item) => item.id === formState.values.routeProgramId) ?? null;
  }, [formState.values.routeProgramId, routeOptions]);

  const handleOpenChange = useCallback((open: boolean) => {
    if (!open && !submitting) {
      onClose();
    }
  }, [onClose, submitting]);

  const inputClass = "h-10 w-full rounded-md border px-3 text-sm outline-none ring-offset-2 transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200";

  const handleSubmit = async () => {
    const parsed = createFormSchema.safeParse(formState.values);
    if (!parsed.success) {
      const nextErrors: Partial<Record<keyof LoadingSummaryFormValues, string>> = {};
      parsed.error.issues.forEach((issue) => {
        const key = issue.path[0] as keyof LoadingSummaryFormValues | undefined;
        if (key && !nextErrors[key]) {
          nextErrors[key] = issue.message;
        }
      });
      setFieldErrors(nextErrors);
      return;
    }

    setFieldErrors({});
    await onSubmit();
  };

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl"
        initialFocusRef={routeSelectRef}
        aria-labelledby="loading-summary-form-title"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-6 py-5">
          <div>
            <h2 id="loading-summary-form-title" className="text-2xl font-bold tracking-tight text-slate-900">Create New Loading Summary</h2>
            <p className="mt-1 text-sm text-slate-500">Initialize a morning route loading sheet before dispatch.</p>
          </div>

          <Button variant="ghost" size="icon" onClick={onClose} disabled={submitting} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-4 px-6 py-5">
          {formError ? <Alert variant="destructive">{formError}</Alert> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Report Date</span>
              <input
                type="date"
                value={formState.values.reportDate}
                onChange={(event) => onChange({ ...formState.values, reportDate: event.target.value })}
                className={`${inputClass} ${fieldErrors.reportDate ? "border-red-300" : "border-slate-200"}`}
                disabled={submitting}
              />
              {fieldErrors.reportDate ? <p className="text-xs text-red-600">{fieldErrors.reportDate}</p> : null}
            </label>

            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Route Program</span>
              <select
                ref={routeSelectRef}
                value={formState.values.routeProgramId}
                onChange={(event) => onChange({ ...formState.values, routeProgramId: event.target.value })}
                className={`${inputClass} ${fieldErrors.routeProgramId ? "border-red-300" : "border-slate-200"}`}
                disabled={submitting}
              >
                <option value="">Select route program</option>
                {routeOptions.map((option) => (
                  <option key={option.id} value={option.id}>{option.routeName} ({option.territoryName})</option>
                ))}
              </select>
              {fieldErrors.routeProgramId ? <p className="text-xs text-red-600">{fieldErrors.routeProgramId}</p> : null}
            </label>

            <label className="space-y-1 sm:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Prepared By / Staff Name</span>
              <input
                value={formState.values.staffName}
                onChange={(event) => onChange({ ...formState.values, staffName: event.target.value })}
                placeholder="Staff name"
                className={`${inputClass} ${fieldErrors.staffName ? "border-red-300" : "border-slate-200"}`}
                disabled={submitting}
              />
              {fieldErrors.staffName ? <p className="text-xs text-red-600">{fieldErrors.staffName}</p> : null}
            </label>

            <label className="space-y-1 sm:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Remarks</span>
              <textarea
                value={formState.values.remarks}
                onChange={(event) => onChange({ ...formState.values, remarks: event.target.value })}
                placeholder="Optional remarks"
                rows={3}
                className={`w-full rounded-md border px-3 py-2 text-sm outline-none ring-offset-2 transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200 ${fieldErrors.remarks ? "border-red-300" : "border-slate-200"}`}
                disabled={submitting}
              />
              {fieldErrors.remarks ? <p className="text-xs text-red-600">{fieldErrors.remarks}</p> : null}
            </label>

            <label className="space-y-1 sm:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Loading Notes</span>
              <textarea
                value={formState.values.loadingNotes}
                onChange={(event) => onChange({ ...formState.values, loadingNotes: event.target.value })}
                placeholder="Optional morning loading notes"
                rows={3}
                className={`w-full rounded-md border px-3 py-2 text-sm outline-none ring-offset-2 transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200 ${fieldErrors.loadingNotes ? "border-red-300" : "border-slate-200"}`}
                disabled={submitting}
              />
              {fieldErrors.loadingNotes ? <p className="text-xs text-red-600">{fieldErrors.loadingNotes}</p> : null}
            </label>
          </div>

          {selectedRoute ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <p><span className="font-semibold">Route:</span> {selectedRoute.routeName}</p>
              <p><span className="font-semibold">Territory:</span> {selectedRoute.territoryName}</p>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-6 py-4">
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Create Loading Summary
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}


