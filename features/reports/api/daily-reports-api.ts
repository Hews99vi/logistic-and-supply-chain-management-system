import type { DashboardDailyTrendDto } from "@/types/domain/dashboard";
import type {
  DailyReportAttachmentDto,
  DailyReportAuditEventDto,
  DailyReportBaseDto,
  DailyReportCashDenominationDto,
  DailyReportExpenseEntryDto,
  DailyReportInventoryEntryDto,
  DailyReportInvoiceEntryDto,
  DailyReportReturnDamageEntryDto,
  DailyReportSummaryCardsDto
} from "@/types/domain/report";

import type {
  ApiEnvelope,
  ApiErrorEnvelope,
  AuthSession,
  DailyReportCreateInput,
  DailyReportDraftUpdateInput,
  ExpenseCategoryOption,
  ProductOption,
  ReportExpenseBatchSaveItemInput,
  ReportInventoryBatchSaveItemInput,
  ReportInvoiceBatchSaveItemInput,
  ReportReturnDamageBatchSaveItemInput,
  ReportsFilterState,
  ReportsListResponse,
  RouteProgramFilterOption,
  WorkflowActionResult
} from "@/features/reports/types";

type RouteProgramsApiResponse = {
  items: Array<{
    id: string;
    route_name: string;
    territory_name: string;
  }>;
};

