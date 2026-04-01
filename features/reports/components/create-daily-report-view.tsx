"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarDays, Loader2, Save } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardSidebar } from "@/features/dashboard/components/dashboard-sidebar";
import { createDailyReport, fetchRouteFilterOptions } from "@/features/reports/api/daily-reports-api";
import type { DailyReportCreateInput, RouteProgramFilterOption } from "@/features/reports/types";

type CreateFormState = {
  reportDate: string;
  routeProgramId: string;
  staffName: string;
  remarks: string;
};

type FieldErrors = Partial<Record<keyof CreateFormState, string>>;

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function validateForm(values: CreateFormState) {
  const nextErrors: FieldErrors = {};

  if (!values.reportDate) {
    nextErrors.reportDate = "Report date is required.";
  }

  if (!values.routeProgramId) {
    nextErrors.routeProgramId = "Route program is required.";
  }

  const staffName = values.staffName.trim();
  if (staffName.length < 2) {
    nextErrors.staffName = "Staff name must be at least 2 characters.";
  }

  if (staffName.length > 160) {
    nextErrors.staffName = "Staff name must be 160 characters or less.";
  }

  if (values.remarks.trim().length > 1000) {
    nextErrors.remarks = "Remarks must be 1000 characters or less.";
  }

  return nextErrors;
}

export function CreateDailyReportView() {
  const router = useRouter();

  const [routeOptions, setRouteOptions] = useState<RouteProgramFilterOption[]>([]);
  const [loadingRoutes, setLoadingRoutes] = useState(true);
  const [routeError, setRouteError] = useState<string | null>(null);

  const [form, setForm] = useState<CreateFormState>({
    reportDate: todayIsoDate(),
    routeProgramId: "",
    staffName: "",
    remarks: ""
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedRoute = useMemo(() => {
    return routeOptions.find((item) => item.id === form.routeProgramId) ?? null;
  }, [form.routeProgramId, routeOptions]);

  const loadRoutes = async () => {
    setLoadingRoutes(true);
    setRouteError(null);

    try {
      const options = await fetchRouteFilterOptions();
      setRouteOptions(options);
    } catch (requestError) {
      setRouteError(requestError instanceof Error ? requestError.message : "Failed to load routes.");
    } finally {
      setLoadingRoutes(false);
    }
  };

  useEffect(() => {
    void loadRoutes();
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const validation = validateForm(form);
    setFieldErrors(validation);
    setSubmitError(null);

    if (Object.keys(validation).length > 0) {
      return;
    }

    const payload: DailyReportCreateInput = {
      reportDate: form.reportDate,
      routeProgramId: form.routeProgramId,
      staffName: form.staffName.trim(),
      remarks: form.remarks.trim() || undefined
    };

    setSubmitting(true);

    try {
      const created = await createDailyReport(payload);
      router.push(`/reports/${created.id}`);
    } catch (requestError) {
      setSubmitError(requestError instanceof Error ? requestError.message : "Failed to create daily report.");
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen lg:flex">
      <DashboardSidebar activeKey="reports" />

      <main className="flex-1 p-4 sm:p-6">
        <div className="mx-auto max-w-4xl space-y-5">
          <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Operations / Daily Reports</p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">Create Daily Report</h1>
            <p className="mt-2 text-slate-600">This direct route remains available, but the operational workflow now starts from Daily Loading Summary first whenever possible.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild size="sm">
                <Link href="/loading-summaries" className="gap-2">
                  Go to Loading Summaries
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/reports" className="gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  Back to Daily Reports
                </Link>
              </Button>
            </div>
          </header>

          <Alert>
            Start from <span className="font-semibold">Daily Loading Summary</span> for the normal morning-to-evening route workflow. Use this page only when you need to open a report directly without going through the loading-summary step.
          </Alert>

          <Card>
            <CardHeader>
              <CardTitle>Report Setup</CardTitle>
              <CardDescription>Secondary entry path for creating a draft daily report when the loading-summary-first workflow is not practical.</CardDescription>
            </CardHeader>
            <CardContent>
              {routeError ? (
                <Alert variant="destructive">
                  <div className="flex items-center justify-between gap-2">
                    <span>{routeError}</span>
                    <Button variant="outline" size="sm" onClick={loadRoutes} disabled={loadingRoutes}>
                      Retry
                    </Button>
                  </div>
                </Alert>
              ) : null}

              {submitError ? <Alert variant="destructive" className="mt-3">{submitError}</Alert> : null}

              <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-1.5">
                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Report Date</span>
                    <div className="relative">
                      <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        type="date"
                        value={form.reportDate}
                        onChange={(event) => setForm((prev) => ({ ...prev, reportDate: event.target.value }))}
                        className="h-11 w-full rounded-xl border border-slate-200 pl-10 pr-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200"
                        disabled={submitting}
                      />
                    </div>
                    {fieldErrors.reportDate ? <p className="text-xs text-rose-600">{fieldErrors.reportDate}</p> : null}
                  </label>

                  <label className="space-y-1.5">
                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Route Program</span>
                    {loadingRoutes ? (
                      <Skeleton className="h-11 w-full" />
                    ) : (
                      <select
                        value={form.routeProgramId}
                        onChange={(event) => setForm((prev) => ({ ...prev, routeProgramId: event.target.value }))}
                        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200"
                        disabled={submitting || routeOptions.length === 0}
                      >
                        <option value="">Select route program</option>
                        {routeOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.routeName} ({option.territoryName})
                          </option>
                        ))}
                      </select>
                    )}
                    {fieldErrors.routeProgramId ? <p className="text-xs text-rose-600">{fieldErrors.routeProgramId}</p> : null}
                  </label>

                  <label className="space-y-1.5 md:col-span-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Prepared By / Staff Name</span>
                    <input
                      value={form.staffName}
                      onChange={(event) => setForm((prev) => ({ ...prev, staffName: event.target.value }))}
                      placeholder="Enter staff name"
                      className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200"
                      disabled={submitting}
                    />
                    {fieldErrors.staffName ? <p className="text-xs text-rose-600">{fieldErrors.staffName}</p> : null}
                  </label>

                  <label className="space-y-1.5 md:col-span-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Remarks (Optional)</span>
                    <textarea
                      rows={4}
                      value={form.remarks}
                      onChange={(event) => setForm((prev) => ({ ...prev, remarks: event.target.value }))}
                      placeholder="Notes for this report"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200"
                      disabled={submitting}
                    />
                    {fieldErrors.remarks ? <p className="text-xs text-rose-600">{fieldErrors.remarks}</p> : null}
                  </label>
                </div>

                {selectedRoute ? (
                  <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Route Snapshot</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{selectedRoute.routeName}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Territory Snapshot</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{selectedRoute.territoryName}</p>
                    </div>
                  </div>
                ) : null}

                {!loadingRoutes && routeOptions.length === 0 ? (
                  <Alert>No active route programs found. Create or activate a route program before creating reports.</Alert>
                ) : null}

                <div className="flex justify-end">
                  <Button type="submit" disabled={submitting || loadingRoutes || routeOptions.length === 0}>
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Create Report
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

