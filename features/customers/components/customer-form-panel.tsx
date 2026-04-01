"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { z } from "zod";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  CUSTOMER_CHANNEL_OPTIONS,
  type CustomerFormState,
  type CustomerFormValues
} from "@/features/customers/types";

const customerFormSchema = z.object({
  code: z.string().trim().min(1, "Customer code is required.").max(80),
  name: z.string().trim().min(2, "Customer name must be at least 2 characters.").max(200),
  channel: z.enum(["RETAIL", "WHOLESALE", "INSTITUTIONAL"]),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().email("Enter a valid email.").or(z.literal("")).optional(),
  addressLine1: z.string().trim().max(250).optional(),
  addressLine2: z.string().trim().max(250).optional(),
  city: z.string().trim().max(120).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"])
});

type CustomerFormPanelProps = {
  formState: CustomerFormState;
  formError: string | null;
  submitting: boolean;
  onClose: () => void;
  onChange: (nextValues: CustomerFormValues) => void;
  onSubmit: () => Promise<void> | void;
};

export function CustomerFormPanel({
  formState,
  formError,
  submitting,
  onClose,
  onChange,
  onSubmit
}: CustomerFormPanelProps) {
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof CustomerFormValues, string>>>({});
  const codeRef = useRef<HTMLInputElement | null>(null);
  const isCreate = formState.mode === "create";

  const title = useMemo(() => (isCreate ? "Add New Customer" : "Edit Customer"), [isCreate]);

  useEffect(() => {
    setFieldErrors({});
  }, [formState.mode, formState.customerId]);

  const inputClass = "h-10 w-full rounded-md border px-3 text-sm outline-none ring-offset-2 transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200";

  const handleSubmit = async () => {
    const parsed = customerFormSchema.safeParse(formState.values);

    if (!parsed.success) {
      const nextErrors: Partial<Record<keyof CustomerFormValues, string>> = {};
      parsed.error.issues.forEach((issue) => {
        const key = issue.path[0] as keyof CustomerFormValues | undefined;
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
    <Dialog
      open
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !submitting) {
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl" initialFocusRef={codeRef} aria-labelledby="customer-form-title">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-6 py-5">
          <div>
            <h2 id="customer-form-title" className="text-2xl font-bold tracking-tight text-slate-900">{title}</h2>
            <p className="mt-1 text-sm text-slate-500">Maintain customer profile and commercial status details.</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} disabled={submitting} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-4 px-6 py-5">
          {formError ? <Alert variant="destructive">{formError}</Alert> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Customer Code</span>
              <input
                ref={codeRef}
                value={formState.values.code}
                onChange={(event) => onChange({ ...formState.values, code: event.target.value })}
                className={`${inputClass} ${fieldErrors.code ? "border-red-300" : "border-slate-200"}`}
                disabled={submitting}
                aria-invalid={Boolean(fieldErrors.code)}
              />
              {fieldErrors.code ? <p className="text-xs text-red-600">{fieldErrors.code}</p> : null}
            </label>

            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Customer Name</span>
              <input
                value={formState.values.name}
                onChange={(event) => onChange({ ...formState.values, name: event.target.value })}
                className={`${inputClass} ${fieldErrors.name ? "border-red-300" : "border-slate-200"}`}
                disabled={submitting}
                aria-invalid={Boolean(fieldErrors.name)}
              />
              {fieldErrors.name ? <p className="text-xs text-red-600">{fieldErrors.name}</p> : null}
            </label>

            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Channel</span>
              <select
                value={formState.values.channel}
                onChange={(event) => onChange({ ...formState.values, channel: event.target.value as CustomerFormValues["channel"] })}
                className={`${inputClass} ${fieldErrors.channel ? "border-red-300" : "border-slate-200"}`}
                disabled={submitting}
              >
                {CUSTOMER_CHANNEL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Status</span>
              <select
                value={formState.values.status}
                onChange={(event) => onChange({ ...formState.values, status: event.target.value as CustomerFormValues["status"] })}
                className={`${inputClass} ${fieldErrors.status ? "border-red-300" : "border-slate-200"}`}
                disabled={submitting}
              >
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Contact Number</span>
              <input
                value={formState.values.phone}
                onChange={(event) => onChange({ ...formState.values, phone: event.target.value })}
                className={`${inputClass} ${fieldErrors.phone ? "border-red-300" : "border-slate-200"}`}
                disabled={submitting}
              />
            </label>

            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Email</span>
              <input
                value={formState.values.email}
                onChange={(event) => onChange({ ...formState.values, email: event.target.value })}
                className={`${inputClass} ${fieldErrors.email ? "border-red-300" : "border-slate-200"}`}
                disabled={submitting}
                aria-invalid={Boolean(fieldErrors.email)}
              />
              {fieldErrors.email ? <p className="text-xs text-red-600">{fieldErrors.email}</p> : null}
            </label>

            <label className="space-y-1 sm:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Address Line 1</span>
              <input
                value={formState.values.addressLine1}
                onChange={(event) => onChange({ ...formState.values, addressLine1: event.target.value })}
                className={`${inputClass} ${fieldErrors.addressLine1 ? "border-red-300" : "border-slate-200"}`}
                disabled={submitting}
              />
            </label>

            <label className="space-y-1 sm:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Address Line 2</span>
              <input
                value={formState.values.addressLine2}
                onChange={(event) => onChange({ ...formState.values, addressLine2: event.target.value })}
                className={`${inputClass} ${fieldErrors.addressLine2 ? "border-red-300" : "border-slate-200"}`}
                disabled={submitting}
              />
            </label>

            <label className="space-y-1 sm:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Assigned Territory / Route</span>
              <input
                value={formState.values.city}
                onChange={(event) => onChange({ ...formState.values, city: event.target.value })}
                className={`${inputClass} ${fieldErrors.city ? "border-red-300" : "border-slate-200"}`}
                disabled={submitting}
                placeholder="Territory or city"
              />
            </label>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-6 py-4">
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {isCreate ? "Create Customer" : "Save Changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
