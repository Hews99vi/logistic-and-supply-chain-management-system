import { cn } from "@/lib/utils";

export function RouteProgramStatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
        isActive ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-100 text-slate-600"
      )}
    >
      {isActive ? "Active" : "Inactive"}
    </span>
  );
}
