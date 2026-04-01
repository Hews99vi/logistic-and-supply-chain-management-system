import { ReportExpenseEntryService } from "@/services/reports/report-expense-entry.service";

type RouteContext = {
  params: Promise<{
    reportId: string;
    entryId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { reportId, entryId } = await context.params;
  return ReportExpenseEntryService.updateExpenseEntry(reportId, entryId, request);
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { reportId, entryId } = await context.params;
  return ReportExpenseEntryService.deleteExpenseEntry(reportId, entryId);
}