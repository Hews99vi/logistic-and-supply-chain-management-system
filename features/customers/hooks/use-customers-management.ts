"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  createCustomer,
  fetchAuthSession,
  fetchCustomers,
  fetchUnmatchedCustomers,
  resolveUnmatchedCustomer,
  setCustomerActiveState,
  updateCustomer
} from "@/features/customers/api/customers-api";
import type {
  CustomerFilterState,
  CustomerFormState,
  CustomerFormValues,
  CustomerListItem,
  CustomerStatus,
  UnmatchedCustomerOutletDto
} from "@/features/customers/types";

const DEFAULT_FORM_VALUES: CustomerFormValues = {
  code: "",
  name: "",
  channel: "RETAIL",
  phone: "",
  email: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  status: "ACTIVE",
  creditDays: 7,
  creditLimit: 0,
  creditStatus: "active"
};

function toFormValues(customer: CustomerListItem): CustomerFormValues {
  return {
    code: customer.code,
    name: customer.name,
    channel: customer.channel,
    phone: customer.phone ?? "",
    email: customer.email ?? "",
    addressLine1: customer.address_line_1 ?? "",
    addressLine2: customer.address_line_2 ?? "",
    city: customer.city ?? "",
    status: customer.status,
    creditDays: customer.credit_days ?? 7,
    creditLimit: customer.credit_limit ?? 0,
    creditStatus: customer.credit_status ?? "active"
  };
}

