import { ReportCashDenominationService } from "@/services/reports/report-cash-denomination.service";

type RouteContext = {
  params: Promise<{
    reportId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { reportId } = await context.params;
  return ReportCashDenominationService.listCashDenominations(reportId);
}

export async function PUT(request: Request, context: RouteContext) {
  const { reportId } = await context.params;
  return ReportCashDenominationService.saveCashDenominationsBatch(reportId, request);
}