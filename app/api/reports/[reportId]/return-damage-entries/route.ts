import { ReportReturnDamageEntryService } from "@/services/reports/report-return-damage-entry.service";

type RouteContext = {
  params: Promise<{
    reportId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { reportId } = await context.params;
  return ReportReturnDamageEntryService.listReturnDamageEntries(reportId);
}

export async function POST(request: Request, context: RouteContext) {
  const { reportId } = await context.params;
  return ReportReturnDamageEntryService.createReturnDamageEntry(reportId, request);
}

export async function PUT(request: Request, context: RouteContext) {
  const { reportId } = await context.params;
  return ReportReturnDamageEntryService.saveReturnDamageEntriesBatch(reportId, request);
}