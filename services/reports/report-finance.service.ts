import { z } from "zod";

import { requireAppAccess } from "@/lib/auth/helpers";
import { errorResponse, fromPostgrestError, successResponse } from "@/lib/db/response";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { uuidSchema } from "@/lib/validation/common";

const moneySchema = z.coerce.number().finite().nonnegative();

const chequeItemSchema = z.object({
  id: uuidSchema.optional(),
  invoiceEntryId: uuidSchema.nullish(),
  invoiceNo: z.string().trim().max(80).nullish(),
  customerName: z.string().trim().max(180).nullish(),
  chequeNo: z.string().trim().min(1).max(80),
  bankName: z.string().trim().min(1).max(160),
  branchName: z.string().trim().max(160).nullish(),
  chequeDate: z.string().trim().max(20).nullish(),
  receivedDate: z.string().trim().max(20).optional(),
  amount: moneySchema.refine((value) => value > 0, "Amount must be greater than zero."),
  status: z.enum(["received", "deposited", "realized", "bounced", "returned", "cancelled"]).optional(),
  notes: z.string().trim().max(500).nullish()
});

const billItemSchema = z.object({
  id: uuidSchema.optional(),
  invoiceEntryId: uuidSchema.nullish(),
  invoiceNo: z.string().trim().min(1).max(80),
  customerName: z.string().trim().max(180).nullish(),
  amountSnapshot: moneySchema,
  status: z.enum(["delivered", "cancelled", "returned", "missing", "disputed"]),
  notes: z.string().trim().max(500).nullish()
});

const cashAdjustmentSchema = z.object({
  id: uuidSchema.optional(),
  adjustmentType: z.enum(["shortage", "excess"]),
  amount: moneySchema.refine((value) => value > 0, "Amount must be greater than zero."),
  reason: z.string().trim().min(1).max(500)
});

const batchSchema = <T extends z.ZodTypeAny>(item: T) => z.object({ items: z.array(item) });

async function readJson(request: Request) {
  return request.json().catch(() => null);
}

async function ensureReportAccess(reportId: string, action: "view" | "edit") {
  const parsed = uuidSchema.safeParse(reportId);
  if (!parsed.success) {
    return { reportId: null, response: errorResponse(422, "INVALID_ID", "A valid report id is required.") };
  }

  const auth = await requireAppAccess();
  if (auth.response) {
    return { reportId: null, response: auth.response };
  }
  if (!auth.context?.organization) {
    return { reportId: null, response: errorResponse(403, "FORBIDDEN", "Organization access is required.") };
  }

  const supabase = await createSupabaseServerClient();
  const rpcName = action === "view" ? "finance_can_view_report" : "finance_can_edit_report";
  const { data, error } = await (supabase as never as {
    rpc: (name: string, params: Record<string, unknown>) => Promise<{ data: boolean | null; error: { message: string; code?: string; details?: string } | null }>;
  }).rpc(rpcName, { target_report_id: parsed.data });

  if (error || !data) {
    return { reportId: null, response: errorResponse(403, "FORBIDDEN", error?.message ?? "Missing finance permission for this report.") };
  }

  return { reportId: parsed.data, response: null };
}

async function listTable(reportId: string, table: string, select: string, orderColumn = "created_at") {
  const access = await ensureReportAccess(reportId, "view");
  if (access.response) return access.response;
  if (!access.reportId) return errorResponse(403, "FORBIDDEN", "Report access is required.");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from(table)
    .select(select)
    .eq("daily_report_id", access.reportId)
    .order(orderColumn, { ascending: true });

  if (error) return fromPostgrestError(error);
  return successResponse({ items: data ?? [] });
}

async function replaceTable(reportId: string, request: Request, table: string, schema: z.ZodTypeAny, mapper: (item: z.infer<typeof schema>, reportId: string) => Record<string, unknown>) {
  const access = await ensureReportAccess(reportId, "edit");
  if (access.response) return access.response;
  if (!access.reportId) return errorResponse(403, "FORBIDDEN", "Report edit access is required.");

  const parsed = batchSchema(schema).safeParse(await readJson(request));
  if (!parsed.success) {
    return errorResponse(422, "VALIDATION_ERROR", "Validation failed.", parsed.error.flatten());
  }

  const supabase = await createSupabaseServerClient();
  const { error: deleteError } = await supabase.from(table).delete().eq("daily_report_id", access.reportId);
  if (deleteError) return fromPostgrestError(deleteError);

  const rows = parsed.data.items.map((item) => mapper(item, access.reportId));
  if (rows.length > 0) {
    const { error: insertError } = await (supabase as never as {
      from: (name: string) => { insert: (values: Record<string, unknown>[]) => Promise<{ error: Parameters<typeof fromPostgrestError>[0] | null }> };
    }).from(table).insert(rows);
    if (insertError) return fromPostgrestError(insertError);
  }

  await (supabase as never as { rpc: (name: string, params: Record<string, unknown>) => Promise<unknown> }).rpc("recalculate_daily_report_totals", {
    target_daily_report_id: access.reportId
  });

  return listTable(access.reportId, table, "*");
}

