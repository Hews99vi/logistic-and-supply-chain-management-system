import { ReportAuditService } from "@/services/reports/report-audit.service";

type RouteContext = {
  params: Promise<{
    reportId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { reportId } = await context.params;
  return ReportAuditService.listReportAuditTrail(reportId);
}
