import { NextResponse } from "next/server";

import { requireRole } from "@/lib/auth/helpers";

export async function GET() {
  const auth = await requireRole(["admin", "supervisor"]);

  if (auth.response || !auth.context) {
    return auth.response;
  }

  return NextResponse.json({
    data: {
      message: "Authorized request.",
      userId: auth.context.user.id,
      role: auth.context.profile.role
    }
  });
}
