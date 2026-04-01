import { requireAuth, requireRole } from "@/lib/auth/helpers";
import { errorResponse, fromPostgrestError, successResponse } from "@/lib/db/response";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPaginationRange, uuidSchema } from "@/lib/validation/common";
import {
  expenseCategoryCreateSchema,
  expenseCategoryListQuerySchema,
  expenseCategoryUpdateSchema
} from "@/lib/validation/expense-category";

type ExpenseCategoryRecord = {
  id: string;
  category_name: string;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

const EXPENSE_CATEGORY_SELECT = "id, category_name, is_system, is_active, created_at, updated_at";

export class ExpenseCategoryService {
  static async listExpenseCategories(request: Request) {
    const auth = await requireAuth();
    if (auth.response) {
      return auth.response;
    }

    const { searchParams } = new URL(request.url);
    const parsed = expenseCategoryListQuerySchema.safeParse(Object.fromEntries(searchParams.entries()));

    if (!parsed.success) {
      return errorResponse(422, "VALIDATION_ERROR", "Invalid expense category query parameters.", parsed.error.flatten());
    }

    const { page, pageSize, search, isActive, isSystem } = parsed.data;
    const { from, to } = getPaginationRange(page, pageSize);
    const supabase = await createSupabaseServerClient();

    let query = supabase
      .from("expense_categories")
      .select(EXPENSE_CATEGORY_SELECT, { count: "exact" })
      .order("category_name", { ascending: true })
      .range(from, to);

    if (search) {
      query = query.ilike("category_name", `%${search}%`);
    }

    if (typeof isActive === "boolean") {
      query = query.eq("is_active", isActive);
    }

    if (typeof isSystem === "boolean") {
      query = query.eq("is_system", isSystem);
    }

    const { data, count, error } = (await query) as {
      data: ExpenseCategoryRecord[] | null;
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

  static async getExpenseCategoryById(expenseCategoryId: string) {
    const auth = await requireAuth();
    if (auth.response) {
      return auth.response;
    }

    const parsedId = uuidSchema.safeParse(expenseCategoryId);
    if (!parsedId.success) {
      return errorResponse(422, "INVALID_ID", "A valid expense category id is required.");
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = (await supabase
      .from("expense_categories")
      .select(EXPENSE_CATEGORY_SELECT)
      .eq("id", parsedId.data)
      .maybeSingle()) as {
      data: ExpenseCategoryRecord | null;
      error: Parameters<typeof fromPostgrestError>[0] | null;
    };

    if (error) {
      return fromPostgrestError(error);
    }

    if (!data) {
      return errorResponse(404, "EXPENSE_CATEGORY_NOT_FOUND", "Expense category not found.");
    }

    return successResponse(data);
  }

  static async createExpenseCategory(request: Request) {
    const auth = await requireRole(["admin", "supervisor"]);
    if (auth.response) {
      return auth.response;
    }

    const body = await request.json().catch(() => null);
    const parsed = expenseCategoryCreateSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse(422, "VALIDATION_ERROR", "Invalid expense category payload.", parsed.error.flatten());
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = (await supabase
      .from("expense_categories")
      .insert({
        category_name: parsed.data.categoryName,
        is_system: parsed.data.isSystem,
        is_active: parsed.data.isActive
      } as never)
      .select(EXPENSE_CATEGORY_SELECT)
      .single()) as {
      data: ExpenseCategoryRecord | null;
      error: Parameters<typeof fromPostgrestError>[0] | null;
    };

    if (error) {
      return fromPostgrestError(error);
    }

    return successResponse(data as ExpenseCategoryRecord, { status: 201 });
  }

  static async updateExpenseCategory(expenseCategoryId: string, request: Request) {
    const auth = await requireRole(["admin", "supervisor"]);
    if (auth.response) {
      return auth.response;
    }

    const parsedId = uuidSchema.safeParse(expenseCategoryId);
    if (!parsedId.success) {
      return errorResponse(422, "INVALID_ID", "A valid expense category id is required.");
    }

    const body = await request.json().catch(() => null);
    const parsed = expenseCategoryUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse(422, "VALIDATION_ERROR", "Invalid expense category payload.", parsed.error.flatten());
    }

    const updatePayload: Record<string, unknown> = {};

    if (parsed.data.categoryName !== undefined) {
      updatePayload.category_name = parsed.data.categoryName;
    }
    if (parsed.data.isSystem !== undefined) {
      updatePayload.is_system = parsed.data.isSystem;
    }
    if (parsed.data.isActive !== undefined) {
      updatePayload.is_active = parsed.data.isActive;
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = (await supabase
      .from("expense_categories")
      .update(updatePayload as never)
      .eq("id", parsedId.data)
      .select(EXPENSE_CATEGORY_SELECT)
      .maybeSingle()) as {
      data: ExpenseCategoryRecord | null;
      error: Parameters<typeof fromPostgrestError>[0] | null;
    };

    if (error) {
      return fromPostgrestError(error);
    }

    if (!data) {
      return errorResponse(404, "EXPENSE_CATEGORY_NOT_FOUND", "Expense category not found.");
    }

    return successResponse(data);
  }

  static async deactivateExpenseCategory(expenseCategoryId: string) {
    const auth = await requireRole(["admin", "supervisor"]);
    if (auth.response) {
      return auth.response;
    }

    const parsedId = uuidSchema.safeParse(expenseCategoryId);
    if (!parsedId.success) {
      return errorResponse(422, "INVALID_ID", "A valid expense category id is required.");
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = (await supabase
      .from("expense_categories")
      .update({ is_active: false } as never)
      .eq("id", parsedId.data)
      .select(EXPENSE_CATEGORY_SELECT)
      .maybeSingle()) as {
      data: ExpenseCategoryRecord | null;
      error: Parameters<typeof fromPostgrestError>[0] | null;
    };

    if (error) {
      return fromPostgrestError(error);
    }

    if (!data) {
      return errorResponse(404, "EXPENSE_CATEGORY_NOT_FOUND", "Expense category not found.");
    }

    return successResponse(data);
  }
}
