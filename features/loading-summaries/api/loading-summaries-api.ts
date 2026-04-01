import type {
  AuthSession,
  LoadingSummaryFilterState,
  LoadingSummaryFormValues,
  LoadingSummaryItem,
  LoadingSummaryItemBatchSaveInput,
  LoadingSummaryListItem,
  LoadingSummaryListResponse,
  ProductOption,
  RouteProgramFilterOption
} from "@/features/loading-summaries/types";

type ApiEnvelope<T> = {
  data: T;
};

type ApiErrorEnvelope = {
  error: {
    message?: string;
  };
};

type RouteProgramsApiResponse = {
  items: Array<{
    id: string;
    route_name: string;
    territory_name: string;
  }>;
};

type ProductsApiResponse = {
  items: Array<{
    id: string;
    product_code: string;
    product_name: string;
    display_name?: string | null;
    unit_price: number;
    unit_size?: number | null;
    unit_measure?: string | null;
    pack_size?: number | null;
    selling_unit?: string | null;
    quantity_entry_mode?: "pack" | "unit" | null;
    is_active: boolean;
  }>;
};

function toErrorMessage(payload: unknown, fallback: string) {
  const maybePayload = payload as ApiErrorEnvelope | null;
  return maybePayload?.error?.message ?? fallback;
}

async function readEnvelope<T>(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => null)) as ApiEnvelope<T> | ApiErrorEnvelope | null;

  if (!response.ok) {
    throw new Error(toErrorMessage(payload, fallback));
  }

  if (!payload || !("data" in payload)) {
    throw new Error("Invalid API response.");
  }

  return payload.data;
}

function buildLoadingSummariesQuery(filters: LoadingSummaryFilterState) {
  const params = new URLSearchParams();

  params.set("page", String(filters.page));
  params.set("pageSize", String(filters.pageSize));
  params.set("sortKey", "reportDate");
  params.set("sortDirection", "desc");

  if (filters.dateFrom) {
    params.set("dateFrom", filters.dateFrom);
  }
  if (filters.dateTo) {
    params.set("dateTo", filters.dateTo);
  }
  if (filters.routeProgramId) {
    params.set("routeProgramId", filters.routeProgramId);
  }
  if (filters.status) {
    params.set("status", filters.status);
  }
  if (filters.search?.trim()) {
    params.set("search", filters.search.trim());
  }

  return params.toString();
}

type LoadingSummaryCreatePayload = {
  reportDate: string;
  routeProgramId: string;
  staffName: string;
  remarks?: string;
  loadingNotes?: string;
};

type LoadingSummaryUpdatePayload = {
  reportDate?: string;
  staffName?: string;
  remarks?: string;
  loadingNotes?: string;
};

function toCreatePayload(values: LoadingSummaryFormValues): LoadingSummaryCreatePayload {
  return {
    reportDate: values.reportDate,
    routeProgramId: values.routeProgramId,
    staffName: values.staffName.trim(),
    remarks: values.remarks.trim() || undefined,
    loadingNotes: values.loadingNotes.trim() || undefined
  };
}

export async function fetchAuthSession() {
  const response = await fetch("/api/auth/me", {
    method: "GET",
    credentials: "include",
    cache: "no-store"
  });

  return readEnvelope<AuthSession>(response, "Failed to load current session.");
}

export async function fetchLoadingSummaries(filters: LoadingSummaryFilterState) {
  const query = buildLoadingSummariesQuery(filters);
  const response = await fetch(`/api/loading-summaries?${query}`, {
    method: "GET",
    credentials: "include",
    cache: "no-store"
  });

  return readEnvelope<LoadingSummaryListResponse>(response, "Failed to load loading summaries.");
}

export async function fetchLoadingSummaryDetail(summaryId: string) {
  const response = await fetch(`/api/loading-summaries/${summaryId}`, {
    method: "GET",
    credentials: "include",
    cache: "no-store"
  });

  return readEnvelope<LoadingSummaryListItem>(response, "Failed to load loading summary.");
}

export async function fetchLoadingSummaryItems(summaryId: string) {
  const response = await fetch(`/api/loading-summaries/${summaryId}/items`, {
    method: "GET",
    credentials: "include",
    cache: "no-store"
  });

  const data = await readEnvelope<{ items: LoadingSummaryItem[] }>(response, "Failed to load loading line items.");
  return data.items;
}

export async function saveLoadingSummaryItems(summaryId: string, items: LoadingSummaryItemBatchSaveInput[]) {
  const response = await fetch(`/api/loading-summaries/${summaryId}/items`, {
    method: "PUT",
    credentials: "include",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      items: items.map((item) => ({
        id: item.id,
        productId: item.productId,
        loadingQty: item.loadingQty,
        salesQty: item.salesQty,
        lorryQty: item.lorryQty
      }))
    })
  });

  const data = await readEnvelope<{ items: LoadingSummaryItem[] }>(response, "Failed to save loading line items.");
  return data.items;
}

export async function createLoadingSummary(values: LoadingSummaryFormValues) {
  const payload = toCreatePayload(values);
  const response = await fetch("/api/loading-summaries", {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return readEnvelope<LoadingSummaryListItem>(response, "Failed to create loading summary.");
}

export async function updateLoadingSummary(summaryId: string, payload: LoadingSummaryUpdatePayload) {
  const response = await fetch(`/api/loading-summaries/${summaryId}`, {
    method: "PATCH",
    credentials: "include",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return readEnvelope<LoadingSummaryListItem>(response, "Failed to save loading summary.");
}

export async function finalizeLoadingSummary(summaryId: string, loadingNotes?: string) {
  const response = await fetch(`/api/loading-summaries/${summaryId}/finalize`, {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ loadingNotes })
  });

  return readEnvelope<LoadingSummaryListItem>(response, "Failed to finalize loading summary.");
}

export async function fetchRouteFilterOptions() {
  const response = await fetch("/api/route-programs?page=1&pageSize=100&isActive=true", {
    method: "GET",
    credentials: "include",
    cache: "no-store"
  });

  const data = await readEnvelope<RouteProgramsApiResponse>(response, "Failed to load route options.");

  const options: RouteProgramFilterOption[] = data.items.map((item) => ({
    id: item.id,
    routeName: item.route_name,
    territoryName: item.territory_name
  }));

  return options;
}

export async function fetchProductOptions() {
  const response = await fetch("/api/products?page=1&pageSize=100&isActive=true", {
    method: "GET",
    credentials: "include",
    cache: "no-store"
  });

  const data = await readEnvelope<ProductsApiResponse>(response, "Failed to load product options.");

  const options: ProductOption[] = data.items.map((item) => ({
    id: item.id,
    productCode: item.product_code,
    productName: item.display_name ?? item.product_name,
    unitPrice: item.unit_price,
    unitSize: item.unit_size ?? null,
    unitMeasure: item.unit_measure ?? null,
    packSize: item.pack_size ?? null,
    sellingUnit: item.selling_unit ?? null,
    quantityEntryMode: item.quantity_entry_mode === "unit" ? "unit" : "pack",
    isActive: item.is_active
  }));

  return options;
}










