import { LoadingSummaryPrintView } from "@/features/loading-summaries/components/loading-summary-print-view";

type LoadingSummaryPrintPageProps = {
  params: Promise<{
    summaryId: string;
  }>;
};

export default async function LoadingSummaryPrintPage({ params }: LoadingSummaryPrintPageProps) {
  const { summaryId } = await params;

  return <LoadingSummaryPrintView summaryId={summaryId} />;
}
