"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Printer, Send, TriangleAlert, XCircle } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchReportDailyTrend } from "@/features/reports/api/daily-reports-api";
import {
  buildReportSubmitChecklistFromEnvelope,
  type ReportSubmitValidationCheck
} from "@/features/reports/lib/report-submit-checklist";
import type { ReportDetailEnvelope } from "@/features/reports/types";
import type { DashboardDailyTrendDto } from "@/types/domain/dashboard";

function formatCurrencyLkr(amount: number) {
  return new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency: "LKR",
    maximumFractionDigits: 2
  }).format(amount);
}

function formatCompact(amount: number) {
  return new Intl.NumberFormat("en-LK", {
    notation: "compact",
    maximumFractionDigits: 1
  }).format(amount);
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function SummaryKpiCard({
  title,
  value,
  hint
}: {
  title: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="text-xs font-semibold uppercase tracking-[0.14em]">{title}</CardDescription>
        <CardTitle className="text-3xl font-extrabold tracking-tight">{value}</CardTitle>
      </CardHeader>
      {hint ? (
        <CardContent>
          <p className="text-xs text-slate-500">{hint}</p>
        </CardContent>
      ) : null}
    </Card>
  );
}

export function ReportFinalSummaryPanel({
  report,
  canFinalize,
  saving,
  onFinalize
}: {
  report: ReportDetailEnvelope;
  canFinalize: boolean;
  saving: boolean;
  onFinalize: () => Promise<void>;
}) {

  const [trendLoading, setTrendLoading] = useState(false);
  const [trendError, setTrendError] = useState<string | null>(null);
  const [trendItems, setTrendItems] = useState<DashboardDailyTrendDto[]>([]);

  const reportData = report.report;

  useEffect(() => {
    let ignore = false;

    const loadTrend = async () => {
      setTrendLoading(true);
      setTrendError(null);

      try {
        const items = await fetchReportDailyTrend(reportData.reportDate, reportData.routeProgramId);
        if (!ignore) {
          setTrendItems(items);
        }
      } catch (requestError) {
        if (!ignore) {
          setTrendError(requestError instanceof Error ? requestError.message : "Failed to load trend.");
        }
      } finally {
        if (!ignore) {
          setTrendLoading(false);
        }
      }
    };

    void loadTrend();

    return () => {
      ignore = true;
    };
  }, [reportData.reportDate, reportData.routeProgramId]);

  const salesReturns = useMemo(() => {
    return report.returnDamageEntries.reduce((acc, row) => acc + row.value, 0);
  }, [report.returnDamageEntries]);

  const grossSales = reportData.daySaleTotal;
  const netSales = reportData.totalSale;

  const denominationTotal = useMemo(() => {
    return report.cashDenominations.reduce((acc, row) => acc + row.lineTotal, 0);
  }, [report.cashDenominations]);

  const totalNotes = useMemo(() => {
    return report.cashDenominations.reduce((acc, row) => acc + row.noteCount, 0);
  }, [report.cashDenominations]);

  const checklist: ReportSubmitValidationCheck[] = useMemo(
    () => buildReportSubmitChecklistFromEnvelope(report),
    [report]
  );
  const hasBlockingFailure = checklist.some((item) => item.blocking && !item.passed);


  const trendChartData = trendItems.map((item) => ({
    date: item.reportDate,
    netProfit: item.totalNetProfit
  }));

  return (
    <section className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Operations / Report Summary</p>
          <CardTitle className="mt-2 text-3xl">Daily Distribution Report</CardTitle>
          <CardDescription>Executive final review before workflow finalization.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-start gap-3">
          <div className="max-w-2xl flex-1 text-sm text-slate-600">
            Printing and final presentation now live on the DATE closing sheet. Use that page for browser print instead of share or PDF export.
          </div>
          <Button asChild variant="outline">
            <Link href={`/reports/${reportData.id}/date`}>
              <Printer className="h-4 w-4" />Open DATE Sheet
            </Link>
          </Button>
          <Button onClick={onFinalize} disabled={saving || !canFinalize || hasBlockingFailure}>
            <Send className="h-4 w-4" />Finalize Report
          </Button>
        </CardContent>
      </Card>

      {hasBlockingFailure ? (
        <Alert variant="destructive">
          Finalization is blocked. Resolve checklist failures before proceeding.
        </Alert>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryKpiCard title="Gross Sales" value={formatCurrencyLkr(grossSales)} hint="Day sale total" />
            <SummaryKpiCard title="Sales Returns" value={formatCurrencyLkr(salesReturns)} hint="Return/damage value" />
            <SummaryKpiCard title="Net Sales" value={formatCurrencyLkr(netSales)} hint="Total sale" />
            <SummaryKpiCard title="Gross Margin" value={formatCurrencyLkr(reportData.dbMarginValue)} hint={formatPercent(reportData.dbMarginPercent)} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Expense Summary</CardTitle>
                <CardDescription>Operational expense overview</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center justify-between"><span className="text-slate-600">Total Expenses</span><span className="font-semibold">{formatCurrencyLkr(reportData.totalExpenses)}</span></div>
                <div className="flex items-center justify-between"><span className="text-slate-600">Expense Lines</span><span className="font-semibold">{report.expenseEntries.length}</span></div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-blue-900 to-slate-900 text-slate-50">
              <CardHeader>
                <CardDescription className="text-slate-300">Net Profitability</CardDescription>
                <CardTitle className="text-4xl">{formatCurrencyLkr(reportData.netProfit)}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-200">Gross margin value: {formatCurrencyLkr(reportData.dbMarginValue)}</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Cash Reconciliation</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center justify-between"><span className="text-slate-600">Total Cash</span><span className="font-semibold">{formatCurrencyLkr(reportData.totalCash)}</span></div>
                <div className="flex items-center justify-between"><span className="text-slate-600">Total Cheques</span><span className="font-semibold">{formatCurrencyLkr(reportData.totalCheques)}</span></div>
                <div className="flex items-center justify-between"><span className="text-slate-600">Total Credit</span><span className="font-semibold">{formatCurrencyLkr(reportData.totalCredit)}</span></div>
                <div className="flex items-center justify-between border-t border-slate-100 pt-2"><span className="text-slate-600">Ledger Balance</span><span className="font-semibold">{formatCurrencyLkr(reportData.cashBookTotal)}</span></div>
                <div className="flex items-center justify-between"><span className="text-slate-600">Physical Cash</span><span className="font-semibold">{formatCurrencyLkr(reportData.cashPhysicalTotal)}</span></div>
                <div className="flex items-center justify-between"><span className="text-slate-600">Difference</span><span className={`font-semibold ${Math.abs(reportData.cashDifference) < 0.0001 ? "text-emerald-600" : "text-amber-600"}`}>{formatCurrencyLkr(reportData.cashDifference)}</span></div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Denomination Summary</CardTitle>
                <CardDescription>From audited cash sheet</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center justify-between"><span className="text-slate-600">Rows</span><span className="font-semibold">{report.cashDenominations.length}</span></div>
                <div className="flex items-center justify-between"><span className="text-slate-600">Total Notes</span><span className="font-semibold">{totalNotes}</span></div>
                <div className="flex items-center justify-between"><span className="text-slate-600">Denomination Total</span><span className="font-semibold">{formatCurrencyLkr(denominationTotal)}</span></div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>7-Day Profit Trend</CardTitle>
              <CardDescription>Recent net profit pattern for this route</CardDescription>
            </CardHeader>
            <CardContent>
              {trendLoading ? (
                <Skeleton className="h-56" />
              ) : trendError ? (
                <Alert variant="destructive">{trendError}</Alert>
              ) : trendChartData.length === 0 ? (
                <Alert>No trend data available for the selected period.</Alert>
              ) : (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendChartData} margin={{ left: -16, right: 10, top: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip formatter={(value) => formatCurrencyLkr(Number(value))} />
                      <Line type="monotone" dataKey="netProfit" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Validation Checklist</CardTitle>
            <CardDescription>Final review controls</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {checklist.map((item) => (
              <div key={item.key} className="rounded-md border border-slate-100 p-3">
                <div className="flex items-start gap-2">
                  {item.passed ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                  ) : item.blocking ? (
                    <XCircle className="mt-0.5 h-4 w-4 text-red-600" />
                  ) : (
                    <TriangleAlert className="mt-0.5 h-4 w-4 text-amber-600" />
                  )}
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                    <p className="text-xs text-slate-500">{item.message}</p>
                  </div>
                </div>
              </div>
            ))}

            <div className="rounded-md border border-slate-100 bg-slate-50 p-3 text-sm">
              <p className="text-slate-600">Workflow Status</p>
              <p className="mt-1 font-semibold text-slate-900">{reportData.status}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}




