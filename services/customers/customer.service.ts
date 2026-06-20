import { requireFeaturePermission } from "@/lib/auth/permissions";
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
  credit_days: number;
  credit_limit: number;
  credit_status: "active" | "hold" | "blocked";
  outstanding_credit?: number;
  overdue_credit?: number;
  created_at: string;
  updated_at: string;
};

type MembershipLookup = {
  organization_id: string;
};

const CUSTOMER_SELECT = "id, organization_id, code, name, channel, phone, email, address_line_1, address_line_2, city, status, credit_days, credit_limit, credit_status, created_at, updated_at";

async function resolveActiveOrganizationId(userId: string) {
  const supabase = await createSupabaseServerClient();
  const membershipResult = (await supabase
    .from("organization_memberships")
    .select("organization_id")
    .eq("user_id", userId)
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: true })
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

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function resolveAgingBucket(dueDate: string | null, status: string, outstandingAmount: number) {
  if (outstandingAmount <= 0 || status === "settled" || status === "written_off") return "settled";
  if (!dueDate) return "unassigned";

  const today = startOfToday();
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((today.getTime() - due.getTime()) / 86_400_000);

  if (diffDays < 0) return "current";
  if (diffDays === 0) return "due_today";
  if (diffDays <= 7) return "1_7";
  if (diffDays <= 14) return "8_14";
  if (diffDays <= 30) return "15_30";
  if (diffDays <= 60) return "31_60";
  if (diffDays <= 90) return "61_90";
  return "90_plus";
}

async function attachCustomerCreditSummaries(customers: CustomerRecord[], organizationId: string) {
  if (customers.length === 0) return customers;

  const supabase = await createSupabaseServerClient();
  const names = customers.map((customer) => customer.name);
  const { data } = await supabase
    .from("credit_invoices")
    .select("customer_name, due_date, outstanding_amount, status")
    .eq("organization_id", organizationId)
    .in("customer_name", names);

  const summaryByName = new Map<string, { outstanding: number; overdue: number }>();
  const today = startOfToday();

  for (const row of (data ?? []) as Array<{ customer_name: string; due_date: string | null; outstanding_amount: number; status: string }>) {
    const key = row.customer_name;
    const summary = summaryByName.get(key) ?? { outstanding: 0, overdue: 0 };
    const outstanding = Number(row.outstanding_amount ?? 0);
    if (outstanding > 0 && !["settled", "written_off"].includes(row.status)) {
      summary.outstanding += outstanding;
      if (row.due_date) {
        const due = new Date(row.due_date);
        due.setHours(0, 0, 0, 0);
        if (due < today) summary.overdue += outstanding;
      }
    }
    summaryByName.set(key, summary);
  }

  return customers.map((customer) => {
    const summary = summaryByName.get(customer.name) ?? { outstanding: 0, overdue: 0 };
    return {
      ...customer,
      outstanding_credit: summary.outstanding,
      overdue_credit: summary.overdue
    };
  });
}

export class CustomerService {
  static async listCustomers(request: Request) {
    const auth = await requireFeaturePermission("customers", "view");
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

    const items = await attachCustomerCreditSummaries(data ?? [], membership.organizationId);

    return successResponse({
      items,
      page,
      pageSize,
      total: count ?? 0
    });
  }

  static async getCustomerById(customerId: string) {
    const auth = await requireFeaturePermission("customers", "view");
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

    const [customer] = await attachCustomerCreditSummaries([data], membership.organizationId);
    return successResponse(customer);
  }

