"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardSidebar } from "@/features/dashboard/components/dashboard-sidebar";
import {
  createExpenseCategoryOption,
  fetchExpenseCategoryOptions,
  fetchProductOptions,
  fetchReportCashDenominations,
  fetchReportExpenseEntries,
  fetchReportInventoryEntries,
  fetchReportAttachments,
  fetchReportAuditTrail,
  fetchReportInvoiceEntries,
  fetchReportReturnDamageEntries,
  approveReportBillException,
  approveReportExpense,
  resolveReportCashAdjustment,
  saveReportBills,
  saveReportCashAdjustments,
  saveReportCheques,
  saveReportCashDenominations,
  importFlatDataReport,
  postCreditInvoiceCollection,
  uploadReportAttachment,
  deleteReportAttachment,
  saveReportExpenseEntries,
  saveReportInventoryEntries,
  saveReportInvoiceEntries,
  saveReportReturnDamageEntries
} from "@/features/reports/api/daily-reports-api";
import { DailyReportStatusBadge } from "@/features/reports/components/daily-report-status-badge";
import { FlatDataImportPanel } from "@/features/reports/components/flat-data-import-panel";
import { ReportCashAuditPanel } from "@/features/reports/components/report-cash-audit-panel";
import { ReportAttachmentsPanel } from "@/features/reports/components/report-attachments-panel";
import { ReportAuditTrailPanel } from "@/features/reports/components/report-audit-trail-panel";
import { ReportExpenseEntriesPanel } from "@/features/reports/components/report-expense-entries-panel";
import { ReportFinalSummaryPanel } from "@/features/reports/components/report-final-summary-panel";
import { ReportFinanceHandoverPanel } from "@/features/reports/components/report-finance-handover-panel";
import { ReportInventoryEntriesPanel } from "@/features/reports/components/report-inventory-entries-panel";
import { ReportInvoiceEntriesPanel } from "@/features/reports/components/report-invoice-entries-panel";
import { ReportReturnDamageEntriesPanel } from "@/features/reports/components/report-return-damage-entries-panel";
import { ReportWorkspaceHeader } from "@/features/reports/components/report-workspace-header";
import { ReportWorkspaceTabs } from "@/features/reports/components/report-workspace-tabs";
import { useReportWorkspace } from "@/features/reports/hooks/use-report-workspace";
import type { FlatDataParseResult } from "@/features/reports/utils/flatDataParser";
import type {
  ExpenseCategoryOption,
  ProductOption,
  ReportExpenseBatchSaveItemInput,
  ReportBillSaveItemInput,
  ReportCashAdjustmentSaveItemInput,
  ReportChequeSaveItemInput,
  ReportInventoryBatchSaveItemInput,
  ReportInvoiceBatchSaveItemInput,
  ReportReturnDamageBatchSaveItemInput,
  ReportWorkspaceTabKey
} from "@/features/reports/types";
import type { DailyReportExpenseEntryDto, DailyReportInventoryEntryDto, DailyReportReturnDamageEntryDto } from "@/types/domain/report";

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

