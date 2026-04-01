import { requireAuth } from "@/lib/auth/helpers";
import { errorResponse, successResponse } from "@/lib/db/response";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dashboardReportQuerySchema } from "@/lib/validation/dashboard";
import type {
  DashboardDailyTrendDto,
  DashboardMostReturnedProductDto,
  DashboardOverviewDto,
  DashboardRoutePerformanceDto,
  DashboardSalesByRouteDto,
  DashboardTopProductSalesDto
} from "@/types/domain/dashboard";

type DashboardRpcFilters = {
  date_from: string | null;
  date_to: string | null;
  target_route_program_id: string | null;
};

type DashboardScalarRow = number | null;

type DashboardStatusRow = {
  status: "draft" | "submitted" | "approved" | "rejected";
  report_count: number;
};

type DashboardPaymentRow = {
  total_cash: number;
  total_cheques: number;
  total_credit: number;
};

type DashboardSalesByRouteRow = {
  route_program_id: string;
  route_name: string;
  territory_name: string;
  report_count: number;
  total_sales: number;
  total_cash: number;
  total_expenses: number;
  total_net_profit: number;
};

type DashboardTopProductRow = {
  product_id: string;
  product_code: string;
  product_name: string;
  total_sales_qty: number;
  total_balance_qty: number;
  total_variance_qty: number;
};

type DashboardMostReturnedRow = {
  product_id: string;
  product_code: string;
  product_name: string;
  total_return_qty: number;
  total_damage_qty: number;
  total_free_issue_qty: number;
  total_affected_qty: number;
  total_value: number;
};

type DashboardDailyTrendRow = {
  report_date: string;
  report_count: number;
  total_sales: number;
  total_expenses: number;
  total_net_profit: number;
  total_cash: number;
  total_cheques: number;
  total_credit: number;
};

type DashboardRoutePerformanceRow = {
  route_program_id: string;
  route_name: string;
  territory_name: string;
  report_count: number;
  total_sales: number;
  total_expenses: number;
  total_net_profit: number;
  average_sales_per_report: number;
  average_expense_per_report: number;
  average_net_profit_per_report: number;
  total_cash_difference: number;
};

async function parseDashboardFilters(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = dashboardReportQuerySchema.safeParse(Object.fromEntries(searchParams.entries()));

  if (!parsed.success) {
    return {
      data: null,
      response: errorResponse(422, "VALIDATION_ERROR", "Invalid dashboard query parameters.", parsed.error.flatten())
    };
  }

  return {
    data: parsed.data,
    response: null
  };
}

function toRpcFilters(filters: { dateFrom?: string; dateTo?: string; routeProgramId?: string }): DashboardRpcFilters {
  return {
    date_from: filters.dateFrom ?? null,
    date_to: filters.dateTo ?? null,
    target_route_program_id: filters.routeProgramId ?? null
  };
}

async function runRpc<T>(name: string, params: Record<string, unknown>) {
  const supabase = await createSupabaseServerClient();
  return (supabase as never as {
    rpc: (fn: string, fnParams: Record<string, unknown>) => Promise<{
      data: T;
      error: { message: string; code?: string | null; details?: string | null } | null;
    }>;
  }).rpc(name, params);
}

function mapSalesByRoute(rows: DashboardSalesByRouteRow[] | null): DashboardSalesByRouteDto[] {
  return (rows ?? []).map((row) => ({
    routeProgramId: row.route_program_id,
    routeName: row.route_name,
    territoryName: row.territory_name,
    reportCount: row.report_count,
    totalSales: row.total_sales,
    totalCash: row.total_cash,
    totalExpenses: row.total_expenses,
    totalNetProfit: row.total_net_profit
  }));
}

function mapTopProducts(rows: DashboardTopProductRow[] | null): DashboardTopProductSalesDto[] {
  return (rows ?? []).map((row) => ({
    productId: row.product_id,
    productCode: row.product_code,
    productName: row.product_name,
    totalSalesQty: row.total_sales_qty,
    totalBalanceQty: row.total_balance_qty,
    totalVarianceQty: row.total_variance_qty
  }));
}

function mapMostReturned(rows: DashboardMostReturnedRow[] | null): DashboardMostReturnedProductDto[] {
  return (rows ?? []).map((row) => ({
    productId: row.product_id,
    productCode: row.product_code,
    productName: row.product_name,
    totalReturnQty: row.total_return_qty,
    totalDamageQty: row.total_damage_qty,
    totalFreeIssueQty: row.total_free_issue_qty,
    totalAffectedQty: row.total_affected_qty,
    totalValue: row.total_value
  }));
}

function mapDailyTrend(rows: DashboardDailyTrendRow[] | null): DashboardDailyTrendDto[] {
  return (rows ?? []).map((row) => ({
    reportDate: row.report_date,
    reportCount: row.report_count,
    totalSales: row.total_sales,
    totalExpenses: row.total_expenses,
    totalNetProfit: row.total_net_profit,
    totalCash: row.total_cash,
    totalCheques: row.total_cheques,
    totalCredit: row.total_credit
  }));
}

function mapRoutePerformance(rows: DashboardRoutePerformanceRow[] | null): DashboardRoutePerformanceDto[] {
  return (rows ?? []).map((row) => ({
    routeProgramId: row.route_program_id,
    routeName: row.route_name,
    territoryName: row.territory_name,
    reportCount: row.report_count,
    totalSales: row.total_sales,
    totalExpenses: row.total_expenses,
    totalNetProfit: row.total_net_profit,
    averageSalesPerReport: row.average_sales_per_report,
    averageExpensePerReport: row.average_expense_per_report,
    averageNetProfitPerReport: row.average_net_profit_per_report,
    totalCashDifference: row.total_cash_difference
  }));
}

