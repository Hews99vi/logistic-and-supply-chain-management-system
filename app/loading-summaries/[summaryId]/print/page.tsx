import { LoadingSummaryPrintView } from "@/features/loading-summaries/components/loading-summary-print-view";
import { requireProtectedPage } from "@/lib/auth/page-guard";

type LoadingSummaryPrintPageProps = {
  params: Promise<{
    summaryId: string;
  }>;
};

export default async function LoadingSummaryPrintPage({ params }: LoadingSummaryPrintPageProps) {
  const { summaryId } = await params;
  await requireProtectedPage(`/loading-summaries/${summaryId}/print`);

  return <LoadingSummaryPrintView summaryId={summaryId} />;
}
