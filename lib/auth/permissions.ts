import { errorResponse } from "@/lib/db/response";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAppAccess } from "@/lib/auth/helpers";
import type { AppRole } from "@/lib/auth/helpers";

export const FEATURE_KEYS = [
  "dashboard",
  "daily_reports",
  "date_sheet",
  "loading_summaries",
  "main_inventory",
  "products",
  "route_programs",
  "customers",
  "users",
  "settings",
  "analytics"
] as const;

export const ACTION_KEYS = [
  "view",
  "create",
  "edit",
  "delete",
  "submit",
  "approve",
  "reopen",
  "import",
  "receive_stock",
  "view_costs",
  "edit_costs"
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];
export type ActionKey = (typeof ACTION_KEYS)[number];
export type ResolvedPermissions = Record<FeatureKey, Partial<Record<ActionKey, boolean>>>;

const emptyPermissions = FEATURE_KEYS.reduce((acc, feature) => {
  acc[feature] = {};
  return acc;
}, {} as ResolvedPermissions);

function cloneEmptyPermissions(): ResolvedPermissions {
  return FEATURE_KEYS.reduce((acc, feature) => {
    acc[feature] = {};
    return acc;
  }, {} as ResolvedPermissions);
}

export function hasResolvedPermission(
  permissions: ResolvedPermissions | null | undefined,
  feature: FeatureKey,
  action: ActionKey
) {
  return Boolean(permissions?.[feature]?.[action]);
}

export async function getResolvedFeaturePermissions(input: {
  userId: string;
  role: AppRole;
  organizationId: string;
}): Promise<ResolvedPermissions> {
  const supabase = await createSupabaseServerClient();
  const permissions = cloneEmptyPermissions();

  const { data: defaults } = (await supabase
    .from("feature_permissions")
    .select("feature_key, action_key, is_allowed")
    .eq("role", input.role)) as {
    data: Array<{ feature_key: FeatureKey; action_key: ActionKey; is_allowed: boolean }> | null;
  };

  for (const row of defaults ?? []) {
    if (FEATURE_KEYS.includes(row.feature_key) && ACTION_KEYS.includes(row.action_key)) {
      permissions[row.feature_key][row.action_key] = row.is_allowed;
    }
  }

  const { data: overrides } = (await supabase
    .from("user_feature_overrides")
    .select("feature_key, action_key, effect")
    .eq("organization_id", input.organizationId)
    .eq("user_id", input.userId)) as {
    data: Array<{ feature_key: FeatureKey; action_key: ActionKey; effect: "allow" | "deny" }> | null;
  };

  for (const row of overrides ?? []) {
    if (FEATURE_KEYS.includes(row.feature_key) && ACTION_KEYS.includes(row.action_key)) {
      permissions[row.feature_key][row.action_key] = row.effect === "allow";
    }
  }

  return permissions;
}

export async function requireFeaturePermission(feature: FeatureKey, action: ActionKey) {
  const auth = await requireAppAccess();

  if (auth.response || !auth.context || !auth.context.organization) {
    return auth;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await (supabase as never as {
    rpc: (name: string, params: Record<string, unknown>) => Promise<{ data: boolean | null; error: { message: string } | null }>;
  }).rpc("user_has_feature_permission", {
    feature_key: feature,
    action_key: action,
    target_org_id: auth.context.organization.id
  });

  if (error || !data) {
    return {
      context: null,
      response: errorResponse(403, "FORBIDDEN", error?.message ?? `Missing permission: ${feature}.${action}.`)
    };
  }

  return auth;
}

export async function checkFeaturePermission(feature: FeatureKey, action: ActionKey, organizationId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await (supabase as never as {
    rpc: (name: string, params: Record<string, unknown>) => Promise<{ data: boolean | null; error: unknown }>;
  }).rpc("user_has_feature_permission", {
    feature_key: feature,
    action_key: action,
    target_org_id: organizationId
  });

  return Boolean(data);
}

export { emptyPermissions };
