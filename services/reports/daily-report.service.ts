import { requireAppAccess, requireAuth } from "@/lib/auth/helpers";
import { checkFeaturePermission, requireFeaturePermission } from "@/lib/auth/permissions";
import { errorResponse, fromPostgrestError, successResponse } from "@/lib/db/response";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  dailyReportCreateSchema,
  dailyReportListQuerySchema,
  dailyReportSummaryQuerySchema,
  dailyReportUpdateSchema
} from "@/lib/validation/daily-report";
import { getPaginationRange, uuidSchema } from "@/lib/validation/common";
import type { DailyReportListQuery } from "@/lib/validation/daily-report";
import type {
  DailyReportBaseDto,
  DailyReportCashDenominationDto,
  CreditInvoiceDto,
  DailyReportDetailDto,
  DailyReportExpenseEntryDto,
  DriverDeductionDto,
  DailyReportInventoryEntryDto,
  DailyReportInvoiceEntryDto,
  DailyReportListItemDto,
  DailyReportReturnDamageEntryDto,
  ReportBillDto,
  ReportCashAdjustmentDto,
  ReportChequeDto,
  DailyReportSummaryCardsDto
} from "@/types/domain/report";

type RouteProgramSnapshot = {
  id: string;
  organization_id: string;
  territory_name: string;
  route_name: string;
};

type MembershipLookup = {
  organization_id: string;
};

type DailyReportRow = {
  id: string;
  report_date: string;
  route_program_id: string;
  prepared_by: string;
  staff_name: string;
  territory_name_snapshot: string;
  route_name_snapshot: string;
  loading_completed_at: string | null;
  loading_completed_by: string | null;
  loading_notes: string | null;
  status: "draft" | "submitted" | "approved" | "rejected";
  remarks: string | null;
  total_cash: number;
  total_cheques: number;
  total_credit: number;
  total_expenses: number;
  day_sale_total: number;
  total_sale: number;
  db_margin_percent: number;
  db_margin_value: number;
  net_profit: number;
  cash_in_hand: number;
  cash_in_bank: number;
  cash_book_total: number;
  cash_physical_total: number;
  cash_difference: number;
  total_bill_count: number;
  delivered_bill_count: number;
  cancelled_bill_count: number;
  rejection_reason: string | null;
  submitted_at: string | null;
  submitted_by: string | null;
  approved_at: string | null;
  approved_by: string | null;
  rejected_at: string | null;
  rejected_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
};

type NestedDailyReportRow = DailyReportRow & {
  invoice_entries: Array<{
    id: string;
    line_no: number;
    invoice_no: string;
    cash_amount: number;
    cheque_amount: number;
    credit_amount: number;
    notes: string | null;
    created_at: string;
  }> | null;
  expense_entries: Array<{
    id: string;
    line_no: number;
    expense_category_id: string | null;
    custom_expense_name: string | null;
    amount: number;
    payment_method: "cash" | "cheque" | "bank" | "credit" | "other";
    paid_by: string | null;
    receipt_file_path: string | null;
    receipt_file_name: string | null;
    status: "draft" | "submitted" | "approved" | "rejected" | "void";
    approved_by: string | null;
    approved_at: string | null;
    rejected_by: string | null;
    rejected_at: string | null;
    rejection_reason: string | null;
    notes: string | null;
    created_at: string;
  }> | null;
  cash_denominations: Array<{
    id: string;
    denomination_value: number;
    note_count: number;
    line_total: number;
    created_at: string;
  }> | null;
  inventory_entries: Array<{
    id: string;
    product_id: string;
    product_code_snapshot: string;
    product_name_snapshot: string;
    product_display_name_snapshot: string | null;
    brand_snapshot: string | null;
    product_family_snapshot: string | null;
    variant_snapshot: string | null;
    unit_size_snapshot: number | null;
    unit_measure_snapshot: string | null;
    pack_size_snapshot: number | null;
    selling_unit_snapshot: string | null;
    quantity_entry_mode_snapshot: "pack" | "unit" | null;
    unit_price_snapshot: number;
    distributor_price_snapshot: number;
    sales_revenue_snapshot: number;
    costed_sales_qty_snapshot: number;
    gross_profit_snapshot: number;
    loading_qty: number;
    sales_qty: number;
    balance_qty: number;
    lorry_qty: number;
    variance_qty: number;
    created_at: string;
    updated_at: string;
  }> | null;
  return_damage_entries: Array<{
    id: string;
    product_id: string;
    product_code_snapshot: string;
    product_name_snapshot: string;
    product_display_name_snapshot: string | null;
    brand_snapshot: string | null;
    product_family_snapshot: string | null;
    variant_snapshot: string | null;
    unit_size_snapshot: number | null;
    unit_measure_snapshot: string | null;
    pack_size_snapshot: number | null;
    selling_unit_snapshot: string | null;
    quantity_entry_mode_snapshot: "pack" | "unit" | null;
    unit_price_snapshot: number;
    qty: number;
    value: number;
    invoice_no: string | null;
    shop_name: string | null;
    damage_qty: number;
    return_qty: number;
    free_issue_qty: number;
    notes: string | null;
    created_at: string;
    updated_at: string;
  }> | null;
  driver_deductions: Array<{
    id: string;
    daily_report_id: string;
    driver_id: string;
    product_id: string;
    product_code_snapshot: string;
    product_name_snapshot: string;
    missing_qty: number;
    unit_price_snapshot: number;
    deduction_amount: number;
    reason: string;
    status: "pending" | "approved" | "waived" | "settled";
    approved_by: string | null;
    approved_at: string | null;
    waived_by: string | null;
    waived_at: string | null;
    settled_at: string | null;
    created_at: string;
    updated_at: string;
  }> | null;
  cash_adjustments: Array<{
    id: string;
    daily_report_id: string;
    adjustment_type: "shortage" | "excess";
    amount: number;
    reason: string;
    status: "pending" | "approved" | "rejected" | "void";
    approved_by: string | null;
    approved_at: string | null;
    created_by: string | null;
    created_at: string;
    updated_at: string;
  }> | null;
  cheques: Array<{
    id: string;
    daily_report_id: string;
    invoice_entry_id: string | null;
    invoice_no: string | null;
    customer_name: string | null;
    cheque_no: string;
    bank_name: string;
    branch_name: string | null;
    cheque_date: string | null;
    received_date: string;
    amount: number;
    status: "received" | "deposited" | "realized" | "bounced" | "returned" | "cancelled";
    notes: string | null;
    created_at: string;
    updated_at: string;
  }> | null;
  credit_invoices: Array<{
    id: string;
    organization_id: string;
    daily_report_id: string | null;
    invoice_entry_id: string | null;
    credit_account_id: string | null;
    invoice_no: string;
    customer_name: string;
    invoice_date: string;
    due_date: string | null;
    amount: number;
    collected_amount: number;
    outstanding_amount: number;
    status: "open" | "partially_paid" | "settled" | "written_off" | "disputed";
    notes: string | null;
    created_at: string;
    updated_at: string;
  }> | null;
  bills: Array<{
    id: string;
    daily_report_id: string;
    invoice_entry_id: string | null;
    invoice_no: string;
    customer_name: string | null;
    amount_snapshot: number;
    status: "delivered" | "cancelled" | "returned" | "missing" | "disputed";
    exception_approved_by: string | null;
    exception_approved_at: string | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
  }> | null;
};

