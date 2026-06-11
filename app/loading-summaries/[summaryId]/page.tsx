import { LoadingSummaryWorkspaceView } from "@/features/loading-summaries/components/loading-summary-workspace-view";
import { requireProtectedPage } from "@/lib/auth/page-guard";

type LoadingSummaryPageProps = {
  params: Promise<{
    summaryId: string;
  }>;
};

export default async function LoadingSummaryPage({ params }: LoadingSummaryPageProps) {
  const { summaryId } = await params;
  await requireProtectedPage(`/loading-summaries/${summaryId}`);

  return <LoadingSummaryWorkspaceView summaryId={summaryId} />;
}
