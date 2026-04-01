import { requireAuth } from "@/lib/auth/helpers";
import { errorResponse, fromPostgrestError, successResponse } from "@/lib/db/response";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { uuidSchema } from "@/lib/validation/common";
import {
  reportExpenseEntryBatchSaveSchema,
  reportExpenseEntryCreateSchema,
  reportExpenseEntryUpdateSchema
} from "@/lib/validation/report-expense-entry";
import type { DailyReportExpenseEntryDto } from "@/types/domain/report";

type DailyReportAccessRow = {
  id: string;
  prepared_by: string;
  status: "draft" | "submitted" | "approved" | "rejected";
  deleted_at: string | null;
};

type ExpenseCategoryRow = {
  id: string;
  is_active: boolean;
};

type ReportExpenseEntryRow = {
  id: string;
  daily_report_id: string;
  line_no: number;
  expense_category_id: string | null;
  custom_expense_name: string | null;
  amount: number;
  notes: string | null;
  created_at: string;
};

type DatabaseErrorLike = {
  code?: string | null;
  message: string;
  details?: string | null;
};

const EXPENSE_ENTRY_SELECT = `
  id,
  daily_report_id,
  line_no,
  expense_category_id,
  custom_expense_name,
  amount,
  notes,
  created_at
`.replace(/\s+/g, " ").trim();

function mapExpenseEntry(row: ReportExpenseEntryRow): DailyReportExpenseEntryDto {
  return {
    id: row.id,
    lineNo: row.line_no,
    expenseCategoryId: row.expense_category_id,
    customExpenseName: row.custom_expense_name,
    amount: row.amount,
    notes: row.notes,
    createdAt: row.created_at
  };
}

