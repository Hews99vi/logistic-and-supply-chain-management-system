import { requireAuth, requireRole } from "@/lib/auth/helpers";
import { errorResponse, fromPostgrestError, successResponse } from "@/lib/db/response";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPaginationRange, uuidSchema } from "@/lib/validation/common";
import {
  routeProgramCreateSchema,
  routeProgramListQuerySchema,
  routeProgramUpdateSchema
} from "@/lib/validation/route-program";

type RouteProgramRecord = {
  id: string;
  organization_id: string;
  territory_name: string;
  day_of_week: number;
  frequency_label: string;
  route_name: string;
  route_description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type MembershipLookup = {
  organization_id: string;
};

const ROUTE_PROGRAM_SELECT = "id, organization_id, territory_name, day_of_week, frequency_label, route_name, route_description, is_active, created_at, updated_at";

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
        "An active organization membership is required to access route programs."
      )
    };
  }

  return {
    organizationId: membershipResult.data.organization_id,
    response: null
  };
}

export class RouteProgramService {
  static async listRoutePrograms(request: Request) {
    const auth = await requireAuth();
    if (auth.response || !auth.context) {
      return auth.response;
    }

    const { searchParams } = new URL(request.url);
    const parsed = routeProgramListQuerySchema.safeParse(Object.fromEntries(searchParams.entries()));

    if (!parsed.success) {
      return errorResponse(422, "VALIDATION_ERROR", "Invalid route program query parameters.", parsed.error.flatten());
    }

    const membership = await resolveActiveOrganizationId(auth.context.user.id);
    if (membership.response) {
      return membership.response;
    }

    if (!membership.organizationId) {
      return errorResponse(
        403,
        "MEMBERSHIP_REQUIRED",
        "An active organization membership is required to access route programs."
      );
    }

    const { page, pageSize, search, territory, dayOfWeek, isActive } = parsed.data;
    const { from, to } = getPaginationRange(page, pageSize);
    const supabase = await createSupabaseServerClient();

    let query = supabase
      .from("route_programs")
      .select(ROUTE_PROGRAM_SELECT, { count: "exact" })
      .eq("organization_id", membership.organizationId)
      .order("territory_name", { ascending: true })
      .range(from, to);

    if (territory) {
      query = query.ilike("territory_name", `%${territory}%`);
    }

    if (search) {
      const searchTerm = `%${search}%`;
      query = query.or(`territory_name.ilike.${searchTerm},route_name.ilike.${searchTerm},frequency_label.ilike.${searchTerm}`);
    }

    if (dayOfWeek !== undefined) {
      query = query.eq("day_of_week", dayOfWeek);
    }

    if (typeof isActive === "boolean") {
      query = query.eq("is_active", isActive);
    }

    const { data, count, error } = (await query) as {
      data: RouteProgramRecord[] | null;
      count: number | null;
      error: Parameters<typeof fromPostgrestError>[0] | null;
    };

    if (error) {
      return fromPostgrestError(error);
    }

    return successResponse({
      items: data ?? [],
      page,
      pageSize,
      total: count ?? 0
    });
  }

