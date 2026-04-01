"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, CheckCircle2, Printer, RefreshCw, Save, Send, ShieldCheck, TriangleAlert, XCircle } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardSidebar } from "@/features/dashboard/components/dashboard-sidebar";
import {
  fetchExpenseCategoryOptions,
  fetchReportCashDenominations,
  fetchReportExpenseEntries,
  fetchReportInvoiceEntries,
  saveReportCashDenominations,
  saveReportExpenseEntries,
  saveReportInvoiceEntries,
  updateReportDraft
} from "@/features/reports/api/daily-reports-api";
import { DailyReportStatusBadge } from "@/features/reports/components/daily-report-status-badge";
import { buildReportSubmitChecklist } from "@/features/reports/lib/report-submit-checklist";
import { ReportCashAuditPanel } from "@/features/reports/components/report-cash-audit-panel";
import { ReportExpenseEntriesPanel } from "@/features/reports/components/report-expense-entries-panel";
import { ReportInvoiceEntriesPanel } from "@/features/reports/components/report-invoice-entries-panel";
import { useReportWorkspace } from "@/features/reports/hooks/use-report-workspace";
import type {
  ExpenseCategoryOption,
  ReportExpenseBatchSaveItemInput,
  ReportInvoiceBatchSaveItemInput
} from "@/features/reports/types";
import type { DailyReportBaseDto } from "@/types/domain/report";

function formatCurrencyLkr(amount: number) {
  return new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency: "LKR",
    maximumFractionDigits: 2
  }).format(amount);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-LK", {
    year: "numeric",
    month: "short",
    day: "2-digit"
  }).format(new Date(value));
}

type DateSheetFormState = {
  reportDate: string;
  staffName: string;
  remarks: string;
  totalSale: string;
  dbMarginPercent: string;
  cashInHand: string;
  cashInBank: string;
  totalBillCount: string;
  deliveredBillCount: string;
  cancelledBillCount: string;
};

type DateSheetErrors = Partial<Record<keyof DateSheetFormState, string>>;

function toDecimalString(value: number) {
  return Number.isFinite(value) ? value.toFixed(2) : "0.00";
}

function toIntegerString(value: number) {
  return String(Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0);
}

function buildInitialForm(report: DailyReportBaseDto): DateSheetFormState {
  return {
    reportDate: report.reportDate,
    staffName: report.staffName,
    remarks: report.remarks ?? "",
    totalSale: toDecimalString(report.totalSale),
    dbMarginPercent: toDecimalString(report.dbMarginPercent),
    cashInHand: toDecimalString(report.cashInHand),
    cashInBank: toDecimalString(report.cashInBank),
    totalBillCount: toIntegerString(report.totalBillCount),
    deliveredBillCount: toIntegerString(report.deliveredBillCount),
    cancelledBillCount: toIntegerString(report.cancelledBillCount)
  };
}

function parseNonNegativeNumber(value: string) {
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return Number(parsed.toFixed(2));
}

function parseNonNegativeInteger(value: string) {
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return Math.trunc(parsed);
}

