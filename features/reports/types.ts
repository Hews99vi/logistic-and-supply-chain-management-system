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
  distributorPrice: number;
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
  driverDeductions: DailyReportDetailDto["driverDeductions"];
  cashAdjustments: DailyReportDetailDto["cashAdjustments"];
  cheques: DailyReportDetailDto["cheques"];
  creditInvoices: DailyReportDetailDto["creditInvoices"];
  bills: DailyReportDetailDto["bills"];
};

export type AuthSession = {
  user: {
    id: string;
    email?: string;
    profileRole: "admin" | "supervisor" | "driver" | "cashier";
    isActive: boolean;
    organizationId?: string | null;
    permissions?: Record<string, Record<string, boolean | undefined> | undefined> | null;
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
  paymentMethod?: "cash" | "cheque" | "bank" | "credit" | "other";
  receiptFilePath?: string | null;
  receiptFileName?: string | null;
  notes?: string;
};

export type ReportChequeSaveItemInput = {
  id?: string;
  invoiceEntryId?: string | null;
  invoiceNo?: string | null;
  customerName?: string | null;
  chequeNo: string;
  bankName: string;
  branchName?: string | null;
  chequeDate?: string | null;
  receivedDate?: string;
  amount: number;
  status?: "received" | "deposited" | "realized" | "bounced" | "returned" | "cancelled";
  notes?: string | null;
};

export type ReportBillSaveItemInput = {
  id?: string;
  invoiceEntryId?: string | null;
  invoiceNo: string;
  customerName?: string | null;
  amountSnapshot: number;
  status: "delivered" | "cancelled" | "returned" | "missing" | "disputed";
  notes?: string | null;
};

export type ReportCashAdjustmentSaveItemInput = {
  id?: string;
  adjustmentType: "shortage" | "excess";
  amount: number;
  reason: string;
};

export type ReportInventoryBatchSaveItemInput = {
  id?: string;
  productId: string;
  loadingQty: number;
  salesQty: number;
  lorryQty: number;
  salesRevenue?: number;
  costedSalesQty?: number;
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
  | "flat-data"
  | "finance"
  | "invoices"
  | "expenses"
  | "cash-check"
  | "inventory"
  | "returns-damage"
  | "summary"
  | "attachments"
  | "audit-trail";