  static async createCustomer(request: Request) {
    const auth = await requireFeaturePermission("customers", "create");
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
        status: parsed.data.status,
        credit_days: parsed.data.creditDays,
        credit_limit: parsed.data.creditLimit,
        credit_status: parsed.data.creditStatus
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
    const auth = await requireFeaturePermission("customers", "edit");
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
    if (parsed.data.creditDays !== undefined) updatePayload.credit_days = parsed.data.creditDays;
    if (parsed.data.creditLimit !== undefined) updatePayload.credit_limit = parsed.data.creditLimit;
    if (parsed.data.creditStatus !== undefined) updatePayload.credit_status = parsed.data.creditStatus;

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

  static async getCustomerStatement(customerId: string) {
    const auth = await requireFeaturePermission("customers", "view");
    if (auth.response) return auth.response;
    if (!auth.context) return errorResponse(403, "FORBIDDEN", "Authentication context is required.");

    const parsedId = uuidSchema.safeParse(customerId);
    if (!parsedId.success) return errorResponse(422, "INVALID_ID", "A valid customer id is required.");

    const membership = await resolveActiveOrganizationId(auth.context.user.id);
    if (membership.response) return membership.response;
    if (!membership.organizationId) return errorResponse(403, "MEMBERSHIP_REQUIRED", "An active organization membership is required to access customers.");

    const supabase = await createSupabaseServerClient();
    const { data: customer, error: customerError } = (await supabase
      .from("customers")
      .select(CUSTOMER_SELECT)
      .eq("id", parsedId.data)
      .eq("organization_id", membership.organizationId)
      .maybeSingle()) as {
      data: CustomerRecord | null;
      error: Parameters<typeof fromPostgrestError>[0] | null;
    };

    if (customerError) return fromPostgrestError(customerError);
    if (!customer) return errorResponse(404, "CUSTOMER_NOT_FOUND", "Customer not found.");

    const normalizedName = customer.name.trim().toLowerCase();

    const [creditResult, collectionResult, chequeResult, billResult, eventResult] = await Promise.all([
      supabase
        .from("credit_invoices")
        .select("id, invoice_no, invoice_date, due_date, amount, collected_amount, outstanding_amount, status")
        .eq("organization_id", membership.organizationId)
        .ilike("customer_name", customer.name)
        .order("invoice_date", { ascending: false }),
      supabase
        .from("credit_collections")
        .select("id, credit_invoice_id, collected_at, amount, payment_method, reference_no, credit_invoices!inner(invoice_no, customer_name, organization_id)")
        .eq("credit_invoices.organization_id", membership.organizationId)
        .ilike("credit_invoices.customer_name", customer.name)
        .order("collected_at", { ascending: false }),
      supabase
        .from("report_cheques")
        .select("id, invoice_no, cheque_no, bank_name, amount, status, received_date, customer_name")
        .ilike("customer_name", customer.name)
        .order("received_date", { ascending: false }),
      supabase
        .from("report_bills")
        .select("id, invoice_no, amount_snapshot, status, created_at, customer_name")
        .ilike("customer_name", customer.name)
        .order("created_at", { ascending: false }),
      supabase
        .from("finance_ledger_events")
        .select("id, event_type, entity_type, amount, status_from, status_to, created_at")
        .eq("organization_id", membership.organizationId)
        .eq("customer_id", customer.id)
        .order("created_at", { ascending: false })
        .limit(100)
    ]);

    const errors = [creditResult.error, collectionResult.error, chequeResult.error, billResult.error, eventResult.error].filter(Boolean);
    if (errors.length > 0) return fromPostgrestError(errors[0] as Parameters<typeof fromPostgrestError>[0]);

    const creditInvoices = ((creditResult.data ?? []) as Array<{
      id: string;
      invoice_no: string;
      invoice_date: string;
      due_date: string | null;
      amount: number;
      collected_amount: number;
      outstanding_amount: number;
      status: string;
    }>).map((row) => ({
      id: row.id,
      invoiceNo: row.invoice_no,
      invoiceDate: row.invoice_date,
      dueDate: row.due_date,
      amount: Number(row.amount),
      collectedAmount: Number(row.collected_amount),
      outstandingAmount: Number(row.outstanding_amount),
      status: row.status,
      agingBucket: resolveAgingBucket(row.due_date, row.status, Number(row.outstanding_amount))
    }));

    const totals = creditInvoices.reduce((acc, row) => {
      acc.creditAmount += row.amount;
      acc.collectedAmount += row.collectedAmount;
      acc.outstandingAmount += row.outstandingAmount;
      if (row.dueDate && new Date(row.dueDate) < startOfToday() && row.outstandingAmount > 0 && !["settled", "written_off"].includes(row.status)) {
        acc.overdueAmount += row.outstandingAmount;
      }
      return acc;
    }, { creditAmount: 0, collectedAmount: 0, outstandingAmount: 0, overdueAmount: 0 });

    return successResponse({
      customer,
      totals,
      creditInvoices,
      collections: ((collectionResult.data ?? []) as Array<{
        id: string;
        credit_invoice_id: string;
        collected_at: string;
        amount: number;
        payment_method: string;
        reference_no: string | null;
        credit_invoices: { invoice_no: string };
      }>).map((row) => ({
        id: row.id,
        creditInvoiceId: row.credit_invoice_id,
        invoiceNo: row.credit_invoices.invoice_no,
        collectedAt: row.collected_at,
        amount: Number(row.amount),
        paymentMethod: row.payment_method,
        referenceNo: row.reference_no
      })),
      cheques: ((chequeResult.data ?? []) as Array<{ id: string; invoice_no: string | null; cheque_no: string; bank_name: string; amount: number; status: string; received_date: string }>).map((row) => ({
        id: row.id,
        invoiceNo: row.invoice_no,
        chequeNo: row.cheque_no,
        bankName: row.bank_name,
        amount: Number(row.amount),
        status: row.status,
        receivedDate: row.received_date
      })),
      bills: ((billResult.data ?? []) as Array<{ id: string; invoice_no: string; amount_snapshot: number; status: string; created_at: string }>).map((row) => ({
        id: row.id,
        invoiceNo: row.invoice_no,
        amountSnapshot: Number(row.amount_snapshot),
        status: row.status,
        createdAt: row.created_at
      })),
      events: ((eventResult.data ?? []) as Array<{ id: string; event_type: string; entity_type: string; amount: number | null; status_from: string | null; status_to: string | null; created_at: string }>).map((row) => ({
        id: row.id,
        eventType: row.event_type,
        entityType: row.entity_type,
        amount: row.amount === null ? null : Number(row.amount),
        statusFrom: row.status_from,
        statusTo: row.status_to,
        createdAt: row.created_at
      })),
      normalizedName
    });
  }

  static async listUnmatchedCustomers() {
    const auth = await requireFeaturePermission("customers", "view");
    if (auth.response) return auth.response;
    if (!auth.context) return errorResponse(403, "FORBIDDEN", "Authentication context is required.");

    const membership = await resolveActiveOrganizationId(auth.context.user.id);
    if (membership.response) return membership.response;
    if (!membership.organizationId) return errorResponse(403, "MEMBERSHIP_REQUIRED", "An active organization membership is required to access customers.");

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("unmatched_customer_outlets")
      .select("id, outlet_name, route_name, status, first_seen_report_id, last_seen_report_id, suggested_customer_id, resolved_customer_id, updated_at")
      .eq("organization_id", membership.organizationId)
      .order("updated_at", { ascending: false }) as unknown as {
        data: Array<{
          id: string;
          outlet_name: string;
          route_name: string | null;
          status: "pending" | "linked" | "created" | "ignored";
          first_seen_report_id: string | null;
          last_seen_report_id: string | null;
          suggested_customer_id: string | null;
          resolved_customer_id: string | null;
          updated_at: string;
        }> | null;
        error: Parameters<typeof fromPostgrestError>[0] | null;
      };

    if (error) return fromPostgrestError(error);

    return successResponse({
      items: (data ?? []).map((row) => ({
        id: row.id,
        outletName: row.outlet_name,
        routeName: row.route_name,
        status: row.status,
        firstSeenReportId: row.first_seen_report_id,
        lastSeenReportId: row.last_seen_report_id,
        suggestedCustomerId: row.suggested_customer_id,
        resolvedCustomerId: row.resolved_customer_id,
        updatedAt: row.updated_at
      }))
    });
  }

  static async resolveUnmatchedCustomer(matchId: string, request: Request) {
    const auth = await requireFeaturePermission("customers", "edit");
    if (auth.response) return auth.response;
    if (!auth.context) return errorResponse(403, "FORBIDDEN", "Authentication context is required.");

    const parsedId = uuidSchema.safeParse(matchId);
    if (!parsedId.success) return errorResponse(422, "INVALID_ID", "A valid unmatched customer id is required.");

    const payload = await request.json().catch(() => null) as { action?: string; customerId?: string | null } | null;
    const action = payload?.action;
    if (!action || !["link", "create", "ignore"].includes(action)) {
      return errorResponse(422, "VALIDATION_ERROR", "Action must be link, create, or ignore.");
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = await (supabase as never as {
      rpc: (name: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: Parameters<typeof fromPostgrestError>[0] | null }>;
    }).rpc("resolve_unmatched_customer_outlet", {
      target_match_id: parsedId.data,
      target_action: action,
      target_customer_id: payload?.customerId ?? null
    });

    if (error) return fromPostgrestError(error);
    return successResponse(data);
  }

  static async deactivateCustomer(customerId: string) {
    const auth = await requireFeaturePermission("customers", "delete");
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
