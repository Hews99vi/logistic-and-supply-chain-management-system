import { requireAuth } from "@/lib/auth/helpers";
import { errorResponse, fromPostgrestError, successResponse } from "@/lib/db/response";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { uuidSchema } from "@/lib/validation/common";
import {
  reportInvoiceEntryBatchSaveSchema,
  reportInvoiceEntryCreateSchema,
  reportInvoiceEntryUpdateSchema
} from "@/lib/validation/report-invoice-entry";
import type { DailyReportInvoiceEntryDto } from "@/types/domain/report";

type DailyReportAccessRow = {
  id: string;
  prepared_by: string;
  status: "draft" | "submitted" | "approved" | "rejected";
  deleted_at: string | null;
};

type ReportInvoiceEntryRow = {
  id: string;
  daily_report_id: string;
  line_no: number;
  invoice_no: string;
  cash_amount: number;
  cheque_amount: number;
  credit_amount: number;
  notes: string | null;
  created_at: string;
};

type DatabaseErrorLike = {
  code?: string | null;
  message: string;
  details?: string | null;
};

const INVOICE_ENTRY_SELECT = `
  id,
  daily_report_id,
  line_no,
  invoice_no,
  cash_amount,
  cheque_amount,
  credit_amount,
  notes,
  created_at
`.replace(/\s+/g, " ").trim();

function mapInvoiceEntry(row: ReportInvoiceEntryRow): DailyReportInvoiceEntryDto {
  return {
    id: row.id,
    lineNo: row.line_no,
    invoiceNo: row.invoice_no,
    cashAmount: row.cash_amount,
    chequeAmount: row.cheque_amount,
    creditAmount: row.credit_amount,
    notes: row.notes,
    createdAt: row.created_at
  };
}

function mapInvoiceEntryDatabaseError(error: DatabaseErrorLike) {
  const detail = `${error.message} ${error.details ?? ""}`.toLowerCase();

  if (error.code === "23505") {
    if (detail.includes("unique_line")) {
      return errorResponse(409, "LINE_NO_ALREADY_EXISTS", "Another invoice entry already uses that line number.");
    }

    if (detail.includes("unique_invoice")) {
      return errorResponse(409, "INVOICE_NO_ALREADY_EXISTS", "Invoice numbers must be unique within a report.");
    }

    return errorResponse(409, "DUPLICATE_INVOICE_ENTRY", "This invoice entry conflicts with an existing row.");
  }

  if (error.code === "23514") {
    return errorResponse(
      422,
      "INVALID_INVOICE_ENTRY",
      "Invoice amounts must be non-negative, and at least one amount must be greater than zero."
    );
  }

  if (error.code === "P0001") {
    return errorResponse(409, "REPORT_NOT_EDITABLE", error.message);
  }

  if (error.code === "P0002") {
    return errorResponse(404, "REPORT_NOT_FOUND", error.message);
  }

  if (error.code === "42501") {
    return errorResponse(403, "FORBIDDEN", error.message);
  }

  return fromPostgrestError(error as Parameters<typeof fromPostgrestError>[0]);
}