function mapExpenseEntryDatabaseError(error: DatabaseErrorLike) {
  const detail = `${error.message} ${error.details ?? ""}`.toLowerCase();

  if (error.code === "23505") {
    if (detail.includes("unique_line")) {
      return errorResponse(409, "LINE_NO_ALREADY_EXISTS", "Another expense entry already uses that line number.");
    }

    return errorResponse(409, "DUPLICATE_EXPENSE_ENTRY", "This expense entry conflicts with an existing row.");
  }

  if (error.code === "23503") {
    return errorResponse(422, "EXPENSE_CATEGORY_NOT_FOUND", "The selected expense category does not exist.");
  }

  if (error.code === "23514") {
    return errorResponse(
      422,
      "INVALID_EXPENSE_ENTRY",
      "Each expense must have either a category or a custom name, and the amount must be non-negative."
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

async function getEditableExpenseReport(reportId: string, userId: string, role: string) {
  const report = await getReportForRead(reportId);

  if (report.response || !report.data) {
    return report;
  }

  if (role === "driver" && report.data.prepared_by !== userId) {
    return {
      data: null,
      response: errorResponse(403, "FORBIDDEN", "Drivers can only edit expense entries on their own reports.")
    };
  }

  if (report.data.status !== "draft") {
    return {
      data: null,
      response: errorResponse(
        409,
        "REPORT_NOT_EDITABLE",
        "Expense entries can only be changed while the daily report is in draft status."
      )
    };
  }

  return report;
}

async function ensureExpenseCategoryExists(expenseCategoryId: string | null | undefined) {
  if (!expenseCategoryId) {
    return null;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = (await supabase
    .from("expense_categories")
    .select("id, is_active")
    .eq("id", expenseCategoryId)
    .maybeSingle()) as {
    data: ExpenseCategoryRow | null;
    error: Parameters<typeof fromPostgrestError>[0] | null;
  };

  if (error) {
    return fromPostgrestError(error);
  }

  if (!data) {
    return errorResponse(422, "EXPENSE_CATEGORY_NOT_FOUND", "The selected expense category does not exist.");
  }

  if (!data.is_active) {
    return errorResponse(422, "EXPENSE_CATEGORY_INACTIVE", "The selected expense category is inactive.");
  }

  return null;
}

async function getExpenseEntryById(reportId: string, entryId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = (await supabase
    .from("report_expenses")
    .select(EXPENSE_ENTRY_SELECT)
    .eq("daily_report_id", reportId)
    .eq("id", entryId)
    .maybeSingle()) as {
    data: ReportExpenseEntryRow | null;
    error: Parameters<typeof fromPostgrestError>[0] | null;
  };

  if (error) {
    return { data: null, response: fromPostgrestError(error) };
  }

  if (!data) {
    return {
      data: null,
      response: errorResponse(404, "EXPENSE_ENTRY_NOT_FOUND", "Expense entry not found.")
    };
  }

  return { data, response: null };
}

function validateResolvedExpenseSource(expenseCategoryId: string | null, customExpenseName: string | null) {
  if (expenseCategoryId || customExpenseName) {
    return null;
  }

  return errorResponse(
    422,
    "VALIDATION_ERROR",
    "Either expenseCategoryId or customExpenseName is required."
  );
}

export class ReportExpenseEntryService {
  static async listExpenseEntries(reportId: string) {
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
      .from("report_expenses")
      .select(EXPENSE_ENTRY_SELECT)
      .eq("daily_report_id", parsedReportId.data)
      .order("line_no", { ascending: true })) as {
      data: ReportExpenseEntryRow[] | null;
      error: Parameters<typeof fromPostgrestError>[0] | null;
    };

    if (error) {
      return fromPostgrestError(error);
    }

    return successResponse({
      items: (data ?? []).map(mapExpenseEntry)
    });
  }

  static async createExpenseEntry(reportId: string, request: Request) {
    const auth = await requireAuth();
    if (auth.response || !auth.context) {
      return auth.response;
    }

    const parsedReportId = uuidSchema.safeParse(reportId);
    if (!parsedReportId.success) {
      return errorResponse(422, "INVALID_REPORT_ID", "A valid report id is required.");
    }

    const report = await getEditableExpenseReport(
      parsedReportId.data,
      auth.context.user.id,
      auth.context.profile.role
    );

    if (report.response) {
      return report.response;
    }

    const body = await request.json().catch(() => null);
    const parsed = reportExpenseEntryCreateSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse(422, "VALIDATION_ERROR", "Invalid expense entry payload.", parsed.error.flatten());
    }

    const categoryError = await ensureExpenseCategoryExists(parsed.data.expenseCategoryId ?? null);
    if (categoryError) {
      return categoryError;
    }

    const supabase = await createSupabaseServerClient();

    let lineNo = parsed.data.lineNo;
    if (lineNo === undefined) {
      const { data: lastRow, error: lastRowError } = (await supabase
        .from("report_expenses")
        .select("line_no")
        .eq("daily_report_id", parsedReportId.data)
        .order("line_no", { ascending: false })
        .limit(1)
        .maybeSingle()) as {
        data: Pick<ReportExpenseEntryRow, "line_no"> | null;
        error: Parameters<typeof fromPostgrestError>[0] | null;
      };

      if (lastRowError) {
        return fromPostgrestError(lastRowError);
      }

      lineNo = (lastRow?.line_no ?? 0) + 1;
    }

    const { data, error } = (await supabase
      .from("report_expenses")
      .insert({
        daily_report_id: parsedReportId.data,
        line_no: lineNo,
        expense_category_id: parsed.data.expenseCategoryId ?? null,
        custom_expense_name: parsed.data.customExpenseName ?? null,
        amount: parsed.data.amount,
        notes: parsed.data.notes ?? null
      } as never)
      .select(EXPENSE_ENTRY_SELECT)
      .single()) as {
      data: ReportExpenseEntryRow | null;
      error: DatabaseErrorLike | null;
    };

    if (error) {
      return mapExpenseEntryDatabaseError(error);
    }

    return successResponse(mapExpenseEntry(data as ReportExpenseEntryRow), { status: 201 });
  }

  static async updateExpenseEntry(reportId: string, entryId: string, request: Request) {
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
      return errorResponse(422, "INVALID_EXPENSE_ENTRY_ID", "A valid expense entry id is required.");
    }

    const report = await getEditableExpenseReport(
      parsedReportId.data,
      auth.context.user.id,
      auth.context.profile.role
    );

    if (report.response) {
      return report.response;
    }

    const existing = await getExpenseEntryById(parsedReportId.data, parsedEntryId.data);
    if (existing.response) {
      return existing.response;
    }

    const body = await request.json().catch(() => null);
    const parsed = reportExpenseEntryUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse(422, "VALIDATION_ERROR", "Invalid expense entry payload.", parsed.error.flatten());
    }

    const resolvedExpenseCategoryId = parsed.data.expenseCategoryId !== undefined
      ? parsed.data.expenseCategoryId ?? null
      : existing.data!.expense_category_id;

    const resolvedCustomExpenseName = parsed.data.customExpenseName !== undefined
      ? parsed.data.customExpenseName ?? null
      : existing.data!.custom_expense_name;

    const sourceError = validateResolvedExpenseSource(resolvedExpenseCategoryId, resolvedCustomExpenseName);
    if (sourceError) {
      return sourceError;
    }

    const categoryError = await ensureExpenseCategoryExists(resolvedExpenseCategoryId);
    if (categoryError) {
      return categoryError;
    }

    const updatePayload: Record<string, unknown> = {};
    if (parsed.data.lineNo !== undefined) updatePayload.line_no = parsed.data.lineNo;
    if (parsed.data.expenseCategoryId !== undefined) updatePayload.expense_category_id = parsed.data.expenseCategoryId ?? null;
    if (parsed.data.customExpenseName !== undefined) updatePayload.custom_expense_name = parsed.data.customExpenseName ?? null;
    if (parsed.data.amount !== undefined) updatePayload.amount = parsed.data.amount;
    if (parsed.data.notes !== undefined) updatePayload.notes = parsed.data.notes ?? null;

    const supabase = await createSupabaseServerClient();
    const { data, error } = (await supabase
      .from("report_expenses")
      .update(updatePayload as never)
      .eq("daily_report_id", parsedReportId.data)
      .eq("id", parsedEntryId.data)
      .select(EXPENSE_ENTRY_SELECT)
      .single()) as {
      data: ReportExpenseEntryRow | null;
      error: DatabaseErrorLike | null;
    };

    if (error) {
      return mapExpenseEntryDatabaseError(error);
    }

    return successResponse(mapExpenseEntry(data as ReportExpenseEntryRow));
  }

  static async deleteExpenseEntry(reportId: string, entryId: string) {
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
      return errorResponse(422, "INVALID_EXPENSE_ENTRY_ID", "A valid expense entry id is required.");
    }

    const report = await getEditableExpenseReport(
      parsedReportId.data,
      auth.context.user.id,
      auth.context.profile.role
    );

    if (report.response) {
      return report.response;
    }

    const existing = await getExpenseEntryById(parsedReportId.data, parsedEntryId.data);
    if (existing.response) {
      return existing.response;
    }

    const supabase = await createSupabaseServerClient();
    const { error } = (await supabase
      .from("report_expenses")
      .delete()
      .eq("daily_report_id", parsedReportId.data)
      .eq("id", parsedEntryId.data)) as {
      error: DatabaseErrorLike | null;
    };

    if (error) {
      return mapExpenseEntryDatabaseError(error);
    }

    return successResponse({
      id: parsedEntryId.data,
      deleted: true
    });
  }

  static async saveExpenseEntryBatch(reportId: string, request: Request) {
    const auth = await requireAuth();
    if (auth.response || !auth.context) {
      return auth.response;
    }

    const parsedReportId = uuidSchema.safeParse(reportId);
    if (!parsedReportId.success) {
      return errorResponse(422, "INVALID_REPORT_ID", "A valid report id is required.");
    }

    const report = await getEditableExpenseReport(
      parsedReportId.data,
      auth.context.user.id,
      auth.context.profile.role
    );

    if (report.response) {
      return report.response;
    }

    const body = await request.json().catch(() => null);
    const parsed = reportExpenseEntryBatchSaveSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse(422, "VALIDATION_ERROR", "Invalid expense batch payload.", parsed.error.flatten());
    }

    for (const item of parsed.data.items) {
      const categoryError = await ensureExpenseCategoryExists(item.expenseCategoryId ?? null);
      if (categoryError) {
        return categoryError;
      }
    }

    const payload = parsed.data.items.map((item, index) => ({
      id: item.id ?? null,
      lineNo: index + 1,
      expenseCategoryId: item.expenseCategoryId ?? null,
      customExpenseName: item.customExpenseName ?? null,
      amount: item.amount,
      notes: item.notes ?? null
    }));

    const supabase = await createSupabaseServerClient();
    const { data, error } = await (supabase as never as {
      rpc: (name: string, params: Record<string, unknown>) => Promise<{
        data: ReportExpenseEntryRow[] | null;
        error: DatabaseErrorLike | null;
      }>;
    }).rpc("save_report_expenses", {
      target_daily_report_id: parsedReportId.data,
      input_entries: payload
    });

    if (error) {
      return mapExpenseEntryDatabaseError(error);
    }

    return successResponse({
      items: (data ?? []).map(mapExpenseEntry)
    });
  }
}