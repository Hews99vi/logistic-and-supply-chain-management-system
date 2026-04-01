"use client";

import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { CustomerListItem } from "@/features/customers/types";

type CustomerStatusConfirmDialogProps = {
  customer: CustomerListItem | null;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function CustomerStatusConfirmDialog({
  customer,
  submitting,
  onCancel,
  onConfirm
}: CustomerStatusConfirmDialogProps) {
  const open = Boolean(customer);

  if (!customer) {
    return null;
  }

  const isDeactivation = customer.status === "ACTIVE";

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
        aria-labelledby="customer-status-dialog-title"
      >
        <div className="border-b border-slate-100 p-6">
          <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-amber-50 text-amber-600">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <h2 id="customer-status-dialog-title" className="text-xl font-bold tracking-tight text-slate-900">
            {isDeactivation ? "Deactivate Customer" : "Activate Customer"}
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            {isDeactivation
              ? "This customer will be hidden from active operational selections."
              : "This customer will become available again for operational use."}
          </p>
        </div>

        <div className="space-y-3 p-6 text-sm text-slate-700">
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <p>
              <span className="font-semibold">Customer:</span> {customer.name}
            </p>
            <p>
              <span className="font-semibold">Code:</span> {customer.code}
            </p>
            <p>
              <span className="font-semibold">Assignment:</span> {customer.city ?? "-"}
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