async function getReportForRead(reportId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = (await supabase
    .from("daily_reports")
    .select("id, prepared_by, status, deleted_at")
    .eq("id", reportId)
    .is("deleted_at", null)
    .maybeSingle()) as {
    data: DailyReportAccessRow | null;
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

  return { data, response: null };
}

async function getEditableInvoiceReport(reportId: string, userId: string, role: string) {
  const report = await getReportForRead(reportId);

  if (report.response || !report.data) {
    return report;
  }

  if (role === "driver" && report.data.prepared_by !== userId) {
    return {
      data: null,
      response: errorResponse(403, "FORBIDDEN", "Drivers can only edit invoice entries on their own reports.")
    };
  }

  if (report.data.status !== "draft") {
    return {
      data: null,
      response: errorResponse(
        409,
        "REPORT_NOT_EDITABLE",
        "Invoice entries can only be changed while the daily report is in draft status."
      )
    };
  }

  return report;
}

async function getInvoiceEntryById(reportId: string, entryId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = (await supabase
    .from("report_invoice_entries")
    .select(INVOICE_ENTRY_SELECT)
    .eq("daily_report_id", reportId)
    .eq("id", entryId)
    .maybeSingle()) as {
    data: ReportInvoiceEntryRow | null;
    error: Parameters<typeof fromPostgrestError>[0] | null;
  };

  if (error) {
    return { data: null, response: fromPostgrestError(error) };
  }

  if (!data) {
    return {
      data: null,
      response: errorResponse(404, "INVOICE_ENTRY_NOT_FOUND", "Invoice entry not found.")
    };
  }

  return { data, response: null };
}

export class ReportInvoiceEntryService {
  static async listInvoiceEntries(reportId: string) {
    const auth = await requireAuth();
    if (auth.response) {
      return auth.response;
    }

    const parsedReportId = uuidSchema.safeParse(reportId);
    if (!parsedReportId.success) {
      return errorResponse(422, "INVALID_REPORT_ID", "A valid report id is required.");
    }

    const report = await getReportForRead(parsedReportId.data);
    if (report.response) {
      return report.response;
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = (await supabase
      .from("report_invoice_entries")
      .select(INVOICE_ENTRY_SELECT)
      .eq("daily_report_id", parsedReportId.data)
      .order("line_no", { ascending: true })) as {
      data: ReportInvoiceEntryRow[] | null;
      error: Parameters<typeof fromPostgrestError>[0] | null;
    };

    if (error) {
      return fromPostgrestError(error);
    }

    return successResponse({
      items: (data ?? []).map(mapInvoiceEntry)
    });
  }

  static async createInvoiceEntry(reportId: string, request: Request) {
    const auth = await requireAuth();
    if (auth.response || !auth.context) {
      return auth.response;
    }

    const parsedReportId = uuidSchema.safeParse(reportId);
    if (!parsedReportId.success) {
      return errorResponse(422, "INVALID_REPORT_ID", "A valid report id is required.");
    }

    const report = await getEditableInvoiceReport(
      parsedReportId.data,
      auth.context.user.id,
      auth.context.profile.role
    );

    if (report.response) {
      return report.response;
    }

    const body = await request.json().catch(() => null);
    const parsed = reportInvoiceEntryCreateSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse(422, "VALIDATION_ERROR", "Invalid invoice entry payload.", parsed.error.flatten());
    }

    const supabase = await createSupabaseServerClient();

    let lineNo = parsed.data.lineNo;
    if (lineNo === undefined) {
      const { data: lastRow, error: lastRowError } = (await supabase
        .from("report_invoice_entries")
        .select("line_no")
        .eq("daily_report_id", parsedReportId.data)
        .order("line_no", { ascending: false })
        .limit(1)
        .maybeSingle()) as {
        data: Pick<ReportInvoiceEntryRow, "line_no"> | null;
        error: Parameters<typeof fromPostgrestError>[0] | null;
      };

      if (lastRowError) {
        return fromPostgrestError(lastRowError);
      }

      lineNo = (lastRow?.line_no ?? 0) + 1;
    }

    const { data, error } = (await supabase
      .from("report_invoice_entries")
      .insert({
        daily_report_id: parsedReportId.data,
        line_no: lineNo,
        invoice_no: parsed.data.invoiceNo,
        cash_amount: parsed.data.cashAmount,
        cheque_amount: parsed.data.chequeAmount,
        credit_amount: parsed.data.creditAmount,
        notes: parsed.data.notes ?? null
      } as never)
      .select(INVOICE_ENTRY_SELECT)
      .single()) as {
      data: ReportInvoiceEntryRow | null;
      error: DatabaseErrorLike | null;
    };

    if (error) {
      return mapInvoiceEntryDatabaseError(error);
    }

    return successResponse(mapInvoiceEntry(data as ReportInvoiceEntryRow), { status: 201 });
  }

  static async updateInvoiceEntry(reportId: string, entryId: string, request: Request) {
    const auth = await requireAuth();
    if (auth.response || !auth.context) {
      return auth.response;
    }

    const parsedReportId = uuidSchema.safeParse(reportId);
    if (!parsedReportId.success) {
      return errorResponse(422, "INVALID_REPORT_ID", "A valid report id is required.");
    }

    const parsedEntryId = uuidSchema.safeParse(entryId);
    if (!parsedEntryId.success) {
      return errorResponse(422, "INVALID_INVOICE_ENTRY_ID", "A valid invoice entry id is required.");
    }

    const report = await getEditableInvoiceReport(
      parsedReportId.data,
      auth.context.user.id,
      auth.context.profile.role
    );

    if (report.response) {
      return report.response;
    }

    const existing = await getInvoiceEntryById(parsedReportId.data, parsedEntryId.data);
    if (existing.response) {
      return existing.response;
    }

    const body = await request.json().catch(() => null);
    const parsed = reportInvoiceEntryUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse(422, "VALIDATION_ERROR", "Invalid invoice entry payload.", parsed.error.flatten());
    }

    const nextValues = {
      cashAmount: parsed.data.cashAmount ?? existing.data!.cash_amount,
      chequeAmount: parsed.data.chequeAmount ?? existing.data!.cheque_amount,
      creditAmount: parsed.data.creditAmount ?? existing.data!.credit_amount
    };

    if (nextValues.cashAmount + nextValues.chequeAmount + nextValues.creditAmount <= 0) {
      return errorResponse(
        422,
        "VALIDATION_ERROR",
        "At least one payment amount must be greater than zero."
      );
    }

    const updatePayload: Record<string, unknown> = {};
    if (parsed.data.lineNo !== undefined) updatePayload.line_no = parsed.data.lineNo;
    if (parsed.data.invoiceNo !== undefined) updatePayload.invoice_no = parsed.data.invoiceNo;
    if (parsed.data.cashAmount !== undefined) updatePayload.cash_amount = parsed.data.cashAmount;
    if (parsed.data.chequeAmount !== undefined) updatePayload.cheque_amount = parsed.data.chequeAmount;
    if (parsed.data.creditAmount !== undefined) updatePayload.credit_amount = parsed.data.creditAmount;
    if (parsed.data.notes !== undefined) updatePayload.notes = parsed.data.notes ?? null;

    const supabase = await createSupabaseServerClient();
    const { data, error } = (await supabase
      .from("report_invoice_entries")
      .update(updatePayload as never)
      .eq("daily_report_id", parsedReportId.data)
      .eq("id", parsedEntryId.data)
      .select(INVOICE_ENTRY_SELECT)
      .single()) as {
      data: ReportInvoiceEntryRow | null;
      error: DatabaseErrorLike | null;
    };

    if (error) {
      return mapInvoiceEntryDatabaseError(error);
    }

    return successResponse(mapInvoiceEntry(data as ReportInvoiceEntryRow));
  }

  static async deleteInvoiceEntry(reportId: string, entryId: string) {
    const auth = await requireAuth();
    if (auth.response || !auth.context) {
      return auth.response;
    }

    const parsedReportId = uuidSchema.safeParse(reportId);
    if (!parsedReportId.success) {
      return errorResponse(422, "INVALID_REPORT_ID", "A valid report id is required.");
    }

    const parsedEntryId = uuidSchema.safeParse(entryId);
    if (!parsedEntryId.success) {
      return errorResponse(422, "INVALID_INVOICE_ENTRY_ID", "A valid invoice entry id is required.");
    }

    const report = await getEditableInvoiceReport(
      parsedReportId.data,
      auth.context.user.id,
      auth.context.profile.role
    );

    if (report.response) {
      return report.response;
    }

    const existing = await getInvoiceEntryById(parsedReportId.data, parsedEntryId.data);
    if (existing.response) {
      return existing.response;
    }

    const supabase = await createSupabaseServerClient();
    const { error } = (await supabase
      .from("report_invoice_entries")
      .delete()
      .eq("daily_report_id", parsedReportId.data)
      .eq("id", parsedEntryId.data)) as {
      error: DatabaseErrorLike | null;
    };

    if (error) {
      return mapInvoiceEntryDatabaseError(error);
    }

    return successResponse({
      id: parsedEntryId.data,
      deleted: true
    });
  }

  static async saveInvoiceEntryBatch(reportId: string, request: Request) {
    const auth = await requireAuth();
    if (auth.response || !auth.context) {
      return auth.response;
    }

    const parsedReportId = uuidSchema.safeParse(reportId);
    if (!parsedReportId.success) {
      return errorResponse(422, "INVALID_REPORT_ID", "A valid report id is required.");
    }

    const report = await getEditableInvoiceReport(
      parsedReportId.data,
      auth.context.user.id,
      auth.context.profile.role
    );

    if (report.response) {
      return report.response;
    }

    const body = await request.json().catch(() => null);
    const parsed = reportInvoiceEntryBatchSaveSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse(422, "VALIDATION_ERROR", "Invalid invoice batch payload.", parsed.error.flatten());
    }

    const payload = parsed.data.items.map((item, index) => ({
      id: item.id ?? null,
      lineNo: index + 1,
      invoiceNo: item.invoiceNo,
      cashAmount: item.cashAmount,
      chequeAmount: item.chequeAmount,
      creditAmount: item.creditAmount,
      notes: item.notes ?? null
    }));

    const supabase = await createSupabaseServerClient();
    const { data, error } = await (supabase as never as {
      rpc: (name: string, params: Record<string, unknown>) => Promise<{
        data: ReportInvoiceEntryRow[] | null;
        error: DatabaseErrorLike | null;
      }>;
    }).rpc("save_report_invoice_entries", {
      target_daily_report_id: parsedReportId.data,
      input_entries: payload
    });

    if (error) {
      return mapInvoiceEntryDatabaseError(error);
    }

    return successResponse({
      items: (data ?? []).map(mapInvoiceEntry)
    });
  }
}