import type {
  DashboardDailyTrendDto,
  DashboardMostReturnedProductDto,
  DashboardOverviewDto,
  DashboardRoutePerformanceDto,
  DashboardSalesByRouteDto,
  DashboardTopProductSalesDto
} from "@/types/domain/dashboard";

export type DashboardFilters = {
  dateFrom?: string;
  dateTo?: string;
  routeProgramId?: string;
  top?: number;
};

export type ApiEnvelope<T> = {
  data: T;
};

export type ApiErrorEnvelope = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export type RouteProgramListItem = {
  id: string;
  territory_name: string;
  route_name: string;
  is_active: boolean;
};

export type RouteProgramListResponse = {
  items: RouteProgramListItem[];
  page: number;
  pageSize: number;
  total: number;
};

export type AuthSession = {
  user: {
    id: string;
    email?: string;
    profileRole: "admin" | "supervisor" | "driver" | "cashier";
    isActive: boolean;
  };
};

export type DashboardDataBundle = {
  overview: DashboardOverviewDto;
  salesByRoute: DashboardSalesByRouteDto[];
  topProducts: DashboardTopProductSalesDto[];
  mostReturnedProducts: DashboardMostReturnedProductDto[];
  dailyTrend: DashboardDailyTrendDto[];
  routePerformance: DashboardRoutePerformanceDto[];
  routeProgramTotal: number;
};

export type ActivityItem = {
  id: string;
  routeOrDepot: string;
  activity: string;
  value: string;
  statusLabel: string;
  statusTone: "success" | "warning" | "danger" | "secondary";
  meta?: string;
};
