import { FlatDataImportService } from "@/services/reports/flat-data-import.service";

type RouteContext = {
  params: Promise<{ reportId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { reportId } = await context.params;
  return FlatDataImportService.importReport(reportId, request);
}
