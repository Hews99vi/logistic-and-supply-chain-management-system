import type { DailyReportBaseDto, DailyReportDetailDto, DailyReportStatus, DailyReportSummaryCardsDto } from "@/types/domain/report";

export type ReportsSortKey =
  | "reportDate"
  | "routeNameSnapshot"
  | "territoryNameSnapshot"
  | "staffName"
  | "status"
  | "totalSale"
  | "netProfit"
  | "updatedAt";

export type ReportsSortDirection = "asc" | "desc";

export type ReportsFilterState = {
  dateFrom?: string;
  dateTo?: string;
  status?: DailyReportStatus;
  routeProgramId?: string;
  createdBy?: string;
  search?: string;
  page: number;
  pageSize: number;
  sortKey: ReportsSortKey;
  sortDirection: ReportsSortDirection;
};

export type ReportsListResponse = {
  items: DailyReportBaseDto[];
  page: number;
  pageSize: number;
  total: number;
};

export type RouteProgramFilterOption = {
  id: string;
  routeName: string;
  territoryName: string;
};

export type ReportPreparedByOption = {
  id: string;
  label: string;
};

export type ExpenseCategoryOption = {
  id: string;
  categoryName: string;
  isSystem: boolean;
  isActive: boolean;
};

export type ProductOption = {
  id: string;
  productCode: string;
  productName: string;
  unitPrice: number;
  unitSize: number | null;
  unitMeasure: string | null;
  packSize: number | null;
  sellingUnit: string | null;
  quantityEntryMode: "pack" | "unit";
  isActive: boolean;
};

export type ReportsPageData = {
  reports: ReportsListResponse;
  summary: DailyReportSummaryCardsDto;
  routeOptions: RouteProgramFilterOption[];
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

export type ReportDetailEnvelope = {
  report: DailyReportDetailDto["report"];
  invoiceEntries: DailyReportDetailDto["invoiceEntries"];
  expenseEntries: DailyReportDetailDto["expenseEntries"];
  cashDenominations: DailyReportDetailDto["cashDenominations"];
  inventoryEntries: DailyReportDetailDto["inventoryEntries"];
  returnDamageEntries: DailyReportDetailDto["returnDamageEntries"];
};

export type AuthSession = {
  user: {
    id: string;
    email?: string;
    profileRole: "admin" | "supervisor" | "driver" | "cashier";
    isActive: boolean;
  };
};

export type DailyReportCreateInput = {
  reportDate: string;
  routeProgramId: string;
  staffName: string;
  remarks?: string;
};

export type ReportInvoiceBatchSaveItemInput = {
  id?: string;
  invoiceNo: string;
  cashAmount: number;
  chequeAmount: number;
  creditAmount: number;
  notes?: string;
};

export type ReportExpenseBatchSaveItemInput = {
  id?: string;
  expenseCategoryId?: string | null;
  customExpenseName?: string;
  amount: number;
  notes?: string;
};

export type ReportInventoryBatchSaveItemInput = {
  id?: string;
  productId: string;
  loadingQty: number;
  salesQty: number;
  lorryQty: number;
};

export type ReportReturnDamageBatchSaveItemInput = {
  id?: string;
  productId: string;
  invoiceNo?: string;
  shopName?: string;
  damageQty: number;
  returnQty: number;
  freeIssueQty: number;
  notes?: string;
};

export type DailyReportDraftUpdateInput = {
  reportDate?: string;
  staffName?: string;
  remarks?: string;
  totalSale?: number;
  dbMarginPercent?: number;
  cashInHand?: number;
  cashInBank?: number;
  totalBillCount?: number;
  deliveredBillCount?: number;
  cancelledBillCount?: number;
};

export type WorkflowActionResult = {
  id: string;
  status: DailyReportStatus;
};

export type ReportWorkspaceTabKey =
  | "overview"
  | "invoices"
  | "expenses"
  | "cash-check"
  | "inventory"
  | "returns-damage"
  | "summary"
  | "attachments"
  | "audit-trail";
