import { LoadingSummaryItemService } from "@/services/loading-summaries/loading-summary-item.service";

type RouteContext = {
  params: Promise<{
    summaryId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { summaryId } = await context.params;
  return LoadingSummaryItemService.list(summaryId);
}

export async function PUT(request: Request, context: RouteContext) {
  const { summaryId } = await context.params;
  return LoadingSummaryItemService.saveBatch(summaryId, request);
}
