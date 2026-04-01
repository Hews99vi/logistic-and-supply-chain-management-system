import { errorResponse, successResponse } from "@/lib/db/response";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth/helpers";
import { signUpSchema } from "@/lib/validation/auth";

export class AuthService {
  static async getCurrentSession() {
    const auth = await requireAuth();

    if (auth.response || !auth.context) {
      return auth.response ?? errorResponse(401, "AUTH_SESSION_INVALID", "Authentication required.");
    }

    return successResponse({
      user: {
        id: auth.context.user.id,
        email: auth.context.user.email,
        authRole: auth.context.user.role,
        profileRole: auth.context.profile.role,
        isActive: auth.context.profile.is_active,
        metadata: auth.context.user.user_metadata
      }
    });
  }

  static async registerPendingUser(request: Request) {
    const body = await request.json().catch(() => null);
    const parsed = signUpSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse(422, "VALIDATION_ERROR", "Invalid signup payload.", parsed.error.flatten());
    }

    const supabase = createSupabaseAdminClient();
    const { fullName, email, password } = parsed.data;

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role: "driver"
      }
    });

    if (error) {
      const code = error.status === 422 ? "AUTH_USER_EXISTS" : "AUTH_SIGNUP_FAILED";
      const status = error.status ?? 400;
      return errorResponse(status, code, error.message);
    }

    if (!data.user) {
      return errorResponse(500, "AUTH_SIGNUP_FAILED", "User could not be created.");
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        full_name: fullName,
        role: "driver",
        is_active: false
      } as never)
      .eq("id", data.user.id);

    if (profileError) {
      await supabase.auth.admin.deleteUser(data.user.id);
      return errorResponse(500, "PROFILE_SETUP_FAILED", profileError.message);
    }

    return successResponse({
      id: data.user.id,
      email: data.user.email,
      status: "pending_admin_approval"
    }, { status: 201 });
  }
}
