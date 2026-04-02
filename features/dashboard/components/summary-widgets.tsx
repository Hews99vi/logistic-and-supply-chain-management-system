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
      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle>Top Products by Sales Qty</CardTitle>
          <CardDescription>Based on current filter window</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          {loading ? (
            Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-16 rounded-xl" />)
          ) : topProducts.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
              No product movement data available.
            </p>
          ) : (
            topProducts.map((item, index) => (
              <div key={item.productId} className="rounded-xl border border-slate-100 px-3 py-3 sm:px-4">
                <div className="space-y-2 sm:flex sm:items-start sm:justify-between sm:gap-3 sm:space-y-0">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">#{index + 1} Product</p>
                    <p className="mt-1 break-words text-base font-semibold leading-6 text-slate-900 sm:text-lg">{item.productName}</p>
                    <p className="text-xs text-slate-500">{item.productCode}</p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold text-slate-800 sm:text-right">{item.totalSalesQty} units</p>
                </div>
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
        <CardContent className="grid gap-3 pt-0 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-1">
          {loading ? (
            Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-16 rounded-xl" />)
          ) : !paymentTotals ? (
            <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500 sm:col-span-3 lg:col-span-1 xl:col-span-1">
              Payment totals are unavailable.
            </p>
          ) : (
            <>
              <div className="rounded-xl border border-slate-100 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Cash</p>
                <p className="mt-1 break-words text-lg font-semibold text-slate-900">{formatCurrencyLkr(paymentTotals.totalCash)}</p>
              </div>
              <div className="rounded-xl border border-slate-100 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Cheques</p>
                <p className="mt-1 break-words text-lg font-semibold text-slate-900">{formatCurrencyLkr(paymentTotals.totalCheques)}</p>
              </div>
              <div className="rounded-xl border border-slate-100 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Credit</p>
                <p className="mt-1 break-words text-lg font-semibold text-slate-900">{formatCurrencyLkr(paymentTotals.totalCredit)}</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
