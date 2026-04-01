import { requireAuth } from "@/lib/auth/helpers";
import { errorResponse, fromPostgrestError, successResponse } from "@/lib/db/response";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { uuidSchema } from "@/lib/validation/common";
import {
  reportReturnDamageEntryBatchSaveSchema,
  reportReturnDamageEntryCreateSchema,
  reportReturnDamageEntryUpdateSchema
} from "@/lib/validation/report-return-damage-entry";
import type { DailyReportReturnDamageEntryDto } from "@/types/domain/report";

type DailyReportAccessRow = {
  id: string;
  prepared_by: string;
  status: "draft" | "submitted" | "approved" | "rejected";
  deleted_at: string | null;
};

type ProductSnapshotRow = {
  id: string;
  product_code: string;
  product_name: string;
  display_name: string | null;
  unit_price: number;
  brand: string | null;
  product_family: string;
  variant: string | null;
  unit_size: number | null;
  unit_measure: string | null;
  pack_size: number | null;
  selling_unit: string | null;
  quantity_entry_mode: "pack" | "unit" | null;
  is_active: boolean;
};

type ReportReturnDamageEntryRow = {
  id: string;
  daily_report_id: string;
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
};

type DatabaseErrorLike = {
  code?: string | null;
  message: string;
  details?: string | null;
};

const RETURN_DAMAGE_ENTRY_SELECT = `
  id,
  daily_report_id,
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
`.replace(/\s+/g, " ").trim();

function mapReturnDamageEntry(row: ReportReturnDamageEntryRow): DailyReportReturnDamageEntryDto {
  return {
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
  };
}

function buildProductSnapshotPayload(product: ProductSnapshotRow) {
  return {
    product_code_snapshot: product.product_code,
    product_name_snapshot: product.product_name,
    product_display_name_snapshot: product.display_name ?? product.product_name,
    brand_snapshot: product.brand,
    product_family_snapshot: product.product_family,
    variant_snapshot: product.variant,
    unit_size_snapshot: product.unit_size,
    unit_measure_snapshot: product.unit_measure,
    pack_size_snapshot: product.pack_size,
    selling_unit_snapshot: product.selling_unit,
    quantity_entry_mode_snapshot: product.quantity_entry_mode ?? (product.selling_unit?.toLowerCase() === "unit" ? "unit" : "pack"),
    unit_price_snapshot: product.unit_price
  };
}

