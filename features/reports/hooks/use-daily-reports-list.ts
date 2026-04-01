"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { DailyReportBaseDto, DailyReportStatus, DailyReportSummaryCardsDto } from "@/types/domain/report";
import {
  fetchReportsList,
  fetchReportsSummary,
  fetchRouteFilterOptions
} from "@/features/reports/api/daily-reports-api";
import type {
  ReportPreparedByOption,
  ReportsFilterState,
  ReportsSortKey,
  RouteProgramFilterOption
} from "@/features/reports/types";

function buildPreparedByOptions(items: DailyReportBaseDto[]): ReportPreparedByOption[] {
  const map = new Map<string, string>();

  items.forEach((item) => {
    if (!map.has(item.preparedBy)) {
      map.set(item.preparedBy, item.staffName);
    }
  });

  return Array.from(map.entries())
    .map(([id, label]) => ({ id, label }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

function defaultSummary(): DailyReportSummaryCardsDto {
  return {
    totalReports: 0,
    draftReports: 0,
    submittedReports: 0,
    approvedReports: 0,
    rejectedReports: 0,
    totalSales: 0,
    totalCash: 0,
    totalExpenses: 0,
    totalNetProfit: 0
  };
}

function getPreviousDateRange(dateFrom?: string, dateTo?: string) {
  if (!dateFrom || !dateTo) {
    return { dateFrom: undefined, dateTo: undefined };
  }

  const start = new Date(dateFrom);
  const end = new Date(dateTo);

  const dayMs = 1000 * 60 * 60 * 24;
  const rangeDays = Math.floor((end.getTime() - start.getTime()) / dayMs) + 1;

  const previousEnd = new Date(start.getTime() - dayMs);
  const previousStart = new Date(previousEnd.getTime() - dayMs * (rangeDays - 1));

  return {
    dateFrom: previousStart.toISOString().slice(0, 10),
    dateTo: previousEnd.toISOString().slice(0, 10)
  };
}

export function useDailyReportsList() {
  const today = new Date();
  const previousWeek = new Date(today);
  previousWeek.setDate(today.getDate() - 6);

  const [filters, setFilters] = useState<ReportsFilterState>({
    page: 1,
    pageSize: 10,
    sortKey: "updatedAt",
    sortDirection: "desc",
    dateFrom: previousWeek.toISOString().slice(0, 10),
    dateTo: today.toISOString().slice(0, 10)
  });

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [reports, setReports] = useState<DailyReportBaseDto[]>([]);
  const [summary, setSummary] = useState<DailyReportSummaryCardsDto>(defaultSummary());
  const [previousSummary, setPreviousSummary] = useState<DailyReportSummaryCardsDto>(defaultSummary());
  const [total, setTotal] = useState(0);
  const [routeOptions, setRouteOptions] = useState<RouteProgramFilterOption[]>([]);
  const [preparedByOptions, setPreparedByOptions] = useState<ReportPreparedByOption[]>([]);

  const [searchInput, setSearchInput] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((previous) => ({
        ...previous,
        page: 1,
        search: searchInput.trim() || undefined
      }));
    }, 400);

    return () => clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(async (nextFilters: ReportsFilterState, isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError(null);

    const previousRange = getPreviousDateRange(nextFilters.dateFrom, nextFilters.dateTo);

    try {
      const [list, summaryCards, previousSummaryCards, routes] = await Promise.all([
        fetchReportsList(nextFilters),
        fetchReportsSummary(nextFilters),
        fetchReportsSummary({
          ...nextFilters,
          page: 1,
          pageSize: 10,
          dateFrom: previousRange.dateFrom,
          dateTo: previousRange.dateTo
        }),
        fetchRouteFilterOptions()
      ]);

      setReports(list.items);
      setTotal(list.total);
      setSummary(summaryCards);
      setPreviousSummary(previousSummaryCards);
      setRouteOptions(routes);
      setPreparedByOptions(buildPreparedByOptions(list.items));
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Failed to load daily reports.";
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(filters);
  }, [filters, load]);

  const displayedRows = useMemo(() => reports, [reports]);

  const weeklyChangePercent = useMemo(() => {
    const baseline = previousSummary.totalSales;
    if (baseline === 0) {
      return summary.totalSales > 0 ? 100 : 0;
    }

    return ((summary.totalSales - baseline) / baseline) * 100;
  }, [previousSummary.totalSales, summary.totalSales]);

  const activeRouteCount = useMemo(() => {
    return new Set(reports.map((item) => item.routeProgramId)).size;
  }, [reports]);

  const sortBy = useCallback((key: ReportsSortKey) => {
    setFilters((previous) => {
      if (previous.sortKey === key) {
        return {
          ...previous,
          page: 1,
          sortDirection: previous.sortDirection === "asc" ? "desc" : "asc"
        };
      }

      return {
        ...previous,
        page: 1,
        sortKey: key,
        sortDirection: "asc"
      };
    });
  }, []);

  const setStatus = useCallback((status: DailyReportStatus | "") => {
    setFilters((previous) => ({
      ...previous,
      page: 1,
      status: status || undefined
    }));
  }, []);

  const setRoute = useCallback((routeProgramId: string) => {
    setFilters((previous) => ({
      ...previous,
      page: 1,
      routeProgramId: routeProgramId || undefined
    }));
  }, []);

  const setPreparedBy = useCallback((createdBy: string) => {
    setFilters((previous) => ({
      ...previous,
      page: 1,
      createdBy: createdBy || undefined
    }));
  }, []);

  const setDateFrom = useCallback((dateFrom: string) => {
    setFilters((previous) => ({
      ...previous,
      page: 1,
      dateFrom: dateFrom || undefined
    }));
  }, []);

  const setDateTo = useCallback((dateTo: string) => {
    setFilters((previous) => ({
      ...previous,
      page: 1,
      dateTo: dateTo || undefined
    }));
  }, []);

  const setPage = useCallback((page: number) => {
    setFilters((previous) => ({ ...previous, page }));
  }, []);

  const setPageSize = useCallback((pageSize: number) => {
    setFilters((previous) => ({ ...previous, page: 1, pageSize }));
  }, []);

  const reload = useCallback(() => {
    void load(filters, true);
  }, [filters, load]);

  return {
    filters,
    displayedRows,
    total,
    summary,
    routeOptions,
    preparedByOptions,
    loading,
    refreshing,
    error,
    searchInput,
    weeklyChangePercent,
    activeRouteCount,
    setSearchInput,
    setStatus,
    setRoute,
    setPreparedBy,
    setDateFrom,
    setDateTo,
    setPage,
    setPageSize,
    sortBy,
    reload
  };
}
