import { requireAuth, requireRole } from "@/lib/auth/helpers";
import { errorResponse, fromPostgrestError, successResponse } from "@/lib/db/response";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPaginationRange, uuidSchema } from "@/lib/validation/common";
import {
  productCreateSchema,
  productListQuerySchema,
  productUpdateSchema
} from "@/lib/validation/product";

type ProductRecord = {
  id: string;
  organization_id: string;
  product_code: string;
  product_name: string;
  category: string | null;
  unit_price: number;
  sku: string | null;
  brand: string | null;
  product_family: string;
  variant: string | null;
  unit_size: number | null;
  unit_measure: string | null;
  pack_size: number | null;
  selling_unit: string | null;
  quantity_entry_mode: "pack" | "unit" | null;
  display_name: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type MembershipLookup = {
  organization_id: string;
};

const PRODUCT_SELECT = `
  id,
  organization_id,
  product_code,
  product_name,
  category,
  unit_price,
  sku,
  brand,
  product_family,
  variant,
  unit_size,
  unit_measure,
  pack_size,
  selling_unit,
  quantity_entry_mode,
  display_name,
  is_active,
  created_at,
  updated_at
`.replace(/\s+/g, " ").trim();

function normalizeOptionalText(value: string | null | undefined) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function formatStructuredNumber(value: number) {
  return Number.isInteger(value) ? String(value) : String(value);
}

function buildStructuredDisplayName(parts: {
  brand?: string | null;
  productFamily?: string | null;
  variant?: string | null;
  unitSize?: number | null;
  unitMeasure?: string | null;
  packSize?: number | null;
  sellingUnit?: string | null;
}) {
  const identity = [parts.brand, parts.productFamily, parts.variant]
    .map((value) => normalizeOptionalText(value))
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .trim();

  const descriptors: string[] = [];

  if (parts.unitSize !== null && parts.unitSize !== undefined) {
    const measure = normalizeOptionalText(parts.unitMeasure) ?? "";
    descriptors.push([formatStructuredNumber(parts.unitSize), measure].filter(Boolean).join(" ").trim());
  } else {
    const measure = normalizeOptionalText(parts.unitMeasure);
    if (measure) {
      descriptors.push(measure);
    }
  }

  if (parts.packSize !== null && parts.packSize !== undefined) {
    descriptors.push(`x ${parts.packSize}`);
  }

  const sellingUnit = normalizeOptionalText(parts.sellingUnit);
  if (sellingUnit) {
    descriptors.push(sellingUnit);
  }

  const suffix = descriptors.join(" ").trim();
  const display = [identity, suffix].filter(Boolean).join(" ").trim();
  return display.length > 0 ? display : null;
}

function deriveProductFamily(input: {
  productFamily?: string | null;
  productName?: string | null;
  displayName?: string | null;
  existingProductFamily?: string | null;
}) {
  return (
    normalizeOptionalText(input.productFamily) ??
    normalizeOptionalText(input.productName) ??
    normalizeOptionalText(input.displayName) ??
    normalizeOptionalText(input.existingProductFamily) ??
    "General"
  );
}

function deriveQuantityEntryMode(input: {
  quantityEntryMode?: "pack" | "unit" | null;
  sellingUnit?: string | null;
}) {
  if (input.quantityEntryMode === "unit") {
    return "unit";
  }

  if (input.quantityEntryMode === "pack") {
    return "pack";
  }

  return input.sellingUnit?.trim().toLowerCase() === "unit" ? "unit" : "pack";
}

function mapProduct(record: ProductRecord) {
  return {
    ...record,
    category: record.category ?? "OTHER",
    quantity_entry_mode: deriveQuantityEntryMode({
      quantityEntryMode: record.quantity_entry_mode,
      sellingUnit: record.selling_unit
    }),
    display_name: record.display_name ?? record.product_name
  };
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
      response: errorResponse(
        403,
        "MEMBERSHIP_REQUIRED",
        "An active organization membership is required to access products."
      )
    };
  }

  return {
    organizationId: membershipResult.data.organization_id,
    response: null
  };
}

async function getScopedProduct(productId: string, organizationId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = (await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("id", productId)
    .eq("organization_id", organizationId)
    .maybeSingle()) as {
    data: ProductRecord | null;
    error: Parameters<typeof fromPostgrestError>[0] | null;
  };

  if (error) {
    return { data: null, response: fromPostgrestError(error) };
  }

  if (!data) {
    return {
      data: null,
      response: errorResponse(404, "PRODUCT_NOT_FOUND", "Product not found.")
    };
  }

  return { data, response: null };
}

