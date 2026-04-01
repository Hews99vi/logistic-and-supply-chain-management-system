export type DashboardFiltersDto = {
  dateFrom?: string;
  dateTo?: string;
  routeProgramId?: string;
  top?: number;
};

export type DashboardOverviewDto = {
  totalSales: number;
  totalExpenses: number;
  totalNetProfit: number;
  reportCountByStatus: Array<{
    status: "draft" | "submitted" | "approved" | "rejected";
    reportCount: number;
  }>;
  paymentModeTotals: {
    totalCash: number;
    totalCheques: number;
    totalCredit: number;
  };
};

export type DashboardSalesByRouteDto = {
  routeProgramId: string;
  routeName: string;
  territoryName: string;
  reportCount: number;
  totalSales: number;
  totalCash: number;
  totalExpenses: number;
  totalNetProfit: number;
};

export type DashboardTopProductSalesDto = {
  productId: string;
  productCode: string;
  productName: string;
  totalSalesQty: number;
  totalBalanceQty: number;
  totalVarianceQty: number;
};

export type DashboardMostReturnedProductDto = {
  productId: string;
  productCode: string;
  productName: string;
  totalReturnQty: number;
  totalDamageQty: number;
  totalFreeIssueQty: number;
  totalAffectedQty: number;
  totalValue: number;
};

export type DashboardDailyTrendDto = {
  reportDate: string;
  reportCount: number;
  totalSales: number;
  totalExpenses: number;
  totalNetProfit: number;
  totalCash: number;
  totalCheques: number;
  totalCredit: number;
};

export type DashboardRoutePerformanceDto = {
  routeProgramId: string;
  routeName: string;
  territoryName: string;
  reportCount: number;
  totalSales: number;
  totalExpenses: number;
  totalNetProfit: number;
  averageSalesPerReport: number;
  averageExpensePerReport: number;
  averageNetProfitPerReport: number;
  totalCashDifference: number;
};