function validateDateSheet(values: DateSheetFormState) {
  const errors: DateSheetErrors = {};

  if (!values.reportDate) {
    errors.reportDate = "Report date is required.";
  }

  const staffName = values.staffName.trim();
  if (staffName.length < 2) {
    errors.staffName = "Name must be at least 2 characters.";
  } else if (staffName.length > 160) {
    errors.staffName = "Name must be 160 characters or less.";
  }

  if (values.remarks.trim().length > 1000) {
    errors.remarks = "Remarks must be 1000 characters or less.";
  }

  if (parseNonNegativeNumber(values.totalSale) === null) {
    errors.totalSale = "Enter a valid non-negative total sale.";
  }

  if (parseNonNegativeNumber(values.dbMarginPercent) === null) {
    errors.dbMarginPercent = "Enter a valid non-negative margin percent.";
  }

  if (parseNonNegativeNumber(values.cashInHand) === null) {
    errors.cashInHand = "Enter a valid non-negative amount.";
  }

  if (parseNonNegativeNumber(values.cashInBank) === null) {
    errors.cashInBank = "Enter a valid non-negative amount.";
  }

  if (parseNonNegativeInteger(values.totalBillCount) === null) {
    errors.totalBillCount = "Enter a valid bill count.";
  }

  if (parseNonNegativeInteger(values.deliveredBillCount) === null) {
    errors.deliveredBillCount = "Enter a valid bill count.";
  }

  if (parseNonNegativeInteger(values.cancelledBillCount) === null) {
    errors.cancelledBillCount = "Enter a valid bill count.";
  }

  const totalBillCount = parseNonNegativeInteger(values.totalBillCount);
  const deliveredBillCount = parseNonNegativeInteger(values.deliveredBillCount);
  const cancelledBillCount = parseNonNegativeInteger(values.cancelledBillCount);

  if (
    totalBillCount !== null &&
    deliveredBillCount !== null &&
    cancelledBillCount !== null &&
    deliveredBillCount + cancelledBillCount > totalBillCount
  ) {
    errors.deliveredBillCount = "Delivered + cancelled cannot exceed total bill count.";
    errors.cancelledBillCount = "Delivered + cancelled cannot exceed total bill count.";
  }

  return errors;
}

function calculateDenominationTotal(rows: Array<{ denominationValue: number; noteCount: number }>) {
  return rows.reduce((total, row) => total + row.denominationValue * row.noteCount, 0);
}

