import { errorResponse, successResponse } from "@/lib/db/response";
import { requireAuth } from "@/lib/auth/helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type DailyReportWorkflowRecord = {
  id: string;
  status: "draft" | "submitted" | "approved" | "rejected";
  rejection_reason: string | null;
  submitted_at: string | null;
  submitted_by: string | null;
  approved_at: string | null;
  approved_by: string | null;
  rejected_at: string | null;
  rejected_by: string | null;
  updated_at: string;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function mapDatabaseError(error: { message: string; code?: string | null }) {
  switch (error.code) {
    case "42501":
      return errorResponse(403, "FORBIDDEN", error.message);
    case "P0002":
      return errorResponse(404, "REPORT_NOT_FOUND", error.message);
    case "23514":
      return errorResponse(422, "WORKFLOW_CONSTRAINT_VIOLATION", error.message);
    case "P0001":
      return errorResponse(409, "INVALID_STATE_TRANSITION", error.message);
    default:
      return errorResponse(400, error.code ?? "WORKFLOW_ERROR", error.message);
  }
}

async function runWorkflowRpc(fn: string, args: Record<string, unknown>) {
  const auth = await requireAuth();
  if (auth.response) {
    return auth.response;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await (supabase as never as {
    rpc: (name: string, params: Record<string, unknown>) => Promise<{
      data: DailyReportWorkflowRecord | null;
      error: { message: string; code?: string | null } | null;
    }>;
  }).rpc(fn, args);

  if (error) {
    return mapDatabaseError(error);
  }

  return successResponse<DailyReportWorkflowRecord>(data as DailyReportWorkflowRecord);
}

export class DailyReportWorkflowService {
  static async submit(reportId: string) {
    if (!isUuid(reportId)) {
      return errorResponse(422, "INVALID_REPORT_ID", "A valid report id is required.");
    }

    return runWorkflowRpc("submit_daily_report", { target_report_id: reportId });
  }

  static async approve(reportId: string) {
    if (!isUuid(reportId)) {
      return errorResponse(422, "INVALID_REPORT_ID", "A valid report id is required.");
    }

    return runWorkflowRpc("approve_daily_report", { target_report_id: reportId });
  }

  static async reject(reportId: string, reason: string) {
    if (!isUuid(reportId)) {
      return errorResponse(422, "INVALID_REPORT_ID", "A valid report id is required.");
    }

    if (!reason.trim()) {
      return errorResponse(422, "REJECTION_REASON_REQUIRED", "Rejection reason is required.");
    }

    return runWorkflowRpc("reject_daily_report", {
      target_report_id: reportId,
      reason
    });
  }

  static async reopen(reportId: string) {
    if (!isUuid(reportId)) {
      return errorResponse(422, "INVALID_REPORT_ID", "A valid report id is required.");
    }

    return runWorkflowRpc("reopen_daily_report", { target_report_id: reportId });
  }
}
