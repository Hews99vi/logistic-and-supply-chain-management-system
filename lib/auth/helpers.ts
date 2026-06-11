import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export const APP_ROLES = ["admin", "supervisor", "driver", "cashier"] as const;

export type AppRole = (typeof APP_ROLES)[number];

export type AuthenticatedContext = {
  user: User;
  profile: {
    id: string;
    role: AppRole;
    is_active: boolean;
    full_name: string | null;
    phone: string | null;
  };
  organization: {
    id: string;
  } | null;
};

type AuthProfileRow = {
  id: string;
  role: string;
  is_active: boolean;
  full_name: string | null;
  phone: string | null;
};

type AuthProfile = AuthenticatedContext["profile"];

type AuthOrganizationMembershipRow = {
  organization_id: string;
};

function unauthorizedResponse(message = "Authentication required.") {
  return NextResponse.json(
    { error: { code: "UNAUTHORIZED", message } },
    { status: 401 }
  );
}

function forbiddenResponse(message = "Insufficient permissions.") {
  return NextResponse.json(
    { error: { code: "FORBIDDEN", message } },
    { status: 403 }
  );
}

function isAppRole(value: string): value is AppRole {
  return APP_ROLES.includes(value as AppRole);
}

async function getCurrentProfile(userId: string): Promise<AuthProfile | null> {
  const supabase = await createSupabaseServerClient();
  const profileQuery = supabase
    .from("profiles")
    .select("id, role, is_active, full_name, phone")
    .eq("id", userId)
    .maybeSingle();

  const { data, error } = (await profileQuery) as {
    data: AuthProfileRow | null;
    error: { message: string } | null;
  };

  if (error || !data || !isAppRole(data.role)) {
    return null;
  }

  return {
    id: data.id,
    role: data.role,
    is_active: data.is_active,
    full_name: data.full_name,
    phone: data.phone
  };
}

async function getCurrentOrganization(userId: string): Promise<AuthenticatedContext["organization"]> {
  const supabase = await createSupabaseServerClient();
  const membershipQuery = supabase
    .from("organization_memberships")
    .select("organization_id")
    .eq("user_id", userId)
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const { data, error } = (await membershipQuery) as {
    data: AuthOrganizationMembershipRow | null;
    error: { message: string } | null;
  };

  if (error || !data) {
    return null;
  }

  return {
    id: data.organization_id
  };
}

export async function getCurrentUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
}

export async function requireAuth() {
  const user = await getCurrentUser();

  if (!user) {
    return {
      context: null,
      response: unauthorizedResponse()
    };
  }

  const profile = await getCurrentProfile(user.id);

  if (!profile || !profile.is_active) {
    return {
      context: null,
      response: forbiddenResponse("Active profile required.")
    };
  }

  return {
    context: {
      user,
      profile,
      organization: null
    } satisfies AuthenticatedContext,
    response: null
  };
}

export async function requireAppAccess() {
  const auth = await requireAuth();

  if (auth.response || !auth.context) {
    return auth;
  }

  const organization = await getCurrentOrganization(auth.context.user.id);

  if (!organization) {
    return {
      context: null,
      response: forbiddenResponse("Active organization membership required.")
    };
  }

  return {
    context: {
      ...auth.context,
      organization
    } satisfies AuthenticatedContext,
    response: null
  };
}

export async function requireRole(allowedRoles: AppRole | AppRole[]) {
  const auth = await requireAuth();

  if (auth.response || !auth.context) {
    return auth;
  }

  const roleSet = new Set(Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles]);

  if (!roleSet.has(auth.context.profile.role)) {
    return {
      context: null,
      response: forbiddenResponse(`Required role: ${Array.from(roleSet).join(", ")}.`)
    };
  }

  return auth;
}

export async function requireAuthenticatedUser() {
  const auth = await requireAuth();

  if (auth.response || !auth.context) {
    return {
      user: null,
      profile: null,
      response: auth.response ?? unauthorizedResponse()
    };
  }

  return {
    user: auth.context.user,
    profile: auth.context.profile,
    response: null
  };
}
