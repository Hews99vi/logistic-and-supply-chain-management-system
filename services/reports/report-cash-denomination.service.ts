import { requireAuth } from "@/lib/auth/helpers";
import { errorResponse, fromPostgrestError, successResponse } from "@/lib/db/response";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { uuidSchema } from "@/lib/validation/common";
import {
  reportCashDenominationBatchSaveSchema,
  reportCashDenominationUpdateSchema
} from "@/lib/validation/report-cash-denomination";
import type { DailyReportCashDenominationDto } from "@/types/domain/report";

type DailyReportAccessRow = {
  id: string;
  prepared_by: string;
  status: "draft" | "submitted" | "approved" | "rejected";
  deleted_at: string | null;
};

type ReportCashDenominationRow = {
  id: string;
  daily_report_id: string;
  denomination_value: number;
  note_count: number;
  line_total: number;
  created_at: string;
};

type DatabaseErrorLike = {
  code?: string | null;
  message: string;
  details?: string | null;
};

const CASH_DENOMINATION_SELECT = `
  id,
  daily_report_id,
  denomination_value,
  note_count,
  line_total,
  created_at
`.replace(/\s+/g, " ").trim();

function mapCashDenomination(row: ReportCashDenominationRow): DailyReportCashDenominationDto {
  return {
    id: row.id,
    denominationValue: row.denomination_value,
    noteCount: row.note_count,
    lineTotal: row.line_total,
    createdAt: row.created_at
  };
}

function mapCashDenominationDatabaseError(error: DatabaseErrorLike) {
  const detail = `${error.message} ${error.details ?? ""}`.toLowerCase();

  if (error.code === "23505") {
    return errorResponse(409, "DUPLICATE_DENOMINATION", "A denomination row already exists for this value.");
  }

  if (error.code === "23514") {
    return errorResponse(422, "INVALID_NOTE_COUNT", "noteCount must be a non-negative whole number.");
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

  if (detail.includes("not found")) {
    return errorResponse(404, "CASH_DENOMINATION_NOT_FOUND", error.message);
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

async function getEditableCashDenominationReport(reportId: string, userId: string, role: string) {
  const report = await getReportForRead(reportId);

  if (report.response || !report.data) {
    return report;
  }

  if (role === "driver" && report.data.prepared_by !== userId) {
    return {
      data: null,
      response: errorResponse(403, "FORBIDDEN", "Drivers can only edit cash denominations on their own reports.")
    };
  }

  if (report.data.status !== "draft") {
    return {
      data: null,
      response: errorResponse(
        409,
        "REPORT_NOT_EDITABLE",
        "Cash denominations can only be changed while the daily report is in draft status."
      )
    };
  }

  return report;
}

async function ensureCashDenominationsSeeded(reportId: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await (supabase as never as {
    rpc: (name: string, params: Record<string, unknown>) => Promise<{
      data: null;
      error: DatabaseErrorLike | null;
    }>;
  }).rpc("seed_default_report_cash_denominations", {
    target_daily_report_id: reportId
  });

  if (error) {
    return mapCashDenominationDatabaseError(error);
  }

  return null;
}

async function getCashDenominationById(reportId: string, entryId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = (await supabase
    .from("report_cash_denominations")
    .select(CASH_DENOMINATION_SELECT)
    .eq("daily_report_id", reportId)
    .eq("id", entryId)
    .maybeSingle()) as {
    data: ReportCashDenominationRow | null;
    error: Parameters<typeof fromPostgrestError>[0] | null;
  };

  if (error) {
    return { data: null, response: fromPostgrestError(error) };
  }

  if (!data) {
    return {
      data: null,
      response: errorResponse(404, "CASH_DENOMINATION_NOT_FOUND", "Cash denomination row not found.")
    };
  }

  return { data, response: null };
}

export class ReportCashDenominationService {
  static async listCashDenominations(reportId: string) {
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

    const seedError = await ensureCashDenominationsSeeded(parsedReportId.data);
    if (seedError) {
      return seedError;
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = (await supabase
      .from("report_cash_denominations")
      .select(CASH_DENOMINATION_SELECT)
      .eq("daily_report_id", parsedReportId.data)
      .order("denomination_value", { ascending: false })) as {
      data: ReportCashDenominationRow[] | null;
      error: Parameters<typeof fromPostgrestError>[0] | null;
    };

    if (error) {
      return fromPostgrestError(error);
    }

    return successResponse({
      items: (data ?? []).map(mapCashDenomination)
    });
  }

  static async updateCashDenomination(reportId: string, entryId: string, request: Request) {
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
      return errorResponse(422, "INVALID_CASH_DENOMINATION_ID", "A valid cash denomination id is required.");
    }

    const report = await getEditableCashDenominationReport(
      parsedReportId.data,
      auth.context.user.id,
      auth.context.profile.role
    );

    if (report.response) {
      return report.response;
    }

    const seedError = await ensureCashDenominationsSeeded(parsedReportId.data);
    if (seedError) {
      return seedError;
    }

    const existing = await getCashDenominationById(parsedReportId.data, parsedEntryId.data);
    if (existing.response) {
      return existing.response;
    }

    const body = await request.json().catch(() => null);
    const parsed = reportCashDenominationUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse(422, "VALIDATION_ERROR", "Invalid cash denomination payload.", parsed.error.flatten());
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = (await supabase
      .from("report_cash_denominations")
      .update({
        note_count: parsed.data.noteCount
      } as never)
      .eq("daily_report_id", parsedReportId.data)
      .eq("id", parsedEntryId.data)
      .select(CASH_DENOMINATION_SELECT)
      .single()) as {
      data: ReportCashDenominationRow | null;
      error: DatabaseErrorLike | null;
    };

    if (error) {
      return mapCashDenominationDatabaseError(error);
    }

    return successResponse(mapCashDenomination(data as ReportCashDenominationRow));
  }

  static async saveCashDenominationsBatch(reportId: string, request: Request) {
    const auth = await requireAuth();
    if (auth.response || !auth.context) {
      return auth.response;
    }

    const parsedReportId = uuidSchema.safeParse(reportId);
    if (!parsedReportId.success) {
      return errorResponse(422, "INVALID_REPORT_ID", "A valid report id is required.");
    }

    const report = await getEditableCashDenominationReport(
      parsedReportId.data,
      auth.context.user.id,
      auth.context.profile.role
    );

    if (report.response) {
      return report.response;
    }

    const seedError = await ensureCashDenominationsSeeded(parsedReportId.data);
    if (seedError) {
      return seedError;
    }

    const body = await request.json().catch(() => null);
    const parsed = reportCashDenominationBatchSaveSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse(422, "VALIDATION_ERROR", "Invalid cash denomination batch payload.", parsed.error.flatten());
    }

    const payload = parsed.data.items.map((item) => ({
      denominationValue: item.denominationValue,
      noteCount: item.noteCount
    }));

    const supabase = await createSupabaseServerClient();
    const { data, error } = await (supabase as never as {
      rpc: (name: string, params: Record<string, unknown>) => Promise<{
        data: ReportCashDenominationRow[] | null;
        error: DatabaseErrorLike | null;
      }>;
    }).rpc("save_report_cash_denominations", {
      target_daily_report_id: parsedReportId.data,
      input_entries: payload
    });

    if (error) {
      return mapCashDenominationDatabaseError(error);
    }

    return successResponse({
      items: (data ?? []).map(mapCashDenomination)
    });
  }
}