  static async getRouteProgramById(routeProgramId: string) {
    const auth = await requireAuth();
    if (auth.response || !auth.context) {
      return auth.response;
    }

    const parsedId = uuidSchema.safeParse(routeProgramId);
    if (!parsedId.success) {
      return errorResponse(422, "INVALID_ID", "A valid route program id is required.");
    }

    const membership = await resolveActiveOrganizationId(auth.context.user.id);
    if (membership.response) {
      return membership.response;
    }

    if (!membership.organizationId) {
      return errorResponse(
        403,
        "MEMBERSHIP_REQUIRED",
        "An active organization membership is required to access route programs."
      );
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = (await supabase
      .from("route_programs")
      .select(ROUTE_PROGRAM_SELECT)
      .eq("id", parsedId.data)
      .eq("organization_id", membership.organizationId)
      .maybeSingle()) as {
      data: RouteProgramRecord | null;
      error: Parameters<typeof fromPostgrestError>[0] | null;
    };

    if (error) {
      return fromPostgrestError(error);
    }

    if (!data) {
      return errorResponse(404, "ROUTE_PROGRAM_NOT_FOUND", "Route program not found.");
    }

    return successResponse(data);
  }

  static async createRouteProgram(request: Request) {
    const auth = await requireRole(["admin", "supervisor"]);
    if (auth.response || !auth.context) {
      return auth.response;
    }

    const body = await request.json().catch(() => null);
    const parsed = routeProgramCreateSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse(422, "VALIDATION_ERROR", "Invalid route program payload.", parsed.error.flatten());
    }

    const membership = await resolveActiveOrganizationId(auth.context.user.id);
    if (membership.response) {
      return membership.response;
    }

    if (!membership.organizationId) {
      return errorResponse(
        403,
        "MEMBERSHIP_REQUIRED",
        "An active organization membership is required to access route programs."
      );
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = (await supabase
      .from("route_programs")
      .insert({
        organization_id: membership.organizationId,
        territory_name: parsed.data.territoryName,
        day_of_week: parsed.data.dayOfWeek,
        frequency_label: parsed.data.frequencyLabel,
        route_name: parsed.data.routeName,
        route_description: parsed.data.routeDescription ?? null,
        is_active: parsed.data.isActive
      } as never)
      .select(ROUTE_PROGRAM_SELECT)
      .single()) as {
      data: RouteProgramRecord | null;
      error: Parameters<typeof fromPostgrestError>[0] | null;
    };

    if (error) {
      return fromPostgrestError(error);
    }

    return successResponse(data as RouteProgramRecord, { status: 201 });
  }

  static async updateRouteProgram(routeProgramId: string, request: Request) {
    const auth = await requireRole(["admin", "supervisor"]);
    if (auth.response || !auth.context) {
      return auth.response;
    }

    const parsedId = uuidSchema.safeParse(routeProgramId);
    if (!parsedId.success) {
      return errorResponse(422, "INVALID_ID", "A valid route program id is required.");
    }

    const body = await request.json().catch(() => null);
    const parsed = routeProgramUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse(422, "VALIDATION_ERROR", "Invalid route program payload.", parsed.error.flatten());
    }

    const membership = await resolveActiveOrganizationId(auth.context.user.id);
    if (membership.response) {
      return membership.response;
    }

    if (!membership.organizationId) {
      return errorResponse(
        403,
        "MEMBERSHIP_REQUIRED",
        "An active organization membership is required to access route programs."
      );
    }

    const updatePayload: Record<string, unknown> = {};

    if (parsed.data.territoryName !== undefined) {
      updatePayload.territory_name = parsed.data.territoryName;
    }
    if (parsed.data.dayOfWeek !== undefined) {
      updatePayload.day_of_week = parsed.data.dayOfWeek;
    }
    if (parsed.data.frequencyLabel !== undefined) {
      updatePayload.frequency_label = parsed.data.frequencyLabel;
    }
    if (parsed.data.routeName !== undefined) {
      updatePayload.route_name = parsed.data.routeName;
    }
    if (parsed.data.routeDescription !== undefined) {
      updatePayload.route_description = parsed.data.routeDescription ?? null;
    }
    if (parsed.data.isActive !== undefined) {
      updatePayload.is_active = parsed.data.isActive;
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = (await supabase
      .from("route_programs")
      .update(updatePayload as never)
      .eq("id", parsedId.data)
      .eq("organization_id", membership.organizationId)
      .select(ROUTE_PROGRAM_SELECT)
      .maybeSingle()) as {
      data: RouteProgramRecord | null;
      error: Parameters<typeof fromPostgrestError>[0] | null;
    };

    if (error) {
      return fromPostgrestError(error);
    }

    if (!data) {
      return errorResponse(404, "ROUTE_PROGRAM_NOT_FOUND", "Route program not found.");
    }

    return successResponse(data);
  }

  static async deactivateRouteProgram(routeProgramId: string) {
    const auth = await requireRole(["admin", "supervisor"]);
    if (auth.response || !auth.context) {
      return auth.response;
    }

    const parsedId = uuidSchema.safeParse(routeProgramId);
    if (!parsedId.success) {
      return errorResponse(422, "INVALID_ID", "A valid route program id is required.");
    }

    const membership = await resolveActiveOrganizationId(auth.context.user.id);
    if (membership.response) {
      return membership.response;
    }

    if (!membership.organizationId) {
      return errorResponse(
        403,
        "MEMBERSHIP_REQUIRED",
        "An active organization membership is required to access route programs."
      );
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = (await supabase
      .from("route_programs")
      .update({ is_active: false } as never)
      .eq("id", parsedId.data)
      .eq("organization_id", membership.organizationId)
      .select(ROUTE_PROGRAM_SELECT)
      .maybeSingle()) as {
      data: RouteProgramRecord | null;
      error: Parameters<typeof fromPostgrestError>[0] | null;
    };

    if (error) {
      return fromPostgrestError(error);
    }

    if (!data) {
      return errorResponse(404, "ROUTE_PROGRAM_NOT_FOUND", "Route program not found.");
    }

    return successResponse(data);
  }
}