export class DashboardReportService {
  static async getOverview(request: Request) {
    const auth = await requireAuth();
    if (auth.response) {
      return auth.response;
    }

    const filtersResult = await parseDashboardFilters(request);
    if (filtersResult.response || !filtersResult.data) {
      return filtersResult.response;
    }

    const filters = toRpcFilters(filtersResult.data);

    const [
      totalSalesResult,
      totalExpensesResult,
      totalNetProfitResult,
      reportCountByStatusResult,
      paymentModeTotalsResult
    ] = await Promise.all([
      runRpc<DashboardScalarRow>("dashboard_total_sales", filters),
      runRpc<DashboardScalarRow>("dashboard_total_expenses", filters),
      runRpc<DashboardScalarRow>("dashboard_net_profit", filters),
      runRpc<DashboardStatusRow[] | null>("dashboard_report_count_by_status", filters),
      runRpc<DashboardPaymentRow[] | null>("dashboard_payment_mode_totals", filters)
    ]);

    const errors = [
      totalSalesResult.error,
      totalExpensesResult.error,
      totalNetProfitResult.error,
      reportCountByStatusResult.error,
      paymentModeTotalsResult.error
    ].filter(Boolean);

    if (errors.length > 0) {
      return errorResponse(400, errors[0]!.code ?? "DASHBOARD_QUERY_FAILED", errors[0]!.message, errors[0]!.details);
    }

    const overview: DashboardOverviewDto = {
      totalSales: totalSalesResult.data ?? 0,
      totalExpenses: totalExpensesResult.data ?? 0,
      totalNetProfit: totalNetProfitResult.data ?? 0,
      reportCountByStatus: (reportCountByStatusResult.data ?? []).map((row) => ({
        status: row.status,
        reportCount: row.report_count
      })),
      paymentModeTotals: {
        totalCash: paymentModeTotalsResult.data?.[0]?.total_cash ?? 0,
        totalCheques: paymentModeTotalsResult.data?.[0]?.total_cheques ?? 0,
        totalCredit: paymentModeTotalsResult.data?.[0]?.total_credit ?? 0
      }
    };

    return successResponse(overview);
  }

  static async getSalesByRoute(request: Request) {
    const auth = await requireAuth();
    if (auth.response) {
      return auth.response;
    }

    const filtersResult = await parseDashboardFilters(request);
    if (filtersResult.response || !filtersResult.data) {
      return filtersResult.response;
    }

    const result = await runRpc<DashboardSalesByRouteRow[] | null>(
      "dashboard_sales_by_route",
      toRpcFilters(filtersResult.data)
    );

    if (result.error) {
      return errorResponse(400, result.error.code ?? "DASHBOARD_QUERY_FAILED", result.error.message, result.error.details);
    }

    return successResponse({ items: mapSalesByRoute(result.data) });
  }

  static async getTopProductsBySales(request: Request) {
    const auth = await requireAuth();
    if (auth.response) {
      return auth.response;
    }

    const filtersResult = await parseDashboardFilters(request);
    if (filtersResult.response || !filtersResult.data) {
      return filtersResult.response;
    }

    const result = await runRpc<DashboardTopProductRow[] | null>(
      "dashboard_top_products_by_sales_quantity",
      {
        ...toRpcFilters(filtersResult.data),
        top_n: filtersResult.data.top
      }
    );

    if (result.error) {
      return errorResponse(400, result.error.code ?? "DASHBOARD_QUERY_FAILED", result.error.message, result.error.details);
    }

    return successResponse({ items: mapTopProducts(result.data) });
  }

  static async getMostReturnedProducts(request: Request) {
    const auth = await requireAuth();
    if (auth.response) {
      return auth.response;
    }

    const filtersResult = await parseDashboardFilters(request);
    if (filtersResult.response || !filtersResult.data) {
      return filtersResult.response;
    }

    const result = await runRpc<DashboardMostReturnedRow[] | null>(
      "dashboard_most_returned_products",
      {
        ...toRpcFilters(filtersResult.data),
        top_n: filtersResult.data.top
      }
    );

    if (result.error) {
      return errorResponse(400, result.error.code ?? "DASHBOARD_QUERY_FAILED", result.error.message, result.error.details);
    }

    return successResponse({ items: mapMostReturned(result.data) });
  }

  static async getDailyTrendSummary(request: Request) {
    const auth = await requireAuth();
    if (auth.response) {
      return auth.response;
    }

    const filtersResult = await parseDashboardFilters(request);
    if (filtersResult.response || !filtersResult.data) {
      return filtersResult.response;
    }

    const result = await runRpc<DashboardDailyTrendRow[] | null>(
      "dashboard_daily_trend_summary",
      toRpcFilters(filtersResult.data)
    );

    if (result.error) {
      return errorResponse(400, result.error.code ?? "DASHBOARD_QUERY_FAILED", result.error.message, result.error.details);
    }

    return successResponse({ items: mapDailyTrend(result.data) });
  }

  static async getRoutePerformanceSummary(request: Request) {
    const auth = await requireAuth();
    if (auth.response) {
      return auth.response;
    }

    const filtersResult = await parseDashboardFilters(request);
    if (filtersResult.response || !filtersResult.data) {
      return filtersResult.response;
    }

    const result = await runRpc<DashboardRoutePerformanceRow[] | null>(
      "dashboard_route_performance_summary",
      toRpcFilters(filtersResult.data)
    );

    if (result.error) {
      return errorResponse(400, result.error.code ?? "DASHBOARD_QUERY_FAILED", result.error.message, result.error.details);
    }

    return successResponse({ items: mapRoutePerformance(result.data) });
  }
}