import { ReportCashDenominationService } from "@/services/reports/report-cash-denomination.service";

type RouteContext = {
  params: Promise<{
    reportId: string;
    entryId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { reportId, entryId } = await context.params;
  return ReportCashDenominationService.updateCashDenomination(reportId, entryId, request);
}