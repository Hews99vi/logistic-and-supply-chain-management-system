import { DateEndOfDayReportView } from "@/features/reports/components/date-end-of-day-report-view";

type DateEndOfDayReportPageProps = {
  params: Promise<{
    reportId: string;
  }>;
};

export default async function DateEndOfDayReportPage({ params }: DateEndOfDayReportPageProps) {
  const { reportId } = await params;

  return <DateEndOfDayReportView reportId={reportId} />;
}
