import { DailyReportService } from "@/services/reports/daily-report.service";

export async function GET(request: Request) {
  return DailyReportService.getSummaryCards(request);
}