function MetricCard({
  label,
  value,
  hint
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm print:break-inside-avoid">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function DateEndOfDayReportView({ reportId }: { reportId: string }) {
  const {
    loading,
    error,
    saving,
    detail,
    status,
    showRejectForm,
    setShowRejectForm,
    rejectReason,
    setRejectReason,
    canSaveDraft,
    canSubmit,
    canApprove,
    canReject,
    canReopen,
    reload,
    actions
  } = useReportWorkspace(reportId);

  const [form, setForm] = useState<DateSheetFormState | null>(null);
  const [formErrors, setFormErrors] = useState<DateSheetErrors>({});
  const [sheetSaving, setSheetSaving] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [sheetMessage, setSheetMessage] = useState<string | null>(null);

  const [invoiceRows, setInvoiceRows] = useState(detail?.invoiceEntries ?? []);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceSaving, setInvoiceSaving] = useState(false);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);

  const [expenseRows, setExpenseRows] = useState(detail?.expenseEntries ?? []);
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategoryOption[]>([]);
  const [expenseLoading, setExpenseLoading] = useState(false);
  const [expenseSaving, setExpenseSaving] = useState(false);
  const [expenseError, setExpenseError] = useState<string | null>(null);

  const [cashRows, setCashRows] = useState(detail?.cashDenominations ?? []);
  const [cashLoading, setCashLoading] = useState(false);
  const [cashSaving, setCashSaving] = useState(false);
  const [cashError, setCashError] = useState<string | null>(null);

  const report = detail?.report;

  useEffect(() => {
    if (report) {
      setForm(buildInitialForm(report));
      setSheetError(null);
      setSheetMessage(null);
    }
  }, [report]);

  useEffect(() => {
    setInvoiceRows(detail?.invoiceEntries ?? []);
    setExpenseRows(detail?.expenseEntries ?? []);

    const nextCashRows = detail?.cashDenominations ?? [];
    setCashRows(nextCashRows);
    setForm((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        cashInHand: toDecimalString(calculateDenominationTotal(nextCashRows))
      };
    });
  }, [detail]);

  useEffect(() => {
    if (!report) return;

    let cancelled = false;

    const loadSections = async () => {
      setInvoiceLoading(true);
      setExpenseLoading(true);
      setCashLoading(true);
      setInvoiceError(null);
      setExpenseError(null);
      setCashError(null);

      const [invoiceResult, expenseResult, cashResult] = await Promise.allSettled([
        fetchReportInvoiceEntries(report.id),
        Promise.all([fetchReportExpenseEntries(report.id), fetchExpenseCategoryOptions()]),
        fetchReportCashDenominations(report.id)
      ]);

      if (cancelled) return;

      if (invoiceResult.status === "fulfilled") {
        setInvoiceRows(invoiceResult.value);
      } else {
        setInvoiceError(invoiceResult.reason instanceof Error ? invoiceResult.reason.message : "Failed to load invoice rows.");
      }

      if (expenseResult.status === "fulfilled") {
        setExpenseRows(expenseResult.value[0]);
        setExpenseCategories(expenseResult.value[1]);
      } else {
        setExpenseError(expenseResult.reason instanceof Error ? expenseResult.reason.message : "Failed to load expense rows.");
      }

      if (cashResult.status === "fulfilled") {
        setCashRows(cashResult.value);
      } else {
        setCashError(cashResult.reason instanceof Error ? cashResult.reason.message : "Failed to load denomination rows.");
      }

      setInvoiceLoading(false);
      setExpenseLoading(false);
      setCashLoading(false);
    };

    void loadSections();

    return () => {
      cancelled = true;
    };
  }, [report]);
  const handleFieldChange = (field: keyof DateSheetFormState, value: string) => {
    if (field === "cashInHand") {
      return;
    }

    setForm((previous) => previous ? { ...previous, [field]: value } : previous);
    setFormErrors((previous) => ({ ...previous, [field]: undefined }));
    setSheetMessage(null);
  };

  const handlePreviewPhysicalTotalChange = useCallback((value: number) => {
    const nextCashInHand = toDecimalString(value);

    setForm((previous) => {
      if (!previous || previous.cashInHand === nextCashInHand) {
        return previous;
      }

      return {
        ...previous,
        cashInHand: nextCashInHand
      };
    });
  }, []);

  const handleSaveSheet = async () => {
    if (!report || !form) return false;

    const nextErrors = validateDateSheet(form);
    setFormErrors(nextErrors);
    setSheetError(null);
    setSheetMessage(null);

    if (Object.keys(nextErrors).length > 0) {
      return false;
    }

    setSheetSaving(true);

    try {
      await updateReportDraft(report.id, {
        reportDate: form.reportDate,
        staffName: form.staffName.trim(),
        remarks: form.remarks.trim() || undefined,
        totalSale: parseNonNegativeNumber(form.totalSale) ?? 0,
        dbMarginPercent: parseNonNegativeNumber(form.dbMarginPercent) ?? 0,
        cashInHand: parseNonNegativeNumber(form.cashInHand) ?? 0,
        cashInBank: parseNonNegativeNumber(form.cashInBank) ?? 0,
        totalBillCount: parseNonNegativeInteger(form.totalBillCount) ?? 0,
        deliveredBillCount: parseNonNegativeInteger(form.deliveredBillCount) ?? 0,
        cancelledBillCount: parseNonNegativeInteger(form.cancelledBillCount) ?? 0
      });

      await reload();
      setSheetMessage("DATE closing sheet saved.");
      return true;
    } catch (requestError) {
      setSheetError(requestError instanceof Error ? requestError.message : "Failed to save DATE sheet.");
      return false;
    } finally {
      setSheetSaving(false);
    }
  };

  const handleSubmitReport = async () => {
    const saved = await handleSaveSheet();
    if (!saved) return;

    if (submitBlockingFailures.length > 0) {
      setSheetError("Resolve the DATE review checklist before submitting the report.");
      return;
    }

    await actions.submit();
  };

  const handleSaveInvoiceRows = async (items: ReportInvoiceBatchSaveItemInput[]) => {
    if (!report) return;

    setInvoiceSaving(true);
    setInvoiceError(null);

    try {
      const saved = await saveReportInvoiceEntries(report.id, items);
      setInvoiceRows(saved);
      await reload();
    } catch (requestError) {
      setInvoiceError(requestError instanceof Error ? requestError.message : "Failed to save invoice rows.");
    } finally {
      setInvoiceSaving(false);
    }
  };

  const handleSaveExpenseRows = async (items: ReportExpenseBatchSaveItemInput[]) => {
    if (!report) return;

    setExpenseSaving(true);
    setExpenseError(null);

    try {
      const saved = await saveReportExpenseEntries(report.id, items);
      setExpenseRows(saved);
      await reload();
    } catch (requestError) {
      setExpenseError(requestError instanceof Error ? requestError.message : "Failed to save expense rows.");
    } finally {
      setExpenseSaving(false);
    }
  };

  const handleSaveCashRows = async (items: Array<{ denominationValue: number; noteCount: number }>) => {
    if (!report) return;

    setCashSaving(true);
    setCashError(null);

    try {
      await saveReportCashDenominations(report.id, items);
      const refreshed = await fetchReportCashDenominations(report.id);
      setCashRows(refreshed);
      setForm((previous) => {
        if (!previous) return previous;
        return {
          ...previous,
          cashInHand: toDecimalString(calculateDenominationTotal(refreshed))
        };
      });
      await reload();
    } catch (requestError) {
      setCashError(requestError instanceof Error ? requestError.message : "Failed to save denomination rows.");
    } finally {
      setCashSaving(false);
    }
  };

  const canEditDateSheet = canSaveDraft && status === "draft";
  const submitChecklist = useMemo(() => {
    if (!report || !form) return [];
    return buildReportSubmitChecklist({
      routeNameSnapshot: report.routeNameSnapshot,
      staffName: form.staffName.trim(),
      totalBillCount: parseNonNegativeInteger(form.totalBillCount) ?? 0,
      deliveredBillCount: parseNonNegativeInteger(form.deliveredBillCount) ?? 0,
      cancelledBillCount: parseNonNegativeInteger(form.cancelledBillCount) ?? 0,
      cashDifference: report.cashDifference,
      totalCash: report.totalCash,
      cashInHand: parseNonNegativeNumber(form.cashInHand) ?? 0,
      cashPhysicalTotal: report.cashPhysicalTotal,
      invoiceEntriesCount: invoiceRows.length,
      denominationRowCount: cashRows.length,
      denominationPositiveNoteCount: cashRows.reduce((count, row) => count + (row.noteCount > 0 ? 1 : 0), 0)
    });
  }, [cashRows, form, invoiceRows, report]);
  const submitBlockingFailures = submitChecklist.filter((item) => item.blocking && !item.passed);
  const canSubmitFromDateSheet = canSubmit && submitBlockingFailures.length === 0;


  const headerFacts = report ? [
    { label: "Date", value: formatDate(report.reportDate) },
    { label: "Route", value: report.routeNameSnapshot },
    { label: "Territory", value: report.territoryNameSnapshot },
    { label: "Prepared By", value: report.staffName }
  ] : [];

  if (loading) {
    return (
      <div className="min-h-screen lg:flex">
        <div className="print:hidden">
          <DashboardSidebar activeKey="reports" />
        </div>
        <main className="flex-1 p-4 sm:p-6">
          <div className="mx-auto max-w-7xl space-y-5">
            <Skeleton className="h-40" />
            <Skeleton className="h-72" />
            <Skeleton className="h-72" />
        </div>
      </main>
    </div>
  );
  }

  if (!loading && (error || !report || !status || !form)) {
    return (
      <div className="min-h-screen lg:flex">
        <div className="print:hidden">
          <DashboardSidebar activeKey="reports" />
        </div>
        <main className="flex-1 p-4 sm:p-6">
          <div className="mx-auto max-w-4xl space-y-5">
            <Alert variant="destructive">
              <div className="flex items-center justify-between gap-3">
                <span>{error ?? "Report not found."}</span>
                <Button variant="outline" size="sm" onClick={reload} disabled={saving}>Retry</Button>
              </div>
            </Alert>
        </div>
      </main>
    </div>
  );
  }

  return (
    <div className="min-h-screen bg-slate-50 lg:flex print:block print:bg-white">
      <div className="print:hidden">
        <DashboardSidebar activeKey="reports" />
      </div>

      <main className="flex-1 p-4 sm:p-6 print:p-0">
        <div className="mx-auto max-w-7xl space-y-5 print:max-w-none print:space-y-4">
          <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card print:rounded-none print:border-0 print:p-0 print:shadow-none sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Operations / DATE Closing Sheet</p>
                <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">DATE End-of-Day Report</h1>
                <p className="mt-2 text-slate-600">A dedicated route-closing screen laid out to match the operational paper form.</p>
                <div className="mt-4 flex flex-wrap gap-3 text-sm text-slate-600">
                  {headerFacts.map((fact) => (
                    <div key={fact.label} className="rounded-full border border-slate-200 px-3 py-1.5">
                      <span className="font-semibold text-slate-900">{fact.label}:</span> {fact.value}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 print:hidden">
                <DailyReportStatusBadge status={status!} />
                <Button asChild variant="outline">
                  <Link href={`/loading-summaries/${report!.loadingSummaryId}`}>
                    Morning Loading
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href={`/reports/${report!.id}`} className="gap-2">
                    <ArrowLeft className="h-4 w-4" />
                    Workspace
                  </Link>
                </Button>
                <Button variant="outline" onClick={() => void reload()} disabled={saving || sheetSaving}>
                  <RefreshCw className="h-4 w-4" />
                  Refresh
                </Button>
                <Button variant="outline" onClick={() => window.print()}>
                  <Printer className="h-4 w-4" />
                  Print
                </Button>
              </div>
            </div>
          </header>

          {report!.loadingCompletedAt ? (
            <Alert className="border-emerald-200 bg-emerald-50 text-emerald-700 print:hidden">
              Morning loading was finalized on {formatDate(report!.loadingCompletedAt)}. Product movements for this route-day continue to use each product's configured quantity mode across loading, inventory, and return workflows.
            </Alert>
          ) : (
            <Alert className="border-amber-200 bg-amber-50 text-amber-800 print:hidden">
              Morning loading has not been finalized yet. You can still complete the DATE sheet, but operationally this route-day has not been
              closed from the loading side.
            </Alert>
          )}
          {sheetError ? <Alert variant="destructive" className="print:hidden">{sheetError}</Alert> : null}
          {sheetMessage ? <Alert className="print:hidden">{sheetMessage}</Alert> : null}

          <Card className="print:break-inside-avoid">
            <CardHeader>
              <CardTitle>1. Header</CardTitle>
              <CardDescription>Date, route, name, and closing remarks.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="grid gap-4 md:grid-cols-2" onSubmit={(event: FormEvent) => event.preventDefault()}>
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Date</span>
                  <input
                    type="date"
                    value={form!.reportDate}
                    onChange={(event) => handleFieldChange("reportDate", event.target.value)}
                    disabled={!canEditDateSheet || sheetSaving || saving}
                    className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200 disabled:bg-slate-100"
                  />
                  {formErrors.reportDate ? <p className="text-xs text-rose-600">{formErrors.reportDate}</p> : null}
                </label>

                <div className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Route</span>
                  <div className="flex h-11 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-900">
                    {report!.routeNameSnapshot} ({report!.territoryNameSnapshot})
                  </div>
                </div>

                <label className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Name</span>
                  <input
                    value={form!.staffName}
                    onChange={(event) => handleFieldChange("staffName", event.target.value)}
                    disabled={!canEditDateSheet || sheetSaving || saving}
                    className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200 disabled:bg-slate-100"
                  />
                  {formErrors.staffName ? <p className="text-xs text-rose-600">{formErrors.staffName}</p> : null}
                </label>

                <div className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Workflow Status</span>
                  <div className="flex h-11 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900">
                    <DailyReportStatusBadge status={status!} />
                  </div>
                </div>

                <label className="space-y-1.5 md:col-span-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Remarks</span>
                  <textarea
                    rows={3}
                    value={form!.remarks}
                    onChange={(event) => handleFieldChange("remarks", event.target.value)}
                    disabled={!canEditDateSheet || sheetSaving || saving}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200 disabled:bg-slate-100"
                  />
                  {formErrors.remarks ? <p className="text-xs text-rose-600">{formErrors.remarks}</p> : null}
                </label>
              </form>
            </CardContent>
          </Card>
          <section className="space-y-4 print:break-inside-avoid">
            <div>
              <h2 className="text-lg font-bold text-slate-900">2. Invoice / Payment Section</h2>
              <p className="text-sm text-slate-500">Capture invoice rows with cash, cheque, and credit values.</p>
            </div>
            <ReportInvoiceEntriesPanel
              rows={invoiceRows}
              loading={invoiceLoading}
              saving={invoiceSaving || saving}
              error={invoiceError}
              canEdit={canEditDateSheet}
              onSave={handleSaveInvoiceRows}
            />
          </section>

          <section className="space-y-4 print:break-inside-avoid">
            <div>
              <h2 className="text-lg font-bold text-slate-900">3. Expenses Section</h2>
              <p className="text-sm text-slate-500">Record route expenses before final closing.</p>
            </div>
            <ReportExpenseEntriesPanel
              rows={expenseRows}
              categories={expenseCategories}
              loading={expenseLoading}
              saving={expenseSaving || saving}
              error={expenseError}
              canEdit={canEditDateSheet}
              onSave={handleSaveExpenseRows}
            />
          </section>

          <section className="space-y-4 print:break-inside-avoid">
            <div>
              <h2 className="text-lg font-bold text-slate-900">4. Day Sale Block</h2>
              <p className="text-sm text-slate-500">Backend-calculated payment totals for the route closing sheet.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Cash" value={formatCurrencyLkr(report!.totalCash)} />
              <MetricCard label="Cheques" value={formatCurrencyLkr(report!.totalCheques)} />
              <MetricCard label="Credit" value={formatCurrencyLkr(report!.totalCredit)} />
              <MetricCard label="Day Sale" value={formatCurrencyLkr(report!.daySaleTotal)} hint="Calculated from invoice rows" />
            </div>
          </section>

          <section className="space-y-4 print:break-inside-avoid">
            <div>
              <h2 className="text-lg font-bold text-slate-900">5. Cash Checking Denomination Block</h2>
              <p className="text-sm text-slate-500">Count note quantities and reconcile physical cash.</p>
            </div>
            <ReportCashAuditPanel
              reportId={report!.id}
              loading={cashLoading}
              saving={cashSaving || saving}
              error={cashError}
              rows={cashRows}
              cashInHand={parseNonNegativeNumber(form!.cashInHand) ?? 0}
              cashInBank={report!.cashInBank}
              cashBookTotal={report!.cashBookTotal}
              cashPhysicalTotal={report!.cashPhysicalTotal}
              cashDifference={report!.cashDifference}
              canEdit={canEditDateSheet}
              canFinalize={canSubmit}
              showFinalizeAction={false}
              onSave={handleSaveCashRows}
              onFinalize={actions.submit}
              onPreviewPhysicalTotalChange={handlePreviewPhysicalTotalChange}
            />
          </section>

          <section className="space-y-4 print:break-inside-avoid">
            <div>
              <h2 className="text-lg font-bold text-slate-900">6. Cash In Hand / Bank / Total / Cash Total / More or Less</h2>
              <p className="text-sm text-slate-500">Use the editable closing fields while keeping reconciliation totals backend-driven.</p>
            </div>
            <Card>
              <CardContent className="grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-5">
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Cash In Hand</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form!.cashInHand}
                    readOnly
                    disabled
                    className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none"
                  />
                  <p className="text-xs text-slate-500">Auto-filled from the denomination count above.</p>
                  {formErrors.cashInHand ? <p className="text-xs text-rose-600">{formErrors.cashInHand}</p> : null}
                </label>

                <label className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Cash In Bank</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form!.cashInBank}
                    onChange={(event) => handleFieldChange("cashInBank", event.target.value)}
                    disabled={!canEditDateSheet || sheetSaving || saving}
                    className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200 disabled:bg-slate-100"
                  />
                  {formErrors.cashInBank ? <p className="text-xs text-rose-600">{formErrors.cashInBank}</p> : null}
                </label>

                <MetricCard label="Total" value={formatCurrencyLkr(report!.cashBookTotal)} hint="Cash book total" />
                <MetricCard label="Cash Total" value={formatCurrencyLkr(report!.totalCash)} hint="From invoice rows" />
                <MetricCard label="More or Less" value={formatCurrencyLkr(report!.cashDifference)} hint="Physical vs ledger difference" />
              </CardContent>
            </Card>
          </section>

          <section className="space-y-4 print:break-inside-avoid">
            <div>
              <h2 className="text-lg font-bold text-slate-900">7. Summary Block</h2>
              <p className="text-sm text-slate-500">Closing sales and profit summary with backend-derived margin and net profit.</p>
            </div>
            <Card>
              <CardContent className="grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-3">
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Total Sale</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form!.totalSale}
                    onChange={(event) => handleFieldChange("totalSale", event.target.value)}
                    disabled={!canEditDateSheet || sheetSaving || saving}
                    className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200 disabled:bg-slate-100"
                  />
                  {formErrors.totalSale ? <p className="text-xs text-rose-600">{formErrors.totalSale}</p> : null}
                </label>

                <label className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">DB Margin %</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form!.dbMarginPercent}
                    onChange={(event) => handleFieldChange("dbMarginPercent", event.target.value)}
                    disabled={!canEditDateSheet || sheetSaving || saving}
                    className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200 disabled:bg-slate-100"
                  />
                  {formErrors.dbMarginPercent ? <p className="text-xs text-rose-600">{formErrors.dbMarginPercent}</p> : null}
                </label>

                <MetricCard label="Expenses" value={formatCurrencyLkr(report!.totalExpenses)} />
                <MetricCard label="Net Profit" value={formatCurrencyLkr(report!.netProfit)} hint="Calculated by backend" />
                <MetricCard label="DB Margin Value" value={formatCurrencyLkr(report!.dbMarginValue)} />
                <MetricCard label="Physical Cash" value={formatCurrencyLkr(report!.cashPhysicalTotal)} />
                <MetricCard label="Gross Sales" value={formatCurrencyLkr(report!.daySaleTotal)} />
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                  <div className="flex items-start gap-2">
                    <ShieldCheck className="mt-0.5 h-4 w-4" />
                    <p>Totals shown here remain database-driven. Saving this sheet updates input fields only; derived values are recalculated server-side.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          <section className="space-y-4 print:break-inside-avoid">
            <div>
              <h2 className="text-lg font-bold text-slate-900">8. Bill Count Block</h2>
              <p className="text-sm text-slate-500">Capture total, delivered, and cancelled bills for route closing.</p>
            </div>
            <Card>
              <CardContent className="grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-3">
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Total Bill</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form!.totalBillCount}
                    onChange={(event) => handleFieldChange("totalBillCount", event.target.value)}
                    disabled={!canEditDateSheet || sheetSaving || saving}
                    className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200 disabled:bg-slate-100"
                  />
                  {formErrors.totalBillCount ? <p className="text-xs text-rose-600">{formErrors.totalBillCount}</p> : null}
                </label>

                <label className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Delivered Bill</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form!.deliveredBillCount}
                    onChange={(event) => handleFieldChange("deliveredBillCount", event.target.value)}
                    disabled={!canEditDateSheet || sheetSaving || saving}
                    className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200 disabled:bg-slate-100"
                  />
                  {formErrors.deliveredBillCount ? <p className="text-xs text-rose-600">{formErrors.deliveredBillCount}</p> : null}
                </label>

                <label className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Cancel Bill</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form!.cancelledBillCount}
                    onChange={(event) => handleFieldChange("cancelledBillCount", event.target.value)}
                    disabled={!canEditDateSheet || sheetSaving || saving}
                    className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200 disabled:bg-slate-100"
                  />
                  {formErrors.cancelledBillCount ? <p className="text-xs text-rose-600">{formErrors.cancelledBillCount}</p> : null}
                </label>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 md:col-span-2 xl:col-span-3">
                  Delivered bill and cancel bill values are loaded from the report record and saved back through the report draft update API. Validation follows the backend rule: delivered plus cancel bill cannot exceed total bill.
                </div>
              </CardContent>
            </Card>
          </section>

          <section className="space-y-4 print:hidden">
            <div>
              <h2 className="text-lg font-bold text-slate-900">9. Final Actions</h2>
              <p className="text-sm text-slate-500">Save, submit, or review the DATE closing sheet according to the current workflow state.</p>
            </div>

            {canSubmit && submitBlockingFailures.length > 0 ? (
              <Alert variant="destructive">
                DATE submission is blocked until the review checklist is complete.
              </Alert>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle>DATE Review Checklist</CardTitle>
                <CardDescription>Use the same blocking review discipline as the report summary workflow before submit.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {submitChecklist.map((item) => (
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
              </CardContent>
            </Card>

            {showRejectForm ? (
              <Card className="border-amber-200 bg-amber-50/70 print:hidden">
                <CardHeader>
                  <CardTitle>Reject Report</CardTitle>
                  <CardDescription>Provide a rejection reason before sending this report back.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <textarea
                    value={rejectReason}
                    onChange={(event) => setRejectReason(event.target.value)}
                    rows={3}
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-offset-2 transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200"
                    placeholder="Enter rejection reason"
                  />
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setShowRejectForm(false)} disabled={saving}>Cancel</Button>
                    <Button onClick={actions.reject} disabled={saving || rejectReason.trim().length === 0}>Confirm Reject</Button>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardContent className="flex flex-wrap gap-2 p-6 print:hidden">
                {canEditDateSheet ? (
                  <Button variant="outline" onClick={() => void handleSaveSheet()} disabled={sheetSaving || saving}>
                    <Save className={`h-4 w-4 ${sheetSaving ? "animate-pulse" : ""}`} />
                    Save Draft
                  </Button>
                ) : null}
                {canSubmit ? (
                  <Button onClick={() => void handleSubmitReport()} disabled={sheetSaving || saving || !canSubmitFromDateSheet}>
                    <Send className="h-4 w-4" />
                    Submit Report
                  </Button>
                ) : null}
                {canApprove ? <Button onClick={actions.approve} disabled={saving}>Approve</Button> : null}
                {canReject ? <Button variant="outline" onClick={() => setShowRejectForm(true)} disabled={saving}>Reject</Button> : null}
                {canReopen ? <Button variant="secondary" onClick={actions.reopen} disabled={saving}>Reopen</Button> : null}
                <Button variant="outline" onClick={() => window.print()}>
                  <Printer className="h-4 w-4" />
                  Print Sheet
                </Button>
              </CardContent>
            </Card>
          </section>
        </div>
      </main>
    </div>
  );
}



















