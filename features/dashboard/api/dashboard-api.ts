import type {
  DashboardDailyTrendDto,
  DashboardMostReturnedProductDto,
  DashboardOverviewDto,
  DashboardRoutePerformanceDto,
  DashboardSalesByRouteDto,
  DashboardTopProductSalesDto
} from "@/types/domain/dashboard";

import type {
  ApiEnvelope,
  ApiErrorEnvelope,
  AuthSession,
  DashboardDataBundle,
  DashboardFilters,
  RouteProgramListResponse
} from "@/features/dashboard/types";

function toQueryString(filters: DashboardFilters) {
  const params = new URLSearchParams();

  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.routeProgramId) params.set("routeProgramId", filters.routeProgramId);
  if (filters.top) params.set("top", String(filters.top));

  return params.toString();
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as T | ApiErrorEnvelope | null;

  if (!response.ok) {
    const message = (payload as ApiErrorEnvelope | null)?.error?.message ?? "Request failed.";
    throw new Error(message);
  }

  if (!payload) {
    throw new Error("Empty response payload.");
  }

  return payload as T;
}

async function fetchEnvelope<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
    cache: "no-store"
  });

  const payload = await readJson<ApiEnvelope<T>>(response);
  return payload.data;
}

export async function fetchAuthSession() {
  return fetchEnvelope<AuthSession>("/api/auth/me");
}

export async function fetchRouteProgramsTotal() {
  const data = await fetchEnvelope<RouteProgramListResponse>("/api/route-programs?page=1&pageSize=1&isActive=true");
  return data.total;
}

export async function fetchDashboardBundle(filters: DashboardFilters): Promise<DashboardDataBundle> {
  const query = toQueryString(filters);
  const suffix = query.length > 0 ? `?${query}` : "";

  const [overview, salesByRoute, topProducts, mostReturnedProducts, dailyTrend, routePerformance, routeProgramTotal] = await Promise.all([
    fetchEnvelope<DashboardOverviewDto>(`/api/dashboard${suffix}`),
    fetchEnvelope<{ items: DashboardSalesByRouteDto[] }>(`/api/dashboard/sales-by-route${suffix}`).then((d) => d.items),
    fetchEnvelope<{ items: DashboardTopProductSalesDto[] }>(`/api/dashboard/top-products${suffix}`).then((d) => d.items),
    fetchEnvelope<{ items: DashboardMostReturnedProductDto[] }>(`/api/dashboard/most-returned-products${suffix}`).then((d) => d.items),
    fetchEnvelope<{ items: DashboardDailyTrendDto[] }>(`/api/dashboard/daily-trend${suffix}`).then((d) => d.items),
    fetchEnvelope<{ items: DashboardRoutePerformanceDto[] }>(`/api/dashboard/route-performance${suffix}`).then((d) => d.items),
    fetchRouteProgramsTotal()
  ]);

  return {
    overview,
    salesByRoute,
    topProducts,
    mostReturnedProducts,
    dailyTrend,
    routePerformance,
    routeProgramTotal
  };
}
