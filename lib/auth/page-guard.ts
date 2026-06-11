import { redirect } from "next/navigation";

import { requireAppAccess } from "@/lib/auth/helpers";
import { checkFeaturePermission, type FeatureKey } from "@/lib/auth/permissions";

const protectedFeatureByPath: Array<{ prefix: string; feature: FeatureKey }> = [
  { prefix: "/dashboard", feature: "dashboard" },
  { prefix: "/reports", feature: "daily_reports" },
  { prefix: "/loading-summaries", feature: "loading_summaries" },
  { prefix: "/main-inventory", feature: "main_inventory" },
  { prefix: "/products", feature: "products" },
  { prefix: "/route-programs", feature: "route_programs" },
  { prefix: "/customers", feature: "customers" },
  { prefix: "/users", feature: "users" },
  { prefix: "/settings", feature: "settings" },
  { prefix: "/analytics", feature: "analytics" }
];

export async function requireProtectedPage(redirectTo: string) {
  const auth = await requireAppAccess();

  if (auth.response || !auth.context) {
    redirect(`/login?redirectTo=${encodeURIComponent(redirectTo)}`);
  }

  const matchedFeature = protectedFeatureByPath.find((item) => redirectTo.startsWith(item.prefix));
  const organizationId = auth.context.organization?.id;

  if (matchedFeature && organizationId) {
    const canView = await checkFeaturePermission(matchedFeature.feature, "view", organizationId);
    if (!canView) {
      redirect("/dashboard");
    }
  }
}
