import { requireAuth, requireRole } from "@/lib/auth/helpers";
import { errorResponse, fromPostgrestError, successResponse } from "@/lib/db/response";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPaginationRange, uuidSchema } from "@/lib/validation/common";
import {
  customerCreateSchema,
  customerListQuerySchema,
  customerUpdateSchema
} from "@/lib/validation/customer";

type CustomerRecord = {
  id: string;
  organization_id: string;
  code: string;
  name: string;
  channel: "RETAIL" | "WHOLESALE" | "INSTITUTIONAL";
  phone: string | null;
  email: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  status: "ACTIVE" | "INACTIVE";
  created_at: string;
  updated_at: string;
};

type MembershipLookup = {
  organization_id: string;
};

const CUSTOMER_SELECT = "id, organization_id, code, name, channel, phone, email, address_line_1, address_line_2, city, status, created_at, updated_at";

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
        "An active organization membership is required to access customers."
      )
    };
  }

  return {
    organizationId: membershipResult.data.organization_id,
    response: null
  };
}

export class CustomerService {
  static async listCustomers(request: Request) {
    const auth = await requireAuth();
    if (auth.response || !auth.context) {
      return auth.response;
    }

    const { searchParams } = new URL(request.url);
    const parsed = customerListQuerySchema.safeParse(Object.fromEntries(searchParams.entries()));

    if (!parsed.success) {
      return errorResponse(422, "VALIDATION_ERROR", "Invalid customer query parameters.", parsed.error.flatten());
    }

    const membership = await resolveActiveOrganizationId(auth.context.user.id);
    if (membership.response) {
      return membership.response;
    }

    if (!membership.organizationId) {
      return errorResponse(
        403,
        "MEMBERSHIP_REQUIRED",
        "An active organization membership is required to access customers."
      );
    }

    const { page, pageSize, search, territory, assignment, status, isActive } = parsed.data;
    const territorySearch = territory ?? assignment;
    const { from, to } = getPaginationRange(page, pageSize);
    const supabase = await createSupabaseServerClient();

    let query = supabase
      .from("customers")
      .select(CUSTOMER_SELECT, { count: "exact" })
      .eq("organization_id", membership.organizationId)
      .order("name", { ascending: true })
      .range(from, to);

    if (search) {
      const searchTerm = `%${search}%`;
      query = query.or(`code.ilike.${searchTerm},name.ilike.${searchTerm},phone.ilike.${searchTerm},email.ilike.${searchTerm}`);
    }

    if (territorySearch) {
      const assignmentTerm = `%${territorySearch}%`;

      if (search) {
        query = query.ilike("city", assignmentTerm);
      } else {
        query = query.or(`city.ilike.${assignmentTerm},address_line_1.ilike.${assignmentTerm},address_line_2.ilike.${assignmentTerm}`);
      }
    }

    const effectiveStatus = status ?? (typeof isActive === "boolean" ? (isActive ? "ACTIVE" : "INACTIVE") : undefined);
    if (effectiveStatus) {
      query = query.eq("status", effectiveStatus);
    }

    const { data, count, error } = (await query) as {
      data: CustomerRecord[] | null;
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

  static async getCustomerById(customerId: string) {
    const auth = await requireAuth();
    if (auth.response || !auth.context) {
      return auth.response;
    }

    const parsedId = uuidSchema.safeParse(customerId);
    if (!parsedId.success) {
      return errorResponse(422, "INVALID_ID", "A valid customer id is required.");
    }

    const membership = await resolveActiveOrganizationId(auth.context.user.id);
    if (membership.response) {
      return membership.response;
    }

    if (!membership.organizationId) {
      return errorResponse(
        403,
        "MEMBERSHIP_REQUIRED",
        "An active organization membership is required to access customers."
      );
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = (await supabase
      .from("customers")
      .select(CUSTOMER_SELECT)
      .eq("id", parsedId.data)
      .eq("organization_id", membership.organizationId)
      .maybeSingle()) as {
      data: CustomerRecord | null;
      error: Parameters<typeof fromPostgrestError>[0] | null;
    };

    if (error) {
      return fromPostgrestError(error);
    }

    if (!data) {
      return errorResponse(404, "CUSTOMER_NOT_FOUND", "Customer not found.");
    }

    return successResponse(data);
  }

  static async createCustomer(request: Request) {
    const auth = await requireRole(["admin", "supervisor"]);
    if (auth.response || !auth.context) {
      return auth.response;
    }

    const body = await request.json().catch(() => null);
    const parsed = customerCreateSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse(422, "VALIDATION_ERROR", "Invalid customer payload.", parsed.error.flatten());
    }

    const membership = await resolveActiveOrganizationId(auth.context.user.id);
    if (membership.response) {
      return membership.response;
    }

    if (!membership.organizationId) {
      return errorResponse(
        403,
        "MEMBERSHIP_REQUIRED",
        "An active organization membership is required to access customers."
      );
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = (await supabase
      .from("customers")
      .insert({
        organization_id: membership.organizationId,
        code: parsed.data.code,
        name: parsed.data.name,
        channel: parsed.data.channel,
        phone: parsed.data.phone ?? null,
        email: parsed.data.email ?? null,
        address_line_1: parsed.data.addressLine1 ?? null,
        address_line_2: parsed.data.addressLine2 ?? null,
        city: parsed.data.city ?? null,
        status: parsed.data.status
      } as never)
      .select(CUSTOMER_SELECT)
      .single()) as {
      data: CustomerRecord | null;
      error: Parameters<typeof fromPostgrestError>[0] | null;
    };

    if (error) {
      return fromPostgrestError(error);
    }

    return successResponse(data as CustomerRecord, { status: 201 });
  }

  static async updateCustomer(customerId: string, request: Request) {
    const auth = await requireRole(["admin", "supervisor"]);
    if (auth.response || !auth.context) {
      return auth.response;
    }

    const parsedId = uuidSchema.safeParse(customerId);
    if (!parsedId.success) {
      return errorResponse(422, "INVALID_ID", "A valid customer id is required.");
    }

    const body = await request.json().catch(() => null);
    const parsed = customerUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse(422, "VALIDATION_ERROR", "Invalid customer payload.", parsed.error.flatten());
    }

    const membership = await resolveActiveOrganizationId(auth.context.user.id);
    if (membership.response) {
      return membership.response;
    }

    if (!membership.organizationId) {
      return errorResponse(
        403,
        "MEMBERSHIP_REQUIRED",
        "An active organization membership is required to access customers."
      );
    }

    const updatePayload: Record<string, unknown> = {};

    if (parsed.data.code !== undefined) updatePayload.code = parsed.data.code;
    if (parsed.data.name !== undefined) updatePayload.name = parsed.data.name;
    if (parsed.data.channel !== undefined) updatePayload.channel = parsed.data.channel;
    if (parsed.data.phone !== undefined) updatePayload.phone = parsed.data.phone;
    if (parsed.data.email !== undefined) updatePayload.email = parsed.data.email;
    if (parsed.data.addressLine1 !== undefined) updatePayload.address_line_1 = parsed.data.addressLine1;
    if (parsed.data.addressLine2 !== undefined) updatePayload.address_line_2 = parsed.data.addressLine2;
    if (parsed.data.city !== undefined) updatePayload.city = parsed.data.city;
    if (parsed.data.status !== undefined) updatePayload.status = parsed.data.status;

    const supabase = await createSupabaseServerClient();
    const { data, error } = (await supabase
      .from("customers")
      .update(updatePayload as never)
      .eq("id", parsedId.data)
      .eq("organization_id", membership.organizationId)
      .select(CUSTOMER_SELECT)
      .maybeSingle()) as {
      data: CustomerRecord | null;
      error: Parameters<typeof fromPostgrestError>[0] | null;
    };

    if (error) {
      return fromPostgrestError(error);
    }

    if (!data) {
      return errorResponse(404, "CUSTOMER_NOT_FOUND", "Customer not found.");
    }

    return successResponse(data);
  }

  static async deactivateCustomer(customerId: string) {
    const auth = await requireRole(["admin", "supervisor"]);
    if (auth.response || !auth.context) {
      return auth.response;
    }

    const parsedId = uuidSchema.safeParse(customerId);
    if (!parsedId.success) {
      return errorResponse(422, "INVALID_ID", "A valid customer id is required.");
    }

    const membership = await resolveActiveOrganizationId(auth.context.user.id);
    if (membership.response) {
      return membership.response;
    }

    if (!membership.organizationId) {
      return errorResponse(
        403,
        "MEMBERSHIP_REQUIRED",
        "An active organization membership is required to access customers."
      );
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = (await supabase
      .from("customers")
      .update({ status: "INACTIVE" } as never)
      .eq("id", parsedId.data)
      .eq("organization_id", membership.organizationId)
      .select(CUSTOMER_SELECT)
      .maybeSingle()) as {
      data: CustomerRecord | null;
      error: Parameters<typeof fromPostgrestError>[0] | null;
    };

    if (error) {
      return fromPostgrestError(error);
    }

    if (!data) {
      return errorResponse(404, "CUSTOMER_NOT_FOUND", "Customer not found.");
    }

    return successResponse(data);
  }
}

