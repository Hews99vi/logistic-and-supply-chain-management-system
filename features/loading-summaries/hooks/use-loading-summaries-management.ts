"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  createLoadingSummary,
  fetchAuthSession,
  fetchLoadingSummaries,
  fetchRouteFilterOptions,
  finalizeLoadingSummary
} from "@/features/loading-summaries/api/loading-summaries-api";
import type {
  LoadingSummaryFilterState,
  LoadingSummaryFormState,
  LoadingSummaryFormValues,
  LoadingSummaryListItem,
  RouteProgramFilterOption
} from "@/features/loading-summaries/types";
import type { DailyReportStatus } from "@/types/domain/report";

const DEFAULT_FORM_VALUES: LoadingSummaryFormValues = {
  reportDate: new Date().toISOString().slice(0, 10),
  routeProgramId: "",
  staffName: "",
  remarks: "",
  loadingNotes: ""
};

function formatDateOffset(days: number) {
  const target = new Date();
  target.setDate(target.getDate() + days);
  return target.toISOString().slice(0, 10);
}

export function useLoadingSummariesManagement() {
  const router = useRouter();

  const [filters, setFilters] = useState<LoadingSummaryFilterState>({
    page: 1,
    pageSize: 10,
    dateFrom: formatDateOffset(-6),
    dateTo: formatDateOffset(0)
  });
  const [items, setItems] = useState<LoadingSummaryListItem[]>([]);
  const [total, setTotal] = useState(0);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [routeOptions, setRouteOptions] = useState<RouteProgramFilterOption[]>([]);
  const [sessionRole, setSessionRole] = useState<"admin" | "supervisor" | "driver" | "cashier" | null>(null);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [isUserActive, setIsUserActive] = useState(false);

  const [searchInput, setSearchInput] = useState("");
  const [formState, setFormState] = useState<LoadingSummaryFormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [finalizingId, setFinalizingId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((previous) => ({
        ...previous,
        page: 1,
        search: searchInput.trim() || undefined
      }));
    }, 350);

    return () => clearTimeout(timer);
  }, [searchInput]);

  const loadSession = useCallback(async () => {
    try {
      const session = await fetchAuthSession();
      setSessionRole(session.user.profileRole);
      setSessionUserId(session.user.id);
      setIsUserActive(session.user.isActive);
    } catch {
      setSessionRole(null);
      setSessionUserId(null);
      setIsUserActive(false);
    }
  }, []);

  const loadData = useCallback(async (nextFilters: LoadingSummaryFilterState, isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError(null);

    try {
      const [list, routes] = await Promise.all([
        fetchLoadingSummaries(nextFilters),
        fetchRouteFilterOptions()
      ]);

      setItems(list.items);
      setTotal(list.total);
      setRouteOptions(routes);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to load loading summaries.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  useEffect(() => {
    void loadData(filters);
  }, [filters, loadData]);

  const canCreate = useMemo(() => {
    if (!isUserActive) return false;
    return sessionRole === "admin" || sessionRole === "supervisor" || sessionRole === "driver";
  }, [isUserActive, sessionRole]);

  const canFinalize = useCallback((row: LoadingSummaryListItem) => {
    if (!canCreate) return false;
    if (row.status !== "draft") return false;
    if (row.loadingCompletedAt) return false;
    if (sessionRole === "driver") {
      return sessionUserId === row.preparedBy;
    }
    return true;
  }, [canCreate, sessionRole, sessionUserId]);

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

  const setRouteProgramId = useCallback((routeProgramId: string) => {
    setFilters((previous) => ({
      ...previous,
      page: 1,
      routeProgramId: routeProgramId || undefined
    }));
  }, []);

  const setStatus = useCallback((status: DailyReportStatus | "") => {
    setFilters((previous) => ({
      ...previous,
      page: 1,
      status: status || undefined
    }));
  }, []);

  const clearFilters = useCallback(() => {
    setSearchInput("");
    setFilters((previous) => ({
      page: 1,
      pageSize: previous.pageSize
    }));
  }, []);

  const setPage = useCallback((page: number) => {
    setFilters((previous) => ({ ...previous, page }));
  }, []);

  const setPageSize = useCallback((pageSize: number) => {
    setFilters((previous) => ({
      ...previous,
      page: 1,
      pageSize
    }));
  }, []);

  const reload = useCallback(() => {
    void loadData(filters, true);
  }, [filters, loadData]);

  const openCreate = useCallback(() => {
    if (!canCreate) return;

    setFormError(null);
    setSuccessMessage(null);
    setFormState({
      values: {
        ...DEFAULT_FORM_VALUES
      }
    });
  }, [canCreate]);

  const closeCreate = useCallback(() => {
    setFormError(null);
    setFormState(null);
  }, []);

  const updateFormValues = useCallback((nextValues: LoadingSummaryFormValues) => {
    setFormError(null);
    setFormState((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        values: nextValues
      };
    });
  }, []);

  const submitCreate = useCallback(async () => {
    if (!formState || !canCreate) return;

    setFormSubmitting(true);
    setFormError(null);
    setSuccessMessage(null);

    try {
      const createdSummary = await createLoadingSummary(formState.values);
      setSuccessMessage("Loading summary created successfully.");
      setFormState(null);
      router.push(`/loading-summaries/${createdSummary.id}` as Route);
    } catch (requestError) {
      setFormError(requestError instanceof Error ? requestError.message : "Failed to create loading summary.");
    } finally {
      setFormSubmitting(false);
    }
  }, [canCreate, formState, router]);

  const finalizeSummary = useCallback(async (item: LoadingSummaryListItem) => {
    if (!canFinalize(item)) return false;

    setFinalizingId(item.id);
    setError(null);
    setSuccessMessage(null);

    try {
      await finalizeLoadingSummary(item.id);
      setSuccessMessage("Loading summary finalized.");
      await loadData(filters, true);
      return true;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to finalize loading summary.");
      return false;
    } finally {
      setFinalizingId(null);
    }
  }, [canFinalize, filters, loadData]);

  return {
    filters,
    items,
    total,
    loading,
    refreshing,
    error,
    successMessage,
    routeOptions,
    searchInput,
    formState,
    formError,
    formSubmitting,
    finalizingId,
    canCreate,
    setSearchInput,
    setDateFrom,
    setDateTo,
    setRouteProgramId,
    setStatus,
    clearFilters,
    setPage,
    setPageSize,
    reload,
    openCreate,
    closeCreate,
    updateFormValues,
    submitCreate,
    finalizeSummary,
    canFinalize
  };
}
