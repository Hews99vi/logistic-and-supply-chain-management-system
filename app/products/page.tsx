import { ProductsManagementView } from "@/features/products/components/products-management-view";
import { requireProtectedPage } from "@/lib/auth/page-guard";

export default async function ProductsPage() {
  await requireProtectedPage("/products");

  return <ProductsManagementView />;
}
