import { ExpenseCategoryService } from "@/services/expense-categories/expense-category.service";

export async function GET(request: Request) {
  return ExpenseCategoryService.listExpenseCategories(request);
}

export async function POST(request: Request) {
  return ExpenseCategoryService.createExpenseCategory(request);
}
