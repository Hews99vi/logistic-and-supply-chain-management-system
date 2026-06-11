import { z } from "zod";

import { requireFeaturePermission } from "@/lib/auth/permissions";
import { errorResponse, fromPostgrestError, successResponse } from "@/lib/db/response";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { uuidSchema } from "@/lib/validation/common";

const invoiceItemSchema = z.object({
  invoiceNo: z.string().min(1),
  cashAmount: z.number().nonnegative().default(0),
  chequeAmount: z.number().nonnegative().default(0),
  creditAmount: z.number().nonnegative().default(0),
  notes: z.string().optional()
});

const inventorySalesItemSchema = z.object({
  productId: uuidSchema,
  salesQty: z.number().int().min(0),
  salesRevenue: z.number().nonnegative(),
  costedSalesQty: z.number().int().min(0)
}).superRefine((value, ctx) => {
  if (value.costedSalesQty > value.salesQty) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["costedSalesQty"],
      message: "Costed sales quantity cannot exceed sales quantity."
    });
  }
});

const returnDamageItemSchema = z.object({
  productId: uuidSchema,
  invoiceNo: z.string().optional(),
  shopName: z.string().optional(),
  damageQty: z.number().int().min(0).default(0),
  returnQty: z.number().int().min(0).default(0),
  freeIssueQty: z.number().int().min(0).default(0),
  notes: z.string().optional()
});

const flatDataImportSchema = z.object({
  invoiceEntries: z.array(invoiceItemSchema).max(5000),
  inventorySales: z.array(inventorySalesItemSchema).max(1000),
  returnDamageEntries: z.array(returnDamageItemSchema).max(5000),
  deliveredBillCount: z.number().int().min(0),
  allowOverwrite: z.boolean().default(false)
});

function mapImportError(error: { code?: string | null; message: string; details?: string | null }) {
  if (error.code === "42501") {
    return errorResponse(403, "FORBIDDEN", error.message);
  }

  if (error.code === "P0002") {
    return errorResponse(404, "REPORT_NOT_FOUND", error.message);
  }

  if (error.code === "P0001") {
    return errorResponse(409, "IMPORT_BLOCKED", error.message);
  }

  if (error.code === "23503" || error.code === "23514" || error.code === "22023") {
    return errorResponse(422, "IMPORT_VALIDATION_FAILED", error.message);
  }

  return fromPostgrestError(error as Parameters<typeof fromPostgrestError>[0]);
}

export class FlatDataImportService {
  static async importReport(reportId: string, request: Request) {
    const auth = await requireFeaturePermission("date_sheet", "import");
    if (auth.response || !auth.context) {
      return auth.response;
    }

    const parsedReportId = uuidSchema.safeParse(reportId);
    if (!parsedReportId.success) {
      return errorResponse(422, "INVALID_REPORT_ID", "A valid report id is required.");
    }

    const body = await request.json().catch(() => null);
    const parsed = flatDataImportSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse(422, "VALIDATION_ERROR", "Invalid Flat Data import payload.", parsed.error.flatten());
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = await (supabase as never as {
      rpc: (name: string, params: Record<string, unknown>) => Promise<{
        data: unknown;
        error: { code?: string | null; message: string; details?: string | null } | null;
      }>;
    }).rpc("import_flat_data_report", {
      target_daily_report_id: parsedReportId.data,
      input_invoice_entries: parsed.data.invoiceEntries,
      input_inventory_sales: parsed.data.inventorySales,
      input_return_damage_entries: parsed.data.returnDamageEntries,
      input_delivered_bill_count: parsed.data.deliveredBillCount,
      allow_overwrite: parsed.data.allowOverwrite
    });

    if (error) {
      return mapImportError(error);
    }

    return successResponse(data);
  }
}
