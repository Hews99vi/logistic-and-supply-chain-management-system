import type { ReactNode } from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";

type AuthShellProps = {
  title: string;
  description: string;
  footer: ReactNode;
  children: ReactNode;
};

export function AuthShell({ title, description, footer, children }: AuthShellProps) {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative hidden overflow-hidden border-r border-white/10 lg:block">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.32),_transparent_35%),radial-gradient(circle_at_bottom_right,_rgba(16,185,129,0.18),_transparent_30%),linear-gradient(160deg,#020617_0%,#0f172a_55%,#111827_100%)]" />
          <div className="relative flex h-full flex-col justify-between p-10">
            <div>
              <p className="text-4xl font-extrabold tracking-tight text-white">Priyadarshana</p>
              <p className="mt-3 text-sm font-semibold uppercase tracking-[0.24em] text-blue-200/80">Enterprise Logistics</p>
            </div>

            <div className="max-w-xl space-y-6">
              <div className="inline-flex rounded-full border border-blue-400/30 bg-blue-500/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-blue-100">
                Dairy Distribution Operations
              </div>
              <h2 className="text-5xl font-black leading-tight text-white">
                Dispatch, reporting, and route finance in one controlled workspace.
              </h2>
              <p className="max-w-lg text-base leading-7 text-slate-300">
                Access is restricted by role and profile status. New registrations stay pending until an administrator activates the account.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
              <p className="text-sm font-semibold text-white">Operational controls</p>
              <div className="mt-4 grid gap-3 text-sm text-slate-300">
                <div className="rounded-xl border border-white/10 bg-black/10 px-4 py-3">Daily report workflow approvals</div>
                <div className="rounded-xl border border-white/10 bg-black/10 px-4 py-3">Cash reconciliation and variance tracking</div>
                <div className="rounded-xl border border-white/10 bg-black/10 px-4 py-3">Product, route, and user access management</div>
              </div>
            </div>
          </div>
        </section>

        <section className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-6 lg:px-10">
          <div className="w-full max-w-md">
            <Link href="/" className="mb-8 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/10 lg:hidden">
              Priyadarshana Enterprise Logistics
            </Link>

            <div className={cn("rounded-3xl border border-white/10 bg-white p-8 shadow-2xl", "text-slate-900") }>
              <div className="mb-8 space-y-2">
                <h1 className="text-3xl font-extrabold tracking-tight text-slate-950">{title}</h1>
                <p className="text-sm leading-6 text-slate-500">{description}</p>
              </div>

              {children}

              <div className="mt-6 border-t border-slate-200 pt-5 text-sm text-slate-600">
                {footer}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
