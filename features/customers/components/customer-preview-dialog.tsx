"use client";

import { useEffect, useState } from "react";
import { Clock3, Mail, MapPinned, Phone, Route, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { fetchCustomerRouteProgramContext } from "@/features/customers/api/customers-api";
import { CustomerStatusBadge } from "@/features/customers/components/customer-status-badge";
import type { CustomerListItem, CustomerRouteProgramContextItem } from "@/features/customers/types";
import { getDayLabel } from "@/features/route-programs/types";

type CustomerPreviewDialogProps = {
  customer: CustomerListItem | null;
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

function formatAddress(customer: CustomerListItem) {
  return [customer.address_line_1, customer.address_line_2].filter(Boolean).join(", ") || "-";
}

export function CustomerPreviewDialog({ customer, onClose }: CustomerPreviewDialogProps) {
  const [routes, setRoutes] = useState<CustomerRouteProgramContextItem[]>([]);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);

  useEffect(() => {
    if (!customer || !customer.city?.trim()) {
      setRoutes([]);
      setContextError(null);
      setContextLoading(false);
      return;
    }

    let ignore = false;

    const loadContext = async () => {
      setContextLoading(true);
      setContextError(null);

      try {
        const nextRoutes = await fetchCustomerRouteProgramContext(customer.city ?? "");
        if (!ignore) {
          setRoutes(nextRoutes);
        }
      } catch (requestError) {
        if (!ignore) {
          setContextError(requestError instanceof Error ? requestError.message : "Failed to load operational context.");
          setRoutes([]);
        }
      } finally {
        if (!ignore) {
          setContextLoading(false);
        }
      }
    };

    void loadContext();

    return () => {
      ignore = true;
    };
  }, [customer]);

  if (!customer) {
    return null;
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl" aria-labelledby="customer-preview-title">
        <div className="border-b border-slate-200 px-6 py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Customer Details</p>
          <h2 id="customer-preview-title" className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
            {customer.name}
          </h2>
          <p className="mt-1 text-sm text-slate-600">Read-only customer profile preview.</p>
        </div>

        <div className="space-y-4 px-6 py-5 text-sm text-slate-700">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Customer Code</p>
              <p className="mt-1 font-medium text-slate-900">{customer.code}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Status</p>
              <div className="mt-1"><CustomerStatusBadge status={customer.status} /></div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-start gap-3 rounded-lg border border-slate-200 p-3">
              <Phone className="mt-0.5 h-4 w-4 text-slate-500" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Contact Number</p>
                <p className="font-medium text-slate-900">{customer.phone ?? "-"}</p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-lg border border-slate-200 p-3">
              <Mail className="mt-0.5 h-4 w-4 text-slate-500" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Email</p>
                <p className="font-medium text-slate-900">{customer.email ?? "-"}</p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 sm:col-span-2">
              <MapPinned className="mt-0.5 h-4 w-4 text-slate-500" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Address</p>
                <p className="font-medium text-slate-900">{formatAddress(customer)}</p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 sm:col-span-2">
              <MapPinned className="mt-0.5 h-4 w-4 text-slate-500" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Assigned Territory / Route</p>
                <p className="font-medium text-slate-900">{customer.city ?? "-"}</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Operational Context</p>
            {contextLoading ? <p className="mt-1 text-slate-500">Loading related route programs...</p> : null}
            {contextError ? (
              <p className="mt-2 flex items-center gap-1 text-amber-700">
                <TriangleAlert className="h-4 w-4" />
                {contextError}
              </p>
            ) : null}
            {!contextLoading && !contextError && !customer.city?.trim() ? (
              <p className="mt-1 text-slate-500">No assigned territory/route is currently recorded for this customer.</p>
            ) : null}
            {!contextLoading && !contextError && customer.city?.trim() && routes.length === 0 ? (
              <p className="mt-1 text-slate-500">No active route programs matched the assigned territory.</p>
            ) : null}
            {!contextLoading && !contextError && routes.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {routes.map((routeProgram) => (
                  <li key={routeProgram.id} className="rounded-md border border-slate-200 bg-white p-2">
                    <p className="font-medium text-slate-900">{routeProgram.route_name}</p>
                    <p className="flex items-center gap-2 text-xs text-slate-600">
                      <Route className="h-3.5 w-3.5" />
                      {routeProgram.territory_name}
                      <Clock3 className="ml-2 h-3.5 w-3.5" />
                      {getDayLabel(routeProgram.day_of_week)}  {routeProgram.frequency_label}
                    </p>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Created At</p>
              <p className="mt-1 font-medium text-slate-900">{formatDateTime(customer.created_at)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Updated At</p>
              <p className="mt-1 font-medium text-slate-900">{formatDateTime(customer.updated_at)}</p>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Notes</p>
            <p className="mt-1 font-medium text-slate-500">Not available in current backend contract.</p>
          </div>
        </div>

        <div className="flex justify-end border-t border-slate-200 px-6 py-4">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
