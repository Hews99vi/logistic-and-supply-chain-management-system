import { requireFeaturePermission } from "@/lib/auth/permissions";
import { errorResponse, fromPostgrestError, successResponse } from "@/lib/db/response";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPaginationRange, uuidSchema } from "@/lib/validation/common";
import { z } from "zod";

const receiveStockSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().positive(),
  notes: z.string().optional()
});

async function resolveActiveOrganizationId(userId: string) {
  const supabase = await createSupabaseServerClient();
  const membershipResult = (await supabase
    .from("organization_memberships")
    .select("organization_id")
    .eq("user_id", userId)
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()) as any;

  if (membershipResult.error) {
    return {
      organizationId: null,
      response: fromPostgrestError(membershipResult.error)
    };
  }

  if (!membershipResult.data) {
    return {
      organizationId: null,
      response: errorResponse(
        403,
        "MEMBERSHIP_REQUIRED",
        "An active organization membership is required."
      )
    };
  }

  return {
    organizationId: membershipResult.data.organization_id,
    response: null
  };
}

export class MainInventoryService {
  static async list(request: Request) {
    const auth = await requireFeaturePermission("main_inventory", "view");
    if (auth.response || !auth.context) {
      return auth.response;
    }

    const membership = await resolveActiveOrganizationId(auth.context.user.id);
    if (membership.response) {
      return membership.response;
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") ?? "1", 10);
    const pageSize = parseInt(searchParams.get("pageSize") ?? "100", 10);
    const search = searchParams.get("search") ?? "";
    const { from, to } = getPaginationRange(page, pageSize);

    const supabase = await createSupabaseServerClient();

    // Fetch products along with their main_inventory quantity if it exists
    let query = supabase
      .from("products")
      .select(`
        id,
        product_code,
        product_name,
        display_name,
        unit_price,
        is_active,
        main_inventory ( quantity, updated_at )
      `, { count: "exact" })
      .eq("organization_id", membership.organizationId)
      .eq("is_active", true);

    if (search) {
      const likeTerm = `%${search.replace(/[%_]/g, "").trim()}%`;
      query = query.or(`display_name.ilike.${likeTerm},product_code.ilike.${likeTerm}`);
    }

    const { data, count, error } = await query.range(from, to).order("display_name", { ascending: true });

    if (error) {
      return fromPostgrestError(error as any);
    }

    const items = (data ?? []).map((row: any) => {
      // Filter out inventory that does not belong to the user's organization (though RLS handles this, array might be empty)
      const inventoryItem = (row.main_inventory && Array.isArray(row.main_inventory)) ? row.main_inventory[0] : row.main_inventory;
      
      return {
        id: row.id,
        productId: row.id,
        productCode: row.product_code,
        productName: row.product_name,
        displayName: row.display_name,
        quantity: inventoryItem?.quantity ?? 0,
        updatedAt: inventoryItem?.updated_at ?? null
      };
    });

    return successResponse({
      items,
      page,
      pageSize,
      total: count ?? 0
    });
  }

  static async receiveStock(request: Request) {
    const auth = await requireFeaturePermission("main_inventory", "receive_stock");
    if (auth.response || !auth.context) {
      return auth.response;
    }

    const membership = await resolveActiveOrganizationId(auth.context.user.id);
    if (membership.response) {
      return membership.response;
    }

    const body = await request.json().catch(() => null);
    const parsed = receiveStockSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(422, "VALIDATION_ERROR", "Invalid payload.", parsed.error.flatten());
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = await (supabase as any).rpc("receive_main_inventory", {
      p_organization_id: membership.organizationId,
      p_product_id: parsed.data.productId,
      p_quantity: parsed.data.quantity,
      p_notes: parsed.data.notes ?? null
    });

    if (error) {
      return fromPostgrestError(error as any);
    }

    return successResponse(data, { status: 201 });
  }
}
