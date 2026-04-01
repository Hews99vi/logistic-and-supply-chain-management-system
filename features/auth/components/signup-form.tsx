"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";
import { Loader2, UserPlus } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { signUpPendingUser } from "@/features/auth/api/auth-client";
import { AuthShell } from "@/features/auth/components/auth-shell";

export function SignupForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await signUpPendingUser({
        fullName: fullName.trim(),
        email: email.trim(),
        password
      });

      startTransition(() => {
        router.replace("/login?registered=1");
        router.refresh();
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Signup failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Request access"
      description="Register a new account. Access remains disabled until an administrator activates your profile."
      footer={<span>Already have access? <Link href="/login" className="font-semibold text-blue-700">Sign in</Link></span>}
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        {error ? <Alert variant="destructive">{error}</Alert> : null}

        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Full Name</span>
          <input
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200"
            placeholder="Kasun Kalhara"
            autoComplete="name"
            required
          />
        </label>

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
            placeholder="Minimum 8 characters"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Confirm Password</span>
          <input
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200"
            placeholder="Re-enter your password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>

        <Button type="submit" className="h-11 w-full rounded-xl" disabled={submitting}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          Submit Registration
        </Button>
      </form>
    </AuthShell>
  );
}
