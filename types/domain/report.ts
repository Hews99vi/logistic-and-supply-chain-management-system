export type DailyReportStatus = "draft" | "submitted" | "approved" | "rejected";

export type DailyReportBaseDto = {
  id: string;
  reportDate: string;
  routeProgramId: string;
  preparedBy: string;
  staffName: string;
  territoryNameSnapshot: string;
  routeNameSnapshot: string;
  loadingSummaryId: string;
  loadingCompletedAt: string | null;
  loadingCompletedBy: string | null;
  loadingNotes: string | null;
  status: DailyReportStatus;
  remarks: string | null;
  totalCash: number;
  totalCheques: number;
  totalCredit: number;
  totalExpenses: number;
  daySaleTotal: number;
  totalSale: number;
  dbMarginPercent: number;
  dbMarginValue: number;
  netProfit: number;
  cashInHand: number;
  cashInBank: number;
  cashBookTotal: number;
  cashPhysicalTotal: number;
  cashDifference: number;
  totalBillCount: number;
  deliveredBillCount: number;
  cancelledBillCount: number;
  rejectionReason: string | null;
  submittedAt: string | null;
  submittedBy: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  rejectedAt: string | null;
  rejectedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DailyReportInvoiceEntryDto = {
  id: string;
  lineNo: number;
  invoiceNo: string;
  cashAmount: number;
  chequeAmount: number;
  creditAmount: number;
  notes: string | null;
  createdAt: string;
};

export type DailyReportExpenseEntryDto = {
  id: string;
  lineNo: number;
  expenseCategoryId: string | null;
  customExpenseName: string | null;
  amount: number;
  notes: string | null;
  createdAt: string;
};

export type DailyReportCashDenominationDto = {
  id: string;
  denominationValue: number;
  noteCount: number;
  lineTotal: number;
  createdAt: string;
};

export type ProductSnapshotDto = {
  productDisplayNameSnapshot: string | null;
  brandSnapshot: string | null;
  productFamilySnapshot: string | null;
  variantSnapshot: string | null;
  unitSizeSnapshot: number | null;
  unitMeasureSnapshot: string | null;
  packSizeSnapshot: number | null;
  sellingUnitSnapshot: string | null;
  quantityEntryModeSnapshot: "pack" | "unit" | null;
};

export type DailyReportInventoryEntryDto = ProductSnapshotDto & {
  id: string;
  productId: string;
  productCodeSnapshot: string;
  productNameSnapshot: string;
  unitPriceSnapshot: number;
  loadingQty: number;
  salesQty: number;
  balanceQty: number;
  lorryQty: number;
  varianceQty: number;
  createdAt: string;
  updatedAt: string;
};

export type DailyReportReturnDamageEntryDto = ProductSnapshotDto & {
  id: string;
  productId: string;
  productCodeSnapshot: string;
  productNameSnapshot: string;
  unitPriceSnapshot: number;
  qty: number;
  value: number;
  invoiceNo: string | null;
  shopName: string | null;
  damageQty: number;
  returnQty: number;
  freeIssueQty: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DailyReportAttachmentDto = {
  filePath: string;
  fileName: string;
  fileType: string | null;
  fileSize: number | null;
  uploadedAt: string | null;
  signedUrl: string | null;
};

export type DailyReportAuditEventDto = {
  id: string;
  timestamp: string;
  actorId: string | null;
  actorName: string | null;
  action: "INSERT" | "UPDATE" | "DELETE";
  tableName: string;
  section: string;
  summary: string;
  oldData: unknown;
  newData: unknown;
};

export type DailyReportDetailDto = {
  report: DailyReportBaseDto;
  invoiceEntries: DailyReportInvoiceEntryDto[];
  expenseEntries: DailyReportExpenseEntryDto[];
  cashDenominations: DailyReportCashDenominationDto[];
  inventoryEntries: DailyReportInventoryEntryDto[];
  returnDamageEntries: DailyReportReturnDamageEntryDto[];
};

export type DailyReportListItemDto = DailyReportBaseDto;

export type DailyReportSummaryCardsDto = {
  totalReports: number;
  draftReports: number;
  submittedReports: number;
  approvedReports: number;
  rejectedReports: number;
  totalSales: number;
  totalCash: number;
  totalExpenses: number;
  totalNetProfit: number;
};
