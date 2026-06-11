import { RouteProgramsManagementView } from "@/features/route-programs/components/route-programs-management-view";
import { requireProtectedPage } from "@/lib/auth/page-guard";

export default async function RouteProgramsPage() {
  await requireProtectedPage("/route-programs");

  return <RouteProgramsManagementView />;
}
