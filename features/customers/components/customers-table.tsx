"use client";

import { ChevronLeft, ChevronRight, Edit, Eye, Power } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CustomerStatusBadge } from "@/features/customers/components/customer-status-badge";
import type { CustomerListItem } from "@/features/customers/types";

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-LK", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

type CustomersTableProps = {
  customers: CustomerListItem[];
  loading: boolean;
  page: number;
  pageSize: number;
  total: number;
  canManageCustomers: boolean;
  togglingCustomerId: string | null;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onView: (customer: CustomerListItem) => void;
  onEdit: (customer: CustomerListItem) => void;
  onToggleStatus: (customer: CustomerListItem) => void;
};

export function CustomersTable({
  customers,
  loading,
  page,
  pageSize,
  total,
  canManageCustomers,
  togglingCustomerId,
  onPageChange,
  onPageSizeChange,
  onView,
  onEdit,
  onToggleStatus
}: CustomersTableProps) {
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
                <th className="px-5 py-4 font-semibold">Customer Code</th>
                <th className="px-5 py-4 font-semibold">Customer Name</th>
                <th className="px-5 py-4 font-semibold">Contact Number</th>
                <th className="px-5 py-4 font-semibold">Address</th>
                <th className="px-5 py-4 font-semibold">Assigned Territory / Route</th>
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
              ) : customers.length === 0 ? (
                <tr>
                  <td className="px-5 py-12 text-center text-slate-500" colSpan={8}>
                    No customers found for the selected filters.
                  </td>
                </tr>
              ) : (
                customers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-slate-50/70">
                    <td className="px-5 py-4 font-semibold text-slate-900">{customer.code}</td>
                    <td className="px-5 py-4">
                      <p className="font-medium text-slate-900">{customer.name}</p>
                      <p className="text-xs text-slate-500">{customer.channel.replaceAll("_", " ")}</p>
                    </td>
                    <td className="px-5 py-4">{customer.phone ?? "-"}</td>
                    <td className="px-5 py-4 max-w-[280px]">
                      <p className="truncate" title={customer.address_line_1 ?? undefined}>{customer.address_line_1 ?? "-"}</p>
                      {customer.address_line_2 ? <p className="truncate text-xs text-slate-500" title={customer.address_line_2}>{customer.address_line_2}</p> : null}
                    </td>
                    <td className="px-5 py-4">{customer.city ?? "-"}</td>
                    <td className="px-5 py-4"><CustomerStatusBadge status={customer.status} /></td>
                    <td className="px-5 py-4 text-slate-500">{formatDateTime(customer.updated_at)}</td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => onView(customer)}>
                          <Eye className="h-3.5 w-3.5" />
                          View
                        </Button>

                        {canManageCustomers ? (
                          <>
                            <Button variant="outline" size="sm" onClick={() => onEdit(customer)}>
                              <Edit className="h-3.5 w-3.5" />
                              Edit
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => onToggleStatus(customer)}
                              disabled={togglingCustomerId === customer.id}
                            >
                              <Power className="h-3.5 w-3.5" />
                              {customer.status === "ACTIVE" ? "Deactivate" : "Activate"}
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
