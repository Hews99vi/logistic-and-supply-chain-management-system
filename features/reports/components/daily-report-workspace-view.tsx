"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { DailyReportInventoryEntryDto, DailyReportReturnDamageEntryDto } from "@/types/domain/report";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchExpenseCategoryOptions,
  fetchProductOptions,
  fetchReportCashDenominations,
  fetchReportExpenseEntries,
  fetchReportInventoryEntries,
  fetchReportAttachments,
  fetchReportAuditTrail,
  fetchReportInvoiceEntries,
  fetchReportReturnDamageEntries,
  saveReportCashDenominations,
  uploadReportAttachment,
  deleteReportAttachment,
  saveReportExpenseEntries,
  saveReportInventoryEntries,
  saveReportInvoiceEntries,
  saveReportReturnDamageEntries
} from "@/features/reports/api/daily-reports-api";
import { DailyReportStatusBadge } from "@/features/reports/components/daily-report-status-badge";
import { ReportCashAuditPanel } from "@/features/reports/components/report-cash-audit-panel";
import { ReportAttachmentsPanel } from "@/features/reports/components/report-attachments-panel";
import { ReportAuditTrailPanel } from "@/features/reports/components/report-audit-trail-panel";
import { ReportExpenseEntriesPanel } from "@/features/reports/components/report-expense-entries-panel";
import { ReportFinalSummaryPanel } from "@/features/reports/components/report-final-summary-panel";
import { ReportInventoryEntriesPanel } from "@/features/reports/components/report-inventory-entries-panel";
import { ReportInvoiceEntriesPanel } from "@/features/reports/components/report-invoice-entries-panel";
import { ReportReturnDamageEntriesPanel } from "@/features/reports/components/report-return-damage-entries-panel";
import { ReportWorkspaceHeader } from "@/features/reports/components/report-workspace-header";
import { ReportWorkspaceTabs } from "@/features/reports/components/report-workspace-tabs";
import { useReportWorkspace } from "@/features/reports/hooks/use-report-workspace";
import type {
  ExpenseCategoryOption,
  ProductOption,
  ReportExpenseBatchSaveItemInput,
  ReportInventoryBatchSaveItemInput,
  ReportInvoiceBatchSaveItemInput,
  ReportReturnDamageBatchSaveItemInput,
  ReportWorkspaceTabKey
} from "@/features/reports/types";

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

function TabPlaceholder({ title }: { title: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          This tab boundary is prepared. Data grid/form implementation can be added using existing nested endpoints.
        </CardDescription>
      </CardHeader>
    </Card>
  );
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

  const [expenseRows, setExpenseRows] = useState<Array<{
    id: string;
    lineNo: number;
    expenseCategoryId: string | null;
    customExpenseName: string | null;
    amount: number;
    notes: string | null;
    createdAt: string;
  }>>([]);
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
    if (activeTab === "invoices" && report) {
      void loadInvoiceRows();
    }

    if (activeTab === "expenses" && report) {
      void loadExpenseData();
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
    <main className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
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
            <section className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
              <Card>
                <CardHeader>
                  <CardTitle>Report Metadata</CardTitle>
                  <CardDescription>Primary operational fields for this daily report.</CardDescription>
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
                  <CardTitle>Financial Snapshot</CardTitle>
                  <CardDescription>Auto-calculated values from report lines.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
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
                        <Link href={`/loading-summaries/${report.loadingSummaryId}`}>Open Loading Summary</Link>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>
          ) : null}

          {activeTab === "invoices" ? (
            <ReportInvoiceEntriesPanel
              rows={invoiceRows}
              loading={invoiceLoading}
              saving={invoiceSaving || saving}
              error={invoiceError}
              canEdit={canSaveDraft}
              onSave={handleSaveInvoiceRows}
            />
          ) : null}

          {activeTab === "expenses" ? (
            <ReportExpenseEntriesPanel
              rows={expenseRows}
              categories={expenseCategories}
              loading={expenseLoading}
              saving={expenseSaving || saving}
              error={expenseError}
              canEdit={canSaveDraft}
              onSave={handleSaveExpenseRows}
            />
          ) : null}

          {activeTab === "inventory" ? (
            <ReportInventoryEntriesPanel
              rows={inventoryRows}
              products={productOptions}
              loading={inventoryLoading}
              saving={inventorySaving || saving}
              error={inventoryError}
              canEdit={canSaveDraft}
              onSave={handleSaveInventoryRows}
            />
          ) : null}

          {activeTab === "returns-damage" ? (
            <ReportReturnDamageEntriesPanel
              rows={returnDamageRows}
              products={productOptions}
              loading={returnDamageLoading}
              saving={returnDamageSaving || saving}
              error={returnDamageError}
              canEdit={canSaveDraft}
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
              canEdit={canSaveDraft}
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
              canEdit={canSaveDraft}
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
    </main>
  );
}






















