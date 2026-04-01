import { ReportExpenseEntryService } from "@/services/reports/report-expense-entry.service";

type RouteContext = {
  params: Promise<{
    reportId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { reportId } = await context.params;
  return ReportExpenseEntryService.listExpenseEntries(reportId);
}

export async function POST(request: Request, context: RouteContext) {
  const { reportId } = await context.params;
  return ReportExpenseEntryService.createExpenseEntry(reportId, request);
}

export async function PUT(request: Request, context: RouteContext) {
  const { reportId } = await context.params;
  return ReportExpenseEntryService.saveExpenseEntryBatch(reportId, request);
}