export class ReportFinanceService {
  static listCheques(reportId: string) {
    return listTable(reportId, "report_cheques", "*");
  }

  static saveCheques(reportId: string, request: Request) {
    return replaceTable(reportId, request, "report_cheques", chequeItemSchema, (item, dailyReportId) => ({
      id: item.id,
      daily_report_id: dailyReportId,
      invoice_entry_id: item.invoiceEntryId ?? null,
      invoice_no: item.invoiceNo ?? null,
      customer_name: item.customerName ?? null,
      cheque_no: item.chequeNo,
      bank_name: item.bankName,
      branch_name: item.branchName ?? null,
      cheque_date: item.chequeDate || null,
      received_date: item.receivedDate || new Date().toISOString().slice(0, 10),
      amount: item.amount,
      status: item.status ?? "received",
      notes: item.notes ?? null
    }));
  }

  static listBills(reportId: string) {
    return listTable(reportId, "report_bills", "*", "invoice_no");
  }

  static saveBills(reportId: string, request: Request) {
    return replaceTable(reportId, request, "report_bills", billItemSchema, (item, dailyReportId) => ({
      id: item.id,
      daily_report_id: dailyReportId,
      invoice_entry_id: item.invoiceEntryId ?? null,
      invoice_no: item.invoiceNo,
      customer_name: item.customerName ?? null,
      amount_snapshot: item.amountSnapshot,
      status: item.status,
      notes: item.notes ?? null
    }));
  }

  static listCashAdjustments(reportId: string) {
    return listTable(reportId, "report_cash_adjustments", "*");
  }

  static saveCashAdjustments(reportId: string, request: Request) {
    return replaceTable(reportId, request, "report_cash_adjustments", cashAdjustmentSchema, (item, dailyReportId) => ({
      id: item.id,
      daily_report_id: dailyReportId,
      adjustment_type: item.adjustmentType,
      amount: item.amount,
      reason: item.reason,
      status: "pending"
    }));
  }

  static async resolveCashAdjustment(adjustmentId: string, request: Request) {
    const parsedId = uuidSchema.safeParse(adjustmentId);
    if (!parsedId.success) {
      return errorResponse(422, "INVALID_ID", "A valid cash adjustment id is required.");
    }

    const payload = z.object({
      status: z.enum(["approved", "rejected", "void"])
    }).safeParse(await readJson(request));

    if (!payload.success) {
      return errorResponse(422, "VALIDATION_ERROR", "Validation failed.", payload.error.flatten());
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = await (supabase as never as {
      rpc: (name: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: Parameters<typeof fromPostgrestError>[0] | null }>;
    }).rpc("resolve_report_cash_adjustment", {
      target_adjustment_id: parsedId.data,
      target_status: payload.data.status
    });

    if (error) return fromPostgrestError(error);
    return successResponse(data);
  }

  static async approveBillException(billId: string) {
    const parsedId = uuidSchema.safeParse(billId);
    if (!parsedId.success) {
      return errorResponse(422, "INVALID_ID", "A valid bill id is required.");
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = await (supabase as never as {
      rpc: (name: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: Parameters<typeof fromPostgrestError>[0] | null }>;
    }).rpc("approve_report_bill_exception", {
      target_bill_id: parsedId.data
    });

    if (error) return fromPostgrestError(error);
    return successResponse(data);
  }

  static async listCreditInvoices(reportId: string) {
    const access = await ensureReportAccess(reportId, "view");
    if (access.response) return access.response;
    if (!access.reportId) return errorResponse(403, "FORBIDDEN", "Report access is required.");

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("credit_invoices")
      .select("*")
      .eq("daily_report_id", access.reportId)
      .order("invoice_no", { ascending: true });

    if (error) return fromPostgrestError(error);
    return successResponse({ items: data ?? [] });
  }

  static async approveExpense(expenseId: string, request: Request) {
    const parsedId = uuidSchema.safeParse(expenseId);
    if (!parsedId.success) {
      return errorResponse(422, "INVALID_ID", "A valid expense id is required.");
    }

    const payload = z.object({
      status: z.enum(["approved", "rejected", "void"]),
      reason: z.string().trim().max(500).optional()
    }).safeParse(await readJson(request));

    if (!payload.success) {
      return errorResponse(422, "VALIDATION_ERROR", "Validation failed.", payload.error.flatten());
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = await (supabase as never as {
      rpc: (name: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: Parameters<typeof fromPostgrestError>[0] | null }>;
    }).rpc("approve_report_expense", {
      target_expense_id: parsedId.data,
      target_status: payload.data.status,
      resolution_reason: payload.data.reason ?? null
    });

    if (error) return fromPostgrestError(error);
    return successResponse(data);
  }
}
