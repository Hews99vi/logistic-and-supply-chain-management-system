"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  CreditInvoiceDto,
  DailyReportBaseDto,
  DailyReportExpenseEntryDto,
  ReportBillDto,
  ReportCashAdjustmentDto,
  ReportChequeDto
} from "@/types/domain/report";
import type { ReportBillSaveItemInput, ReportCashAdjustmentSaveItemInput, ReportChequeSaveItemInput } from "@/features/reports/types";

const moneyFormat = new Intl.NumberFormat("en-LK", {
  style: "currency",
  currency: "LKR",
  maximumFractionDigits: 2
});

function money(value: number) {
  return moneyFormat.format(value);
}

type FinancePanelProps = {
  report: DailyReportBaseDto;
  expenses: DailyReportExpenseEntryDto[];
  cheques: ReportChequeDto[];
  bills: ReportBillDto[];
  creditInvoices: CreditInvoiceDto[];
  cashAdjustments: ReportCashAdjustmentDto[];
  saving: boolean;
  error: string | null;
  canEdit: boolean;
  canApprove: boolean;
  onSaveCheques: (items: ReportChequeSaveItemInput[]) => Promise<void>;
  onSaveBills: (items: ReportBillSaveItemInput[]) => Promise<void>;
  onSaveCashAdjustments: (items: ReportCashAdjustmentSaveItemInput[]) => Promise<void>;
  onApproveBillException: (billId: string) => Promise<void>;
  onResolveCashAdjustment: (adjustmentId: string, status: "approved" | "rejected" | "void") => Promise<void>;
  onPostCreditCollection: (creditInvoiceId: string, amount: number) => Promise<void>;
  onApproveExpense: (expenseId: string, status: "approved" | "rejected" | "void") => Promise<void>;
};