export function useCustomersManagement() {
  const [filters, setFilters] = useState<CustomerFilterState>({
    page: 1,
    pageSize: 10
  });
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [unmatchedCustomers, setUnmatchedCustomers] = useState<UnmatchedCustomerOutletDto[]>([]);
  const [total, setTotal] = useState(0);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [sessionRole, setSessionRole] = useState<"admin" | "supervisor" | "driver" | "cashier" | null>(null);
  const [isUserActive, setIsUserActive] = useState(false);

  const [searchInput, setSearchInput] = useState("");
  const [territoryInput, setTerritoryInput] = useState("");
  const [formState, setFormState] = useState<CustomerFormState | null>(null);
  const [previewTarget, setPreviewTarget] = useState<CustomerListItem | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [statusTarget, setStatusTarget] = useState<CustomerListItem | null>(null);
  const [togglingCustomerId, setTogglingCustomerId] = useState<string | null>(null);

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

  const loadCustomers = useCallback(async (nextFilters: CustomerFilterState, isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError(null);

    try {
      const list = await fetchCustomers(nextFilters);
      setCustomers(list.items);
      setTotal(list.total);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to load customers.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadUnmatchedCustomers = useCallback(async () => {
    try {
      const rows = await fetchUnmatchedCustomers();
      setUnmatchedCustomers(rows);
    } catch {
      setUnmatchedCustomers([]);
    }
  }, []);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  useEffect(() => {
    void loadCustomers(filters);
    void loadUnmatchedCustomers();
  }, [filters, loadCustomers, loadUnmatchedCustomers]);

  const canManageCustomers = useMemo(() => {
    if (!isUserActive) return false;
    return sessionRole === "admin" || sessionRole === "supervisor";
  }, [isUserActive, sessionRole]);

  useEffect(() => {
    if (canManageCustomers) return;
    setFormState(null);
    setStatusTarget(null);
    setFormError(null);
    setFormSubmitting(false);
  }, [canManageCustomers]);

  const setStatus = useCallback((status: "active" | "inactive" | "") => {
    setFilters((previous) => ({
      ...previous,
      page: 1,
      status: status === "" ? undefined : (status === "active" ? "ACTIVE" : "INACTIVE")
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
    if (!canManageCustomers) return;

    setFormError(null);
    setSuccessMessage(null);
    setFormState({
      mode: "create",
      values: DEFAULT_FORM_VALUES
    });
  }, [canManageCustomers]);

  const openPreview = useCallback((customer: CustomerListItem) => {
    setPreviewTarget(customer);
  }, []);

  const closePreview = useCallback(() => {
    setPreviewTarget(null);
  }, []);

  const openEdit = useCallback((customer: CustomerListItem) => {
    if (!canManageCustomers) return;

    setFormError(null);
    setSuccessMessage(null);
    setFormState({
      mode: "edit",
      customerId: customer.id,
      values: toFormValues(customer)
    });
  }, [canManageCustomers]);

  const closeForm = useCallback(() => {
    setFormError(null);
    setFormState(null);
  }, []);

  const updateFormValues = useCallback((nextValues: CustomerFormValues) => {
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
    void loadCustomers(filters, true);
  }, [filters, loadCustomers]);

  const submitForm = useCallback(async () => {
    if (!formState || !canManageCustomers) return;

    setFormSubmitting(true);
    setFormError(null);
    setSuccessMessage(null);

    try {
      if (formState.mode === "create") {
        await createCustomer(formState.values);
        setSuccessMessage("Customer created successfully.");
      } else if (formState.customerId) {
        await updateCustomer(formState.customerId, formState.values);
        setSuccessMessage("Customer updated successfully.");
      }

      setFormState(null);
      await loadCustomers(filters, true);
      await loadUnmatchedCustomers();
    } catch (requestError) {
      setFormError(requestError instanceof Error ? requestError.message : "Failed to save customer.");
    } finally {
      setFormSubmitting(false);
    }
  }, [canManageCustomers, filters, formState, loadCustomers, loadUnmatchedCustomers]);

  const resolveUnmatched = useCallback(async (matchId: string, action: "create" | "ignore") => {
    if (!canManageCustomers) return;
    setError(null);
    setSuccessMessage(null);
    try {
      await resolveUnmatchedCustomer(matchId, { action });
      setSuccessMessage(action === "create" ? "Customer created from unmatched outlet." : "Unmatched outlet ignored.");
      await loadUnmatchedCustomers();
      await loadCustomers(filters, true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to resolve unmatched customer.");
    }
  }, [canManageCustomers, filters, loadCustomers, loadUnmatchedCustomers]);

  const requestCustomerStatusToggle = useCallback((customer: CustomerListItem) => {
    if (!canManageCustomers) return;

    setError(null);
    setSuccessMessage(null);
    setStatusTarget(customer);
  }, [canManageCustomers]);

  const cancelCustomerStatusToggle = useCallback(() => {
    if (togglingCustomerId) return;
    setStatusTarget(null);
  }, [togglingCustomerId]);

  const confirmCustomerStatusToggle = useCallback(async () => {
    if (!statusTarget || !canManageCustomers) return;

    const shouldActivate = statusTarget.status !== "ACTIVE";
    const nextStatus: CustomerStatus = shouldActivate ? "ACTIVE" : "INACTIVE";

    setTogglingCustomerId(statusTarget.id);
    setError(null);
    setSuccessMessage(null);

    try {
      await setCustomerActiveState(statusTarget.id, nextStatus);
      setSuccessMessage(shouldActivate ? "Customer activated successfully." : "Customer deactivated successfully.");
      setStatusTarget(null);
      await loadCustomers(filters, true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to update customer status.");
    } finally {
      setTogglingCustomerId(null);
    }
  }, [canManageCustomers, filters, loadCustomers, statusTarget]);

  return {
    filters,
    customers,
    unmatchedCustomers,
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
    togglingCustomerId,
    canManageCustomers,
    setSearchInput,
    setTerritoryInput,
    setStatus,
    clearFilters,
    setPage,
    setPageSize,
    reload,
    resolveUnmatched,
    openCreate,
    openPreview,
    closePreview,
    openEdit,
    closeForm,
    updateFormValues,
    submitForm,
    requestCustomerStatusToggle,
    cancelCustomerStatusToggle,
    confirmCustomerStatusToggle
  };
}
