import { ReportInvoiceEntryService } from "@/services/reports/report-invoice-entry.service";

type RouteContext = {
  params: Promise<{
    reportId: string;
    entryId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { reportId, entryId } = await context.params;
  return ReportInvoiceEntryService.updateInvoiceEntry(reportId, entryId, request);
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { reportId, entryId } = await context.params;
  return ReportInvoiceEntryService.deleteInvoiceEntry(reportId, entryId);
}