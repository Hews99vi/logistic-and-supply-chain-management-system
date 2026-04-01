import { ExpenseCategoryService } from "@/services/expense-categories/expense-category.service";

type RouteContext = {
  params: Promise<{
    expenseCategoryId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { expenseCategoryId } = await context.params;
  return ExpenseCategoryService.getExpenseCategoryById(expenseCategoryId);
}

export async function PATCH(request: Request, context: RouteContext) {
  const { expenseCategoryId } = await context.params;
  return ExpenseCategoryService.updateExpenseCategory(expenseCategoryId, request);
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { expenseCategoryId } = await context.params;
  return ExpenseCategoryService.deactivateExpenseCategory(expenseCategoryId);
}
