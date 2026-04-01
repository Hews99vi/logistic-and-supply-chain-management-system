"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { DailyReportSummaryCardsDto } from "@/types/domain/report";

function formatCurrencyLkr(amount: number) {
  return new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency: "LKR",
    maximumFractionDigits: 1
  }).format(amount);
}

export function ReportsSummaryWidgets({
  summary,
  routeCount,
  activeRouteCount,
  weeklyChangePercent
}: {
  summary: DailyReportSummaryCardsDto;
  routeCount: number;
  activeRouteCount: number;
  weeklyChangePercent: number;
}) {
  const pendingApprovals = summary.submittedReports;
  const routeEfficiency = routeCount === 0 ? 0 : Math.round((activeRouteCount / routeCount) * 100);

  return (
    <section className="grid gap-4 lg:grid-cols-3">
      <Card>
        <CardHeader className="pb-2">
          <CardDescription className="text-xs uppercase tracking-[0.18em]">Weekly Performance</CardDescription>
          <CardTitle className="text-4xl">{formatCurrencyLkr(summary.totalSales)}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className={`text-sm font-semibold ${weeklyChangePercent >= 0 ? "text-emerald-600" : "text-red-600"}`}>
            {weeklyChangePercent >= 0 ? "+" : ""}{weeklyChangePercent.toFixed(1)}% vs last week
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardDescription className="text-xs uppercase tracking-[0.18em]">Route Efficiency</CardDescription>
          <CardTitle className="text-2xl">Active Routes {activeRouteCount} / {routeCount}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-2 w-full rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-blue-700" style={{ width: `${Math.max(0, Math.min(100, routeEfficiency))}%` }} />
          </div>
          <p className="mt-3 text-sm text-slate-500">Target completion rate 95%</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardDescription className="text-xs uppercase tracking-[0.18em]">Pending Approval</CardDescription>
          <CardTitle className="text-4xl text-amber-700">{pendingApprovals} Reports</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm font-semibold text-blue-700">Review Now</p>
        </CardContent>
      </Card>
    </section>
  );
}
