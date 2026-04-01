"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ShieldCheck } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { DailyReportCashDenominationDto } from "@/types/domain/report";

function formatCurrencyLkr(amount: number) {
  return new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency: "LKR",
    maximumFractionDigits: 2
  }).format(amount);
}

type EditableRow = {
  denominationValue: number;
  noteCount: number;
  lineTotal: number;
};

type CashAuditPanelProps = {
  reportId: string;
  loading: boolean;
  saving: boolean;
  error?: string | null;
  rows: DailyReportCashDenominationDto[];
  cashInHand: number;
  cashInBank: number;
  cashBookTotal: number;
  cashPhysicalTotal: number;
  cashDifference: number;
  canEdit: boolean;
  canFinalize: boolean;
  showFinalizeAction?: boolean;
  onSave: (items: Array<{ denominationValue: number; noteCount: number }>) => Promise<void>;
  onFinalize: () => Promise<void>;
  onPreviewPhysicalTotalChange?: (value: number) => void;
};

export function ReportCashAuditPanel({
  reportId,
  loading,
  saving,
  error,
  rows,
  cashInHand,
  cashInBank,
  cashBookTotal,
  cashPhysicalTotal,
  cashDifference,
  canEdit,
  canFinalize,
  showFinalizeAction = true,
  onSave,
  onFinalize,
  onPreviewPhysicalTotalChange
}: CashAuditPanelProps) {
  const [draftRows, setDraftRows] = useState<EditableRow[]>([]);

  useEffect(() => {
    setDraftRows(
      [...rows]
        .sort((left, right) => right.denominationValue - left.denominationValue)
        .map((item) => ({
          denominationValue: item.denominationValue,
          noteCount: item.noteCount,
          lineTotal: item.lineTotal
        }))
    );
  }, [rows]);

  const previewPhysicalTotal = useMemo(() => {
    return draftRows.reduce((acc, row) => acc + row.denominationValue * row.noteCount, 0);
  }, [draftRows]);

  useEffect(() => {
    onPreviewPhysicalTotalChange?.(previewPhysicalTotal);
  }, [onPreviewPhysicalTotalChange, previewPhysicalTotal]);

  const effectiveCashDifference = previewPhysicalTotal - cashBookTotal;
  const isBalanced = Math.abs(effectiveCashDifference) < 0.0001;

  const handleCountChange = (denominationValue: number, value: string) => {
    const parsed = Number(value);
    const nextCount = Number.isNaN(parsed) || parsed < 0 ? 0 : Math.floor(parsed);

    setDraftRows((previous) => previous.map((row) => {
      if (row.denominationValue !== denominationValue) return row;

      return {
        ...row,
        noteCount: nextCount,
        lineTotal: row.denominationValue * nextCount
      };
    }));
  };

  const handleSave = async () => {
    await onSave(
      draftRows.map((row) => ({
        denominationValue: row.denominationValue,
        noteCount: row.noteCount
      }))
    );
  };

  return (
    <section className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Operations / Report {reportId}</p>
          <CardTitle className="mt-2 text-3xl">Denomination Audit</CardTitle>
          <CardDescription>Capture note counts and reconcile physical cash with ledger balances.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 print:hidden">
          <Button variant="outline" onClick={handleSave} disabled={saving || !canEdit || loading}>Save Draft</Button>
          {showFinalizeAction ? (
            <Button onClick={onFinalize} disabled={saving || !canFinalize || loading}>Confirm and Finalize</Button>
          ) : null}
        </CardContent>
      </Card>

      {error ? <Alert variant="destructive">{error}</Alert> : null}

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Denomination Table</CardTitle>
            <CardDescription>Counts can be edited only while report workflow allows draft updates.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 10 }).map((_, index) => <Skeleton key={index} className="h-10" />)}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.14em] text-slate-500">
                    <tr>
                      <th className="px-5 py-3">Denomination</th>
                      <th className="px-5 py-3 text-right">Count</th>
                      <th className="px-5 py-3 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {draftRows.map((row) => (
                      <tr key={row.denominationValue}>
                        <td className="px-5 py-3 font-semibold text-slate-900">{formatCurrencyLkr(row.denominationValue)}</td>
                        <td className="px-5 py-3 text-right">
                          <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            step={1}
                            value={row.noteCount}
                            disabled={!canEdit || saving}
                            onChange={(event) => handleCountChange(row.denominationValue, event.target.value)}
                            className="h-9 w-24 rounded-md border border-slate-200 px-2 text-right font-semibold outline-none ring-offset-2 transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200 disabled:bg-slate-100"
                          />
                        </td>
                        <td className="px-5 py-3 text-right font-semibold text-slate-800">{formatCurrencyLkr(row.lineTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Cash Reconciliation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center justify-between"><span className="text-slate-600">Cash in Hand</span><span className="font-semibold">{formatCurrencyLkr(cashInHand)}</span></div>
              <div className="flex items-center justify-between"><span className="text-slate-600">Cash in Bank</span><span className="font-semibold">{formatCurrencyLkr(cashInBank)}</span></div>
              <div className="flex items-center justify-between border-t border-slate-100 pt-2"><span className="text-slate-600">Total Ledger Balance</span><span className="font-semibold">{formatCurrencyLkr(cashBookTotal)}</span></div>
              <div className="flex items-center justify-between"><span className="text-slate-600">Total Physical Cash</span><span className="font-semibold">{formatCurrencyLkr(cashPhysicalTotal)}</span></div>
              <div className="flex items-center justify-between"><span className="text-slate-600">Preview Physical (unsaved)</span><span className="font-semibold">{formatCurrencyLkr(previewPhysicalTotal)}</span></div>

              <div className={`mt-2 rounded-md px-3 py-2 ${isBalanced ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                <div className="flex items-center gap-2 font-semibold">
                  {isBalanced ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                  {isBalanced ? "Balanced" : "Mismatch"}
                </div>
                <p className="mt-1 text-xs">Difference: {formatCurrencyLkr(effectiveCashDifference)}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Verification</CardTitle>
              <CardDescription>Audit completion guidance</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-slate-600">
              <div className="flex items-start gap-2 rounded-md border border-slate-100 bg-slate-50 p-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 text-blue-700" />
                <p>
                  Ensure denominations are counted and saved before finalizing. Backend reconciliation is authoritative and will update cash physical totals and difference after save.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
