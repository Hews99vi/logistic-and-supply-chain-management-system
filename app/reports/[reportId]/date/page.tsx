import { DateEndOfDayReportView } from "@/features/reports/components/date-end-of-day-report-view";
import { requireProtectedPage } from "@/lib/auth/page-guard";

type DateEndOfDayReportPageProps = {
  params: Promise<{
    reportId: string;
  }>;
};

export default async function DateEndOfDayReportPage({ params }: DateEndOfDayReportPageProps) {
  const { reportId } = await params;
  await requireProtectedPage(`/reports/${reportId}/date`);

  return <DateEndOfDayReportView reportId={reportId} />;
}
