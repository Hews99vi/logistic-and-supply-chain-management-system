import { errorResponse } from "@/lib/db/response";
import { LoadingSummaryItemService } from "@/services/loading-summaries/loading-summary-item.service";

type RouteContext = {
  params: Promise<{
    summaryId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { summaryId } = await context.params;
  try {
    return await LoadingSummaryItemService.list(summaryId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load loading line items.";
    return errorResponse(500, "LOADING_ITEMS_LOAD_FAILED", message);
  }
}

export async function PUT(request: Request, context: RouteContext) {
  const { summaryId } = await context.params;
  try {
    return await LoadingSummaryItemService.saveBatch(summaryId, request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save loading line items.";
    return errorResponse(500, "LOADING_ITEMS_SAVE_FAILED", message);
  }
}