const DAILY_REPORT_BASE_SELECT = `
  id,
  report_date,
  route_program_id,
  prepared_by,
  staff_name,
  territory_name_snapshot,
  route_name_snapshot,
  loading_completed_at,
  loading_completed_by,
  loading_notes,
  status,
  remarks,
  total_cash,
  total_cheques,
  total_credit,
  total_expenses,
  day_sale_total,
  total_sale,
  db_margin_percent,
  db_margin_value,
  net_profit,
  cash_in_hand,
  cash_in_bank,
  cash_book_total,
  cash_physical_total,
  cash_difference,
  total_bill_count,
  delivered_bill_count,
  cancelled_bill_count,
  rejection_reason,
  submitted_at,
  submitted_by,
  approved_at,
  approved_by,
  rejected_at,
  rejected_by,
  created_at,
  updated_at,
  deleted_at
`.replace(/\s+/g, " ").trim();

const DAILY_REPORT_DETAIL_SELECT = `
  ${DAILY_REPORT_BASE_SELECT},
  invoice_entries:report_invoice_entries (
    id,
    line_no,
    invoice_no,
    cash_amount,
    cheque_amount,
    credit_amount,
    notes,
    created_at
  ),
  expense_entries:report_expenses (
    id,
    line_no,
    expense_category_id,
    custom_expense_name,
    amount,
    payment_method,
    paid_by,
    receipt_file_path,
    receipt_file_name,
    status,
    approved_by,
    approved_at,
    rejected_by,
    rejected_at,
    rejection_reason,
    notes,
    created_at
  ),
  cash_denominations:report_cash_denominations (
    id,
    denomination_value,
    note_count,
    line_total,
    created_at
  ),
  inventory_entries:report_inventory_entries (
    id,
    product_id,
    product_code_snapshot,
    product_name_snapshot,
    product_display_name_snapshot,
    brand_snapshot,
    product_family_snapshot,
    variant_snapshot,
    unit_size_snapshot,
    unit_measure_snapshot,
    pack_size_snapshot,
    selling_unit_snapshot,
    quantity_entry_mode_snapshot,
    unit_price_snapshot,
    distributor_price_snapshot,
    sales_revenue_snapshot,
    costed_sales_qty_snapshot,
    gross_profit_snapshot,
    loading_qty,
    sales_qty,
    balance_qty,
    lorry_qty,
    variance_qty,
    created_at,
    updated_at
  ),
  return_damage_entries:report_return_damage_entries (
    id,
    product_id,
    product_code_snapshot,
    product_name_snapshot,
    product_display_name_snapshot,
    brand_snapshot,
    product_family_snapshot,
    variant_snapshot,
    unit_size_snapshot,
    unit_measure_snapshot,
    pack_size_snapshot,
    selling_unit_snapshot,
    quantity_entry_mode_snapshot,
    unit_price_snapshot,
    qty,
    value,
    invoice_no,
    shop_name,
    damage_qty,
    return_qty,
    free_issue_qty,
    notes,
    created_at,
    updated_at
  ),
  driver_deductions:driver_deductions (
    id,
    daily_report_id,
    driver_id,
    product_id,
    product_code_snapshot,
    product_name_snapshot,
    missing_qty,
    unit_price_snapshot,
    deduction_amount,
    reason,
    status,
    approved_by,
    approved_at,
    waived_by,
    waived_at,
    settled_at,
    created_at,
    updated_at
  ),
  cash_adjustments:report_cash_adjustments (
    id,
    daily_report_id,
    adjustment_type,
    amount,
    reason,
    status,
    approved_by,
    approved_at,
    created_by,
    created_at,
    updated_at
  ),
  cheques:report_cheques (
    id,
    daily_report_id,
    invoice_entry_id,
    invoice_no,
    customer_name,
    cheque_no,
    bank_name,
    branch_name,
    cheque_date,
    received_date,
    amount,
    status,
    notes,
    created_at,
    updated_at
  ),
  credit_invoices:credit_invoices (
    id,
    organization_id,
    daily_report_id,
    invoice_entry_id,
    credit_account_id,
    invoice_no,
    customer_name,
    invoice_date,
    due_date,
    amount,
    collected_amount,
    outstanding_amount,
    status,
    notes,
    created_at,
    updated_at
  ),
  bills:report_bills (
    id,
    daily_report_id,
    invoice_entry_id,
    invoice_no,
    customer_name,
    amount_snapshot,
    status,
    exception_approved_by,
    exception_approved_at,
    notes,
    created_at,
    updated_at
  )
`.replace(/\s+/g, " ").trim();

