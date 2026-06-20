import { z } from "zod";

import { requireAppAccess } from "@/lib/auth/helpers";
import { errorResponse, fromPostgrestError, successResponse } from "@/lib/db/response";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { uuidSchema } from "@/lib/validation/common";

const payrollCreateSchema = z.object({
  driverId: uuidSchema,
  periodStart: z.string().trim().min(1),
  periodEnd: z.string().trim().min(1),
  advances: z.coerce.number().finite().nonnegative().optional()
});

async function requirePayrollAccess() {
  const auth = await requireAppAccess();
  if (auth.response || !auth.context?.organization) {
    return { auth: null, response: auth.response ?? errorResponse(403, "FORBIDDEN", "Organization access is required.") };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await (supabase as never as {
    rpc: (name: string, params: Record<string, unknown>) => Promise<{ data: boolean | null; error: { message: string } | null }>;
  }).rpc("user_has_feature_permission", {
    feature_key: "daily_reports",
    action_key: "approve",
    target_org_id: auth.context.organization.id
  });

  if (error || !data) {
    return { auth: null, response: errorResponse(403, "FORBIDDEN", error?.message ?? "Missing payroll permission.") };
  }

  return { auth, response: null };
}

export class PayrollService {
  static async listPeriods() {
    const access = await requirePayrollAccess();
    if (access.response) return access.response;
    if (!access.auth?.context?.organization) return errorResponse(403, "FORBIDDEN", "Organization access is required.");

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("driver_payroll_periods")
      .select("*")
      .eq("organization_id", access.auth.context.organization.id)
      .order("period_start", { ascending: false });

    if (error) return fromPostgrestError(error);
    return successResponse({ items: data ?? [] });
  }

  static async createPeriod(request: Request) {
    const access = await requirePayrollAccess();
    if (access.response) return access.response;
    if (!access.auth?.context?.organization) return errorResponse(403, "FORBIDDEN", "Organization access is required.");

    const parsed = payrollCreateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return errorResponse(422, "VALIDATION_ERROR", "Validation failed.", parsed.error.flatten());
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = await (supabase as never as {
      from: (name: string) => {
        insert: (values: Record<string, unknown>) => {
          select: (columns: string) => { single: () => Promise<{ data: unknown; error: Parameters<typeof fromPostgrestError>[0] | null }> };
        };
      };
    })
      .from("driver_payroll_periods")
      .insert({
        organization_id: access.auth.context.organization.id,
        driver_id: parsed.data.driverId,
        period_start: parsed.data.periodStart,
        period_end: parsed.data.periodEnd,
        advances: parsed.data.advances ?? 0
      })
      .select("*")
      .single();

    if (error) return fromPostgrestError(error);
    return successResponse(data);
  }

  static async finalizePeriod(periodId: string) {
    const parsed = uuidSchema.safeParse(periodId);
    if (!parsed.success) {
      return errorResponse(422, "INVALID_ID", "A valid payroll period id is required.");
    }

    const access = await requirePayrollAccess();
    if (access.response) return access.response;

    const supabase = await createSupabaseServerClient();
    const { data, error } = await (supabase as never as {
      rpc: (name: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: Parameters<typeof fromPostgrestError>[0] | null }>;
    }).rpc("finalize_driver_payroll_period", {
      target_period_id: parsed.data
    });

    if (error) return fromPostgrestError(error);
    return successResponse(data);
  }
}
