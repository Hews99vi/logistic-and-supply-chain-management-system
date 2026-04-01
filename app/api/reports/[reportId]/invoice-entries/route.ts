import { ReportInvoiceEntryService } from "@/services/reports/report-invoice-entry.service";

type RouteContext = {
  params: Promise<{
    reportId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { reportId } = await context.params;
  return ReportInvoiceEntryService.listInvoiceEntries(reportId);
}

export async function POST(request: Request, context: RouteContext) {
  const { reportId } = await context.params;
  return ReportInvoiceEntryService.createInvoiceEntry(reportId, request);
}

export async function PUT(request: Request, context: RouteContext) {
  const { reportId } = await context.params;
  return ReportInvoiceEntryService.saveInvoiceEntryBatch(reportId, request);
}