import { ReportInventoryEntryService } from "@/services/reports/report-inventory-entry.service";

type RouteContext = {
  params: Promise<{
    reportId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { reportId } = await context.params;
  return ReportInventoryEntryService.listInventoryEntries(reportId);
}

export async function POST(request: Request, context: RouteContext) {
  const { reportId } = await context.params;
  return ReportInventoryEntryService.createInventoryEntry(reportId, request);
}

export async function PUT(request: Request, context: RouteContext) {
  const { reportId } = await context.params;
  return ReportInventoryEntryService.saveInventoryEntriesBatch(reportId, request);
}