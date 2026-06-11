import { CreateDailyReportView } from "@/features/reports/components/create-daily-report-view";
import { requireProtectedPage } from "@/lib/auth/page-guard";

export default async function NewReportPage() {
  await requireProtectedPage("/reports/new");

  return <CreateDailyReportView />;
}
