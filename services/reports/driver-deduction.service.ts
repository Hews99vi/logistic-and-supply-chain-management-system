import { z } from "zod";

import { requireFeaturePermission } from "@/lib/auth/permissions";
import { errorResponse, fromPostgrestError, successResponse } from "@/lib/db/response";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { uuidSchema } from "@/lib/validation/common";

const resolveDriverDeductionSchema = z.object({
  status: z.enum(["approved", "waived", "settled"]),
  reason: z.string().trim().max(500).optional()
});

export class DriverDeductionService {
  static async resolveDeduction(deductionId: string, request: Request) {
    const auth = await requireFeaturePermission("daily_reports", "approve");
    if (auth.response || !auth.context) {
      return auth.response;
    }

    const parsedId = uuidSchema.safeParse(deductionId);
    if (!parsedId.success) {
      return errorResponse(422, "INVALID_DEDUCTION_ID", "A valid driver deduction id is required.");
    }

    const body = await request.json().catch(() => null);
    const parsed = resolveDriverDeductionSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(422, "VALIDATION_ERROR", "Invalid driver deduction resolution payload.", parsed.error.flatten());
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = await (supabase as never as {
      rpc: (name: string, params: Record<string, unknown>) => Promise<{
        data: unknown;
        error: { code?: string | null; message: string; details?: string | null } | null;
      }>;
    }).rpc("resolve_driver_deduction", {
      target_deduction_id: parsedId.data,
      target_status: parsed.data.status,
      resolution_reason: parsed.data.reason ?? null
    });

    if (error) {
      if (error.code === "42501") {
        return errorResponse(403, "FORBIDDEN", error.message);
      }

      if (error.code === "P0002") {
        return errorResponse(404, "DRIVER_DEDUCTION_NOT_FOUND", error.message);
      }

      if (error.code === "23514") {
        return errorResponse(422, "DRIVER_DEDUCTION_INVALID_STATUS", error.message);
      }

      return fromPostgrestError(error as Parameters<typeof fromPostgrestError>[0]);
    }

    return successResponse(data);
  }
}
