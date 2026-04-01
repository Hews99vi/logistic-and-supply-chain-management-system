"use client";

import { AlertTriangle, ClipboardList, Package, Truck } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardHeader } from "@/features/dashboard/components/dashboard-header";
import { DashboardSidebar } from "@/features/dashboard/components/dashboard-sidebar";
import { KpiCard } from "@/features/dashboard/components/kpi-card";
import { AiInsightCard, RecentActivity } from "@/features/dashboard/components/recent-activity";
import { RouteSaturationWidget } from "@/features/dashboard/components/route-saturation-widget";
import { SummaryWidgets } from "@/features/dashboard/components/summary-widgets";
import { useDashboardData } from "@/features/dashboard/hooks/use-dashboard-data";

function formatCurrencyLkr(amount: number) {
  return new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency: "LKR",
    maximumFractionDigits: 0
  }).format(amount);
}

function buildInsightText(routeName: string | undefined, stockLevel: number, pendingExpenses: number) {
  if (!routeName) {
    return "Route-level trend data is not available yet. Once reports are submitted, this panel will surface congestion and dispatch optimization recommendations.";
  }

  return `Route ${routeName} is showing sustained sales momentum. Depot stock health is at ${stockLevel.toFixed(1)}%. Pending expenses are currently ${formatCurrencyLkr(pendingExpenses)}. Prioritize early dispatch for high-volume routes and verify replenishment for low-balance items.`;
}

export function DashboardView() {
  const { filters, setFilters, reload, viewState } = useDashboardData({
    top: 5,
    dateFrom: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    dateTo: new Date().toISOString().slice(0, 10)
  });

  const overview = viewState.bundle?.overview;
  const topRoute = viewState.bundle?.routePerformance[0]?.routeName;
  const insightText = buildInsightText(topRoute, viewState.depotStockLevelPercent, viewState.pendingExpensesAmount);

  return (
    <div className="min-h-screen lg:flex">
      <DashboardSidebar activeKey="dashboard" />

      <main className="flex-1 p-4 sm:p-6">
        <div className="mx-auto max-w-7xl space-y-6">
          <DashboardHeader
            filters={filters}
            refreshing={viewState.refreshing}
            onApplyFilters={setFilters}
            onRefresh={reload}
          />

          {viewState.error ? <Alert variant="destructive">{viewState.error}</Alert> : null}

          {!viewState.loading && !viewState.auth?.user.isActive ? (
            <Alert variant="destructive">Your account is inactive. Please contact an administrator.</Alert>
          ) : null}

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {viewState.loading ? (
              Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-52 rounded-lg" />)
            ) : (
              <>
                <KpiCard
                  title="Daily Sales"
                  value={formatCurrencyLkr(overview?.totalSales ?? 0)}
                  subtitle="From filtered period"
                  badgeText="+12.5%"
                  badgeTone="success"
                  icon={ClipboardList}
                  accent="bg-blue-100 text-blue-700"
                />
                <KpiCard
                  title="Active Routes"
                  value={viewState.activeRoutesLabel}
                  subtitle="Routes with activity"
                  badgeText="On Track"
                  badgeTone="secondary"
                  icon={Truck}
                  accent="bg-indigo-100 text-indigo-700"
                  progress={viewState.bundle?.routeProgramTotal ? (viewState.bundle.salesByRoute.length / viewState.bundle.routeProgramTotal) * 100 : 0}
                />
                <KpiCard
                  title="Depot Stock Level"
                  value={`${viewState.depotStockLevelPercent.toFixed(1)}%`}
                  subtitle="Balance qty ratio"
                  badgeText={viewState.depotStockLevelPercent < 20 ? "Low" : "Healthy"}
                  badgeTone={viewState.depotStockLevelPercent < 20 ? "warning" : "success"}
                  icon={Package}
                  accent="bg-amber-100 text-amber-700"
                  progress={viewState.depotStockLevelPercent}
                />
                <KpiCard
                  title="Pending Expenses"
                  value={formatCurrencyLkr(viewState.pendingExpensesAmount)}
                  subtitle="Draft + submitted exposure"
                  badgeText={`${overview?.reportCountByStatus.find((item) => item.status === "submitted")?.reportCount ?? 0} Requests`}
                  badgeTone="danger"
                  icon={AlertTriangle}
                  accent="bg-rose-100 text-rose-700"
                />
              </>
            )}
          </section>

          <SummaryWidgets bundle={viewState.bundle} loading={viewState.loading} />

          <section className="grid gap-6 xl:grid-cols-[2fr_1fr]">
            <RecentActivity items={viewState.activities} loading={viewState.loading} />

            <div className="space-y-6">
              <RouteSaturationWidget items={viewState.bundle?.routePerformance ?? []} loading={viewState.loading} />
              <AiInsightCard content={insightText} canGenerate={viewState.canGenerateInsightReport} />
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
