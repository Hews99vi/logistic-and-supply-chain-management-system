"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchAuthSession, fetchDashboardBundle } from "@/features/dashboard/api/dashboard-api";
import type { ActivityItem, AuthSession, DashboardDataBundle, DashboardFilters } from "@/features/dashboard/types";

export type DashboardViewState = {
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  auth: AuthSession | null;
  bundle: DashboardDataBundle | null;
  activities: ActivityItem[];
  depotStockLevelPercent: number;
  pendingExpensesAmount: number;
  activeRoutesLabel: string;
  canGenerateInsightReport: boolean;
};

const DEFAULT_FILTERS: DashboardFilters = {
  top: 5
};

function deriveDepotStockLevelPercent(bundle: DashboardDataBundle | null) {
  if (!bundle || bundle.topProducts.length === 0) {
    return 0;
  }

  const totals = bundle.topProducts.reduce(
    (acc, item) => {
      acc.balance += item.totalBalanceQty;
      acc.sales += item.totalSalesQty;
      return acc;
    },
    { balance: 0, sales: 0 }
  );

  const denominator = totals.balance + totals.sales;
  if (denominator <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, (totals.balance / denominator) * 100));
}

function derivePendingExpensesAmount(bundle: DashboardDataBundle | null) {
  if (!bundle) {
    return 0;
  }

  const counts = bundle.overview.reportCountByStatus.reduce(
    (acc, item) => {
      acc.total += item.reportCount;
      if (item.status === "draft" || item.status === "submitted") {
        acc.pending += item.reportCount;
      }
      return acc;
    },
    { total: 0, pending: 0 }
  );

  if (counts.total === 0) {
    return 0;
  }

  return bundle.overview.totalExpenses * (counts.pending / counts.total);
}

function deriveActiveRoutesLabel(bundle: DashboardDataBundle | null) {
  if (!bundle) {
    return "0 / 0";
  }

  const activeCount = bundle.salesByRoute.filter((item) => item.reportCount > 0).length;
  return `${activeCount} / ${bundle.routeProgramTotal}`;
}

function deriveActivities(bundle: DashboardDataBundle | null): ActivityItem[] {
  if (!bundle) {
    return [];
  }

  const items: ActivityItem[] = [];

  const topRoute = bundle.routePerformance[0];
  if (topRoute) {
    items.push({
      id: `rp-${topRoute.routeProgramId}`,
      routeOrDepot: `${topRoute.territoryName} / ${topRoute.routeName}`,
      activity: "Route performance snapshot",
      value: `${topRoute.reportCount} reports`,
      statusLabel: "Completed",
      statusTone: "success",
      meta: "Route Program"
    });
  }

  const riskProduct = bundle.mostReturnedProducts[0];
  if (riskProduct) {
    items.push({
      id: `mr-${riskProduct.productId}`,
      routeOrDepot: riskProduct.productName,
      activity: "Return and damage watch",
      value: `${riskProduct.totalAffectedQty} units`,
      statusLabel: "Action Req",
      statusTone: "warning",
      meta: "Inventory"
    });
  }

  const fastProduct = bundle.topProducts[0];
  if (fastProduct) {
    items.push({
      id: `tp-${fastProduct.productId}`,
      routeOrDepot: fastProduct.productName,
      activity: "Sales quantity sync",
      value: `${fastProduct.totalSalesQty} units`,
      statusLabel: "Verified",
      statusTone: "success",
      meta: "Sales"
    });
  }

  const weakTrend = [...bundle.dailyTrend].reverse().find((item) => item.totalNetProfit < 0);
  if (weakTrend) {
    items.push({
      id: `dt-${weakTrend.reportDate}`,
      routeOrDepot: weakTrend.reportDate,
      activity: "Negative net profit day",
      value: "Investigate",
      statusLabel: "Processing",
      statusTone: "secondary",
      meta: "Finance"
    });
  }

  return items;
}

export function useDashboardData(initialFilters?: DashboardFilters) {
  const [filters, setFilters] = useState<DashboardFilters>({ ...DEFAULT_FILTERS, ...initialFilters });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [auth, setAuth] = useState<AuthSession | null>(null);
  const [bundle, setBundle] = useState<DashboardDataBundle | null>(null);

  const load = useCallback(
    async (nextFilters: DashboardFilters, isRefresh = false) => {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError(null);

      try {
        const [session, dashboardBundle] = await Promise.all([
          fetchAuthSession(),
          fetchDashboardBundle(nextFilters)
        ]);

        setAuth(session);
        setBundle(dashboardBundle);
      } catch (requestError) {
        const message = requestError instanceof Error ? requestError.message : "Failed to load dashboard data.";
        setError(message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    void load(filters);
  }, [filters, load]);

  const viewState = useMemo<DashboardViewState>(() => {
    const activities = deriveActivities(bundle);
    const depotStockLevelPercent = deriveDepotStockLevelPercent(bundle);
    const pendingExpensesAmount = derivePendingExpensesAmount(bundle);
    const activeRoutesLabel = deriveActiveRoutesLabel(bundle);

    const role = auth?.user.profileRole;
    const canGenerateInsightReport = role === "admin" || role === "supervisor";

    return {
      loading,
      refreshing,
      error,
      auth,
      bundle,
      activities,
      depotStockLevelPercent,
      pendingExpensesAmount,
      activeRoutesLabel,
      canGenerateInsightReport
    };
  }, [auth, bundle, error, loading, refreshing]);

  return {
    filters,
    setFilters,
    reload: () => load(filters, true),
    viewState
  };
}
