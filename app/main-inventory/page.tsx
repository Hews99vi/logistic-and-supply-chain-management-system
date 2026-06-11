import { MainInventoryView } from "@/features/main-inventory/components/main-inventory-view";
import { requireProtectedPage } from "@/lib/auth/page-guard";

export const metadata = {
  title: "Main Inventory | Dairy Operations"
};

export default async function MainInventoryPage() {
  await requireProtectedPage("/main-inventory");

  return <MainInventoryView />;
}