export class ProductService {
  static async listProducts(request: Request) {
    const auth = await requireAuth();
    if (auth.response || !auth.context) {
      return auth.response;
    }

    const { searchParams } = new URL(request.url);
    const parsed = productListQuerySchema.safeParse(Object.fromEntries(searchParams.entries()));

    if (!parsed.success) {
      return errorResponse(422, "VALIDATION_ERROR", "Invalid product query parameters.", parsed.error.flatten());
    }

    const membership = await resolveActiveOrganizationId(auth.context.user.id);
    if (membership.response) {
      return membership.response;
    }

    if (!membership.organizationId) {
      return errorResponse(
        403,
        "MEMBERSHIP_REQUIRED",
        "An active organization membership is required to access products."
      );
    }

    const { page, pageSize, search, category, isActive } = parsed.data;
    const { from, to } = getPaginationRange(page, pageSize);
    const supabase = await createSupabaseServerClient();

    let query = supabase
      .from("products")
      .select(PRODUCT_SELECT, { count: "exact" })
      .eq("organization_id", membership.organizationId)
      .order("product_name", { ascending: true })
      .range(from, to);

    if (search) {
      const searchTerm = `%${search}%`;
      query = query.or(
        `product_code.ilike.${searchTerm},product_name.ilike.${searchTerm},display_name.ilike.${searchTerm},product_family.ilike.${searchTerm},brand.ilike.${searchTerm},variant.ilike.${searchTerm},sku.ilike.${searchTerm}`
      );
    }

    if (category) {
      query = query.eq("category", category);
    }

    if (typeof isActive === "boolean") {
      query = query.eq("is_active", isActive);
    }

    const { data, count, error } = (await query) as {
      data: ProductRecord[] | null;
      count: number | null;
      error: Parameters<typeof fromPostgrestError>[0] | null;
    };

    if (error) {
      return fromPostgrestError(error);
    }

    return successResponse({
      items: (data ?? []).map(mapProduct),
      page,
      pageSize,
      total: count ?? 0
    });
  }

  static async getProductById(productId: string) {
    const auth = await requireAuth();
    if (auth.response || !auth.context) {
      return auth.response;
    }

    const parsedId = uuidSchema.safeParse(productId);
    if (!parsedId.success) {
      return errorResponse(422, "INVALID_ID", "A valid product id is required.");
    }

    const membership = await resolveActiveOrganizationId(auth.context.user.id);
    if (membership.response) {
      return membership.response;
    }

    if (!membership.organizationId) {
      return errorResponse(
        403,
        "MEMBERSHIP_REQUIRED",
        "An active organization membership is required to access products."
      );
    }

    const product = await getScopedProduct(parsedId.data, membership.organizationId);
    if (product.response || !product.data) {
      return product.response;
    }

    return successResponse(mapProduct(product.data));
  }

  static async createProduct(request: Request) {
    const auth = await requireRole(["admin", "supervisor"]);
    if (auth.response || !auth.context) {
      return auth.response;
    }

    const body = await request.json().catch(() => null);
    const parsed = productCreateSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse(422, "VALIDATION_ERROR", "Invalid product payload.", parsed.error.flatten());
    }

    const membership = await resolveActiveOrganizationId(auth.context.user.id);
    if (membership.response) {
      return membership.response;
    }

    if (!membership.organizationId) {
      return errorResponse(
        403,
        "MEMBERSHIP_REQUIRED",
        "An active organization membership is required to access products."
      );
    }

    const resolvedBrand = normalizeOptionalText(parsed.data.brand) ?? null;
    const resolvedProductFamily = deriveProductFamily({
      productFamily: parsed.data.productFamily,
      productName: parsed.data.productName,
      displayName: parsed.data.displayName
    });
    const resolvedQuantityEntryMode = deriveQuantityEntryMode({
      quantityEntryMode: parsed.data.quantityEntryMode ?? null,
      sellingUnit: parsed.data.sellingUnit ?? null
    });
    const generatedDisplayName = buildStructuredDisplayName({
      brand: resolvedBrand,
      productFamily: resolvedProductFamily,
      variant: parsed.data.variant ?? null,
      unitSize: parsed.data.unitSize ?? null,
      unitMeasure: parsed.data.unitMeasure ?? null,
      packSize: parsed.data.packSize ?? null,
      sellingUnit: parsed.data.sellingUnit ?? null
    });
    const resolvedDisplayName =
      normalizeOptionalText(parsed.data.displayName) ??
      generatedDisplayName ??
      normalizeOptionalText(parsed.data.productName) ??
      resolvedProductFamily;
    const resolvedProductName = normalizeOptionalText(parsed.data.productName) ?? resolvedDisplayName;

