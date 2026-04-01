"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { z } from "zod";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ROUTE_DAY_OPTIONS, type RouteProgramFormState, type RouteProgramFormValues } from "@/features/route-programs/types";

const routeProgramFormSchema = z.object({
  territoryName: z.string().trim().min(2, "Territory name must be at least 2 characters.").max(160),
  dayOfWeek: z.number().int().min(1).max(7),
  frequencyLabel: z.string().trim().min(2, "Frequency label must be at least 2 characters.").max(80),
  routeName: z.string().trim().min(2, "Route name must be at least 2 characters.").max(160),
  routeDescription: z.string().trim().max(500).optional(),
  isActive: z.boolean()
});

type RouteProgramFormPanelProps = {
  formState: RouteProgramFormState;
  formError: string | null;
  submitting: boolean;
  onClose: () => void;
  onChange: (next: RouteProgramFormValues) => void;
  onSubmit: () => Promise<void> | void;
};

export function RouteProgramFormPanel({ formState, formError, submitting, onClose, onChange, onSubmit }: RouteProgramFormPanelProps) {
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof RouteProgramFormValues, string>>>({});
  const isCreate = formState.mode === "create";
  const territoryRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setFieldErrors({});
  }, [formState.mode, formState.routeProgramId]);

  const title = useMemo(() => (isCreate ? "Add New Route Program" : "Edit Route Program"), [isCreate]);

  const handleSubmit = async () => {
    const parsed = routeProgramFormSchema.safeParse(formState.values);

    if (!parsed.success) {
      const nextErrors: Partial<Record<keyof RouteProgramFormValues, string>> = {};

      parsed.error.issues.forEach((issue) => {
        const key = issue.path[0] as keyof RouteProgramFormValues | undefined;
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

  const inputClass = "h-10 w-full rounded-md border px-3 text-sm outline-none ring-offset-2 transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200";

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !submitting) {
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl" initialFocusRef={territoryRef} aria-labelledby="route-program-form-title">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-6 py-5">
          <div>
            <h2 id="route-program-form-title" className="text-2xl font-bold tracking-tight text-slate-900">{title}</h2>
            <p className="mt-1 text-sm text-slate-500">Define territory schedules, recurring frequency, and route mapping for operations.</p>
          </div>

          <Button variant="ghost" size="icon" onClick={onClose} disabled={submitting} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-4 px-6 py-5">
          {formError ? <Alert variant="destructive">{formError}</Alert> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Territory Name</span>
              <input
                ref={territoryRef}
                value={formState.values.territoryName}
                onChange={(event) => onChange({ ...formState.values, territoryName: event.target.value })}
                placeholder="Colombo North"
                className={`${inputClass} ${fieldErrors.territoryName ? "border-red-300" : "border-slate-200"}`}
                disabled={submitting}
                aria-invalid={Boolean(fieldErrors.territoryName)}
              />
              {fieldErrors.territoryName ? <p className="text-xs text-red-600">{fieldErrors.territoryName}</p> : null}
            </label>

            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Day Of Week</span>
              <select
                value={formState.values.dayOfWeek}
                onChange={(event) => onChange({ ...formState.values, dayOfWeek: Number(event.target.value) })}
                className={`${inputClass} ${fieldErrors.dayOfWeek ? "border-red-300" : "border-slate-200"}`}
                disabled={submitting}
                aria-invalid={Boolean(fieldErrors.dayOfWeek)}
              >
                {ROUTE_DAY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              {fieldErrors.dayOfWeek ? <p className="text-xs text-red-600">{fieldErrors.dayOfWeek}</p> : null}
            </label>

            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Frequency Label</span>
              <input
                value={formState.values.frequencyLabel}
                onChange={(event) => onChange({ ...formState.values, frequencyLabel: event.target.value })}
                placeholder="Daily"
                className={`${inputClass} ${fieldErrors.frequencyLabel ? "border-red-300" : "border-slate-200"}`}
                disabled={submitting}
                aria-invalid={Boolean(fieldErrors.frequencyLabel)}
              />
              {fieldErrors.frequencyLabel ? <p className="text-xs text-red-600">{fieldErrors.frequencyLabel}</p> : null}
            </label>

            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Route Name</span>
              <input
                value={formState.values.routeName}
                onChange={(event) => onChange({ ...formState.values, routeName: event.target.value })}
                placeholder="Route 04"
                className={`${inputClass} ${fieldErrors.routeName ? "border-red-300" : "border-slate-200"}`}
                disabled={submitting}
                aria-invalid={Boolean(fieldErrors.routeName)}
              />
              {fieldErrors.routeName ? <p className="text-xs text-red-600">{fieldErrors.routeName}</p> : null}
            </label>

            <label className="space-y-1 sm:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Route Description</span>
              <textarea
                value={formState.values.routeDescription}
                onChange={(event) => onChange({ ...formState.values, routeDescription: event.target.value })}
                placeholder="Optional operational notes for this route program"
                rows={3}
                className={`w-full rounded-md border px-3 py-2 text-sm outline-none ring-offset-2 transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200 ${
                  fieldErrors.routeDescription ? "border-red-300" : "border-slate-200"
                }`}
                disabled={submitting}
                aria-invalid={Boolean(fieldErrors.routeDescription)}
              />
              {fieldErrors.routeDescription ? <p className="text-xs text-red-600">{fieldErrors.routeDescription}</p> : null}
            </label>

            <div className="space-y-1 sm:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Active Status</span>
              <label className="flex h-10 items-center justify-between rounded-md border border-slate-200 px-3 text-sm text-slate-700">
                <span>Enable this route program immediately</span>
                <input
                  type="checkbox"
                  checked={formState.values.isActive}
                  onChange={(event) => onChange({ ...formState.values, isActive: event.target.checked })}
                  disabled={submitting}
                  aria-label="Enable route program"
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-200"
                />
              </label>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-6 py-4">
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {isCreate ? "Create Route Program" : "Save Changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

