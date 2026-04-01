import { LoadingSummaryWorkspaceView } from "@/features/loading-summaries/components/loading-summary-workspace-view";

type LoadingSummaryPageProps = {
  params: Promise<{
    summaryId: string;
  }>;
};

export default async function LoadingSummaryPage({ params }: LoadingSummaryPageProps) {
  const { summaryId } = await params;

  return <LoadingSummaryWorkspaceView summaryId={summaryId} />;
}