export function DailyReportWorkspaceView({ reportId }: { reportId: string }) {
  const {
    loading,
    error,
    saving,
    detail,
    status,
    draftForm,
    setDraftForm,
    showRejectForm,
    setShowRejectForm,
    rejectReason,
    setRejectReason,
    canSaveDraft,
    canSubmit,
    canApprove,
    canReject,
    canReopen,
    canImportFlatData,
    canEditFinance,
    canEditOperations,
    reload,
    actions
  } = useReportWorkspace(reportId);

  const [activeTab, setActiveTab] = useState<ReportWorkspaceTabKey>("overview");

  const [invoiceRows, setInvoiceRows] = useState<Array<{
    id: string;
    lineNo: number;
    invoiceNo: string;
    cashAmount: number;
    chequeAmount: number;
    creditAmount: number;
    notes: string | null;
    createdAt: string;
  }>>([]);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceSaving, setInvoiceSaving] = useState(false);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);

  const [expenseRows, setExpenseRows] = useState<DailyReportExpenseEntryDto[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategoryOption[]>([]);
  const [expenseLoading, setExpenseLoading] = useState(false);
  const [expenseSaving, setExpenseSaving] = useState(false);
  const [expenseError, setExpenseError] = useState<string | null>(null);

  const [inventoryRows, setInventoryRows] = useState<DailyReportInventoryEntryDto[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventorySaving, setInventorySaving] = useState(false);
  const [inventoryError, setInventoryError] = useState<string | null>(null);

  const [returnDamageRows, setReturnDamageRows] = useState<DailyReportReturnDamageEntryDto[]>([]);

  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);
  const [returnDamageLoading, setReturnDamageLoading] = useState(false);
  const [returnDamageSaving, setReturnDamageSaving] = useState(false);
  const [returnDamageError, setReturnDamageError] = useState<string | null>(null);
  const [attachmentRows, setAttachmentRows] = useState<Array<{
    filePath: string;
    fileName: string;
    fileType: string | null;
    fileSize: number | null;
    uploadedAt: string | null;
    signedUrl: string | null;
  }>>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [attachmentsUploading, setAttachmentsUploading] = useState(false);
  const [attachmentsUploadProgress, setAttachmentsUploadProgress] = useState(0);
  const [attachmentsDeletingPath, setAttachmentsDeletingPath] = useState<string | null>(null);
  const [attachmentsError, setAttachmentsError] = useState<string | null>(null);
  const [auditRows, setAuditRows] = useState<Array<{
    id: string;
    timestamp: string;
    actorId: string | null;
    actorName: string | null;
    action: "INSERT" | "UPDATE" | "DELETE";
    tableName: string;
    section: string;
    summary: string;
    oldData: unknown;
    newData: unknown;
  }>>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);

  const [cashRows, setCashRows] = useState<Array<{ id: string; denominationValue: number; noteCount: number; lineTotal: number; createdAt: string }>>([]);
  const [cashLoading, setCashLoading] = useState(false);
  const [cashSaving, setCashSaving] = useState(false);
  const [cashError, setCashError] = useState<string | null>(null);
  const [financeSaving, setFinanceSaving] = useState(false);
  const [financeError, setFinanceError] = useState<string | null>(null);

  const report = detail?.report;

  const loadInvoiceRows = useCallback(async () => {
    if (!report) return;

    setInvoiceLoading(true);
    setInvoiceError(null);

    try {
      const rows = await fetchReportInvoiceEntries(report.id);
      setInvoiceRows(rows);
    } catch (requestError) {
      setInvoiceError(requestError instanceof Error ? requestError.message : "Failed to load invoice rows.");
    } finally {
      setInvoiceLoading(false);
    }
  }, [report]);

  const loadExpenseData = useCallback(async () => {
    if (!report) return;

    setExpenseLoading(true);
    setExpenseError(null);

    try {
      const [rows, categories] = await Promise.all([
        fetchReportExpenseEntries(report.id),
        fetchExpenseCategoryOptions()
      ]);

      setExpenseRows(rows);
      setExpenseCategories(categories);
    } catch (requestError) {
      setExpenseError(requestError instanceof Error ? requestError.message : "Failed to load expense rows.");
    } finally {
      setExpenseLoading(false);
    }
  }, [report]);

  const loadInventoryData = useCallback(async () => {
    if (!report) return;

    setInventoryLoading(true);
    setInventoryError(null);

    try {
      const [rows, products] = await Promise.all([
        fetchReportInventoryEntries(report.id),
        fetchProductOptions()
      ]);

      setInventoryRows(rows);
      setProductOptions(products);
    } catch (requestError) {
      setInventoryError(requestError instanceof Error ? requestError.message : "Failed to load inventory rows.");
    } finally {
      setInventoryLoading(false);
    }
  }, [report]);

  const loadReturnDamageData = useCallback(async () => {
    if (!report) return;

    setReturnDamageLoading(true);
    setReturnDamageError(null);

    try {
      const [rows, products] = await Promise.all([
        fetchReportReturnDamageEntries(report.id),
        fetchProductOptions()
      ]);

      setReturnDamageRows(rows);
      setProductOptions(products);
    } catch (requestError) {
      setReturnDamageError(requestError instanceof Error ? requestError.message : "Failed to load return and damage rows.");
    } finally {
      setReturnDamageLoading(false);
    }
  }, [report]);


  const loadAttachmentRows = useCallback(async () => {
    if (!report) return;

    setAttachmentsLoading(true);
    setAttachmentsError(null);

    try {
      const rows = await fetchReportAttachments(report.id);
      setAttachmentRows(rows);
    } catch (requestError) {
      setAttachmentsError(requestError instanceof Error ? requestError.message : "Failed to load attachments.");
    } finally {
      setAttachmentsLoading(false);
    }
  }, [report]);

  const loadAuditRows = useCallback(async () => {
    if (!report) return;

    setAuditLoading(true);
    setAuditError(null);

    try {
      const rows = await fetchReportAuditTrail(report.id);
      setAuditRows(rows);
    } catch (requestError) {
      setAuditError(requestError instanceof Error ? requestError.message : "Failed to load audit trail.");
    } finally {
      setAuditLoading(false);
    }
  }, [report]);
  const loadCashRows = useCallback(async () => {
    if (!report) return;

    setCashLoading(true);
    setCashError(null);

    try {
      const rows = await fetchReportCashDenominations(report.id);
      setCashRows(rows);
    } catch (requestError) {
      setCashError(requestError instanceof Error ? requestError.message : "Failed to load denomination rows.");
    } finally {
      setCashLoading(false);
    }
  }, [report]);

  useEffect(() => {
    if ((activeTab === "overview" || activeTab === "flat-data") && report) {
      void loadInvoiceRows();
      void loadInventoryData();
      void loadReturnDamageData();
    }

    if (activeTab === "invoices" && report) {
      void loadInvoiceRows();
    }

    if (activeTab === "expenses" && report) {
      void loadExpenseData();
    }

    if (activeTab === "finance" && report) {
      void loadExpenseData();
      void loadCashRows();
    }

    if (activeTab === "inventory" && report) {
      void loadInventoryData();
    }

    if (activeTab === "returns-damage" && report) {
      void loadReturnDamageData();
    }

    if (activeTab === "attachments" && report) {
      void loadAttachmentRows();
    }

    if (activeTab === "audit-trail" && report) {
      void loadAuditRows();
    }

    if ((activeTab === "cash-check" || activeTab === "summary") && report) {
      void loadCashRows();
    }
  }, [activeTab, loadAttachmentRows, loadAuditRows, loadCashRows, loadExpenseData, loadInventoryData, loadInvoiceRows, loadReturnDamageData, report]);

  // ---- Flat Data CSV import: ensure products are loaded for the import panel ----
  useEffect(() => {
    if (report && productOptions.length === 0) {
      void fetchProductOptions().then(setProductOptions).catch(() => { /* silently ignore — products will load on tab switch */ });
    }
  }, [report, productOptions.length]);

  const handleFlatDataImportConfirmed = useCallback(
    async (result: FlatDataParseResult & { success: true }, options: { allowOverwrite: boolean }) => {
      if (!report) return;

      try {
        setInvoiceSaving(true);
        setInventorySaving(true);
        setReturnDamageSaving(true);
        setInvoiceError(null);
        setInventoryError(null);
        setReturnDamageError(null);

        await importFlatDataReport(report.id, {
          invoiceEntries: result.invoiceEntries,
          inventorySales: Array.from(result.inventorySalesMap.entries()).map(([productId, sales]) => ({
            productId,
            salesQty: sales.salesQty,
            salesRevenue: sales.salesRevenue,
            costedSalesQty: sales.costedSalesQty
          })),
          returnDamageEntries: result.returnDamageEntries,
          deliveredBillCount: result.deliveredBillCount,
          allowOverwrite: options.allowOverwrite
        });

        await Promise.all([
          loadInvoiceRows(),
          loadInventoryData(),
          loadReturnDamageData(),
          reload()
        ]);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to import Flat Data.";
        setInvoiceError(message);
        setInventoryError(message);
        setReturnDamageError(message);
        throw new Error(message);
      } finally {
        setInvoiceSaving(false);
        setInventorySaving(false);
        setReturnDamageSaving(false);
      }
    },
    [loadInventoryData, loadInvoiceRows, loadReturnDamageData, report, reload]
  );

  const handleSaveInvoiceRows = useCallback(async (items: ReportInvoiceBatchSaveItemInput[]) => {
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
  }, [reload, report]);

  const handleSaveExpenseRows = useCallback(async (items: ReportExpenseBatchSaveItemInput[]) => {
    if (!report) return;

    setExpenseSaving(true);
    setExpenseError(null);

    try {
      const saved = await saveReportExpenseEntries(report.id, items);
      setExpenseRows(saved);
      await reload();
      await loadExpenseData();
    } catch (requestError) {
      setExpenseError(requestError instanceof Error ? requestError.message : "Failed to save expense rows.");
    } finally {
      setExpenseSaving(false);
    }
  }, [loadExpenseData, reload, report]);

  const handleCreateExpenseCategory = useCallback(async (categoryName: string) => {
    const createdCategory = await createExpenseCategoryOption(categoryName);
    setExpenseCategories((previous) => {
      const next = previous.some((category) => category.id === createdCategory.id)
        ? previous
        : [...previous, createdCategory];

      return next.sort((left, right) => left.categoryName.localeCompare(right.categoryName));
    });
    return createdCategory;
  }, []);

  const handleSaveInventoryRows = useCallback(async (items: ReportInventoryBatchSaveItemInput[]) => {
    if (!report) return;

    setInventorySaving(true);
    setInventoryError(null);

    try {
      const saved = await saveReportInventoryEntries(report.id, items);
      setInventoryRows(saved);
      await reload();
      await loadInventoryData();
    } catch (requestError) {
      setInventoryError(requestError instanceof Error ? requestError.message : "Failed to save inventory rows.");
    } finally {
      setInventorySaving(false);
    }
  }, [loadInventoryData, reload, report]);

  const handleSaveReturnDamageRows = useCallback(async (items: ReportReturnDamageBatchSaveItemInput[]) => {
    if (!report) return;

    setReturnDamageSaving(true);
    setReturnDamageError(null);

    try {
      const saved = await saveReportReturnDamageEntries(report.id, items);
      setReturnDamageRows(saved);
      await reload();
      await loadReturnDamageData();
    } catch (requestError) {
      setReturnDamageError(requestError instanceof Error ? requestError.message : "Failed to save return and damage rows.");
    } finally {
      setReturnDamageSaving(false);
    }
  }, [loadReturnDamageData, reload, report]);


  const handleUploadAttachment = useCallback(async (file: File) => {
    if (!report) return;

    setAttachmentsUploading(true);
    setAttachmentsError(null);
    setAttachmentsUploadProgress(0);

    try {
      await uploadReportAttachment(report.id, file, (percent) => {
        setAttachmentsUploadProgress(percent);
      });
      await loadAttachmentRows();
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Failed to upload attachment.";
      setAttachmentsError(message);
      throw new Error(message);
    } finally {
      setAttachmentsUploading(false);
      setAttachmentsUploadProgress(0);
    }
  }, [loadAttachmentRows, report]);

  const handleDeleteAttachment = useCallback(async (filePath: string) => {
    if (!report) return;

    setAttachmentsDeletingPath(filePath);
    setAttachmentsError(null);

    try {
      await deleteReportAttachment(report.id, filePath);
      await loadAttachmentRows();
    } catch (requestError) {
      setAttachmentsError(requestError instanceof Error ? requestError.message : "Failed to delete attachment.");
    } finally {
      setAttachmentsDeletingPath(null);
    }
  }, [loadAttachmentRows, report]);
  const handleSaveCashRows = useCallback(async (items: Array<{ denominationValue: number; noteCount: number }>) => {
    if (!report) return;

    setCashSaving(true);
    setCashError(null);

    try {
      await saveReportCashDenominations(report.id, items);
      await reload();
      await loadCashRows();
    } catch (requestError) {
      setCashError(requestError instanceof Error ? requestError.message : "Failed to save denomination rows.");
    } finally {
      setCashSaving(false);
    }
  }, [loadCashRows, reload, report]);

  const handleFinalizeCashAudit = useCallback(async () => {
    await actions.submit();
    await loadCashRows();
  }, [actions, loadCashRows]);

  const handleSaveCheques = useCallback(async (items: ReportChequeSaveItemInput[]) => {
    if (!report) return;
    setFinanceSaving(true);
    setFinanceError(null);
    try {
      await saveReportCheques(report.id, items);
      await reload();
    } catch (requestError) {
      setFinanceError(requestError instanceof Error ? requestError.message : "Failed to save cheque register.");
    } finally {
      setFinanceSaving(false);
    }
  }, [reload, report]);

  const handleSaveBills = useCallback(async (items: ReportBillSaveItemInput[]) => {
    if (!report) return;
    setFinanceSaving(true);
    setFinanceError(null);
    try {
      await saveReportBills(report.id, items);
      await reload();
    } catch (requestError) {
      setFinanceError(requestError instanceof Error ? requestError.message : "Failed to save bill ledger.");
    } finally {
      setFinanceSaving(false);
    }
  }, [reload, report]);

  const handleSaveCashAdjustments = useCallback(async (items: ReportCashAdjustmentSaveItemInput[]) => {
    if (!report) return;
    setFinanceSaving(true);
    setFinanceError(null);
    try {
      await saveReportCashAdjustments(report.id, items);
      await reload();
      await loadCashRows();
    } catch (requestError) {
      setFinanceError(requestError instanceof Error ? requestError.message : "Failed to save cash adjustments.");
    } finally {
      setFinanceSaving(false);
    }
  }, [loadCashRows, reload, report]);

  const handleApproveBillException = useCallback(async (billId: string) => {
    if (!report) return;
    setFinanceSaving(true);
    setFinanceError(null);
    try {
      await approveReportBillException(report.id, billId);
      await reload();
    } catch (requestError) {
      setFinanceError(requestError instanceof Error ? requestError.message : "Failed to approve bill exception.");
    } finally {
      setFinanceSaving(false);
    }
  }, [reload, report]);

  const handleResolveCashAdjustment = useCallback(async (adjustmentId: string, nextStatus: "approved" | "rejected" | "void") => {
    if (!report) return;
    setFinanceSaving(true);
    setFinanceError(null);
    try {
      await resolveReportCashAdjustment(report.id, adjustmentId, nextStatus);
      await reload();
      await loadCashRows();
    } catch (requestError) {
      setFinanceError(requestError instanceof Error ? requestError.message : "Failed to resolve cash adjustment.");
    } finally {
      setFinanceSaving(false);
    }
  }, [loadCashRows, reload, report]);

  const handlePostCreditCollection = useCallback(async (creditInvoiceId: string, amount: number) => {
    if (!report) return;
    setFinanceSaving(true);
    setFinanceError(null);
    try {
      await postCreditInvoiceCollection(creditInvoiceId, {
        amount,
        paymentMethod: "cash",
        notes: `Collected from route-day report ${report.id}`
      });
      await reload();
    } catch (requestError) {
      setFinanceError(requestError instanceof Error ? requestError.message : "Failed to post credit collection.");
    } finally {
      setFinanceSaving(false);
    }
  }, [reload, report]);

  const handleApproveExpense = useCallback(async (expenseId: string, nextStatus: "approved" | "rejected" | "void") => {
    if (!report) return;
    setFinanceSaving(true);
    setFinanceError(null);
    try {
      await approveReportExpense(report.id, expenseId, { status: nextStatus });
      await reload();
      await loadExpenseData();
    } catch (requestError) {
      setFinanceError(requestError instanceof Error ? requestError.message : "Failed to update expense approval.");
    } finally {
      setFinanceSaving(false);
    }
  }, [loadExpenseData, reload, report]);

  const summaryFacts = useMemo(() => {
    if (!report) return null;

    return [
      { label: "Total Sale", value: formatCurrencyLkr(report.totalSale) },
      { label: "Net Profit", value: formatCurrencyLkr(report.netProfit) },
      { label: "Total Expenses", value: formatCurrencyLkr(report.totalExpenses) },
      { label: "Cash Difference", value: formatCurrencyLkr(report.cashDifference) }
    ];
  }, [report]);

  return (
    <AppShell sidebar={<DashboardSidebar activeKey="reports" />} contentClassName="space-y-5">
      {loading ? (
        <>
          <Skeleton className="h-36" />
          <Skeleton className="h-14" />
          <Skeleton className="h-64" />
        </>
      ) : null}

      {!loading && error ? (
        <Alert variant="destructive">
          <div className="flex items-center justify-between gap-3">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={reload} disabled={saving}>Retry</Button>
          </div>
        </Alert>
      ) : null}

      {!loading && !error && report && status ? (
        <>
          <ReportWorkspaceHeader
            reportId={report.id}
            status={status}
            saving={saving}
            canSaveDraft={canSaveDraft}
            canSubmit={canSubmit}
            canApprove={canApprove}
            canReject={canReject}
            canReopen={canReopen}
            onSaveDraft={actions.saveDraft}
            onSubmit={actions.submit}
            onApprove={actions.approve}
            onReject={() => setShowRejectForm(true)}
            onReopen={actions.reopen}
          />

          <ReportWorkspaceTabs activeTab={activeTab} onTabChange={setActiveTab} />

          {showRejectForm ? (
            <Card className="border-amber-200 bg-amber-50/50">
              <CardHeader>
                <CardTitle>Reject Report</CardTitle>
                <CardDescription>Provide a reason before rejecting this report.</CardDescription>
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

          {activeTab === "overview" ? (
            <>
              <section className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
                <Card>
                  <CardHeader>
                    <CardTitle>Route-Day Overview</CardTitle>
                    <CardDescription>Primary operational fields for this route-day handover.</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4 sm:grid-cols-2">
                    <label className="space-y-1">
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Report Date</span>
                      <input
                        type="date"
                        value={draftForm.reportDate}
                        onChange={(event) => setDraftForm((prev) => ({ ...prev, reportDate: event.target.value }))}
                        disabled={!canSaveDraft || saving}
                        className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none ring-offset-2 transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200 disabled:bg-slate-100"
                      />
                    </label>

                    <div className="space-y-1">
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Workflow Status</span>
                      <div className="h-10 rounded-md border border-slate-200 px-3 py-2"><DailyReportStatusBadge status={report.status} /></div>
                    </div>

                    <div className="space-y-1">
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Route</span>
                      <div className="h-10 rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800">{report.routeNameSnapshot}</div>
                    </div>

                    <div className="space-y-1">
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Territory</span>
                      <div className="h-10 rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800">{report.territoryNameSnapshot}</div>
                    </div>

                    <label className="space-y-1">
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Prepared By</span>
                      <input
                        value={draftForm.staffName}
                        onChange={(event) => setDraftForm((prev) => ({ ...prev, staffName: event.target.value }))}
                        disabled={!canSaveDraft || saving}
                        className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none ring-offset-2 transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200 disabled:bg-slate-100"
                      />
                    </label>

                    <div className="sm:col-span-2 space-y-1">
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Remarks</span>
                      <textarea
                        rows={4}
                        value={draftForm.remarks}
                        onChange={(event) => setDraftForm((prev) => ({ ...prev, remarks: event.target.value }))}
                        disabled={!canSaveDraft || saving}
                        className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none ring-offset-2 transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200 disabled:bg-slate-100"
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Workflow Snapshot</CardTitle>
                    <CardDescription>Current status for loading, Flat Data, stock count, and DATE closing.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="rounded-md border border-slate-100 px-3 py-2">
                      <p className="text-xs uppercase tracking-wider text-slate-500">Flat Data</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        {invoiceRows.length > 0 || inventoryRows.some((row) => row.salesQty > 0 || row.salesRevenueSnapshot > 0)
                          ? "Imported or manually entered"
                          : "Pending"}
                      </p>
                      <div className="mt-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => setActiveTab("flat-data")}>
                          Upload Flat Data
                        </Button>
                      </div>
                    </div>

                    {summaryFacts?.map((fact) => (
                      <div key={fact.label} className="flex items-center justify-between rounded-md border border-slate-100 px-3 py-2">
                        <span className="text-sm text-slate-600">{fact.label}</span>
                        <span className="text-sm font-semibold text-slate-900">{fact.value}</span>
                      </div>
                    ))}

                    <div className="rounded-md border border-slate-100 px-3 py-2">
                      <p className="text-xs uppercase tracking-wider text-slate-500">Last Updated</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{formatDate(report.updatedAt)}</p>
                    </div>

                    <div className="rounded-md border border-slate-100 px-3 py-2">
                      <p className="text-xs uppercase tracking-wider text-slate-500">Morning Loading</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        {report.loadingCompletedAt ? `Completed on ${formatDate(report.loadingCompletedAt)}` : "Pending completion"}
                      </p>
                      <div className="mt-2">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/loading-summaries/${report.loadingSummaryId}`}>Open Route Day Sheet</Link>
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </section>
            </>
          ) : null}

          {activeTab === "flat-data" ? (
            <FlatDataImportPanel
              products={productOptions}
              existingInvoiceRows={invoiceRows}
              existingInventoryRows={inventoryRows}
              existingReturnDamageRows={returnDamageRows}
              canEdit={canImportFlatData && Boolean(report.loadingCompletedAt)}
              disabledReason={
                !report.loadingCompletedAt
                  ? "Morning loading must be finalized first."
                  : !canImportFlatData
                    ? "No permission to import Flat Data."
                    : null
              }
              saving={saving || invoiceSaving || inventorySaving || returnDamageSaving}
              onImportConfirmed={handleFlatDataImportConfirmed}
            />
          ) : null}

          {activeTab === "invoices" ? (
            <ReportInvoiceEntriesPanel
              rows={invoiceRows}
              loading={invoiceLoading}
              saving={invoiceSaving || saving}
              error={invoiceError}
              canEdit={canEditFinance}
              onSave={handleSaveInvoiceRows}
            />
          ) : null}

          {activeTab === "finance" ? (
            <ReportFinanceHandoverPanel
              report={report}
              expenses={expenseRows.length > 0 ? expenseRows : detail.expenseEntries}
              cheques={detail.cheques}
              bills={detail.bills}
              creditInvoices={detail.creditInvoices}
              cashAdjustments={detail.cashAdjustments}
              saving={financeSaving || saving}
              error={financeError}
              canEdit={canEditFinance}
              canApprove={canApprove}
              onSaveCheques={handleSaveCheques}
              onSaveBills={handleSaveBills}
              onSaveCashAdjustments={handleSaveCashAdjustments}
              onApproveBillException={handleApproveBillException}
              onResolveCashAdjustment={handleResolveCashAdjustment}
              onPostCreditCollection={handlePostCreditCollection}
              onApproveExpense={handleApproveExpense}
            />
          ) : null}

          {activeTab === "expenses" ? (
            <ReportExpenseEntriesPanel
              rows={expenseRows}
              categories={expenseCategories}
              loading={expenseLoading}
              saving={expenseSaving || saving}
              error={expenseError}
              canEdit={canEditFinance}
              onSave={handleSaveExpenseRows}
              onCreateCategory={handleCreateExpenseCategory}
            />
          ) : null}

          {activeTab === "inventory" ? (
            <div className="space-y-4">
              <Alert className="border-blue-200 bg-blue-50 text-blue-800">
                Route stock movement is managed from the Route Day Sheet so loading, Flat Data sales, and counted lorry stock stay in one place.
                <Button asChild variant="outline" size="sm" className="ml-0 mt-3 bg-white sm:ml-3 sm:mt-0">
                  <Link href={`/loading-summaries/${report.loadingSummaryId}`}>Open Route Day Sheet</Link>
                </Button>
              </Alert>
              <ReportInventoryEntriesPanel
                rows={inventoryRows}
                products={productOptions}
                loading={inventoryLoading}
                saving={inventorySaving || saving}
                error={inventoryError}
                canEdit={false}
                onSave={handleSaveInventoryRows}
              />
            </div>
          ) : null}

          {activeTab === "returns-damage" ? (
            <ReportReturnDamageEntriesPanel
              rows={returnDamageRows}
              products={productOptions}
              loading={returnDamageLoading}
              saving={returnDamageSaving || saving}
              error={returnDamageError}
              canEdit={canEditOperations}
              onSave={handleSaveReturnDamageRows}
            />
          ) : null}

          {activeTab === "cash-check" ? (
            <ReportCashAuditPanel
              reportId={report.id}
              loading={cashLoading}
              saving={cashSaving || saving}
              error={cashError}
              rows={cashRows}
              cashInHand={report.cashInHand}
              cashInBank={report.cashInBank}
              cashBookTotal={report.cashBookTotal}
              cashPhysicalTotal={report.cashPhysicalTotal}
              cashDifference={report.cashDifference}
              canEdit={canEditFinance}
              canFinalize={canSubmit}
              onSave={handleSaveCashRows}
              onFinalize={handleFinalizeCashAudit}
            />
          ) : null}

          {activeTab === "summary" ? (
            <ReportFinalSummaryPanel
              report={detail}
              canFinalize={canSubmit}
              saving={saving}
              onFinalize={actions.submit}
            />
          ) : null}

          {activeTab === "attachments" ? (
            <ReportAttachmentsPanel
              rows={attachmentRows}
              loading={attachmentsLoading}
              uploading={attachmentsUploading}
              uploadProgress={attachmentsUploadProgress}
              deletingPath={attachmentsDeletingPath}
              error={attachmentsError}
              canEdit={canEditOperations}
              onUpload={handleUploadAttachment}
              onDelete={handleDeleteAttachment}
              onRefresh={loadAttachmentRows}
            />
          ) : null}
          {activeTab === "audit-trail" ? (
            <ReportAuditTrailPanel
              rows={auditRows}
              loading={auditLoading}
              error={auditError}
            />
          ) : null}
        </>
      ) : null}
    </AppShell>
  );
}
