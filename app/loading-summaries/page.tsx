import { LoadingSummariesManagementView } from "@/features/loading-summaries/components/loading-summaries-management-view";
import { requireProtectedPage } from "@/lib/auth/page-guard";

export default async function LoadingSummariesPage() {
  await requireProtectedPage("/loading-summaries");

  return <LoadingSummariesManagementView />;
}