    const supabase = await createSupabaseServerClient();
    const { data, error } = (await supabase
      .from("products")
      .insert({
        organization_id: membership.organizationId,
        product_code: parsed.data.productCode,
        product_name: resolvedProductName,
        name: resolvedProductName,
        category: parsed.data.category ?? "OTHER",
        unit_price: parsed.data.unitPrice,
        base_price: parsed.data.unitPrice,
        sku: parsed.data.sku ?? null,
        brand: resolvedBrand,
        product_family: resolvedProductFamily,
        variant: parsed.data.variant ?? null,
        unit_size: parsed.data.unitSize ?? null,
        unit_measure: parsed.data.unitMeasure ?? null,
        pack_size: parsed.data.packSize ?? null,
        selling_unit: parsed.data.sellingUnit ?? null,
        quantity_entry_mode: resolvedQuantityEntryMode,
        display_name: resolvedDisplayName,
        unit_of_measure: "UNIT",
        cold_chain_required: true,
        is_active: parsed.data.isActive
      } as never)
      .select(PRODUCT_SELECT)
      .single()) as {
      data: ProductRecord | null;
      error: Parameters<typeof fromPostgrestError>[0] | null;
    };

    if (error) {
      return fromPostgrestError(error);
    }

    return successResponse(mapProduct(data as ProductRecord), { status: 201 });
  }

  static async updateProduct(productId: string, request: Request) {
    const auth = await requireRole(["admin", "supervisor"]);
    if (auth.response || !auth.context) {
      return auth.response;
    }

    const parsedId = uuidSchema.safeParse(productId);
    if (!parsedId.success) {
      return errorResponse(422, "INVALID_ID", "A valid product id is required.");
    }

    const body = await request.json().catch(() => null);
    const parsed = productUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse(422, "VALIDATION_ERROR", "Invalid product payload.", parsed.error.flatten());
    }

    const membership = await resolveActiveOrganizationId(auth.context.user.id);
    if (membership.response) {
      return membership.response;
    }

    if (!membership.organizationId) {
      return errorResponse(
        403,
        "MEMBERSHIP_REQUIRED",
        "An active organization membership is required to access products."
      );
    }

    const existing = await getScopedProduct(parsedId.data, membership.organizationId);
    if (existing.response || !existing.data) {
      return existing.response;
    }

    const updatePayload: Record<string, unknown> = {};

    if (parsed.data.productCode !== undefined) {
      updatePayload.product_code = parsed.data.productCode;
    }

    const mergedBrand = parsed.data.brand !== undefined ? parsed.data.brand : existing.data.brand;
    const mergedVariant = parsed.data.variant !== undefined ? parsed.data.variant : existing.data.variant;
    const mergedUnitSize = parsed.data.unitSize !== undefined ? parsed.data.unitSize : existing.data.unit_size;
    const mergedUnitMeasure = parsed.data.unitMeasure !== undefined ? parsed.data.unitMeasure : existing.data.unit_measure;
    const mergedPackSize = parsed.data.packSize !== undefined ? parsed.data.packSize : existing.data.pack_size;
    const mergedSellingUnit = parsed.data.sellingUnit !== undefined ? parsed.data.sellingUnit : existing.data.selling_unit;
    const mergedQuantityEntryMode = deriveQuantityEntryMode({
      quantityEntryMode: parsed.data.quantityEntryMode !== undefined ? parsed.data.quantityEntryMode : existing.data.quantity_entry_mode,
      sellingUnit: mergedSellingUnit
    });
    const resolvedProductFamily = deriveProductFamily({
      productFamily: parsed.data.productFamily !== undefined ? parsed.data.productFamily : existing.data.product_family,
      productName: parsed.data.productName !== undefined ? parsed.data.productName : existing.data.product_name,
      displayName: parsed.data.displayName !== undefined ? parsed.data.displayName : existing.data.display_name,
      existingProductFamily: existing.data.product_family
    });
    const generatedDisplayName = buildStructuredDisplayName({
      brand: mergedBrand ?? null,
      productFamily: resolvedProductFamily,
      variant: mergedVariant ?? null,
      unitSize: mergedUnitSize ?? null,
      unitMeasure: mergedUnitMeasure ?? null,
      packSize: mergedPackSize ?? null,
      sellingUnit: mergedSellingUnit ?? null
    });

    if (parsed.data.productName !== undefined) {
      const resolvedProductName = normalizeOptionalText(parsed.data.productName) ?? generatedDisplayName ?? resolvedProductFamily;
      updatePayload.product_name = resolvedProductName;
      updatePayload.name = resolvedProductName;
    }

    if (parsed.data.category !== undefined) {
      updatePayload.category = parsed.data.category;
    }

    if (parsed.data.unitPrice !== undefined) {
      updatePayload.unit_price = parsed.data.unitPrice;
      updatePayload.base_price = parsed.data.unitPrice;
    }

    if (parsed.data.sku !== undefined) {
      updatePayload.sku = parsed.data.sku ?? null;
    }

    if (parsed.data.brand !== undefined) {
      updatePayload.brand = parsed.data.brand ?? null;
    }

    if (parsed.data.productFamily !== undefined || existing.data.product_family !== resolvedProductFamily) {
      updatePayload.product_family = resolvedProductFamily;
    }

    if (parsed.data.variant !== undefined) {
      updatePayload.variant = parsed.data.variant ?? null;
    }

    if (parsed.data.unitSize !== undefined) {
      updatePayload.unit_size = parsed.data.unitSize ?? null;
    }

    if (parsed.data.unitMeasure !== undefined) {
      updatePayload.unit_measure = parsed.data.unitMeasure ?? null;
    }

    if (parsed.data.packSize !== undefined) {
      updatePayload.pack_size = parsed.data.packSize ?? null;
    }

    if (parsed.data.sellingUnit !== undefined) {
      updatePayload.selling_unit = parsed.data.sellingUnit ?? null;
    }

    if (parsed.data.quantityEntryMode !== undefined) {
      updatePayload.quantity_entry_mode = mergedQuantityEntryMode;
    }

    if (
      parsed.data.displayName !== undefined ||
      parsed.data.brand !== undefined ||
      parsed.data.productFamily !== undefined ||
      parsed.data.variant !== undefined ||
      parsed.data.unitSize !== undefined ||
      parsed.data.unitMeasure !== undefined ||
      parsed.data.packSize !== undefined ||
      parsed.data.sellingUnit !== undefined ||
      parsed.data.quantityEntryMode !== undefined
    ) {
      updatePayload.display_name =
        normalizeOptionalText(parsed.data.displayName) ??
        generatedDisplayName ??
        existing.data.display_name ??
        existing.data.product_name;
    }

    if (parsed.data.isActive !== undefined) {
      updatePayload.is_active = parsed.data.isActive;
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = (await supabase
      .from("products")
      .update(updatePayload as never)
      .eq("id", parsedId.data)
      .eq("organization_id", membership.organizationId)
      .select(PRODUCT_SELECT)
      .maybeSingle()) as {
      data: ProductRecord | null;
      error: Parameters<typeof fromPostgrestError>[0] | null;
    };

    if (error) {
      return fromPostgrestError(error);
    }

    if (!data) {
      return errorResponse(404, "PRODUCT_NOT_FOUND", "Product not found.");
    }

    return successResponse(mapProduct(data));
  }

  static async deactivateProduct(productId: string) {
    const auth = await requireRole(["admin", "supervisor"]);
    if (auth.response || !auth.context) {
      return auth.response;
    }

    const parsedId = uuidSchema.safeParse(productId);
    if (!parsedId.success) {
      return errorResponse(422, "INVALID_ID", "A valid product id is required.");
    }

    const membership = await resolveActiveOrganizationId(auth.context.user.id);
    if (membership.response) {
      return membership.response;
    }

    if (!membership.organizationId) {
      return errorResponse(
        403,
        "MEMBERSHIP_REQUIRED",
        "An active organization membership is required to access products."
      );
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = (await supabase
      .from("products")
      .update({ is_active: false } as never)
      .eq("id", parsedId.data)
      .eq("organization_id", membership.organizationId)
      .select(PRODUCT_SELECT)
      .maybeSingle()) as {
      data: ProductRecord | null;
      error: Parameters<typeof fromPostgrestError>[0] | null;
    };

    if (error) {
      return fromPostgrestError(error);
    }

    if (!data) {
      return errorResponse(404, "PRODUCT_NOT_FOUND", "Product not found.");
    }

    return successResponse(mapProduct(data));
  }
}