export function ReportFinanceHandoverPanel({
  report,
  expenses,
  cheques,
  bills,
  creditInvoices,
  cashAdjustments,
  saving,
  error,
  canEdit,
  canApprove,
  onSaveCheques,
  onSaveBills,
  onSaveCashAdjustments,
  onApproveBillException,
  onResolveCashAdjustment,
  onPostCreditCollection,
  onApproveExpense
}: FinancePanelProps) {
  const [chequeRows, setChequeRows] = useState<ReportChequeSaveItemInput[]>(() => cheques.map((row) => ({
    id: row.id,
    invoiceEntryId: row.invoiceEntryId,
    invoiceNo: row.invoiceNo,
    customerName: row.customerName,
    chequeNo: row.chequeNo,
    bankName: row.bankName,
    branchName: row.branchName,
    chequeDate: row.chequeDate,
    receivedDate: row.receivedDate,
    amount: row.amount,
    status: row.status,
    notes: row.notes
  })));
  const [billRows, setBillRows] = useState<ReportBillSaveItemInput[]>(() => bills.map((row) => ({
    id: row.id,
    invoiceEntryId: row.invoiceEntryId,
    invoiceNo: row.invoiceNo,
    customerName: row.customerName,
    amountSnapshot: row.amountSnapshot,
    status: row.status,
    notes: row.notes
  })));
  const [adjustmentRows, setAdjustmentRows] = useState<ReportCashAdjustmentSaveItemInput[]>(() => cashAdjustments.map((row) => ({
    id: row.id,
    adjustmentType: row.adjustmentType,
    amount: row.amount,
    reason: row.reason
  })));
  const [collectionAmounts, setCollectionAmounts] = useState<Record<string, number>>({});

  useEffect(() => {
    setChequeRows(cheques.map((row) => ({
      id: row.id,
      invoiceEntryId: row.invoiceEntryId,
      invoiceNo: row.invoiceNo,
      customerName: row.customerName,
      chequeNo: row.chequeNo,
      bankName: row.bankName,
      branchName: row.branchName,
      chequeDate: row.chequeDate,
      receivedDate: row.receivedDate,
      amount: row.amount,
      status: row.status,
      notes: row.notes
    })));
  }, [cheques]);

  useEffect(() => {
    setBillRows(bills.map((row) => ({
      id: row.id,
      invoiceEntryId: row.invoiceEntryId,
      invoiceNo: row.invoiceNo,
      customerName: row.customerName,
      amountSnapshot: row.amountSnapshot,
      status: row.status,
      notes: row.notes
    })));
  }, [bills]);

  useEffect(() => {
    setAdjustmentRows(cashAdjustments.map((row) => ({
      id: row.id,
      adjustmentType: row.adjustmentType,
      amount: row.amount,
      reason: row.reason
    })));
  }, [cashAdjustments]);

  const totals = useMemo(() => {
    const chequeTotal = chequeRows.filter((row) => row.status !== "cancelled").reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const creditTotal = creditInvoices.filter((row) => row.status !== "written_off").reduce((sum, row) => sum + row.amount, 0);
    const approvedExpenseTotal = expenses.filter((row) => row.status === "approved").reduce((sum, row) => sum + row.amount, 0);
    const pendingExpenseCount = expenses.filter((row) => row.status === "draft" || row.status === "submitted").length;
    const billExceptions = billRows.filter((row) => row.status === "missing" || row.status === "disputed").length;

    return { chequeTotal, creditTotal, approvedExpenseTotal, pendingExpenseCount, billExceptions };
  }, [billRows, chequeRows, creditInvoices, expenses]);

  const updateCheque = (index: number, patch: Partial<ReportChequeSaveItemInput>) => {
    setChequeRows((previous) => previous.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  };

  const updateBill = (index: number, patch: Partial<ReportBillSaveItemInput>) => {
    setBillRows((previous) => previous.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  };

  const updateAdjustment = (index: number, patch: Partial<ReportCashAdjustmentSaveItemInput>) => {
    setAdjustmentRows((previous) => previous.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  };

  const adjustmentStatusById = useMemo(() => {
    const statusMap = new Map<string, ReportCashAdjustmentDto["status"]>();
    cashAdjustments.forEach((row) => statusMap.set(row.id, row.status));
    return statusMap;
  }, [cashAdjustments]);

  const billApprovalById = useMemo(() => {
    const approvalMap = new Map<string, boolean>();
    bills.forEach((row) => approvalMap.set(row.id, Boolean(row.exceptionApprovedAt)));
    return approvalMap;
  }, [bills]);

  return (
    <section className="space-y-5">
      {error ? <Alert variant="destructive">{error}</Alert> : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Expected Cash</p>
            <p className="mt-2 text-xl font-bold">{money(report.totalCash)}</p>
            <p className="mt-1 text-xs text-slate-500">Physical + bank + approved adjustments must match.</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Cheque Register</p>
            <p className="mt-2 text-xl font-bold">{money(totals.chequeTotal)}</p>
            <p className={totals.chequeTotal === report.totalCheques ? "mt-1 text-xs text-emerald-700" : "mt-1 text-xs text-amber-700"}>
              Expected {money(report.totalCheques)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Credit Ledger</p>
            <p className="mt-2 text-xl font-bold">{money(totals.creditTotal)}</p>
            <p className={totals.creditTotal === report.totalCredit ? "mt-1 text-xs text-emerald-700" : "mt-1 text-xs text-amber-700"}>
              Expected {money(report.totalCredit)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Approved Expenses</p>
            <p className="mt-2 text-xl font-bold">{money(totals.approvedExpenseTotal)}</p>
            <p className={totals.pendingExpenseCount === 0 ? "mt-1 text-xs text-emerald-700" : "mt-1 text-xs text-amber-700"}>
              {totals.pendingExpenseCount} pending
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle>Cheque Register</CardTitle>
              <CardDescription>Cheque detail total must match the invoice cheque total before submit.</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" disabled={!canEdit || saving} onClick={() => setChequeRows((rows) => [...rows, { chequeNo: "", bankName: "", amount: 0, status: "received" }])}>
                <Plus className="h-4 w-4" /> Add
              </Button>
              <Button disabled={!canEdit || saving} onClick={() => onSaveCheques(chequeRows)}>
                <Save className="h-4 w-4" /> Save
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-[0.14em] text-slate-500">
              <tr><th className="px-3 py-2 text-left">Invoice</th><th className="px-3 py-2 text-left">Cheque No</th><th className="px-3 py-2 text-left">Bank</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2">Status</th><th className="px-3 py-2" /></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {chequeRows.map((row, index) => (
                <tr key={row.id ?? index}>
                  <td className="px-3 py-2"><input className="h-9 w-32 rounded-md border px-2" value={row.invoiceNo ?? ""} disabled={!canEdit || saving} onChange={(event) => updateCheque(index, { invoiceNo: event.target.value })} /></td>
                  <td className="px-3 py-2"><input className="h-9 w-36 rounded-md border px-2" value={row.chequeNo} disabled={!canEdit || saving} onChange={(event) => updateCheque(index, { chequeNo: event.target.value })} /></td>
                  <td className="px-3 py-2"><input className="h-9 w-44 rounded-md border px-2" value={row.bankName} disabled={!canEdit || saving} onChange={(event) => updateCheque(index, { bankName: event.target.value })} /></td>
                  <td className="px-3 py-2"><input type="number" className="h-9 w-28 rounded-md border px-2 text-right" value={row.amount} disabled={!canEdit || saving} onChange={(event) => updateCheque(index, { amount: Number(event.target.value) })} /></td>
                  <td className="px-3 py-2">
                    <select className="h-9 rounded-md border px-2" value={row.status ?? "received"} disabled={!canEdit || saving} onChange={(event) => updateCheque(index, { status: event.target.value as ReportChequeSaveItemInput["status"] })}>
                      {["received", "deposited", "realized", "bounced", "returned", "cancelled"].map((status) => <option key={status} value={status}>{status}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-right"><Button variant="outline" size="sm" disabled={!canEdit || saving} onClick={() => setChequeRows((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}><Trash2 className="h-4 w-4" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle>Bill Ledger</CardTitle>
              <CardDescription>Missing and disputed bills must be approved before submit.</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" disabled={!canEdit || saving} onClick={() => setBillRows((rows) => [...rows, { invoiceNo: "", amountSnapshot: 0, status: "delivered", notes: "" }])}>
                <Plus className="h-4 w-4" /> Add Bill
              </Button>
              <Button disabled={!canEdit || saving} onClick={() => onSaveBills(billRows)}>
                <Save className="h-4 w-4" /> Save Bills
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-[0.14em] text-slate-500">
              <tr><th className="px-3 py-2 text-left">Invoice</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-left">Notes</th><th className="px-3 py-2 text-right">Action</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {billRows.map((row, index) => (
                <tr key={row.id ?? index}>
                  <td className="px-3 py-2"><input className="h-9 w-36 rounded-md border px-2 font-semibold" value={row.invoiceNo} disabled={!canEdit || saving} onChange={(event) => updateBill(index, { invoiceNo: event.target.value })} /></td>
                  <td className="px-3 py-2"><input type="number" className="h-9 w-28 rounded-md border px-2 text-right" value={row.amountSnapshot} disabled={!canEdit || saving} onChange={(event) => updateBill(index, { amountSnapshot: Number(event.target.value) })} /></td>
                  <td className="px-3 py-2">
                    <select className="h-9 rounded-md border px-2" value={row.status} disabled={!canEdit || saving} onChange={(event) => updateBill(index, { status: event.target.value as ReportBillSaveItemInput["status"] })}>
                      {["delivered", "cancelled", "returned", "missing", "disputed"].map((status) => <option key={status} value={status}>{status}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2"><input className="h-9 w-64 rounded-md border px-2" value={row.notes ?? ""} disabled={!canEdit || saving} onChange={(event) => updateBill(index, { notes: event.target.value })} /></td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-2">
                      {row.id && (row.status === "missing" || row.status === "disputed") ? (
                        billApprovalById.get(row.id) ? (
                          <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">Approved</span>
                        ) : (
                          <Button size="sm" variant="outline" disabled={!canApprove || saving} onClick={() => onApproveBillException(row.id!)}>
                            Approve
                          </Button>
                        )
                      ) : null}
                      <Button variant="outline" size="sm" disabled={!canEdit || saving} onClick={() => setBillRows((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {totals.billExceptions > 0 ? <p className="mt-3 text-sm text-amber-700">{totals.billExceptions} bill exception(s) need approval before submit.</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle>Cash Adjustments</CardTitle>
              <CardDescription>Use only for approved shortage/excess explanations.</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" disabled={!canEdit || saving} onClick={() => setAdjustmentRows((rows) => [...rows, { adjustmentType: "shortage", amount: 0, reason: "" }])}><Plus className="h-4 w-4" /> Add</Button>
              <Button disabled={!canEdit || saving} onClick={() => onSaveCashAdjustments(adjustmentRows)}><Save className="h-4 w-4" /> Save</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {adjustmentRows.map((row, index) => (
            <div key={row.id ?? index} className="grid gap-2 md:grid-cols-[140px_140px_1fr_120px_auto]">
              <select className="h-10 rounded-md border px-2" value={row.adjustmentType} disabled={!canEdit || saving} onChange={(event) => updateAdjustment(index, { adjustmentType: event.target.value as "shortage" | "excess" })}><option value="shortage">shortage</option><option value="excess">excess</option></select>
              <input type="number" className="h-10 rounded-md border px-2 text-right" value={row.amount} disabled={!canEdit || saving} onChange={(event) => updateAdjustment(index, { amount: Number(event.target.value) })} />
              <input className="h-10 rounded-md border px-2" value={row.reason} placeholder="Reason" disabled={!canEdit || saving} onChange={(event) => updateAdjustment(index, { reason: event.target.value })} />
              <span className="rounded-md bg-slate-100 px-3 py-2 text-sm capitalize">{row.id ? adjustmentStatusById.get(row.id) ?? "pending" : "pending"}</span>
              <div className="flex gap-2">
                {row.id && adjustmentStatusById.get(row.id) === "pending" ? (
                  <>
                    <Button size="sm" variant="outline" disabled={!canApprove || saving} onClick={() => onResolveCashAdjustment(row.id!, "approved")}>Approve</Button>
                    <Button size="sm" variant="outline" disabled={!canApprove || saving} onClick={() => onResolveCashAdjustment(row.id!, "rejected")}>Reject</Button>
                  </>
                ) : null}
                <Button variant="outline" disabled={!canEdit || saving} onClick={() => setAdjustmentRows((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Credit Sales Ledger</CardTitle>
          <CardDescription>Generated from credit invoice rows. Collections are handled from the credit ledger.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-[0.14em] text-slate-500"><tr><th className="px-3 py-2 text-left">Invoice</th><th className="px-3 py-2 text-left">Customer</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2 text-right">Outstanding</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Collection</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {creditInvoices.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2">{row.invoiceNo}</td>
                  <td className="px-3 py-2">{row.customerName}</td>
                  <td className="px-3 py-2 text-right">{money(row.amount)}</td>
                  <td className="px-3 py-2 text-right">{money(row.outstandingAmount)}</td>
                  <td className="px-3 py-2 capitalize">{row.status}</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-2">
                      <input
                        type="number"
                        className="h-9 w-28 rounded-md border px-2 text-right"
                        value={collectionAmounts[row.id] ?? ""}
                        min={0}
                        max={row.outstandingAmount}
                        placeholder="Amount"
                        disabled={!canEdit || saving || row.outstandingAmount <= 0}
                        onChange={(event) => setCollectionAmounts((current) => ({ ...current, [row.id]: Number(event.target.value) }))}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!canEdit || saving || !collectionAmounts[row.id] || collectionAmounts[row.id] <= 0}
                        onClick={() => onPostCreditCollection(row.id, collectionAmounts[row.id] ?? 0)}
                      >
                        Collect
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Expense Approval</CardTitle>
          <CardDescription>Only approved expenses reduce net profit.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {expenses.map((expense) => (
            <div key={expense.id} className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-semibold">{expense.customExpenseName ?? "Categorized expense"} - {money(expense.amount)}</p>
                <p className="text-xs capitalize text-slate-500">{expense.status} / {expense.paymentMethod}</p>
              </div>
              {expense.status === "draft" || expense.status === "submitted" ? (
                <div className="flex gap-2">
                  <Button size="sm" disabled={!canApprove || saving} onClick={() => onApproveExpense(expense.id, "approved")}>Approve</Button>
                  <Button size="sm" variant="outline" disabled={!canApprove || saving} onClick={() => onApproveExpense(expense.id, "rejected")}>Reject</Button>
                </div>
              ) : <span className="text-sm capitalize text-slate-500">{expense.status}</span>}
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
