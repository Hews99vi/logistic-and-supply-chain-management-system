import { handleRoute } from "@/lib/api/response";
import { DashboardReportService } from "@/services/reports/dashboard-report.service";

export async function GET(request: Request) {
  return handleRoute(async () => DashboardReportService.getOverview(request));
}