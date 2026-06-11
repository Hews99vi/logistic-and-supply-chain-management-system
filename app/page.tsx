import { redirect } from "next/navigation";

import { requireAppAccess } from "@/lib/auth/helpers";

export default async function HomePage() {
  const auth = await requireAppAccess();

  if (auth.response || !auth.context) {
    redirect("/login");
  }

  redirect("/dashboard");
}
