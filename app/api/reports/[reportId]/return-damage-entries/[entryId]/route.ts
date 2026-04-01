import { ReportReturnDamageEntryService } from "@/services/reports/report-return-damage-entry.service";

type RouteContext = {
  params: Promise<{
    reportId: string;
    entryId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { reportId, entryId } = await context.params;
  return ReportReturnDamageEntryService.updateReturnDamageEntry(reportId, entryId, request);
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { reportId, entryId } = await context.params;
  return ReportReturnDamageEntryService.deleteReturnDamageEntry(reportId, entryId);
}