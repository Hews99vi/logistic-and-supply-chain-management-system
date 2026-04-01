import { DailyReportWorkflowService } from "@/services/reports/daily-report-workflow.service";

type RouteContext = {
  params: Promise<{
    reportId: string;
  }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const { reportId } = await context.params;
  return DailyReportWorkflowService.submit(reportId);
}
