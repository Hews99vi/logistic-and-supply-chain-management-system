import { ReportFinanceService } from "@/services/reports/report-finance.service";

type RouteContext = {
  params: Promise<{ reportId: string; adjustmentId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { adjustmentId } = await context.params;
  return ReportFinanceService.resolveCashAdjustment(adjustmentId, request);
}
