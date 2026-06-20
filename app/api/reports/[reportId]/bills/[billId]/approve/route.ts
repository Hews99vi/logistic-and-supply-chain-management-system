import { ReportFinanceService } from "@/services/reports/report-finance.service";

type RouteContext = {
  params: Promise<{ reportId: string; billId: string }>;
};

export async function PATCH(_request: Request, context: RouteContext) {
  const { billId } = await context.params;
  return ReportFinanceService.approveBillException(billId);
}
