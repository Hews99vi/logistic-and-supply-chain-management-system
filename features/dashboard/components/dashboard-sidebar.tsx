"use client";

import Link from "next/link";
import type { ComponentType } from "react";
import {
  BarChart3,
  Boxes,
  ClipboardList,
  LayoutDashboard,
  Route,
  Settings,
  Truck,
  UserCog,
  Users
} from "lucide-react";

import { cn } from "@/lib/utils";

type NavKey = "dashboard" | "reports" | "loading-summaries" | "products" | "route-programs" | "customers";
type SidebarHref = "/dashboard" | "/reports" | "/loading-summaries" | "/products" | "/route-programs" | "/customers";

type SidebarItem = {
  key: NavKey | "other";
  href?: SidebarHref;
  label: string;
  icon: ComponentType<{ className?: string }>;
  ready: boolean;
};

const items: SidebarItem[] = [
  { key: "dashboard", href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, ready: true },
  { key: "reports", href: "/reports", label: "Daily Reports", icon: ClipboardList, ready: true },
  { key: "loading-summaries", href: "/loading-summaries", label: "Loading Summaries", icon: Truck, ready: true },
  { key: "products", href: "/products", label: "Products", icon: Boxes, ready: true },
  { key: "route-programs", href: "/route-programs", label: "Route Programs", icon: Route, ready: true },
  { key: "customers", href: "/customers", label: "Customers", icon: Users, ready: true },
  { key: "other", label: "Analytics", icon: BarChart3, ready: false },
  { key: "other", label: "Users", icon: UserCog, ready: false },
  { key: "other", label: "Settings", icon: Settings, ready: false }
];

export function DashboardSidebar({ activeKey }: { activeKey: NavKey }) {
  return (
    <aside className="hidden w-[260px] shrink-0 border-r border-slate-200 bg-white px-4 py-6 lg:block">
      <div className="px-2">
        <p className="text-3xl font-extrabold leading-none text-blue-700">Priyadarshana</p>
        <p className="mt-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Enterprise Logistics</p>
      </div>

      <nav className="mt-8 space-y-1">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = item.ready && item.key === activeKey;
          const baseClassName = cn(
            "flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-colors",
            item.ready
              ? isActive
                ? "bg-blue-100 text-blue-700"
                : "text-slate-600 hover:bg-slate-100"
              : "cursor-not-allowed text-slate-400"
          );

          const content = (
            <>
              <span className="flex items-center gap-3">
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </span>
              {!item.ready ? (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Coming Soon
                </span>
              ) : null}
            </>
          );

          if (!item.ready || !item.href) {
            return (
              <div key={item.label} className={baseClassName} aria-disabled="true">
                {content}
              </div>
            );
          }

          return (
            <Link key={item.label} href={item.href} className={baseClassName}>
              {content}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
