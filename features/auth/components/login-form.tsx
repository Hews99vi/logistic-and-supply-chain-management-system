"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Loader2, LogIn } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { signInWithPassword } from "@/features/auth/api/auth-client";
import { AuthShell } from "@/features/auth/components/auth-shell";

function resolveErrorMessage(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("invalid login credentials")) {
    return "Invalid email or password.";
  }

  if (normalized.includes("active profile required")) {
    return "Your account is pending admin approval.";
  }

  return message;
}

export function LoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const nextPath = useMemo(() => {
    const candidate = searchParams.get("next");
    return candidate && candidate.startsWith("/") ? candidate : "/dashboard";
  }, [searchParams]);

  const registered = searchParams.get("registered") === "1";

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await signInWithPassword(email.trim(), password);
      window.location.assign(nextPath);
    } catch (requestError) {
      setError(resolveErrorMessage(requestError instanceof Error ? requestError.message : "Login failed."));
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Sign in"
      description="Use your assigned account to access the distribution operations workspace."
      footer={<span>Need access? <Link href="/signup" className="font-semibold text-blue-700">Request an account</Link></span>}
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        {registered ? (
          <Alert className="border-emerald-200 bg-emerald-50 text-emerald-700">
            Registration submitted. Wait for admin activation before signing in.
          </Alert>
        ) : null}

        {error ? <Alert variant="destructive">{error}</Alert> : null}

        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200"
            placeholder="name@company.com"
            autoComplete="email"
            required
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200"
            placeholder="Enter your password"
            autoComplete="current-password"
            required
          />
        </label>

        <Button type="submit" className="h-11 w-full rounded-xl" disabled={submitting}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
          Sign In
        </Button>
      </form>
    </AuthShell>
  );
}
