import { LoadingSummaryService } from "@/services/loading-summaries/loading-summary.service";

export async function GET(request: Request) {
  return LoadingSummaryService.list(request);
}

export async function POST(request: Request) {
  return LoadingSummaryService.create(request);
}
