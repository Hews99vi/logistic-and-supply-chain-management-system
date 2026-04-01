import { DailyReportService } from "@/services/reports/daily-report.service";

export async function GET(request: Request) {
  return DailyReportService.listReports(request);
}

export async function POST(request: Request) {
  return DailyReportService.createReport(request);
}
