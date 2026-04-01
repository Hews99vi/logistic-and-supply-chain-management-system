import { DashboardReportService } from "@/services/reports/dashboard-report.service";

export async function GET(request: Request) {
  return DashboardReportService.getTopProductsBySales(request);
}