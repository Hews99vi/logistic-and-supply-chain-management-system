"use client";

import { useEffect, useState } from "react";
import { Clock3, Mail, MapPinned, Phone, Route, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { fetchCustomerRouteProgramContext, fetchCustomerStatement } from "@/features/customers/api/customers-api";
import { CustomerStatusBadge } from "@/features/customers/components/customer-status-badge";
import type { CustomerListItem, CustomerRouteProgramContextItem, CustomerStatementDto } from "@/features/customers/types";
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

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency: "LKR",
    maximumFractionDigits: 0
  }).format(amount);
}

export function CustomerPreviewDialog({ customer, onClose }: CustomerPreviewDialogProps) {
  const [routes, setRoutes] = useState<CustomerRouteProgramContextItem[]>([]);
  const [statement, setStatement] = useState<CustomerStatementDto | null>(null);
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

  useEffect(() => {
    if (!customer) {
      setStatement(null);
      return;
    }

    let ignore = false;
    const loadStatement = async () => {
      try {
        const nextStatement = await fetchCustomerStatement(customer.id);
        if (!ignore) setStatement(nextStatement);
      } catch {
        if (!ignore) setStatement(null);
      }
    };

    void loadStatement();
    return () => {
      ignore = true;
    };
  }, [customer]);

  if (!customer) {
    return null;
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="app-dialog-content max-w-2xl" aria-labelledby="customer-preview-title">
        <div className="app-dialog-shell">
          <div className="app-dialog-header">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Customer Details</p>
            <h2 id="customer-preview-title" className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
              {customer.name}
            </h2>
            <p className="mt-1 text-sm text-slate-600">Read-only customer profile preview.</p>
          </div>

          <div className="app-dialog-body text-sm text-slate-700">
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

            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Credit Terms</p>
                <p className="mt-1 font-medium text-slate-900">{customer.credit_days ?? 7} days</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Credit Limit</p>
                <p className="mt-1 font-medium text-slate-900">{formatCurrency(customer.credit_limit ?? 0)}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Outstanding</p>
                <p className="mt-1 font-medium text-slate-900">{formatCurrency(statement?.totals.outstandingAmount ?? customer.outstanding_credit ?? 0)}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Overdue</p>
                <p className={(statement?.totals.overdueAmount ?? customer.overdue_credit ?? 0) > 0 ? "mt-1 font-medium text-rose-700" : "mt-1 font-medium text-slate-900"}>
                  {formatCurrency(statement?.totals.overdueAmount ?? customer.overdue_credit ?? 0)}
                </p>
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
                        {getDayLabel(routeProgram.day_of_week)} {routeProgram.frequency_label}
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
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Recent Credit Invoices</p>
              {statement?.creditInvoices.length ? (
                <div className="mt-2 max-h-48 overflow-auto rounded-md border border-slate-200 bg-white">
                  {statement.creditInvoices.slice(0, 8).map((invoice) => (
                    <div key={invoice.id} className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-slate-100 px-3 py-2 last:border-b-0">
                      <span className="font-medium text-slate-900">{invoice.invoiceNo}</span>
                      <span className="text-slate-600">{invoice.agingBucket}</span>
                      <span className="font-semibold text-slate-900">{formatCurrency(invoice.outstandingAmount)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-1 font-medium text-slate-500">No credit invoices found.</p>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Collections</p>
                <p className="mt-1 font-medium text-slate-900">{statement?.collections.length ?? 0}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Cheques</p>
                <p className="mt-1 font-medium text-slate-900">{statement?.cheques.length ?? 0}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Bills</p>
                <p className="mt-1 font-medium text-slate-900">{statement?.bills.length ?? 0}</p>
              </div>
            </div>
          </div>

          <div className="app-dialog-footer">
            <Button className="w-full sm:w-auto" variant="outline" onClick={onClose}>Close</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
