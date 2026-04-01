"use client";

import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type KpiCardProps = {
  title: string;
  value: string;
  subtitle?: string;
  badgeText?: string;
  badgeTone?: "success" | "warning" | "danger" | "secondary";
  icon: LucideIcon;
  accent?: string;
  progress?: number;
};

export function KpiCard({ title, value, subtitle, badgeText, badgeTone = "secondary", icon: Icon, accent, progress }: KpiCardProps) {
  return (
    <Card className="h-full">
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className={cn("rounded-xl p-3", accent ?? "bg-blue-100 text-blue-700")}>
            <Icon className="h-5 w-5" />
          </div>
          {badgeText ? <Badge variant={badgeTone}>{badgeText}</Badge> : null}
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">{title}</p>
          <p className="mt-2 text-4xl font-extrabold tracking-tight text-slate-900">{value}</p>
          {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
        </div>

        {typeof progress === "number" ? (
          <div className="h-2 w-full rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
