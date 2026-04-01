"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { DashboardDataBundle } from "@/features/dashboard/types";

type SummaryWidgetsProps = {
  bundle: DashboardDataBundle | null;
  loading?: boolean;
};

function formatCurrencyLkr(amount: number) {
  return new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency: "LKR",
    maximumFractionDigits: 0
  }).format(amount);
}

export function SummaryWidgets({ bundle, loading }: SummaryWidgetsProps) {
  const topProducts = bundle?.topProducts.slice(0, 3) ?? [];
  const paymentTotals = bundle?.overview.paymentModeTotals;

  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Top Products by Sales Qty</CardTitle>
          <CardDescription>Based on current filter window</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          {loading ? (
            Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-14" />)
          ) : topProducts.length === 0 ? (
            <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
              No product movement data available.
            </p>
          ) : (
            topProducts.map((item) => (
              <div key={item.productId} className="flex items-center justify-between rounded-md border border-slate-100 px-3 py-2.5">
                <div>
                  <p className="font-semibold text-slate-900">{item.productName}</p>
                  <p className="text-xs text-slate-500">{item.productCode}</p>
                </div>
                <p className="font-semibold text-slate-800">{item.totalSalesQty} units</p>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Payment Mode Totals</CardTitle>
          <CardDescription>Cash, cheques, and credit split</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          {loading ? (
            Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-10" />)
          ) : !paymentTotals ? (
            <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
              Payment totals are unavailable.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between rounded-md border border-slate-100 px-3 py-2.5">
                <span className="text-slate-600">Cash</span>
                <span className="font-semibold">{formatCurrencyLkr(paymentTotals.totalCash)}</span>
              </div>
              <div className="flex items-center justify-between rounded-md border border-slate-100 px-3 py-2.5">
                <span className="text-slate-600">Cheques</span>
                <span className="font-semibold">{formatCurrencyLkr(paymentTotals.totalCheques)}</span>
              </div>
              <div className="flex items-center justify-between rounded-md border border-slate-100 px-3 py-2.5">
                <span className="text-slate-600">Credit</span>
                <span className="font-semibold">{formatCurrencyLkr(paymentTotals.totalCredit)}</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
