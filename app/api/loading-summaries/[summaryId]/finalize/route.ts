import { LoadingSummaryService } from "@/services/loading-summaries/loading-summary.service";

type RouteContext = {
  params: Promise<{
    summaryId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { summaryId } = await context.params;
  return LoadingSummaryService.finalize(summaryId, request);
}