function mapReturnDamageEntryDatabaseError(error: DatabaseErrorLike) {
  if (error.code === "23503") {
    return errorResponse(422, "PRODUCT_NOT_FOUND", "The selected product does not exist.");
  }

  if (error.code === "23514") {
    return errorResponse(
      422,
      "INVALID_RETURN_DAMAGE_ENTRY",
      "Quantities must be non-negative, and at least one of damageQty, returnQty, or freeIssueQty must be greater than zero."
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

async function getEditableReturnDamageReport(reportId: string, userId: string, role: string) {
  const report = await getReportForRead(reportId);

  if (report.response || !report.data) {
    return report;
  }

  if (role === "driver" && report.data.prepared_by !== userId) {
    return {
      data: null,
      response: errorResponse(403, "FORBIDDEN", "Drivers can only edit return and damage entries on their own reports.")
    };
  }

  if (report.data.status !== "draft") {
    return {
      data: null,
      response: errorResponse(
        409,
        "REPORT_NOT_EDITABLE",
        "Return and damage entries can only be changed while the daily report is in draft status."
      )
    };
  }

  return report;
}

async function ensureProductExists(productId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = (await supabase
    .from("products")
    .select("id, product_code, product_name, display_name, unit_price, brand, product_family, variant, unit_size, unit_measure, pack_size, selling_unit, quantity_entry_mode, is_active")
    .eq("id", productId)
    .maybeSingle()) as {
    data: ProductSnapshotRow | null;
    error: Parameters<typeof fromPostgrestError>[0] | null;
  };

  if (error) {
    return { data: null, response: fromPostgrestError(error) };
  }

  if (!data) {
    return {
      data: null,
      response: errorResponse(422, "PRODUCT_NOT_FOUND", "The selected product does not exist.")
    };
  }

  if (!data.is_active) {
    return {
      data: null,
      response: errorResponse(422, "PRODUCT_INACTIVE", "The selected product is inactive.")
    };
  }

  return { data, response: null };
}

async function getReturnDamageEntryById(reportId: string, entryId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = (await supabase
    .from("report_return_damage_entries")
    .select(RETURN_DAMAGE_ENTRY_SELECT)
    .eq("daily_report_id", reportId)
    .eq("id", entryId)
    .maybeSingle()) as {
    data: ReportReturnDamageEntryRow | null;
    error: Parameters<typeof fromPostgrestError>[0] | null;
  };

  if (error) {
    return { data: null, response: fromPostgrestError(error) };
  }

  if (!data) {
    return {
      data: null,
      response: errorResponse(404, "RETURN_DAMAGE_ENTRY_NOT_FOUND", "Return or damage entry not found.")
    };
  }

  return { data, response: null };
}

function validateResolvedQuantities(damageQty: number, returnQty: number, freeIssueQty: number) {
  if (damageQty + returnQty + freeIssueQty > 0) {
    return null;
  }

  return errorResponse(
    422,
    "VALIDATION_ERROR",
    "At least one of damageQty, returnQty, or freeIssueQty must be greater than zero."
  );
}

export class ReportReturnDamageEntryService {
  static async listReturnDamageEntries(reportId: string) {
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
      .from("report_return_damage_entries")
      .select(RETURN_DAMAGE_ENTRY_SELECT)
      .eq("daily_report_id", parsedReportId.data)
      .order("created_at", { ascending: true })) as {
      data: ReportReturnDamageEntryRow[] | null;
      error: Parameters<typeof fromPostgrestError>[0] | null;
    };

    if (error) {
      return fromPostgrestError(error);
    }

    return successResponse({
      items: (data ?? []).map(mapReturnDamageEntry)
    });
  }

  static async createReturnDamageEntry(reportId: string, request: Request) {
    const auth = await requireAuth();
    if (auth.response || !auth.context) {
      return auth.response;
    }

    const parsedReportId = uuidSchema.safeParse(reportId);
    if (!parsedReportId.success) {
      return errorResponse(422, "INVALID_REPORT_ID", "A valid report id is required.");
    }

    const report = await getEditableReturnDamageReport(
      parsedReportId.data,
      auth.context.user.id,
      auth.context.profile.role
    );

    if (report.response) {
      return report.response;
    }

    const body = await request.json().catch(() => null);
    const parsed = reportReturnDamageEntryCreateSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse(422, "VALIDATION_ERROR", "Invalid return or damage payload.", parsed.error.flatten());
    }

    const product = await ensureProductExists(parsed.data.productId);
    if (product.response) {
      return product.response;
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = (await supabase
      .from("report_return_damage_entries")
      .insert({
        daily_report_id: parsedReportId.data,
        product_id: parsed.data.productId,
        ...buildProductSnapshotPayload(product.data!),
        invoice_no: parsed.data.invoiceNo ?? null,
        shop_name: parsed.data.shopName ?? null,
        damage_qty: parsed.data.damageQty,
        return_qty: parsed.data.returnQty,
        free_issue_qty: parsed.data.freeIssueQty,
        notes: parsed.data.notes ?? null
      } as never)
      .select(RETURN_DAMAGE_ENTRY_SELECT)
      .single()) as {
      data: ReportReturnDamageEntryRow | null;
      error: DatabaseErrorLike | null;
    };

    if (error) {
      return mapReturnDamageEntryDatabaseError(error);
    }

    return successResponse(mapReturnDamageEntry(data as ReportReturnDamageEntryRow), { status: 201 });
  }

  static async updateReturnDamageEntry(reportId: string, entryId: string, request: Request) {
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
      return errorResponse(422, "INVALID_RETURN_DAMAGE_ENTRY_ID", "A valid return or damage entry id is required.");
    }

    const report = await getEditableReturnDamageReport(
      parsedReportId.data,
      auth.context.user.id,
      auth.context.profile.role
    );

    if (report.response) {
      return report.response;
    }

    const existing = await getReturnDamageEntryById(parsedReportId.data, parsedEntryId.data);
    if (existing.response) {
      return existing.response;
    }

    const body = await request.json().catch(() => null);
    const parsed = reportReturnDamageEntryUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse(422, "VALIDATION_ERROR", "Invalid return or damage payload.", parsed.error.flatten());
    }

    const resolvedProductId = parsed.data.productId ?? existing.data!.product_id;
    const resolvedDamageQty = parsed.data.damageQty ?? existing.data!.damage_qty;
    const resolvedReturnQty = parsed.data.returnQty ?? existing.data!.return_qty;
    const resolvedFreeIssueQty = parsed.data.freeIssueQty ?? existing.data!.free_issue_qty;

    const quantityError = validateResolvedQuantities(resolvedDamageQty, resolvedReturnQty, resolvedFreeIssueQty);
    if (quantityError) {
      return quantityError;
    }

    const product = await ensureProductExists(resolvedProductId);
    if (product.response) {
      return product.response;
    }

    const updatePayload: Record<string, unknown> = {};
    if (parsed.data.productId !== undefined) {
      updatePayload.product_id = resolvedProductId;
      Object.assign(updatePayload, buildProductSnapshotPayload(product.data!));
    }
    if (parsed.data.invoiceNo !== undefined) updatePayload.invoice_no = parsed.data.invoiceNo ?? null;
    if (parsed.data.shopName !== undefined) updatePayload.shop_name = parsed.data.shopName ?? null;
    if (parsed.data.damageQty !== undefined) updatePayload.damage_qty = parsed.data.damageQty;
    if (parsed.data.returnQty !== undefined) updatePayload.return_qty = parsed.data.returnQty;
    if (parsed.data.freeIssueQty !== undefined) updatePayload.free_issue_qty = parsed.data.freeIssueQty;
    if (parsed.data.notes !== undefined) updatePayload.notes = parsed.data.notes ?? null;

    const supabase = await createSupabaseServerClient();
    const { data, error } = (await supabase
      .from("report_return_damage_entries")
      .update(updatePayload as never)
      .eq("daily_report_id", parsedReportId.data)
      .eq("id", parsedEntryId.data)
      .select(RETURN_DAMAGE_ENTRY_SELECT)
      .single()) as {
      data: ReportReturnDamageEntryRow | null;
      error: DatabaseErrorLike | null;
    };

    if (error) {
      return mapReturnDamageEntryDatabaseError(error);
    }

    return successResponse(mapReturnDamageEntry(data as ReportReturnDamageEntryRow));
  }

  static async deleteReturnDamageEntry(reportId: string, entryId: string) {
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
      return errorResponse(422, "INVALID_RETURN_DAMAGE_ENTRY_ID", "A valid return or damage entry id is required.");
    }

    const report = await getEditableReturnDamageReport(
      parsedReportId.data,
      auth.context.user.id,
      auth.context.profile.role
    );

    if (report.response) {
      return report.response;
    }

    const existing = await getReturnDamageEntryById(parsedReportId.data, parsedEntryId.data);
    if (existing.response) {
      return existing.response;
    }

    const supabase = await createSupabaseServerClient();
    const { error } = (await supabase
      .from("report_return_damage_entries")
      .delete()
      .eq("daily_report_id", parsedReportId.data)
      .eq("id", parsedEntryId.data)) as {
      error: DatabaseErrorLike | null;
    };

    if (error) {
      return mapReturnDamageEntryDatabaseError(error);
    }

    return successResponse({
      id: parsedEntryId.data,
      deleted: true
    });
  }

  static async saveReturnDamageEntriesBatch(reportId: string, request: Request) {
    const auth = await requireAuth();
    if (auth.response || !auth.context) {
      return auth.response;
    }

    const parsedReportId = uuidSchema.safeParse(reportId);
    if (!parsedReportId.success) {
      return errorResponse(422, "INVALID_REPORT_ID", "A valid report id is required.");
    }

    const report = await getEditableReturnDamageReport(
      parsedReportId.data,
      auth.context.user.id,
      auth.context.profile.role
    );

    if (report.response) {
      return report.response;
    }

    const body = await request.json().catch(() => null);
    const parsed = reportReturnDamageEntryBatchSaveSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse(422, "VALIDATION_ERROR", "Invalid return or damage batch payload.", parsed.error.flatten());
    }

    for (const item of parsed.data.items) {
      const product = await ensureProductExists(item.productId);
      if (product.response) {
        return product.response;
      }
    }

    const payload = parsed.data.items.map((item) => ({
      id: item.id ?? null,
      productId: item.productId,
      invoiceNo: item.invoiceNo ?? null,
      shopName: item.shopName ?? null,
      damageQty: item.damageQty,
      returnQty: item.returnQty,
      freeIssueQty: item.freeIssueQty,
      notes: item.notes ?? null
    }));

    const supabase = await createSupabaseServerClient();
    const { data, error } = await (supabase as never as {
      rpc: (name: string, params: Record<string, unknown>) => Promise<{
        data: ReportReturnDamageEntryRow[] | null;
        error: DatabaseErrorLike | null;
      }>;
    }).rpc("save_report_return_damage_entries", {
      target_daily_report_id: parsedReportId.data,
      input_entries: payload
    });

    if (error) {
      return mapReturnDamageEntryDatabaseError(error);
    }

    return successResponse({
      items: (data ?? []).map(mapReturnDamageEntry)
    });
  }
}






