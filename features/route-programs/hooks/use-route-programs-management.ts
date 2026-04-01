"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  createRouteProgram,
  fetchAuthSession,
  fetchRoutePrograms,
  setRouteProgramActiveState,
  updateRouteProgram
} from "@/features/route-programs/api/route-programs-api";
import type {
  RouteProgramFilterState,
  RouteProgramFormState,
  RouteProgramFormValues,
  RouteProgramListItem
} from "@/features/route-programs/types";

const DEFAULT_FORM_VALUES: RouteProgramFormValues = {
  territoryName: "",
  dayOfWeek: 1,
  frequencyLabel: "",
  routeName: "",
  routeDescription: "",
  isActive: true
};

function toFormValues(item: RouteProgramListItem): RouteProgramFormValues {
  return {
    territoryName: item.territory_name,
    dayOfWeek: item.day_of_week,
    frequencyLabel: item.frequency_label,
    routeName: item.route_name,
    routeDescription: item.route_description ?? "",
    isActive: item.is_active
  };
}

export function useRouteProgramsManagement() {
  const [filters, setFilters] = useState<RouteProgramFilterState>({
    page: 1,
    pageSize: 10
  });
  const [routePrograms, setRoutePrograms] = useState<RouteProgramListItem[]>([]);
  const [total, setTotal] = useState(0);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [sessionRole, setSessionRole] = useState<"admin" | "supervisor" | "driver" | "cashier" | null>(null);
  const [isUserActive, setIsUserActive] = useState(false);

  const [searchInput, setSearchInput] = useState("");
  const [territoryInput, setTerritoryInput] = useState("");
  const [formState, setFormState] = useState<RouteProgramFormState | null>(null);
  const [previewTarget, setPreviewTarget] = useState<RouteProgramListItem | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [togglingRouteProgramId, setTogglingRouteProgramId] = useState<string | null>(null);
  const [statusTarget, setStatusTarget] = useState<RouteProgramListItem | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((previous) => ({
        ...previous,
        page: 1,
        search: searchInput.trim() || undefined,
        territory: territoryInput.trim() || undefined
      }));
    }, 350);

    return () => clearTimeout(timer);
  }, [searchInput, territoryInput]);

  const loadSession = useCallback(async () => {
    try {
      const session = await fetchAuthSession();
      setSessionRole(session.user.profileRole);
      setIsUserActive(session.user.isActive);
    } catch {
      setSessionRole(null);
      setIsUserActive(false);
    }
  }, []);

  const loadRoutePrograms = useCallback(async (nextFilters: RouteProgramFilterState, isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError(null);

    try {
      const list = await fetchRoutePrograms(nextFilters);
      setRoutePrograms(list.items);
      setTotal(list.total);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to load route programs.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  useEffect(() => {
    void loadRoutePrograms(filters);
  }, [filters, loadRoutePrograms]);

  const canManageRoutePrograms = useMemo(() => {
    if (!isUserActive) return false;
    return sessionRole === "admin" || sessionRole === "supervisor";
  }, [isUserActive, sessionRole]);

  useEffect(() => {
    if (canManageRoutePrograms) return;
    setFormState(null);
    setStatusTarget(null);
    setFormError(null);
    setFormSubmitting(false);
  }, [canManageRoutePrograms]);

  const territoryOptions = useMemo(() => {
    const values = new Set(routePrograms.map((item) => item.territory_name).filter(Boolean));
    return Array.from(values).sort((left, right) => left.localeCompare(right));
  }, [routePrograms]);

  const setDayOfWeek = useCallback((dayOfWeek: number | "") => {
    setFilters((previous) => ({
      ...previous,
      page: 1,
      dayOfWeek: dayOfWeek === "" ? undefined : dayOfWeek
    }));
  }, []);

  const setStatus = useCallback((status: "active" | "inactive" | "") => {
    setFilters((previous) => ({
      ...previous,
      page: 1,
      isActive: status === "" ? undefined : status === "active"
    }));
  }, []);

  const clearFilters = useCallback(() => {
    setSearchInput("");
    setTerritoryInput("");
    setFilters({
      page: 1,
      pageSize: filters.pageSize
    });
  }, [filters.pageSize]);

  const openCreate = useCallback(() => {
    if (!canManageRoutePrograms) return;

    setFormError(null);
    setSuccessMessage(null);
    setFormState({
      mode: "create",
      values: DEFAULT_FORM_VALUES
    });
  }, [canManageRoutePrograms]);

  const openPreview = useCallback((routeProgram: RouteProgramListItem) => {
    setPreviewTarget(routeProgram);
  }, []);

  const closePreview = useCallback(() => {
    setPreviewTarget(null);
  }, []);

  const openEdit = useCallback((routeProgram: RouteProgramListItem) => {
    if (!canManageRoutePrograms) return;

    setFormError(null);
    setSuccessMessage(null);
    setFormState({
      mode: "edit",
      routeProgramId: routeProgram.id,
      values: toFormValues(routeProgram)
    });
  }, [canManageRoutePrograms]);

  const closeForm = useCallback(() => {
    setFormError(null);
    setFormState(null);
  }, []);

  const updateFormValues = useCallback((nextValues: RouteProgramFormValues) => {
    setFormError(null);
    setFormState((previous) => {
      if (!previous) return previous;
      return { ...previous, values: nextValues };
    });
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
    void loadRoutePrograms(filters, true);
  }, [filters, loadRoutePrograms]);

  const submitForm = useCallback(async () => {
    if (!formState || !canManageRoutePrograms) return;

    setFormSubmitting(true);
    setFormError(null);
    setSuccessMessage(null);

    try {
      if (formState.mode === "create") {
        await createRouteProgram(formState.values);
        setSuccessMessage("Route program created successfully.");
      } else if (formState.routeProgramId) {
        await updateRouteProgram(formState.routeProgramId, formState.values);
        setSuccessMessage("Route program updated successfully.");
      }

      setFormState(null);
      await loadRoutePrograms(filters, true);
    } catch (requestError) {
      setFormError(requestError instanceof Error ? requestError.message : "Failed to save route program.");
    } finally {
      setFormSubmitting(false);
    }
  }, [canManageRoutePrograms, filters, formState, loadRoutePrograms]);

  const requestRouteProgramStatusToggle = useCallback((routeProgram: RouteProgramListItem) => {
    if (!canManageRoutePrograms) return;

    setError(null);
    setSuccessMessage(null);
    setStatusTarget(routeProgram);
  }, [canManageRoutePrograms]);

  const cancelRouteProgramStatusToggle = useCallback(() => {
    if (togglingRouteProgramId) return;
    setStatusTarget(null);
  }, [togglingRouteProgramId]);

  const confirmRouteProgramStatusToggle = useCallback(async () => {
    if (!statusTarget || !canManageRoutePrograms) return;

    setTogglingRouteProgramId(statusTarget.id);
    setError(null);
    setSuccessMessage(null);

    try {
      await setRouteProgramActiveState(statusTarget.id, !statusTarget.is_active);
      setSuccessMessage(statusTarget.is_active ? "Route program deactivated successfully." : "Route program activated successfully.");
      setStatusTarget(null);
      await loadRoutePrograms(filters, true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to update route program status.");
    } finally {
      setTogglingRouteProgramId(null);
    }
  }, [canManageRoutePrograms, filters, loadRoutePrograms, statusTarget]);

  return {
    filters,
    routePrograms,
    total,
    loading,
    refreshing,
    error,
    successMessage,
    searchInput,
    territoryInput,
    formState,
    previewTarget,
    formError,
    formSubmitting,
    statusTarget,
    togglingRouteProgramId,
    canManageRoutePrograms,
    territoryOptions,
    setSearchInput,
    setTerritoryInput,
    setDayOfWeek,
    setStatus,
    clearFilters,
    setPage,
    setPageSize,
    reload,
    openCreate,
    openPreview,
    closePreview,
    openEdit,
    closeForm,
    updateFormValues,
    submitForm,
    requestRouteProgramStatusToggle,
    cancelRouteProgramStatusToggle,
    confirmRouteProgramStatusToggle
  };
}
