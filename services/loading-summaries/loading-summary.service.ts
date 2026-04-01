import { requireAuth } from "@/lib/auth/helpers";
import { errorResponse, fromPostgrestError, successResponse } from "@/lib/db/response";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPaginationRange, uuidSchema } from "@/lib/validation/common";
import {
  loadingSummaryCreateSchema,
  loadingSummaryFinalizeSchema,
  loadingSummaryListQuerySchema,
  loadingSummaryUpdateSchema
} from "@/lib/validation/loading-summary";

type MembershipLookup = {
  organization_id: string;
};

type DailyReportLoadingRow = {
  id: string;
  report_date: string;
  route_program_id: string;
  prepared_by: string;
  staff_name: string;
  territory_name_snapshot: string;
  route_name_snapshot: string;
  status: "draft" | "submitted" | "approved" | "rejected";
  remarks: string | null;
  loading_completed_at: string | null;
  loading_completed_by: string | null;
  loading_notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type RouteProgramLookup = {
  id: string;
  organization_id: string;
  territory_name: string;
  route_name: string;
  is_active: boolean;
};

type LoadingSummaryItemCompleteness = {
  totalItems: number;
  positiveLoadingItems: number;
};

const LOADING_SUMMARY_SELECT = `
  id,
  report_date,
  route_program_id,
  prepared_by,
  staff_name,
  territory_name_snapshot,
  route_name_snapshot,
  status,
  remarks,
  loading_completed_at,
  loading_completed_by,
  loading_notes,
  created_at,
  updated_at,
  deleted_at
`.replace(/\s+/g, " ").trim();

const sortColumnMap: Record<
  "reportDate" | "routeNameSnapshot" | "territoryNameSnapshot" | "staffName" | "status" | "updatedAt" | "loadingCompletedAt",
  string
> = {
  reportDate: "report_date",
  routeNameSnapshot: "route_name_snapshot",
  territoryNameSnapshot: "territory_name_snapshot",
  staffName: "staff_name",
  status: "status",
  updatedAt: "updated_at",
  loadingCompletedAt: "loading_completed_at"
};

function mapLoadingSummary(row: DailyReportLoadingRow) {
  return {
    id: row.id,
    dateReportId: row.id,
    reportDate: row.report_date,
    routeProgramId: row.route_program_id,
    preparedBy: row.prepared_by,
    staffName: row.staff_name,
    territoryNameSnapshot: row.territory_name_snapshot,
    routeNameSnapshot: row.route_name_snapshot,
    status: row.status,
    remarks: row.remarks,
    loadingCompletedAt: row.loading_completed_at,
    loadingCompletedBy: row.loading_completed_by,
    loadingNotes: row.loading_notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
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
        "An active organization membership is required to access loading summaries."
      )
    };
  }

  return {
    organizationId: membershipResult.data.organization_id,
    response: null
  };
}

async function getScopedRouteProgram(routeProgramId: string, organizationId: string, requireActive = false) {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("route_programs")
    .select("id, organization_id, territory_name, route_name, is_active")
    .eq("id", routeProgramId)
    .eq("organization_id", organizationId);

  if (requireActive) {
    query = query.eq("is_active", true);
  }

  const { data, error } = (await query.maybeSingle()) as {
    data: RouteProgramLookup | null;
    error: Parameters<typeof fromPostgrestError>[0] | null;
  };

  if (error) {
    return { data: null, response: fromPostgrestError(error) };
  }

  if (!data) {
    return {
      data: null,
      response: errorResponse(404, "ROUTE_PROGRAM_NOT_FOUND", "Route program not found for this organization.")
    };
  }

  return { data, response: null };
}

async function findExistingRouteDaySummary(reportDate: string, routeProgramId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = (await supabase
    .from("daily_reports")
    .select(LOADING_SUMMARY_SELECT)
    .eq("report_date", reportDate)
    .eq("route_program_id", routeProgramId)
    .is("deleted_at", null)
    .maybeSingle()) as {
      data: DailyReportLoadingRow | null;
      error: Parameters<typeof fromPostgrestError>[0] | null;
    };

  if (error) {
    return { data: null, response: fromPostgrestError(error) };
  }

  return { data, response: null };
}

