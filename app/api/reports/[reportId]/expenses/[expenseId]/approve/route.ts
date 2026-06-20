import { ReportFinanceService } from "@/services/reports/report-finance.service";

type RouteContext = {
  params: Promise<{ expenseId: string; reportId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { expenseId } = await context.params;
  return ReportFinanceService.approveExpense(expenseId, request);
}
