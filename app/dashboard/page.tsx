import { DashboardView } from "@/features/dashboard/components/dashboard-view";
import { requireProtectedPage } from "@/lib/auth/page-guard";

export default async function DashboardPage() {
  await requireProtectedPage("/dashboard");

  return <DashboardView />;
}
