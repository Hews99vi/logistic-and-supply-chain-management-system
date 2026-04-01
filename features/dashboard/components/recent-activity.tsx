"use client";

import { AlertCircle, CheckCircle2, Loader, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ActivityItem } from "@/features/dashboard/types";

type RecentActivityProps = {
  items: ActivityItem[];
  loading?: boolean;
};

function toneToBadgeVariant(tone: ActivityItem["statusTone"]) {
  if (tone === "success") return "success" as const;
  if (tone === "warning") return "warning" as const;
  if (tone === "danger") return "danger" as const;
  return "secondary" as const;
}

function toneIcon(tone: ActivityItem["statusTone"]) {
  if (tone === "success") return CheckCircle2;
  if (tone === "warning") return AlertCircle;
  if (tone === "danger") return AlertCircle;
  return Loader;
}

export function RecentActivity({ items, loading }: RecentActivityProps) {
  return (
    <Card className="h-full">
      <CardHeader className="pb-4">
        <CardTitle>Recent Activity</CardTitle>
        <CardDescription>Real-time logistics and sales updates</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-16 animate-pulse rounded-md bg-slate-200" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
            No analytics activity available for the selected date range.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-[0.15em] text-slate-500">
                <tr>
                  <th className="pb-3">Route/Depot</th>
                  <th className="pb-3">Activity</th>
                  <th className="pb-3">Value</th>
                  <th className="pb-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item) => {
                  const ToneIcon = toneIcon(item.statusTone);

                  return (
                    <tr key={item.id} className="align-top">
                      <td className="py-3 pr-3">
                        <p className="font-semibold text-slate-900">{item.routeOrDepot}</p>
                        {item.meta ? <p className="text-xs text-slate-500">{item.meta}</p> : null}
                      </td>
                      <td className="py-3 pr-3 text-slate-700">{item.activity}</td>
                      <td className="py-3 pr-3 font-semibold text-slate-900">{item.value}</td>
                      <td className="py-3">
                        <Badge variant={toneToBadgeVariant(item.statusTone)} className="inline-flex gap-1">
                          <ToneIcon className="h-3.5 w-3.5" />
                          {item.statusLabel}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function AiInsightCard({ content, canGenerate }: { content: string; canGenerate: boolean }) {
  return (
    <Card className="overflow-hidden border-blue-900 bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-blue-50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Sparkles className="h-5 w-5" /> AI Logistics Insight
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-blue-100">
        <p>{content}</p>
        <button
          type="button"
          disabled={!canGenerate}
          className="w-full rounded-lg bg-white/15 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Generate Optimization Report
        </button>
      </CardContent>
    </Card>
  );
}