async function getScopedSummary(summaryId: string, organizationId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = (await supabase
    .from("daily_reports")
    .select(LOADING_SUMMARY_SELECT)
    .eq("id", summaryId)
    .is("deleted_at", null)
    .maybeSingle()) as {
    data: DailyReportLoadingRow | null;
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

  const routeProgram = await getScopedRouteProgram(data.route_program_id, organizationId);
  if (routeProgram.response) {
    return {
      data: null,
      response: errorResponse(404, "LOADING_SUMMARY_NOT_FOUND", "Loading summary not found.")
    };
  }

  return { data, response: null };
}

function canManageLoadingSummary(role: string) {
  return role === "admin" || role === "supervisor" || role === "driver";
}

function membershipRequiredResponse() {
  return errorResponse(
    403,
    "MEMBERSHIP_REQUIRED",
    "An active organization membership is required to access loading summaries."
  );
}

async function getLoadingSummaryItemCompleteness(summaryId: string) {
  const supabase = await createSupabaseServerClient();

  const totalItemsResult = (await supabase
    .from("report_inventory_entries")
    .select("id", { count: "exact", head: true })
    .eq("daily_report_id", summaryId)) as {
      count: number | null;
      error: Parameters<typeof fromPostgrestError>[0] | null;
    };

  if (totalItemsResult.error) {
    return {
      data: null,
      response: fromPostgrestError(totalItemsResult.error)
    };
  }

  const positiveLoadingItemsResult = (await supabase
    .from("report_inventory_entries")
    .select("id", { count: "exact", head: true })
    .eq("daily_report_id", summaryId)
    .gt("loading_qty", 0)) as {
      count: number | null;
      error: Parameters<typeof fromPostgrestError>[0] | null;
    };

  if (positiveLoadingItemsResult.error) {
    return {
      data: null,
      response: fromPostgrestError(positiveLoadingItemsResult.error)
    };
  }

  return {
    data: {
      totalItems: totalItemsResult.count ?? 0,
      positiveLoadingItems: positiveLoadingItemsResult.count ?? 0
    } satisfies LoadingSummaryItemCompleteness,
    response: null
  };
}

export class LoadingSummaryService {
  static async list(request: Request) {
    const auth = await requireAuth();
    if (auth.response || !auth.context) {
      return auth.response;
    }

    const parsed = loadingSummaryListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()));
    if (!parsed.success) {
      return errorResponse(422, "VALIDATION_ERROR", "Invalid loading summary query parameters.", parsed.error.flatten());
    }

    const membership = await resolveActiveOrganizationId(auth.context.user.id);
    if (membership.response) {
      return membership.response;
    }
    if (!membership.organizationId) {
      return membershipRequiredResponse();
    }

    const supabase = await createSupabaseServerClient();

    const routeProgramIdsResult = (await supabase
      .from("route_programs")
      .select("id")
      .eq("organization_id", membership.organizationId)) as {
      data: Array<{ id: string }> | null;
      error: Parameters<typeof fromPostgrestError>[0] | null;
    };

    if (routeProgramIdsResult.error) {
      return fromPostgrestError(routeProgramIdsResult.error);
    }

    const routeProgramIds = (routeProgramIdsResult.data ?? []).map((item) => item.id);
    if (routeProgramIds.length === 0) {
      return successResponse({ items: [], page: parsed.data.page, pageSize: parsed.data.pageSize, total: 0 });
    }

    const { page, pageSize, dateFrom, dateTo, routeProgramId, status, search, onlyCompleted, sortKey, sortDirection } = parsed.data;
    const { from, to } = getPaginationRange(page, pageSize);

    let query = supabase
      .from("daily_reports")
      .select(LOADING_SUMMARY_SELECT, { count: "exact" })
      .in("route_program_id", routeProgramIds)
      .is("deleted_at", null)
      .range(from, to);

    if (dateFrom) query = query.gte("report_date", dateFrom);
    if (dateTo) query = query.lte("report_date", dateTo);
    if (routeProgramId) query = query.eq("route_program_id", routeProgramId);
    if (status) query = query.eq("status", status);

    if (typeof onlyCompleted === "boolean") {
      query = onlyCompleted ? query.not("loading_completed_at", "is", null) : query.is("loading_completed_at", null);
    }

    if (search) {
      const normalizedSearch = search.replace(/[%_]/g, "").trim();
      if (normalizedSearch.length > 0) {
        const likeTerm = `%${normalizedSearch}%`;
        query = query.or(`route_name_snapshot.ilike.${likeTerm},territory_name_snapshot.ilike.${likeTerm},staff_name.ilike.${likeTerm}`);
      }
    }

    const sortColumn = sortColumnMap[sortKey];
    query = query.order(sortColumn, { ascending: sortDirection === "asc", nullsFirst: false });
    if (sortColumn !== "updated_at") {
      query = query.order("updated_at", { ascending: false });
    }

    const { data, count, error } = (await query) as {
      data: DailyReportLoadingRow[] | null;
      count: number | null;
      error: Parameters<typeof fromPostgrestError>[0] | null;
    };

    if (error) {
      return fromPostgrestError(error);
    }

    return successResponse({
      items: (data ?? []).map(mapLoadingSummary),
      page,
      pageSize,
      total: count ?? 0
    });
  }

  static async create(request: Request) {
    const auth = await requireAuth();
    if (auth.response || !auth.context) {
      return auth.response;
    }

    if (!canManageLoadingSummary(auth.context.profile.role)) {
      return errorResponse(403, "FORBIDDEN", "Only admin, supervisor, or driver can create loading summaries.");
    }

    const body = await request.json().catch(() => null);
    const parsed = loadingSummaryCreateSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse(422, "VALIDATION_ERROR", "Invalid loading summary payload.", parsed.error.flatten());
    }

    const membership = await resolveActiveOrganizationId(auth.context.user.id);
    if (membership.response) {
      return membership.response;
    }
    if (!membership.organizationId) {
      return membershipRequiredResponse();
    }

    const routeProgram = await getScopedRouteProgram(parsed.data.routeProgramId, membership.organizationId, true);
    if (routeProgram.response || !routeProgram.data) {
      return routeProgram.response;
    }

    const existingRouteDaySummary = await findExistingRouteDaySummary(parsed.data.reportDate, parsed.data.routeProgramId);
    if (existingRouteDaySummary.response) {
      return existingRouteDaySummary.response;
    }

    if (existingRouteDaySummary.data) {
      return successResponse(mapLoadingSummary(existingRouteDaySummary.data));
    }

    // Authorization and organization scoping are enforced before this write.
    // Using the admin client here avoids brittle insert-time RLS or trigger
    // failures on initial route-day creation, matching the daily report create flow.
    const supabase = createSupabaseAdminClient();
    const { data, error } = (await supabase
      .from("daily_reports")
      .insert({
        report_date: parsed.data.reportDate,
        route_program_id: parsed.data.routeProgramId,
        prepared_by: auth.context.user.id,
        staff_name: parsed.data.staffName,
        territory_name_snapshot: routeProgram.data.territory_name,
        route_name_snapshot: routeProgram.data.route_name,
        remarks: parsed.data.remarks ?? null,
        loading_notes: parsed.data.loadingNotes ?? null,
        status: "draft"
      } as never)
      .select(LOADING_SUMMARY_SELECT)
      .single()) as {
      data: DailyReportLoadingRow | null;
      error: Parameters<typeof fromPostgrestError>[0] | null;
    };

    if (error) {
      if (error.code === "23505") {
        const existingRouteDaySummary = await findExistingRouteDaySummary(parsed.data.reportDate, parsed.data.routeProgramId);
        if (existingRouteDaySummary.response) {
          return existingRouteDaySummary.response;
        }

        if (existingRouteDaySummary.data) {
          return successResponse(mapLoadingSummary(existingRouteDaySummary.data));
        }

        return errorResponse(409, "ROUTE_DAY_ALREADY_EXISTS", "A route-day loading summary already exists for this route and date.");
      }

      return fromPostgrestError(error);
    }

    return successResponse(mapLoadingSummary(data as DailyReportLoadingRow), { status: 201 });
  }

  static async getById(summaryId: string) {
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

    const summary = await getScopedSummary(parsedId.data, membership.organizationId);
    if (summary.response || !summary.data) {
      return summary.response;
    }

    return successResponse(mapLoadingSummary(summary.data));
  }

  static async update(summaryId: string, request: Request) {
    const auth = await requireAuth();
    if (auth.response || !auth.context) {
      return auth.response;
    }

    if (!canManageLoadingSummary(auth.context.profile.role)) {
      return errorResponse(403, "FORBIDDEN", "Only admin, supervisor, or driver can update loading summaries.");
    }

    const parsedId = uuidSchema.safeParse(summaryId);
    if (!parsedId.success) {
      return errorResponse(422, "INVALID_SUMMARY_ID", "A valid loading summary id is required.");
    }

    const body = await request.json().catch(() => null);
    const parsed = loadingSummaryUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(422, "VALIDATION_ERROR", "Invalid loading summary payload.", parsed.error.flatten());
    }

    const membership = await resolveActiveOrganizationId(auth.context.user.id);
    if (membership.response) {
      return membership.response;
    }
    if (!membership.organizationId) {
      return membershipRequiredResponse();
    }

    const scoped = await getScopedSummary(parsedId.data, membership.organizationId);
    if (scoped.response || !scoped.data) {
      return scoped.response;
    }

    if (scoped.data.status !== "draft") {
      return errorResponse(409, "SUMMARY_LOCKED", "Loading summary can only be updated while draft.");
    }

    if (scoped.data.loading_completed_at) {
      return errorResponse(409, "LOADING_ALREADY_COMPLETED", "Completed loading summaries cannot be edited.");
    }

    if (auth.context.profile.role === "driver" && scoped.data.prepared_by !== auth.context.user.id) {
      return errorResponse(403, "FORBIDDEN", "Drivers can only edit their own loading summaries.");
    }

    const updatePayload: Record<string, unknown> = {};
    if (parsed.data.reportDate !== undefined) updatePayload.report_date = parsed.data.reportDate;
    if (parsed.data.staffName !== undefined) updatePayload.staff_name = parsed.data.staffName;
    if (parsed.data.remarks !== undefined) updatePayload.remarks = parsed.data.remarks;
    if (parsed.data.loadingNotes !== undefined) updatePayload.loading_notes = parsed.data.loadingNotes;

    const supabase = await createSupabaseServerClient();
    const { data, error } = (await supabase
      .from("daily_reports")
      .update(updatePayload as never)
      .eq("id", parsedId.data)
      .select(LOADING_SUMMARY_SELECT)
      .single()) as {
      data: DailyReportLoadingRow | null;
      error: Parameters<typeof fromPostgrestError>[0] | null;
    };

    if (error) {
      return fromPostgrestError(error);
    }

    return successResponse(mapLoadingSummary(data as DailyReportLoadingRow));
  }

  static async finalize(summaryId: string, request: Request) {
    const auth = await requireAuth();
    if (auth.response || !auth.context) {
      return auth.response;
    }

    if (!canManageLoadingSummary(auth.context.profile.role)) {
      return errorResponse(403, "FORBIDDEN", "Only admin, supervisor, or driver can finalize loading summaries.");
    }

    const parsedId = uuidSchema.safeParse(summaryId);
    if (!parsedId.success) {
      return errorResponse(422, "INVALID_SUMMARY_ID", "A valid loading summary id is required.");
    }

    const body = await request.json().catch(() => ({}));
    const parsed = loadingSummaryFinalizeSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(422, "VALIDATION_ERROR", "Invalid finalize payload.", parsed.error.flatten());
    }

    const membership = await resolveActiveOrganizationId(auth.context.user.id);
    if (membership.response) {
      return membership.response;
    }
    if (!membership.organizationId) {
      return membershipRequiredResponse();
    }

    const scoped = await getScopedSummary(parsedId.data, membership.organizationId);
    if (scoped.response || !scoped.data) {
      return scoped.response;
    }

    if (scoped.data.status !== "draft") {
      return errorResponse(409, "SUMMARY_LOCKED", "Only draft loading summaries can be finalized.");
    }

    if (scoped.data.loading_completed_at) {
      return errorResponse(409, "LOADING_ALREADY_COMPLETED", "Loading has already been finalized.");
    }

    if (auth.context.profile.role === "driver" && scoped.data.prepared_by !== auth.context.user.id) {
      return errorResponse(403, "FORBIDDEN", "Drivers can only finalize their own loading summaries.");
    }

    const completeness = await getLoadingSummaryItemCompleteness(parsedId.data);
    if (completeness.response || !completeness.data) {
      return completeness.response;
    }

    if (completeness.data.totalItems === 0) {
      return errorResponse(
        409,
        "LOADING_SUMMARY_INCOMPLETE",
        "Add at least one loading line item before finalizing the loading summary."
      );
    }

    if (completeness.data.positiveLoadingItems === 0) {
      return errorResponse(
        409,
        "LOADING_SUMMARY_INCOMPLETE",
        "At least one loading line item must have a loading quantity greater than zero before finalizing."
      );
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = (await supabase
      .from("daily_reports")
      .update({
        loading_completed_at: new Date().toISOString(),
        loading_completed_by: auth.context.user.id,
        ...(parsed.data.loadingNotes !== undefined ? { loading_notes: parsed.data.loadingNotes } : {})
      } as never)
      .eq("id", parsedId.data)
      .select(LOADING_SUMMARY_SELECT)
      .single()) as {
      data: DailyReportLoadingRow | null;
      error: Parameters<typeof fromPostgrestError>[0] | null;
    };

    if (error) {
      return fromPostgrestError(error);
    }

    return successResponse(mapLoadingSummary(data as DailyReportLoadingRow));
  }
}








