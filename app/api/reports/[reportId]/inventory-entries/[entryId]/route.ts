import { ReportInventoryEntryService } from "@/services/reports/report-inventory-entry.service";

type RouteContext = {
  params: Promise<{
    reportId: string;
    entryId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { reportId, entryId } = await context.params;
  return ReportInventoryEntryService.updateInventoryEntry(reportId, entryId, request);
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { reportId, entryId } = await context.params;
  return ReportInventoryEntryService.deleteInventoryEntry(reportId, entryId);
}