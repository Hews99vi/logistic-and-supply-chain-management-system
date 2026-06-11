import { CustomersManagementView } from "@/features/customers/components/customers-management-view";
import { requireProtectedPage } from "@/lib/auth/page-guard";

export default async function CustomersPage() {
  await requireProtectedPage("/customers");

  return <CustomersManagementView />;
}
