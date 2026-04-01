import { DailyReportService } from "@/services/reports/daily-report.service";

type RouteContext = {
  params: Promise<{
    reportId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { reportId } = await context.params;
  return DailyReportService.getReportById(reportId);
}

export async function PATCH(request: Request, context: RouteContext) {
  const { reportId } = await context.params;
  return DailyReportService.updateDraftReport(reportId, request);
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { reportId } = await context.params;
  return DailyReportService.softDeleteDraftReport(reportId);
}
