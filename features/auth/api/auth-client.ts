import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export async function signInWithPassword(email: string, password: string) {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    throw new Error(error.message);
  }

  const sessionResponse = await fetch("/api/auth/me", {
    method: "GET",
    credentials: "include",
    cache: "no-store"
  });

  if (!sessionResponse.ok) {
    await supabase.auth.signOut();

    const body = (await sessionResponse.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;

    throw new Error(body?.error?.message ?? "Your account is not active.");
  }

  return data;
}

export async function signUpPendingUser(payload: {
  fullName: string;
  email: string;
  password: string;
}) {
  const response = await fetch("/api/auth/signup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const body = (await response.json().catch(() => null)) as {
    data?: { status: string };
    error?: { message?: string };
  } | null;

  if (!response.ok) {
    throw new Error(body?.error?.message ?? "Signup failed.");
  }

  return body?.data;
}
