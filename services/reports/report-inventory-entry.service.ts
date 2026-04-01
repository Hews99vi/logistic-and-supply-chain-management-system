import { requireAuth } from "@/lib/auth/helpers";
import { errorResponse, fromPostgrestError, successResponse } from "@/lib/db/response";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { uuidSchema } from "@/lib/validation/common";
import {
  reportInventoryEntryBatchSaveSchema,
  reportInventoryEntryCreateSchema,
  reportInventoryEntryUpdateSchema
} from "@/lib/validation/report-inventory-entry";
import type { DailyReportInventoryEntryDto } from "@/types/domain/report";

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

type ReportInventoryEntryRow = {
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
  loading_qty: number;
  sales_qty: number;
  balance_qty: number;
  lorry_qty: number;
  variance_qty: number;
  created_at: string;
  updated_at: string;
};

type DatabaseErrorLike = {
  code?: string | null;
  message: string;
  details?: string | null;
};

const INVENTORY_ENTRY_SELECT = `
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
  loading_qty,
  sales_qty,
  balance_qty,
  lorry_qty,
  variance_qty,
  created_at,
  updated_at
`.replace(/\s+/g, " ").trim();

function mapInventoryEntry(row: ReportInventoryEntryRow): DailyReportInventoryEntryDto {
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
    loadingQty: row.loading_qty,
    salesQty: row.sales_qty,
    balanceQty: row.balance_qty,
    lorryQty: row.lorry_qty,
    varianceQty: row.variance_qty,
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

function mapInventoryEntryDatabaseError(error: DatabaseErrorLike) {
  const detail = `${error.message} ${error.details ?? ""}`.toLowerCase();

  if (error.code === "23505") {
    if (detail.includes("unique_product")) {
      return errorResponse(409, "PRODUCT_ALREADY_EXISTS", "That product already exists in this report.");
    }

    return errorResponse(409, "DUPLICATE_INVENTORY_ENTRY", "This inventory entry conflicts with an existing row.");
  }

  if (error.code === "23503") {
    return errorResponse(422, "PRODUCT_NOT_FOUND", "The selected product does not exist.");
  }

  if (error.code === "23514") {
    return errorResponse(
      422,
      "INVALID_INVENTORY_ENTRY",
      "Quantities must be non-negative, and sold packs/cases cannot exceed loaded packs/cases."
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

async function getEditableInventoryReport(reportId: string, userId: string, role: string) {
  const report = await getReportForRead(reportId);

  if (report.response || !report.data) {
    return report;
  }

  if (role === "driver" && report.data.prepared_by !== userId) {
    return {
      data: null,
      response: errorResponse(403, "FORBIDDEN", "Drivers can only edit inventory entries on their own reports.")
    };
  }

  if (report.data.status !== "draft") {
    return {
      data: null,
      response: errorResponse(
        409,
        "REPORT_NOT_EDITABLE",
        "Inventory entries can only be changed while the daily report is in draft status."
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

async function getInventoryEntryById(reportId: string, entryId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = (await supabase
    .from("report_inventory_entries")
    .select(INVENTORY_ENTRY_SELECT)
    .eq("daily_report_id", reportId)
    .eq("id", entryId)
    .maybeSingle()) as {
    data: ReportInventoryEntryRow | null;
    error: Parameters<typeof fromPostgrestError>[0] | null;
  };

  if (error) {
    return { data: null, response: fromPostgrestError(error) };
  }

  if (!data) {
    return {
      data: null,
      response: errorResponse(404, "INVENTORY_ENTRY_NOT_FOUND", "Inventory entry not found.")
    };
  }

  return { data, response: null };
}

function validateResolvedQuantities(loadingQty: number, salesQty: number) {
  if (salesQty <= loadingQty) {
    return null;
  }

  return errorResponse(422, "VALIDATION_ERROR", "Sold packs/cases cannot exceed loaded packs/cases.");
}

export class ReportInventoryEntryService {
  static async listInventoryEntries(reportId: string) {
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
      .from("report_inventory_entries")
      .select(INVENTORY_ENTRY_SELECT)
      .eq("daily_report_id", parsedReportId.data)
      .order("product_name_snapshot", { ascending: true })) as {
      data: ReportInventoryEntryRow[] | null;
      error: Parameters<typeof fromPostgrestError>[0] | null;
    };

    if (error) {
      return fromPostgrestError(error);
    }

    return successResponse({
      items: (data ?? []).map(mapInventoryEntry)
    });
  }

  static async createInventoryEntry(reportId: string, request: Request) {
    const auth = await requireAuth();
    if (auth.response || !auth.context) {
      return auth.response;
    }

    const parsedReportId = uuidSchema.safeParse(reportId);
    if (!parsedReportId.success) {
      return errorResponse(422, "INVALID_REPORT_ID", "A valid report id is required.");
    }

    const report = await getEditableInventoryReport(
      parsedReportId.data,
      auth.context.user.id,
      auth.context.profile.role
    );

    if (report.response) {
      return report.response;
    }

    const body = await request.json().catch(() => null);
    const parsed = reportInventoryEntryCreateSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse(422, "VALIDATION_ERROR", "Invalid inventory entry payload.", parsed.error.flatten());
    }

    const product = await ensureProductExists(parsed.data.productId);
    if (product.response) {
      return product.response;
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = (await supabase
      .from("report_inventory_entries")
      .insert({
        daily_report_id: parsedReportId.data,
        product_id: parsed.data.productId,
        ...buildProductSnapshotPayload(product.data!),
        loading_qty: parsed.data.loadingQty,
        sales_qty: parsed.data.salesQty,
        lorry_qty: parsed.data.lorryQty
      } as never)
      .select(INVENTORY_ENTRY_SELECT)
      .single()) as {
      data: ReportInventoryEntryRow | null;
      error: DatabaseErrorLike | null;
    };

    if (error) {
      return mapInventoryEntryDatabaseError(error);
    }

    return successResponse(mapInventoryEntry(data as ReportInventoryEntryRow), { status: 201 });
  }

  static async updateInventoryEntry(reportId: string, entryId: string, request: Request) {
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
      return errorResponse(422, "INVALID_INVENTORY_ENTRY_ID", "A valid inventory entry id is required.");
    }

    const report = await getEditableInventoryReport(
      parsedReportId.data,
      auth.context.user.id,
      auth.context.profile.role
    );

    if (report.response) {
      return report.response;
    }

    const existing = await getInventoryEntryById(parsedReportId.data, parsedEntryId.data);
    if (existing.response) {
      return existing.response;
    }

    const body = await request.json().catch(() => null);
    const parsed = reportInventoryEntryUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse(422, "VALIDATION_ERROR", "Invalid inventory entry payload.", parsed.error.flatten());
    }

    const resolvedProductId = parsed.data.productId ?? existing.data!.product_id;
    const resolvedLoadingQty = parsed.data.loadingQty ?? existing.data!.loading_qty;
    const resolvedSalesQty = parsed.data.salesQty ?? existing.data!.sales_qty;

    const quantityError = validateResolvedQuantities(resolvedLoadingQty, resolvedSalesQty);
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
    if (parsed.data.loadingQty !== undefined) updatePayload.loading_qty = parsed.data.loadingQty;
    if (parsed.data.salesQty !== undefined) updatePayload.sales_qty = parsed.data.salesQty;
    if (parsed.data.lorryQty !== undefined) updatePayload.lorry_qty = parsed.data.lorryQty;

    const supabase = await createSupabaseServerClient();
    const { data, error } = (await supabase
      .from("report_inventory_entries")
      .update(updatePayload as never)
      .eq("daily_report_id", parsedReportId.data)
      .eq("id", parsedEntryId.data)
      .select(INVENTORY_ENTRY_SELECT)
      .single()) as {
      data: ReportInventoryEntryRow | null;
      error: DatabaseErrorLike | null;
    };

    if (error) {
      return mapInventoryEntryDatabaseError(error);
    }

    return successResponse(mapInventoryEntry(data as ReportInventoryEntryRow));
  }

  static async deleteInventoryEntry(reportId: string, entryId: string) {
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
      return errorResponse(422, "INVALID_INVENTORY_ENTRY_ID", "A valid inventory entry id is required.");
    }

    const report = await getEditableInventoryReport(
      parsedReportId.data,
      auth.context.user.id,
      auth.context.profile.role
    );

    if (report.response) {
      return report.response;
    }

    const existing = await getInventoryEntryById(parsedReportId.data, parsedEntryId.data);
    if (existing.response) {
      return existing.response;
    }

    const supabase = await createSupabaseServerClient();
    const { error } = (await supabase
      .from("report_inventory_entries")
      .delete()
      .eq("daily_report_id", parsedReportId.data)
      .eq("id", parsedEntryId.data)) as {
      error: DatabaseErrorLike | null;
    };

    if (error) {
      return mapInventoryEntryDatabaseError(error);
    }

    return successResponse({
      id: parsedEntryId.data,
      deleted: true
    });
  }

  static async saveInventoryEntriesBatch(reportId: string, request: Request) {
    const auth = await requireAuth();
    if (auth.response || !auth.context) {
      return auth.response;
    }

    const parsedReportId = uuidSchema.safeParse(reportId);
    if (!parsedReportId.success) {
      return errorResponse(422, "INVALID_REPORT_ID", "A valid report id is required.");
    }

    const report = await getEditableInventoryReport(
      parsedReportId.data,
      auth.context.user.id,
      auth.context.profile.role
    );

    if (report.response) {
      return report.response;
    }

    const body = await request.json().catch(() => null);
    const parsed = reportInventoryEntryBatchSaveSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse(422, "VALIDATION_ERROR", "Invalid inventory batch payload.", parsed.error.flatten());
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
      loadingQty: item.loadingQty,
      salesQty: item.salesQty,
      lorryQty: item.lorryQty
    }));

    const supabase = await createSupabaseServerClient();
    const { data, error } = await (supabase as never as {
      rpc: (name: string, params: Record<string, unknown>) => Promise<{
        data: ReportInventoryEntryRow[] | null;
        error: DatabaseErrorLike | null;
      }>;
    }).rpc("save_report_inventory_entries", {
      target_daily_report_id: parsedReportId.data,
      input_entries: payload
    });

    if (error) {
      return mapInventoryEntryDatabaseError(error);
    }

    return successResponse({
      items: (data ?? []).map(mapInventoryEntry)
    });
  }
}