function mapDailyReportBase(row: DailyReportRow): DailyReportBaseDto {
  return {
    id: row.id,
    reportDate: row.report_date,
    routeProgramId: row.route_program_id,
    preparedBy: row.prepared_by,
    staffName: row.staff_name,
    territoryNameSnapshot: row.territory_name_snapshot,
    routeNameSnapshot: row.route_name_snapshot,
    loadingSummaryId: row.id,
    loadingCompletedAt: row.loading_completed_at,
    loadingCompletedBy: row.loading_completed_by,
    loadingNotes: row.loading_notes,
    status: row.status,
    remarks: row.remarks,
    totalCash: row.total_cash,
    totalCheques: row.total_cheques,
    totalCredit: row.total_credit,
    totalExpenses: row.total_expenses,
    daySaleTotal: row.day_sale_total,
    totalSale: row.total_sale,
    dbMarginPercent: row.db_margin_percent,
    dbMarginValue: row.db_margin_value,
    netProfit: row.net_profit,
    cashInHand: row.cash_in_hand,
    cashInBank: row.cash_in_bank,
    cashBookTotal: row.cash_book_total,
    cashPhysicalTotal: row.cash_physical_total,
    cashDifference: row.cash_difference,
    totalBillCount: row.total_bill_count,
    deliveredBillCount: row.delivered_bill_count,
    cancelledBillCount: row.cancelled_bill_count,
    rejectionReason: row.rejection_reason,
    submittedAt: row.submitted_at,
    submittedBy: row.submitted_by,
    approvedAt: row.approved_at,
    approvedBy: row.approved_by,
    rejectedAt: row.rejected_at,
    rejectedBy: row.rejected_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapInvoiceEntries(rows: NestedDailyReportRow["invoice_entries"]): DailyReportInvoiceEntryDto[] {
  return (rows ?? []).map((row) => ({
    id: row.id,
    lineNo: row.line_no,
    invoiceNo: row.invoice_no,
    cashAmount: row.cash_amount,
    chequeAmount: row.cheque_amount,
    creditAmount: row.credit_amount,
    notes: row.notes,
    createdAt: row.created_at
  }));
}

function mapExpenseEntries(rows: NestedDailyReportRow["expense_entries"]): DailyReportExpenseEntryDto[] {
  return (rows ?? []).map((row) => ({
    id: row.id,
    lineNo: row.line_no,
    expenseCategoryId: row.expense_category_id,
    customExpenseName: row.custom_expense_name,
    amount: row.amount,
    paymentMethod: row.payment_method ?? "cash",
    paidBy: row.paid_by,
    receiptFilePath: row.receipt_file_path,
    receiptFileName: row.receipt_file_name,
    status: row.status ?? "approved",
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    rejectedBy: row.rejected_by,
    rejectedAt: row.rejected_at,
    rejectionReason: row.rejection_reason,
    notes: row.notes,
    createdAt: row.created_at
  }));
}

function mapCashDenominations(rows: NestedDailyReportRow["cash_denominations"]): DailyReportCashDenominationDto[] {
  return (rows ?? []).map((row) => ({
    id: row.id,
    denominationValue: row.denomination_value,
    noteCount: row.note_count,
    lineTotal: row.line_total,
    createdAt: row.created_at
  }));
}

function mapInventoryEntries(rows: NestedDailyReportRow["inventory_entries"]): DailyReportInventoryEntryDto[] {
  return (rows ?? []).map((row) => ({
    id: row.id,
    productId: row.product_id,
    productCodeSnapshot: row.product_code_snapshot,
    productNameSnapshot: row.product_name_snapshot,
    productDisplayNameSnapshot: row.product_display_name_snapshot,
    brandSnapshot: row.brand_snapshot,
    productFamilySnapshot: row.product_family_snapshot,
    variantSnapshot: row.variant_snapshot,
    unitSizeSnapshot: row.unit_size_snapshot,
    unitMeasureSnapshot: row.unit_measure_snapshot,
    packSizeSnapshot: row.pack_size_snapshot,
    sellingUnitSnapshot: row.selling_unit_snapshot,
    quantityEntryModeSnapshot: row.quantity_entry_mode_snapshot,
    unitPriceSnapshot: row.unit_price_snapshot,
    distributorPriceSnapshot: row.distributor_price_snapshot,
    salesRevenueSnapshot: row.sales_revenue_snapshot,
    costedSalesQtySnapshot: row.costed_sales_qty_snapshot,
    grossProfitSnapshot: row.gross_profit_snapshot,
    loadingQty: row.loading_qty,
    salesQty: row.sales_qty,
    balanceQty: row.balance_qty,
    lorryQty: row.lorry_qty,
    varianceQty: row.variance_qty,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

function mapReturnDamageEntries(rows: NestedDailyReportRow["return_damage_entries"]): DailyReportReturnDamageEntryDto[] {
  return (rows ?? []).map((row) => ({
    id: row.id,
    productId: row.product_id,
    productCodeSnapshot: row.product_code_snapshot,
    productNameSnapshot: row.product_name_snapshot,
    productDisplayNameSnapshot: row.product_display_name_snapshot,
    brandSnapshot: row.brand_snapshot,
    productFamilySnapshot: row.product_family_snapshot,
    variantSnapshot: row.variant_snapshot,
    unitSizeSnapshot: row.unit_size_snapshot,
    unitMeasureSnapshot: row.unit_measure_snapshot,
    packSizeSnapshot: row.pack_size_snapshot,
    sellingUnitSnapshot: row.selling_unit_snapshot,
    quantityEntryModeSnapshot: row.quantity_entry_mode_snapshot,
    unitPriceSnapshot: row.unit_price_snapshot,
    qty: row.qty,
    value: row.value,
    invoiceNo: row.invoice_no,
    shopName: row.shop_name,
    damageQty: row.damage_qty,
    returnQty: row.return_qty,
    freeIssueQty: row.free_issue_qty,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

function mapDriverDeductions(rows: NestedDailyReportRow["driver_deductions"]): DriverDeductionDto[] {
  return (rows ?? []).map((row) => ({
    id: row.id,
    dailyReportId: row.daily_report_id,
    driverId: row.driver_id,
    productId: row.product_id,
    productCodeSnapshot: row.product_code_snapshot,
    productNameSnapshot: row.product_name_snapshot,
    missingQty: row.missing_qty,
    unitPriceSnapshot: row.unit_price_snapshot,
    deductionAmount: row.deduction_amount,
    reason: row.reason,
    status: row.status,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    waivedBy: row.waived_by,
    waivedAt: row.waived_at,
    settledAt: row.settled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

function mapCashAdjustments(rows: NestedDailyReportRow["cash_adjustments"]): ReportCashAdjustmentDto[] {
  return (rows ?? []).map((row) => ({
    id: row.id,
    dailyReportId: row.daily_report_id,
    adjustmentType: row.adjustment_type,
    amount: row.amount,
    reason: row.reason,
    status: row.status,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

function mapCheques(rows: NestedDailyReportRow["cheques"]): ReportChequeDto[] {
  return (rows ?? []).map((row) => ({
    id: row.id,
    dailyReportId: row.daily_report_id,
    invoiceEntryId: row.invoice_entry_id,
    invoiceNo: row.invoice_no,
    customerName: row.customer_name,
    chequeNo: row.cheque_no,
    bankName: row.bank_name,
    branchName: row.branch_name,
    chequeDate: row.cheque_date,
    receivedDate: row.received_date,
    amount: row.amount,
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

function mapCreditInvoices(rows: NestedDailyReportRow["credit_invoices"]): CreditInvoiceDto[] {
  return (rows ?? []).map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    dailyReportId: row.daily_report_id,
    invoiceEntryId: row.invoice_entry_id,
    creditAccountId: row.credit_account_id,
    invoiceNo: row.invoice_no,
    customerName: row.customer_name,
    invoiceDate: row.invoice_date,
    dueDate: row.due_date,
    amount: row.amount,
    collectedAmount: row.collected_amount,
    outstandingAmount: row.outstanding_amount,
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

function mapBills(rows: NestedDailyReportRow["bills"]): ReportBillDto[] {
  return (rows ?? []).map((row) => ({
    id: row.id,
    dailyReportId: row.daily_report_id,
    invoiceEntryId: row.invoice_entry_id,
    invoiceNo: row.invoice_no,
    customerName: row.customer_name,
    amountSnapshot: row.amount_snapshot,
    status: row.status,
    exceptionApprovedBy: row.exception_approved_by,
    exceptionApprovedAt: row.exception_approved_at,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

async function resolveActiveOrganizationId(userId: string) {
  const supabase = await createSupabaseServerClient();
  const membershipResult = (await supabase
    .from("organization_memberships")
    .select("organization_id")
    .eq("user_id", userId)
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()) as {
      data: MembershipLookup | null;
      error: Parameters<typeof fromPostgrestError>[0] | null;
    };

  if (membershipResult.error) {
    return {
      organizationId: null,
      response: fromPostgrestError(membershipResult.error)
    };
  }

  if (!membershipResult.data) {
    return {
      organizationId: null,
      response: errorResponse(
        403,
        "MEMBERSHIP_REQUIRED",
        "An active organization membership is required to access route programs for daily reports."
      )
    };
  }

  return {
    organizationId: membershipResult.data.organization_id,
    response: null
  };
}

async function getRouteProgramSnapshot(routeProgramId: string, organizationId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = (await supabase
    .from("route_programs")
    .select("id, organization_id, territory_name, route_name")
    .eq("id", routeProgramId)
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .maybeSingle()) as {
    data: RouteProgramSnapshot | null;
    error: Parameters<typeof fromPostgrestError>[0] | null;
  };

  if (error) {
    return { data: null, response: fromPostgrestError(error) };
  }

  if (!data) {
    return {
      data: null,
      response: errorResponse(404, "ROUTE_PROGRAM_NOT_FOUND", "Route program not found.")
    };
  }

  return { data, response: null };
}

async function findExistingRouteDayReport(reportDate: string, routeProgramId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = (await supabase
    .from("daily_reports")
    .select(DAILY_REPORT_BASE_SELECT)
    .eq("report_date", reportDate)
    .eq("route_program_id", routeProgramId)
    .is("deleted_at", null)
    .maybeSingle()) as {
      data: DailyReportRow | null;
      error: Parameters<typeof fromPostgrestError>[0] | null;
    };

  if (error) {
    return { data: null, response: fromPostgrestError(error) };
  }

  return { data, response: null };
}

async function getDraftReportForUpdate(reportId: string, userId: string, role: string) {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("daily_reports")
    .select(DAILY_REPORT_BASE_SELECT)
    .eq("id", reportId)
    .is("deleted_at", null);

  if (role === "driver") {
    query = query.eq("prepared_by", userId);
  }

  const { data, error } = (await query.maybeSingle()) as {
    data: DailyReportRow | null;
    error: Parameters<typeof fromPostgrestError>[0] | null;
  };

  if (error) {
    return { data: null, response: fromPostgrestError(error) };
  }

  if (!data) {
    return {
      data: null,
      response: errorResponse(404, "REPORT_NOT_FOUND", "Daily report not found.")
    };
  }

  if (data.status !== "draft") {
    return {
      data: null,
      response: errorResponse(409, "REPORT_NOT_EDITABLE", "Only draft reports can be updated or deleted.")
    };
  }

  return { data, response: null };
}

type ReportsSortColumn =
  | "report_date"
  | "route_name_snapshot"
  | "territory_name_snapshot"
  | "staff_name"
  | "status"
  | "total_sale"
  | "net_profit"
  | "updated_at";

const reportsSortColumnMap: Record<DailyReportListQuery["sortKey"], ReportsSortColumn> = {
  reportDate: "report_date",
  routeNameSnapshot: "route_name_snapshot",
  territoryNameSnapshot: "territory_name_snapshot",
  staffName: "staff_name",
  status: "status",
  totalSale: "total_sale",
  netProfit: "net_profit",
  updatedAt: "updated_at"
};

function normalizeSearchTerm(search: string) {
  return search
    .replace(/[,()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeLikePattern(input: string) {
  return input.replace(/[%_]/g, "");
}

export class DailyReportService {
  static async createReport(request: Request) {
    const auth = await requireFeaturePermission("daily_reports", "create");
    if (auth.response || !auth.context) {
      return auth.response;
    }

    const body = await request.json().catch(() => null);
    const parsed = dailyReportCreateSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse(422, "VALIDATION_ERROR", "Invalid daily report payload.", parsed.error.flatten());
    }

    const membership = await resolveActiveOrganizationId(auth.context.user.id);
    if (membership.response || !membership.organizationId) {
      return membership.response ?? errorResponse(
        403,
        "MEMBERSHIP_REQUIRED",
        "An active organization membership is required to access route programs for daily reports."
      );
    }
    const routeProgram = await getRouteProgramSnapshot(parsed.data.routeProgramId, membership.organizationId);
    if (routeProgram.response || !routeProgram.data) {
      return routeProgram.response;
    }

    const existingRouteDayReport = await findExistingRouteDayReport(parsed.data.reportDate, parsed.data.routeProgramId);
    if (existingRouteDayReport.response) {
      return existingRouteDayReport.response;
    }

    if (existingRouteDayReport.data) {
      return successResponse<DailyReportBaseDto>(mapDailyReportBase(existingRouteDayReport.data));
    }

    // Use the authenticated server client so database guards that depend on
    // auth.uid() can validate the actor during insert.
    const supabase = await createSupabaseServerClient();
    const insertPayload = {
      report_date: parsed.data.reportDate,
      route_program_id: parsed.data.routeProgramId,
      prepared_by: auth.context.user.id,
      staff_name: parsed.data.staffName,
      territory_name_snapshot: routeProgram.data.territory_name,
      route_name_snapshot: routeProgram.data.route_name,
      remarks: parsed.data.remarks ?? null,
      total_sale: parsed.data.totalSale,
      db_margin_percent: parsed.data.dbMarginPercent,
      cash_in_hand: parsed.data.cashInHand,
      cash_in_bank: parsed.data.cashInBank,
      total_bill_count: parsed.data.totalBillCount,
      delivered_bill_count: parsed.data.deliveredBillCount,
      cancelled_bill_count: parsed.data.cancelledBillCount,
      status: "draft"
    };

    const { data, error } = (await supabase
      .from("daily_reports")
      .insert(insertPayload as never)
      .select(DAILY_REPORT_BASE_SELECT)
      .single()) as {
      data: DailyReportRow | null;
      error: Parameters<typeof fromPostgrestError>[0] | null;
    };

    if (error) {
      if (error.code === "23505") {
        const existingRouteDayReport = await findExistingRouteDayReport(parsed.data.reportDate, parsed.data.routeProgramId);
        if (existingRouteDayReport.response) {
          return existingRouteDayReport.response;
        }

        if (existingRouteDayReport.data) {
          return successResponse<DailyReportBaseDto>(mapDailyReportBase(existingRouteDayReport.data));
        }

        return errorResponse(409, "ROUTE_DAY_ALREADY_EXISTS", "A route-day record already exists for this route and date.");
      }

      return fromPostgrestError(error);
    }

    return successResponse<DailyReportBaseDto>(mapDailyReportBase(data as DailyReportRow), { status: 201 });
  }

  static async getReportById(reportId: string) {
    const auth = await requireFeaturePermission("daily_reports", "view");
    if (auth.response) {
      return auth.response;
    }

    const parsedId = uuidSchema.safeParse(reportId);
    if (!parsedId.success) {
      return errorResponse(422, "INVALID_ID", "A valid report id is required.");
    }

    const supabase = await createSupabaseServerClient();
    const nestedQuery = supabase
      .from("daily_reports")
      .select(DAILY_REPORT_DETAIL_SELECT)
      .eq("id", parsedId.data)
      .is("deleted_at", null)
      .maybeSingle();

    const { data, error } = (await nestedQuery) as {
      data: NestedDailyReportRow | null;
      error: Parameters<typeof fromPostgrestError>[0] | null;
    };

    if (error) {
      return fromPostgrestError(error);
    }

    if (!data) {
      return errorResponse(404, "REPORT_NOT_FOUND", "Daily report not found.");
    }

    const response: DailyReportDetailDto = {
      report: mapDailyReportBase(data),
      invoiceEntries: mapInvoiceEntries(data.invoice_entries),
      expenseEntries: mapExpenseEntries(data.expense_entries),
      cashDenominations: mapCashDenominations(data.cash_denominations),
      inventoryEntries: mapInventoryEntries(data.inventory_entries),
      returnDamageEntries: mapReturnDamageEntries(data.return_damage_entries),
      driverDeductions: mapDriverDeductions(data.driver_deductions),
      cashAdjustments: mapCashAdjustments(data.cash_adjustments),
      cheques: mapCheques(data.cheques),
      creditInvoices: mapCreditInvoices(data.credit_invoices),
      bills: mapBills(data.bills)
    };

    return successResponse(response);
  }

  static async listReports(request: Request) {
    const auth = await requireFeaturePermission("daily_reports", "view");
    if (auth.response) {
      return auth.response;
    }

    const { searchParams } = new URL(request.url);
    const parsed = dailyReportListQuerySchema.safeParse(Object.fromEntries(searchParams.entries()));

    if (!parsed.success) {
      return errorResponse(422, "VALIDATION_ERROR", "Invalid report query parameters.", parsed.error.flatten());
    }

    const {
      page,
      pageSize,
      dateFrom,
      dateTo,
      routeProgramId,
      territory,
      status,
      createdBy,
      search,
      sortKey,
      sortDirection
    } = parsed.data;
    const { from, to } = getPaginationRange(page, pageSize);
    const supabase = await createSupabaseServerClient();

    let query = supabase
      .from("daily_reports")
      .select(DAILY_REPORT_BASE_SELECT, { count: "exact" })
      .is("deleted_at", null);

    if (dateFrom) {
      query = query.gte("report_date", dateFrom);
    }
    if (dateTo) {
      query = query.lte("report_date", dateTo);
    }
    if (routeProgramId) {
      query = query.eq("route_program_id", routeProgramId);
    }
    if (territory) {
      query = query.ilike("territory_name_snapshot", `%${territory}%`);
    }
    if (status) {
      query = query.eq("status", status);
    }
    if (createdBy) {
      query = query.eq("prepared_by", createdBy);
    }

    if (search) {
      const normalizedSearch = normalizeSearchTerm(search);
      if (normalizedSearch) {
        const likeTerm = `%${escapeLikePattern(normalizedSearch)}%`;
        const searchConditions = [
          `route_name_snapshot.ilike.${likeTerm}`,
          `territory_name_snapshot.ilike.${likeTerm}`,
          `staff_name.ilike.${likeTerm}`
        ];

        if (uuidSchema.safeParse(normalizedSearch).success) {
          searchConditions.unshift(`id.eq.${normalizedSearch}`);
        }

        query = query.or(searchConditions.join(","));
      }
    }

    const sortColumn = reportsSortColumnMap[sortKey];
    const isAscending = sortDirection === "asc";

    query = query.order(sortColumn, { ascending: isAscending });
    if (sortColumn !== "updated_at") {
      query = query.order("updated_at", { ascending: false });
    }

    query = query.order("id", { ascending: false }).range(from, to);

    const { data, count, error } = (await query) as {
      data: DailyReportRow[] | null;
      count: number | null;
      error: Parameters<typeof fromPostgrestError>[0] | null;
    };

    if (error) {
      return fromPostgrestError(error);
    }

    return successResponse({
      items: (data ?? []).map((row) => mapDailyReportBase(row) as DailyReportListItemDto),
      page,
      pageSize,
      total: count ?? 0
    });
  }

  static async updateDraftReport(reportId: string, request: Request) {
    const auth = await requireAppAccess();
    if (auth.response || !auth.context) {
      return auth.response;
    }

    const parsedId = uuidSchema.safeParse(reportId);
    if (!parsedId.success) {
      return errorResponse(422, "INVALID_ID", "A valid report id is required.");
    }

    const reportLookup = await getDraftReportForUpdate(parsedId.data, auth.context.user.id, auth.context.profile.role);
    if (reportLookup.response || !reportLookup.data) {
      return reportLookup.response;
    }

    const body = await request.json().catch(() => null);
    const parsed = dailyReportUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse(422, "VALIDATION_ERROR", "Invalid daily report payload.", parsed.error.flatten());
    }

    const updatePayload: Record<string, unknown> = {};

    if (parsed.data.reportDate !== undefined) updatePayload.report_date = parsed.data.reportDate;
    if (parsed.data.staffName !== undefined) updatePayload.staff_name = parsed.data.staffName;
    if (parsed.data.remarks !== undefined) updatePayload.remarks = parsed.data.remarks ?? null;
    // total_sale is derived from invoice totals by recalculate_daily_report_totals.
    // Ignore client-supplied totalSale so profit cannot drift from invoice data.
    if (parsed.data.dbMarginPercent !== undefined) updatePayload.db_margin_percent = parsed.data.dbMarginPercent;
    if (parsed.data.cashInHand !== undefined) updatePayload.cash_in_hand = parsed.data.cashInHand;
    if (parsed.data.cashInBank !== undefined) updatePayload.cash_in_bank = parsed.data.cashInBank;
    if (parsed.data.totalBillCount !== undefined) updatePayload.total_bill_count = parsed.data.totalBillCount;
    if (parsed.data.deliveredBillCount !== undefined) updatePayload.delivered_bill_count = parsed.data.deliveredBillCount;
    if (parsed.data.cancelledBillCount !== undefined) updatePayload.cancelled_bill_count = parsed.data.cancelledBillCount;

    const membership = await resolveActiveOrganizationId(auth.context.user.id);
    if (membership.response || !membership.organizationId) {
      return membership.response ?? errorResponse(
        403,
        "MEMBERSHIP_REQUIRED",
        "An active organization membership is required to access route programs for daily reports."
      );
    }

    const touchesOperationalFields =
      parsed.data.reportDate !== undefined ||
      parsed.data.staffName !== undefined ||
      parsed.data.remarks !== undefined ||
      parsed.data.routeProgramId !== undefined;

    const touchesFinanceFields =
      parsed.data.dbMarginPercent !== undefined ||
      parsed.data.cashInHand !== undefined ||
      parsed.data.cashInBank !== undefined ||
      parsed.data.totalBillCount !== undefined ||
      parsed.data.deliveredBillCount !== undefined ||
      parsed.data.cancelledBillCount !== undefined ||
      parsed.data.totalSale !== undefined;

    const canEditOperations = !touchesOperationalFields
      || await checkFeaturePermission("daily_reports", "edit", membership.organizationId);
    const canEditFinance = !touchesFinanceFields
      || await checkFeaturePermission("date_sheet", "edit", membership.organizationId);

    if (!canEditOperations || !canEditFinance) {
      return errorResponse(403, "FORBIDDEN", "Missing permission to update these report fields.");
    }

    if (parsed.data.routeProgramId !== undefined) {
      const routeProgram = await getRouteProgramSnapshot(parsed.data.routeProgramId, membership.organizationId);
      if (routeProgram.response || !routeProgram.data) {
        return routeProgram.response;
      }

      updatePayload.route_program_id = parsed.data.routeProgramId;
      updatePayload.territory_name_snapshot = routeProgram.data.territory_name;
      updatePayload.route_name_snapshot = routeProgram.data.route_name;
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = (await supabase
      .from("daily_reports")
      .update(updatePayload as never)
      .eq("id", parsedId.data)
      .select(DAILY_REPORT_BASE_SELECT)
      .single()) as {
      data: DailyReportRow | null;
      error: Parameters<typeof fromPostgrestError>[0] | null;
    };

    if (error) {
      return fromPostgrestError(error);
    }

    return successResponse<DailyReportBaseDto>(mapDailyReportBase(data as DailyReportRow));
  }

  static async softDeleteDraftReport(reportId: string) {
    const auth = await requireAuth();
    if (auth.response || !auth.context) {
      return auth.response;
    }

    const parsedId = uuidSchema.safeParse(reportId);
    if (!parsedId.success) {
      return errorResponse(422, "INVALID_ID", "A valid report id is required.");
    }

    const reportLookup = await getDraftReportForUpdate(parsedId.data, auth.context.user.id, auth.context.profile.role);
    if (reportLookup.response || !reportLookup.data) {
      return reportLookup.response;
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = (await supabase
      .from("daily_reports")
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: auth.context.user.id
      } as never)
      .eq("id", parsedId.data)
      .select(DAILY_REPORT_BASE_SELECT)
      .single()) as {
      data: DailyReportRow | null;
      error: Parameters<typeof fromPostgrestError>[0] | null;
    };

    if (error) {
      return fromPostgrestError(error);
    }

    return successResponse({
      id: data?.id ?? parsedId.data,
      deleted: true
    });
  }

  static async getSummaryCards(request: Request) {
    const auth = await requireAuth();
    if (auth.response) {
      return auth.response;
    }

    const { searchParams } = new URL(request.url);
    const parsed = dailyReportSummaryQuerySchema.safeParse(Object.fromEntries(searchParams.entries()));

    if (!parsed.success) {
      return errorResponse(422, "VALIDATION_ERROR", "Invalid summary query parameters.", parsed.error.flatten());
    }

    const { dateFrom, dateTo, routeProgramId, territory, status, createdBy } = parsed.data;
    const supabase = await createSupabaseServerClient();

    let query = (supabase
      .from("daily_reports")
      .select("status, total_sale, total_cash, total_expenses, net_profit") as unknown as {
        eq: (column: string, value: string) => any;
        gte: (column: string, value: string) => any;
        lte: (column: string, value: string) => any;
        ilike: (column: string, value: string) => any;
        is: (column: string, value: null) => any;
        then: PromiseLike<unknown>["then"];
      }).is("deleted_at", null);

    if (dateFrom) query = query.gte("report_date", dateFrom);
    if (dateTo) query = query.lte("report_date", dateTo);
    if (routeProgramId) query = query.eq("route_program_id", routeProgramId);
    if (territory) query = query.ilike("territory_name_snapshot", `%${territory}%`);
    if (status) query = query.eq("status", status);
    if (createdBy) query = query.eq("prepared_by", createdBy);

    const { data, error } = (await query) as {
      data: Array<{
        status: DailyReportBaseDto["status"];
        total_sale: number;
        total_cash: number;
        total_expenses: number;
        net_profit: number;
      }> | null;
      error: Parameters<typeof fromPostgrestError>[0] | null;
    };

    if (error) {
      return fromPostgrestError(error);
    }

    const summary = (data ?? []).reduce<DailyReportSummaryCardsDto>((acc, row) => {
      acc.totalReports += 1;
      acc.totalSales += row.total_sale;
      acc.totalCash += row.total_cash;
      acc.totalExpenses += row.total_expenses;
      acc.totalNetProfit += row.net_profit;

      if (row.status === "draft") acc.draftReports += 1;
      if (row.status === "submitted") acc.submittedReports += 1;
      if (row.status === "approved") acc.approvedReports += 1;
      if (row.status === "rejected") acc.rejectedReports += 1;

      return acc;
    }, {
      totalReports: 0,
      draftReports: 0,
      submittedReports: 0,
      approvedReports: 0,
      rejectedReports: 0,
      totalSales: 0,
      totalCash: 0,
      totalExpenses: 0,
      totalNetProfit: 0
    });

    return successResponse(summary);
  }
}







