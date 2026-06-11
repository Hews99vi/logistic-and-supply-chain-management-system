"use client";

import { useState } from "react";
import { Check, ShieldCheck, X } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { resolveDriverDeduction } from "@/features/reports/api/daily-reports-api";
import type { DriverDeductionDto } from "@/types/domain/report";

const moneyFormat = new Intl.NumberFormat("en-LK", {
  style: "currency",
  currency: "LKR",
  maximumFractionDigits: 2
});

type ReportDriverDeductionsPanelProps = {
  reportId: string;
  deductions: DriverDeductionDto[];
  canResolve: boolean;
  onResolved: () => Promise<void>;
};

export function ReportDriverDeductionsPanel({
  reportId,
  deductions,
  canResolve,
  onResolved
}: ReportDriverDeductionsPanelProps) {
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleResolve = async (deduction: DriverDeductionDto, status: "approved" | "waived") => {
    setSavingId(deduction.id);
    setError(null);

    try {
      await resolveDriverDeduction(reportId, deduction.id, {
        status,
        reason: status === "approved"
          ? "Approved salary deduction for missing lorry stock"
          : "Waived missing lorry stock deduction after supervisor review"
      });
      await onResolved();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to resolve driver deduction.");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Variance & Driver Deductions</CardTitle>
        <CardDescription>Missing lorry stock creates salary deduction candidates using the selling price snapshot.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? <Alert variant="destructive">{error}</Alert> : null}

        {deductions.length === 0 ? (
          <Alert>No missing-stock deduction candidates are recorded for this route-day handover.</Alert>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.14em] text-slate-500">
                <tr>
                  <th className="px-3 py-3">Product</th>
                  <th className="px-3 py-3 text-right">Missing Qty</th>
                  <th className="px-3 py-3 text-right">Rate</th>
                  <th className="px-3 py-3 text-right">Deduction</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {deductions.map((deduction) => (
                  <tr key={deduction.id}>
                    <td className="px-3 py-3">
                      <p className="font-medium text-slate-900">{deduction.productNameSnapshot}</p>
                      <p className="text-xs text-slate-500">Code {deduction.productCodeSnapshot}</p>
                    </td>
                    <td className="px-3 py-3 text-right">{deduction.missingQty} units</td>
                    <td className="px-3 py-3 text-right">{moneyFormat.format(deduction.unitPriceSnapshot)}</td>
                    <td className="px-3 py-3 text-right font-semibold">{moneyFormat.format(deduction.deductionAmount)}</td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold capitalize text-slate-700">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        {deduction.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      {deduction.status === "pending" ? (
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleResolve(deduction, "approved")}
                            disabled={!canResolve || savingId === deduction.id}
                          >
                            <Check className="h-4 w-4" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleResolve(deduction, "waived")}
                            disabled={!canResolve || savingId === deduction.id}
                          >
                            <X className="h-4 w-4" />
                            Waive
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500">Resolved</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
