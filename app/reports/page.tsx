import { DailyReportsView } from "@/features/reports/components/daily-reports-view";
import { requireProtectedPage } from "@/lib/auth/page-guard";

export default async function ReportsPage() {
  await requireProtectedPage("/reports");

  return <DailyReportsView />;
}
