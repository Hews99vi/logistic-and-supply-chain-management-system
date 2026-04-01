import { DailyReportWorkflowService } from "@/services/reports/daily-report-workflow.service";

type RouteContext = {
  params: Promise<{
    reportId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { reportId } = await context.params;
  const body = (await request.json().catch(() => null)) as { reason?: string } | null;

  return DailyReportWorkflowService.reject(reportId, body?.reason ?? "");
}
