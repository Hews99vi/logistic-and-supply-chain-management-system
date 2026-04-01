import { requireAuth } from "@/lib/auth/helpers";
import { errorResponse, fromPostgrestError, successResponse } from "@/lib/db/response";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { uuidSchema } from "@/lib/validation/common";
import type { DailyReportAuditEventDto } from "@/types/domain/report";

type DailyReportAccessRow = {
  id: string;
  deleted_at: string | null;
};

type AuditRpcRow = {
  id: string;
  table_name: string;
  record_id: string;
  action_type: "INSERT" | "UPDATE" | "DELETE";
  old_data: unknown;
  new_data: unknown;
  changed_by: string | null;
  changed_at: string;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
};

function mapSection(tableName: string) {
  switch (tableName) {
    case "daily_reports":
      return "Report";
    case "report_invoice_entries":
      return "Invoices";
    case "report_expenses":
      return "Expenses";
    case "report_cash_denominations":
      return "Cash Check";
    case "report_inventory_entries":
      return "Inventory";
    case "report_return_damage_entries":
      return "Returns & Damage";
    default:
      return tableName;
  }
}

function mapSummary(row: AuditRpcRow, actorName: string | null) {
  const actorLabel = actorName ?? "System";
  const section = mapSection(row.table_name);

  if (row.action_type === "INSERT") {
    return `${actorLabel} added a new ${section.toLowerCase()} entry.`;
  }

  if (row.action_type === "DELETE") {
    return `${actorLabel} removed a ${section.toLowerCase()} entry.`;
  }

  return `${actorLabel} updated ${section.toLowerCase()} details.`;
}

async function getReportForRead(reportId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = (await supabase
    .from("daily_reports")
    .select("id, deleted_at")
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

export class ReportAuditService {
  static async listReportAuditTrail(reportId: string) {
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
    const { data, error } = await (supabase as never as {
      rpc: (name: string, params: Record<string, unknown>) => Promise<{
        data: AuditRpcRow[] | null;
        error: Parameters<typeof fromPostgrestError>[0] | null;
      }>;
    }).rpc("get_report_audit_history", {
      target_report_id: parsedReportId.data
    });

    if (error) {
      return fromPostgrestError(error);
    }

    const rows = data ?? [];
    const actorIds = Array.from(new Set(rows.map((row) => row.changed_by).filter((id): id is string => Boolean(id))));

    let actorMap = new Map<string, string | null>();

    if (actorIds.length > 0) {
      const { data: profiles, error: profilesError } = (await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", actorIds)) as {
        data: ProfileRow[] | null;
        error: Parameters<typeof fromPostgrestError>[0] | null;
      };

      if (profilesError) {
        return fromPostgrestError(profilesError);
      }

      actorMap = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name]));
    }

    const items: DailyReportAuditEventDto[] = rows.map((row) => {
      const actorName = row.changed_by ? (actorMap.get(row.changed_by) ?? null) : null;

      return {
        id: row.id,
        timestamp: row.changed_at,
        actorId: row.changed_by,
        actorName,
        action: row.action_type,
        tableName: row.table_name,
        section: mapSection(row.table_name),
        summary: mapSummary(row, actorName),
        oldData: row.old_data,
        newData: row.new_data
      };
    });

    return successResponse({ items });
  }
}
