"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  createProduct,
  fetchAuthSession,
  fetchProducts,
  setProductActiveState,
  updateProduct
} from "@/features/products/api/products-api";
import type {
  ProductCategory,
  ProductFilterState,
  ProductFormState,
  ProductFormValues,
  ProductListItem,
  ProductQuantityEntryMode,
  ProductSellingUnit,
  ProductUnitMeasure
} from "@/features/products/types";

const DEFAULT_FORM_VALUES: ProductFormValues = {
  productCode: "",
  brand: "",
  productFamily: "",
  variant: "",
  unitSize: "",
  unitMeasure: "",
  packSize: "",
  sellingUnit: "",
  quantityEntryMode: "pack",
  category: "",
  unitPrice: "",
  isActive: true
};

function toMeasureValue(value: string | null): ProductUnitMeasure | "" {
  return (value ?? "") as ProductUnitMeasure | "";
}

function toSellingUnitValue(value: string | null): ProductSellingUnit | "" {
  return (value ?? "") as ProductSellingUnit | "";
}

function toQuantityEntryModeValue(value: string | null): ProductQuantityEntryMode {
  return value === "unit" ? "unit" : "pack";
}

function toCategoryValue(value: string | null): ProductCategory | "" {
  return (value ?? "") as ProductCategory | "";
}

function toFormValues(product: ProductListItem): ProductFormValues {
  return {
    productCode: product.product_code,
    brand: product.brand ?? "",
    productFamily: product.product_family ?? product.display_name ?? product.product_name,
    variant: product.variant ?? "",
    unitSize: product.unit_size !== null && product.unit_size !== undefined ? String(product.unit_size) : "",
    unitMeasure: toMeasureValue(product.unit_measure),
    packSize: product.pack_size !== null && product.pack_size !== undefined ? String(product.pack_size) : "",
    sellingUnit: toSellingUnitValue(product.selling_unit),
    quantityEntryMode: toQuantityEntryModeValue(product.quantity_entry_mode),
    category: toCategoryValue(product.category),
    unitPrice: String(product.unit_price),
    isActive: product.is_active
  };
}

export function useProductsManagement() {
  const [filters, setFilters] = useState<ProductFilterState>({
    page: 1,
    pageSize: 10
  });
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [total, setTotal] = useState(0);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [sessionRole, setSessionRole] = useState<"admin" | "supervisor" | "driver" | "cashier" | null>(null);
  const [isUserActive, setIsUserActive] = useState(false);

  const [searchInput, setSearchInput] = useState("");
  const [formState, setFormState] = useState<ProductFormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [togglingProductId, setTogglingProductId] = useState<string | null>(null);

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
      setIsUserActive(session.user.isActive);
    } catch {
      setSessionRole(null);
      setIsUserActive(false);
    }
  }, []);

  const loadProducts = useCallback(async (nextFilters: ProductFilterState, isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError(null);

    try {
      const list = await fetchProducts(nextFilters);
      setProducts(list.items);
      setTotal(list.total);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to load products.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  useEffect(() => {
    void loadProducts(filters);
  }, [filters, loadProducts]);

  const canManageProducts = useMemo(() => {
    if (!isUserActive) return false;
    return sessionRole === "admin" || sessionRole === "supervisor";
  }, [isUserActive, sessionRole]);

  const setCategory = useCallback((category: ProductCategory | "") => {
    setFilters((previous) => ({
      ...previous,
      page: 1,
      category: category || undefined
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
    setFilters({
      page: 1,
      pageSize: filters.pageSize
    });
  }, [filters.pageSize]);

  const openCreate = useCallback(() => {
    setFormError(null);
    setSuccessMessage(null);
    setFormState({
      mode: "create",
      values: DEFAULT_FORM_VALUES
    });
  }, []);

  const openEdit = useCallback((product: ProductListItem) => {
    setFormError(null);
    setSuccessMessage(null);
    setFormState({
      mode: "edit",
      productId: product.id,
      legacyProductName: product.product_name,
      values: toFormValues(product)
    });
  }, []);

  const closeForm = useCallback(() => {
    setFormError(null);
    setFormState(null);
  }, []);

  const updateFormValues = useCallback((nextValues: ProductFormValues) => {
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
    void loadProducts(filters, true);
  }, [filters, loadProducts]);

  const submitForm = useCallback(async () => {
    if (!formState) return;

    setFormSubmitting(true);
    setFormError(null);
    setSuccessMessage(null);

    try {
      if (formState.mode === "create") {
        await createProduct(formState.values);
        setSuccessMessage("Product created successfully.");
      } else if (formState.productId) {
        await updateProduct(formState.productId, formState.values);
        setSuccessMessage("Product updated successfully.");
      }

      setFormState(null);
      await loadProducts(filters, true);
    } catch (requestError) {
      setFormError(requestError instanceof Error ? requestError.message : "Failed to save product.");
    } finally {
      setFormSubmitting(false);
    }
  }, [filters, formState, loadProducts]);

  const toggleProductStatus = useCallback(async (product: ProductListItem) => {
    setTogglingProductId(product.id);
    setError(null);
    setSuccessMessage(null);

    try {
      await setProductActiveState(product.id, !product.is_active);
      setSuccessMessage(product.is_active ? "Product deactivated successfully." : "Product activated successfully.");
      await loadProducts(filters, true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to update product status.");
    } finally {
      setTogglingProductId(null);
    }
  }, [filters, loadProducts]);

  return {
    filters,
    products,
    total,
    loading,
    refreshing,
    error,
    successMessage,
    searchInput,
    formState,
    formError,
    formSubmitting,
    togglingProductId,
    canManageProducts,
    setSearchInput,
    setCategory,
    setStatus,
    clearFilters,
    setPage,
    setPageSize,
    reload,
    openCreate,
    openEdit,
    closeForm,
    updateFormValues,
    submitForm,
    toggleProductStatus
  };
}
