"use client";

import Link from "next/link";
import { useEffect, useState, type ComponentType } from "react";
import {
  BarChart3,
  Boxes,
  ClipboardList,
  LayoutDashboard,
  Menu,
  PanelLeftClose,
  Route,
  Settings,
  Truck,
  UserCog,
  Users,
  Warehouse
} from "lucide-react";

import { cn } from "@/lib/utils";
import { fetchCachedAuthSession } from "@/features/auth/api/session-cache";

type NavKey = "dashboard" | "reports" | "loading-summaries" | "products" | "route-programs" | "customers" | "main-inventory";
type SidebarHref = "/dashboard" | "/reports" | "/loading-summaries" | "/products" | "/route-programs" | "/customers" | "/main-inventory";

type SidebarItem = {
  key: NavKey | "other";
  href?: SidebarHref;
  label: string;
  icon: ComponentType<{ className?: string }>;
  ready: boolean;
  feature?: string;
};

const items: SidebarItem[] = [
  { key: "dashboard", href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, ready: true, feature: "dashboard" },
  { key: "reports", href: "/reports", label: "Daily Reports", icon: ClipboardList, ready: true, feature: "daily_reports" },
  { key: "loading-summaries", href: "/loading-summaries", label: "Loading Summaries", icon: Truck, ready: true, feature: "loading_summaries" },
  { key: "main-inventory", href: "/main-inventory", label: "Main Inventory", icon: Warehouse, ready: true, feature: "main_inventory" },
  { key: "products", href: "/products", label: "Products", icon: Boxes, ready: true, feature: "products" },
  { key: "route-programs", href: "/route-programs", label: "Route Programs", icon: Route, ready: true, feature: "route_programs" },
  { key: "customers", href: "/customers", label: "Customers", icon: Users, ready: true, feature: "customers" },
  { key: "other", label: "Analytics", icon: BarChart3, ready: false, feature: "analytics" },
  { key: "other", label: "Users", icon: UserCog, ready: false, feature: "users" },
  { key: "other", label: "Settings", icon: Settings, ready: false, feature: "settings" }
];

export function DashboardSidebar({ activeKey }: { activeKey: NavKey }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [permissions, setPermissions] = useState<Record<string, Record<string, boolean | undefined> | undefined> | null>(null);

  useEffect(() => {
    if (!mobileNavOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileNavOpen(false);
      }
    };

    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [mobileNavOpen]);

  useEffect(() => {
    let mounted = true;

    void fetchCachedAuthSession<{
      user: {
        permissions?: Record<string, Record<string, boolean | undefined> | undefined> | null;
      };
    }>()
      .then((session) => {
        if (mounted) {
          setPermissions(session.user.permissions ?? null);
        }
      })
      .catch(() => {
        if (mounted) {
          setPermissions(null);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  const visibleItems = items.filter((item) => {
    if (permissions === null) return item.ready;
    if (!item.feature) return true;
    if (!item.ready) return Boolean(permissions?.[item.feature]?.view);
    return Boolean(permissions?.[item.feature]?.view);
  });

  const activeItem = visibleItems.find((item) => item.ready && item.key === activeKey);

  const renderItem = (item: SidebarItem, onNavigate?: () => void) => {
    const Icon = item.icon;
    const isActive = item.ready && item.key === activeKey;
    const baseClassName = cn(
      "flex min-h-11 items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-colors",
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
      <Link key={item.label} href={item.href as any} className={baseClassName} onClick={onNavigate}>
        {content}
      </Link>
    );
  };

  return (
    <>
      <div className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 px-3 py-3 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-lg font-extrabold leading-none text-blue-700">Priyadarshana</p>
            <p className="mt-1 truncate text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              {activeItem?.label ?? "Operations"}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50"
            aria-label="Open navigation"
            aria-expanded={mobileNavOpen}
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </div>

      {mobileNavOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/45 backdrop-blur-[1px]"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close navigation"
          />

          <aside className="relative z-10 h-full w-[86vw] max-w-[360px] border-r border-slate-200 bg-white px-4 py-5 shadow-2xl sm:max-w-[400px]">
            <div className="flex items-start justify-between gap-3 px-2">
              <div>
                <p className="text-3xl font-extrabold leading-none text-blue-700">Priyadarshana</p>
                <p className="mt-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Enterprise Logistics</p>
              </div>

              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50"
                aria-label="Close navigation panel"
              >
                <PanelLeftClose className="h-5 w-5" />
              </button>
            </div>

            <nav className="mt-8 space-y-1">
              {visibleItems.map((item) => renderItem(item, () => setMobileNavOpen(false)))}
            </nav>
          </aside>
        </div>
      ) : null}

      <aside className="hidden w-[260px] shrink-0 border-r border-slate-200 bg-white px-4 py-6 lg:block">
        <div className="px-2">
          <p className="text-3xl font-extrabold leading-none text-blue-700">Priyadarshana</p>
          <p className="mt-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Enterprise Logistics</p>
        </div>

        <nav className="mt-8 space-y-1">
          {visibleItems.map((item) => renderItem(item))}
        </nav>
      </aside>
    </>
  );
}
