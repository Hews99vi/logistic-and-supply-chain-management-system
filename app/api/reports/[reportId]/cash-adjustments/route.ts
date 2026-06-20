import { ReportFinanceService } from "@/services/reports/report-finance.service";

type RouteContext = {
  params: Promise<{ reportId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { reportId } = await context.params;
  return ReportFinanceService.listCashAdjustments(reportId);
}

export async function PUT(request: Request, context: RouteContext) {
  const { reportId } = await context.params;
  return ReportFinanceService.saveCashAdjustments(reportId, request);
}