type ExpenseCategoriesApiResponse = {
  items: Array<{
    id: string;
    category_name: string;
    is_system: boolean;
    is_active: boolean;
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

function buildReportQuery(filters: ReportsFilterState, includeSearch = false) {
  const params = new URLSearchParams();

  params.set("page", String(filters.page));
  params.set("pageSize", String(filters.pageSize));
  params.set("sortKey", filters.sortKey);
  params.set("sortDirection", filters.sortDirection);

  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.status) params.set("status", filters.status);
  if (filters.routeProgramId) params.set("routeProgramId", filters.routeProgramId);
  if (filters.createdBy) params.set("createdBy", filters.createdBy);
  if (includeSearch && filters.search?.trim()) params.set("search", filters.search.trim());

  return params.toString();
}

async function postWorkflow<T>(url: string, body?: unknown) {
  const response = await fetch(url, {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json"
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  return readEnvelope<T>(response, "Workflow action failed.");
}

export async function fetchAuthSession() {
  const response = await fetch("/api/auth/me", {
    method: "GET",
    credentials: "include",
    cache: "no-store"
  });

  return readEnvelope<AuthSession>(response, "Failed to load current session.");
}

export async function createDailyReport(payload: DailyReportCreateInput) {
  const response = await fetch("/api/reports", {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return readEnvelope<DailyReportBaseDto>(response, "Failed to create daily report.");
}

export async function fetchReportsList(filters: ReportsFilterState) {
  const query = buildReportQuery(filters, true);
  const response = await fetch(`/api/reports?${query}`, {
    method: "GET",
    credentials: "include",
    cache: "no-store"
  });

  return readEnvelope<ReportsListResponse>(response, "Failed to load daily reports.");
}

export async function fetchReportsSummary(filters: ReportsFilterState) {
  const query = buildReportQuery(filters, false);
  const response = await fetch(`/api/reports/summary?${query}`, {
    method: "GET",
    credentials: "include",
    cache: "no-store"
  });

  return readEnvelope<DailyReportSummaryCardsDto>(response, "Failed to load report summary.");
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

export async function fetchExpenseCategoryOptions() {
  const response = await fetch("/api/expense-categories?page=1&pageSize=100&isActive=true", {
    method: "GET",
    credentials: "include",
    cache: "no-store"
  });

  const data = await readEnvelope<ExpenseCategoriesApiResponse>(response, "Failed to load expense categories.");

  const options: ExpenseCategoryOption[] = data.items.map((item) => ({
    id: item.id,
    categoryName: item.category_name,
    isSystem: item.is_system,
    isActive: item.is_active
  }));

  return options;
}

export async function fetchProductOptions() {
  const response = await fetch("/api/products?page=1&pageSize=100&isActive=true", {
    method: "GET",
    credentials: "include",
    cache: "no-store"
  });

  const data = await readEnvelope<ProductsApiResponse>(response, "Failed to load products.");

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

export async function fetchReportDetail(reportId: string) {
  const response = await fetch(`/api/reports/${reportId}`, {
    method: "GET",
    credentials: "include",
    cache: "no-store"
  });

  return readEnvelope(response, "Failed to load report details.");
}

export async function updateReportDraft(reportId: string, payload: DailyReportDraftUpdateInput) {
  const response = await fetch(`/api/reports/${reportId}`, {
    method: "PATCH",
    credentials: "include",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return readEnvelope(response, "Failed to save draft report.");
}

export async function fetchReportInvoiceEntries(reportId: string) {
  const response = await fetch(`/api/reports/${reportId}/invoice-entries`, {
    method: "GET",
    credentials: "include",
    cache: "no-store"
  });

  const data = await readEnvelope<{ items: DailyReportInvoiceEntryDto[] }>(
    response,
    "Failed to load invoice entries."
  );

  return data.items;
}

export async function saveReportInvoiceEntries(reportId: string, items: ReportInvoiceBatchSaveItemInput[]) {
  const response = await fetch(`/api/reports/${reportId}/invoice-entries`, {
    method: "PUT",
    credentials: "include",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ items })
  });

  const data = await readEnvelope<{ items: DailyReportInvoiceEntryDto[] }>(
    response,
    "Failed to save invoice entries."
  );

  return data.items;
}

export async function fetchReportExpenseEntries(reportId: string) {
  const response = await fetch(`/api/reports/${reportId}/expense-entries`, {
    method: "GET",
    credentials: "include",
    cache: "no-store"
  });

  const data = await readEnvelope<{ items: DailyReportExpenseEntryDto[] }>(
    response,
    "Failed to load expense entries."
  );

  return data.items;
}

export async function saveReportExpenseEntries(reportId: string, items: ReportExpenseBatchSaveItemInput[]) {
  const response = await fetch(`/api/reports/${reportId}/expense-entries`, {
    method: "PUT",
    credentials: "include",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ items })
  });

  const data = await readEnvelope<{ items: DailyReportExpenseEntryDto[] }>(
    response,
    "Failed to save expense entries."
  );

  return data.items;
}

export async function fetchReportInventoryEntries(reportId: string) {
  const response = await fetch(`/api/reports/${reportId}/inventory-entries`, {
    method: "GET",
    credentials: "include",
    cache: "no-store"
  });

  const data = await readEnvelope<{ items: DailyReportInventoryEntryDto[] }>(
    response,
    "Failed to load inventory entries."
  );

  return data.items;
}

export async function saveReportInventoryEntries(reportId: string, items: ReportInventoryBatchSaveItemInput[]) {
  const response = await fetch(`/api/reports/${reportId}/inventory-entries`, {
    method: "PUT",
    credentials: "include",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ items })
  });

  const data = await readEnvelope<{ items: DailyReportInventoryEntryDto[] }>(
    response,
    "Failed to save inventory entries."
  );

  return data.items;
}

export async function fetchReportReturnDamageEntries(reportId: string) {
  const response = await fetch(`/api/reports/${reportId}/return-damage-entries`, {
    method: "GET",
    credentials: "include",
    cache: "no-store"
  });

  const data = await readEnvelope<{ items: DailyReportReturnDamageEntryDto[] }>(
    response,
    "Failed to load return and damage entries."
  );

  return data.items;
}

export async function saveReportReturnDamageEntries(reportId: string, items: ReportReturnDamageBatchSaveItemInput[]) {
  const response = await fetch(`/api/reports/${reportId}/return-damage-entries`, {
    method: "PUT",
    credentials: "include",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ items })
  });

  const data = await readEnvelope<{ items: DailyReportReturnDamageEntryDto[] }>(
    response,
    "Failed to save return and damage entries."
  );

  return data.items;
}


export async function fetchReportAttachments(reportId: string) {
  const response = await fetch(`/api/reports/${reportId}/attachments`, {
    method: "GET",
    credentials: "include",
    cache: "no-store"
  });

  const data = await readEnvelope<{ items: DailyReportAttachmentDto[] }>(
    response,
    "Failed to load attachments."
  );

  return data.items;
}

export async function uploadReportAttachment(
  reportId: string,
  file: File,
  onProgress?: (percent: number) => void
) {
  const formData = new FormData();
  formData.append("file", file);

  const responseData = await new Promise<ApiEnvelope<DailyReportAttachmentDto>>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/reports/${reportId}/attachments`);
    xhr.withCredentials = true;

    xhr.upload.onprogress = (event) => {
      if (!onProgress || !event.lengthComputable) return;
      const percent = Math.min(100, Math.round((event.loaded / event.total) * 100));
      onProgress(percent);
    };

    xhr.onerror = () => {
      reject(new Error("Failed to upload attachment."));
    };

    xhr.onload = () => {
      let payload: ApiEnvelope<DailyReportAttachmentDto> | ApiErrorEnvelope | null = null;
      try {
        payload = JSON.parse(xhr.responseText) as ApiEnvelope<DailyReportAttachmentDto> | ApiErrorEnvelope;
      } catch {
        reject(new Error("Invalid API response."));
        return;
      }

      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(toErrorMessage(payload, "Failed to upload attachment.")));
        return;
      }

      if (!payload || !("data" in payload)) {
        reject(new Error("Invalid API response."));
        return;
      }

      resolve(payload);
    };

    xhr.send(formData);
  });

  return responseData.data;
}

export async function deleteReportAttachment(reportId: string, filePath: string) {
  const response = await fetch(`/api/reports/${reportId}/attachments`, {
    method: "DELETE",
    credentials: "include",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ filePath })
  });

  return readEnvelope<{ filePath: string; deleted: boolean }>(
    response,
    "Failed to delete attachment."
  );
}

export async function fetchReportAuditTrail(reportId: string) {
  const response = await fetch(`/api/reports/${reportId}/audit-trail`, {
    method: "GET",
    credentials: "include",
    cache: "no-store"
  });

  const data = await readEnvelope<{ items: DailyReportAuditEventDto[] }>(
    response,
    "Failed to load audit trail."
  );

  return data.items;
}
export async function fetchReportCashDenominations(reportId: string) {
  const response = await fetch(`/api/reports/${reportId}/cash-denominations`, {
    method: "GET",
    credentials: "include",
    cache: "no-store"
  });

  const data = await readEnvelope<{ items: DailyReportCashDenominationDto[] }>(
    response,
    "Failed to load cash denominations."
  );

  return data.items;
}

export async function saveReportCashDenominations(
  reportId: string,
  payload: Array<{ denominationValue: number; noteCount: number }>
) {
  const response = await fetch(`/api/reports/${reportId}/cash-denominations`, {
    method: "PUT",
    credentials: "include",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ items: payload })
  });

  const data = await readEnvelope<{ items: DailyReportCashDenominationDto[] }>(
    response,
    "Failed to save cash denominations."
  );

  return data.items;
}

export async function fetchReportDailyTrend(reportDate: string, routeProgramId: string) {
  const dateTo = new Date(reportDate);
  const dateFrom = new Date(dateTo);
  dateFrom.setDate(dateTo.getDate() - 6);

  const params = new URLSearchParams({
    dateFrom: dateFrom.toISOString().slice(0, 10),
    dateTo: dateTo.toISOString().slice(0, 10),
    routeProgramId
  });

  const response = await fetch(`/api/dashboard/daily-trend?${params.toString()}`, {
    method: "GET",
    credentials: "include",
    cache: "no-store"
  });

  const data = await readEnvelope<{ items: DashboardDailyTrendDto[] }>(response, "Failed to load 7-day trend.");
  return data.items;
}

export async function submitReport(reportId: string) {
  return postWorkflow<WorkflowActionResult>(`/api/reports/${reportId}/submit`);
}

export async function approveReport(reportId: string) {
  return postWorkflow<WorkflowActionResult>(`/api/reports/${reportId}/approve`);
}

export async function rejectReport(reportId: string, reason: string) {
  return postWorkflow<WorkflowActionResult>(`/api/reports/${reportId}/reject`, { reason });
}

export async function reopenReport(reportId: string) {
  return postWorkflow<WorkflowActionResult>(`/api/reports/${reportId}/reopen`);
}















