import { LoadingSummaryService } from "@/services/loading-summaries/loading-summary.service";

type RouteContext = {
  params: Promise<{
    summaryId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { summaryId } = await context.params;
  return LoadingSummaryService.getById(summaryId);
}

export async function PATCH(request: Request, context: RouteContext) {
  const { summaryId } = await context.params;
  return LoadingSummaryService.update(summaryId, request);
}
