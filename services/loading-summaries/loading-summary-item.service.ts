import { requireAuth } from "@/lib/auth/helpers";
import { errorResponse, fromPostgrestError, successResponse } from "@/lib/db/response";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { uuidSchema } from "@/lib/validation/common";
import { loadingSummaryItemBatchSaveSchema } from "@/lib/validation/loading-summary-item";

type MembershipLookup = {
  organization_id: string;
};

type DailyReportScope = {
  id: string;
  route_program_id: string;
  prepared_by: string;
  status: "draft" | "submitted" | "approved" | "rejected";
  deleted_at: string | null;
  loading_completed_at: string | null;
};

type RouteProgramScope = {
  id: string;
  organization_id: string;
};

type InventoryRow = {
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

const INVENTORY_SELECT = `
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

function mapItem(row: InventoryRow) {
  return {
    id: row.id,
    dailyReportId: row.daily_report_id,
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

function membershipRequiredResponse() {
  return errorResponse(
    403,
    "MEMBERSHIP_REQUIRED",
    "An active organization membership is required to access loading summary items."
  );
}

async function resolveActiveOrganizationId(userId: string) {
  const supabase = await createSupabaseServerClient();
  const membershipResult = (await supabase
    .from("organization_memberships")
    .select("organization_id")
    .eq("user_id", userId)
    .eq("status", "ACTIVE")
    .limit(1)
    .maybeSingle()) as {
    data: MembershipLookup | null;
    error: Parameters<typeof fromPostgrestError>[0] | null;
  };

  if (membershipResult.error) {
    return {
      organizationId: null,
      response: fromPostgrestError(membershipResult.error)
    };
  }

  if (!membershipResult.data) {
    return {
      organizationId: null,
      response: membershipRequiredResponse()
    };
  }

  return {
    organizationId: membershipResult.data.organization_id,
    response: null
  };
}

async function getScopedDraftSummary(summaryId: string, organizationId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = (await supabase
    .from("daily_reports")
    .select("id, route_program_id, prepared_by, status, deleted_at, loading_completed_at")
    .eq("id", summaryId)
    .is("deleted_at", null)
    .maybeSingle()) as {
    data: DailyReportScope | null;
    error: Parameters<typeof fromPostgrestError>[0] | null;
  };

  if (error) {
    return { data: null, response: fromPostgrestError(error) };
  }

  if (!data) {
    return {
      data: null,
      response: errorResponse(404, "LOADING_SUMMARY_NOT_FOUND", "Loading summary not found.")
    };
  }

  const routeProgramResult = (await supabase
    .from("route_programs")
    .select("id, organization_id")
    .eq("id", data.route_program_id)
    .eq("organization_id", organizationId)
    .maybeSingle()) as {
    data: RouteProgramScope | null;
    error: Parameters<typeof fromPostgrestError>[0] | null;
  };

  if (routeProgramResult.error) {
    return { data: null, response: fromPostgrestError(routeProgramResult.error) };
  }

  if (!routeProgramResult.data) {
    return {
      data: null,
      response: errorResponse(404, "LOADING_SUMMARY_NOT_FOUND", "Loading summary not found.")
    };
  }

  return { data, response: null };
}

function canManageLoadingItems(role: string) {
  return role === "admin" || role === "supervisor" || role === "driver";
}

export class LoadingSummaryItemService {
  static async list(summaryId: string) {
    const auth = await requireAuth();
    if (auth.response || !auth.context) {
      return auth.response;
    }

    const parsedId = uuidSchema.safeParse(summaryId);
    if (!parsedId.success) {
      return errorResponse(422, "INVALID_SUMMARY_ID", "A valid loading summary id is required.");
    }

    const membership = await resolveActiveOrganizationId(auth.context.user.id);
    if (membership.response) {
      return membership.response;
    }
    if (!membership.organizationId) {
      return membershipRequiredResponse();
    }

    const scopedSummary = await getScopedDraftSummary(parsedId.data, membership.organizationId);
    if (scopedSummary.response) {
      return scopedSummary.response;
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = (await supabase
      .from("report_inventory_entries")
      .select(INVENTORY_SELECT)
      .eq("daily_report_id", parsedId.data)
      .order("product_name_snapshot", { ascending: true })) as {
      data: InventoryRow[] | null;
      error: Parameters<typeof fromPostgrestError>[0] | null;
    };

    if (error) {
      return fromPostgrestError(error);
    }

    return successResponse({
      items: (data ?? []).map(mapItem)
    });
  }

  static async saveBatch(summaryId: string, request: Request) {
    const auth = await requireAuth();
    if (auth.response || !auth.context) {
      return auth.response;
    }

    if (!canManageLoadingItems(auth.context.profile.role)) {
      return errorResponse(403, "FORBIDDEN", "Only admin, supervisor, or driver can edit loading items.");
    }

    const parsedId = uuidSchema.safeParse(summaryId);
    if (!parsedId.success) {
      return errorResponse(422, "INVALID_SUMMARY_ID", "A valid loading summary id is required.");
    }

    const body = await request.json().catch(() => null);
    const parsed = loadingSummaryItemBatchSaveSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(422, "VALIDATION_ERROR", "Invalid loading summary items payload.", parsed.error.flatten());
    }

    const membership = await resolveActiveOrganizationId(auth.context.user.id);
    if (membership.response) {
      return membership.response;
    }
    if (!membership.organizationId) {
      return membershipRequiredResponse();
    }

    const scopedSummary = await getScopedDraftSummary(parsedId.data, membership.organizationId);
    if (scopedSummary.response || !scopedSummary.data) {
      return scopedSummary.response;
    }

    if (scopedSummary.data.status !== "draft") {
      return errorResponse(409, "SUMMARY_LOCKED", "Loading items can only be edited while draft.");
    }

    if (auth.context.profile.role === "driver" && scopedSummary.data.prepared_by !== auth.context.user.id) {
      return errorResponse(403, "FORBIDDEN", "Drivers can only edit loading items on their own summaries.");
    }

    const supabase = await createSupabaseServerClient();
    const { data: existingRows, error: existingRowsError } = (await supabase
      .from("report_inventory_entries")
      .select(INVENTORY_SELECT)
      .eq("daily_report_id", parsedId.data)) as {
      data: InventoryRow[] | null;
      error: Parameters<typeof fromPostgrestError>[0] | null;
    };

    if (existingRowsError) {
      return fromPostgrestError(existingRowsError);
    }

    const existingItems = existingRows ?? [];
    const isReconciliationStage = Boolean(scopedSummary.data.loading_completed_at);

    if (!isReconciliationStage) {
      const hasUnexpectedReconciliationValues = parsed.data.items.some(
        (item) => item.salesQty > 0 || item.lorryQty > 0
      );

      if (hasUnexpectedReconciliationValues) {
        return errorResponse(
          409,
          "MORNING_LOADING_ONLY",
          "Sales and lorry quantities can only be recorded after morning loading has been finalized."
        );
      }

      const hasExistingSales = existingItems.some((item) => item.sales_qty > 0 || item.lorry_qty > 0);
      if (hasExistingSales) {
        return errorResponse(
          409,
          "SALES_ALREADY_RECORDED",
          "Morning loading rows cannot be replaced after evening reconciliation has started."
        );
      }
    }

    if (isReconciliationStage) {
      if (existingItems.length === 0) {
        return errorResponse(
          409,
          "RECONCILIATION_ROWS_MISSING",
          "Finalize morning loading with at least one saved product row before recording evening reconciliation."
        );
      }

      if (parsed.data.items.length !== existingItems.length) {
        return errorResponse(
          409,
          "LOADING_STRUCTURE_LOCKED",
          "Morning loading rows are locked after finalize. Enter sales and lorry quantities on the existing route-sheet rows only."
        );
      }

      const existingItemsById = new Map(existingItems.map((item) => [item.id, item]));

      for (const item of parsed.data.items) {
        if (!item.id) {
          return errorResponse(
            409,
            "LOADING_STRUCTURE_LOCKED",
            "Morning loading rows are locked after finalize. Sales and lorry quantities must be saved against the existing rows."
          );
        }

        const existingItem = existingItemsById.get(item.id);
        if (!existingItem) {
          return errorResponse(
            404,
            "LOADING_ITEM_NOT_FOUND",
            "One or more loading rows could not be found for evening reconciliation."
          );
        }

        if (item.productId !== existingItem.product_id || item.loadingQty !== existingItem.loading_qty) {
          return errorResponse(
            409,
            "LOADING_STRUCTURE_LOCKED",
            "Product selection and loading quantity are locked after finalize. Only sales and lorry quantities can be updated during evening reconciliation."
          );
        }
      }
    }

    const rpcPayload = parsed.data.items.map((item) => ({
      ...(item.id ? { id: item.id } : {}),
      productId: item.productId,
      loadingQty: item.loadingQty,
      salesQty: item.salesQty,
      lorryQty: item.lorryQty
    }));

    const { data, error } = (await (supabase as never as {
      rpc: (name: string, params: Record<string, unknown>) => Promise<{
        data: InventoryRow[] | null;
        error: Parameters<typeof fromPostgrestError>[0] | null;
      }>;
    }).rpc("save_report_inventory_entries", {
      target_daily_report_id: parsedId.data,
      input_entries: rpcPayload
    })) as {
      data: InventoryRow[] | null;
      error: Parameters<typeof fromPostgrestError>[0] | null;
    };

    if (error) {
      return fromPostgrestError(error);
    }

    return successResponse({
      items: (data ?? []).map(mapItem)
    });
  }
}




