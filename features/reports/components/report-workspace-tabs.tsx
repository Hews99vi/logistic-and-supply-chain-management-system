"use client";

import { cn } from "@/lib/utils";
import type { ReportWorkspaceTabKey } from "@/features/reports/types";

const tabs: Array<{ key: ReportWorkspaceTabKey; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "invoices", label: "Invoices" },
  { key: "expenses", label: "Expenses" },
  { key: "cash-check", label: "Cash Check" },
  { key: "inventory", label: "Inventory" },
  { key: "returns-damage", label: "Returns & Damage" },
  { key: "summary", label: "Summary" },
  { key: "attachments", label: "Attachments" },
  { key: "audit-trail", label: "Audit Trail" }
];

export function ReportWorkspaceTabs({
  activeTab,
  onTabChange
}: {
  activeTab: ReportWorkspaceTabKey;
  onTabChange: (tab: ReportWorkspaceTabKey) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-card">
      <div className="flex min-w-max items-center gap-1 p-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => onTabChange(tab.key)}
            className={cn(
              "rounded-md px-3 py-2 text-sm font-semibold transition",
              activeTab === tab.key ? "bg-blue-100 text-blue-700" : "text-slate-600 hover:bg-slate-100"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
