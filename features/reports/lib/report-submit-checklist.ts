import type { ReportDetailEnvelope } from "@/features/reports/types";

export type ReportSubmitValidationCheck = {
  key: string;
  label: string;
  passed: boolean;
  message: string;
  blocking: boolean;
};

type ReportSubmitChecklistInput = {
  routeNameSnapshot: string;
  staffName: string;
  totalBillCount: number;
  deliveredBillCount: number;
  cancelledBillCount: number;
  cashDifference: number;
  totalCash: number;
  cashInHand: number;
  cashPhysicalTotal: number;
  invoiceEntriesCount: number;
  denominationRowCount: number;
  denominationPositiveNoteCount: number;
};

export function buildReportSubmitChecklist(input: ReportSubmitChecklistInput): ReportSubmitValidationCheck[] {
  const hasInvoiceEntries = input.invoiceEntriesCount > 0;
  const hasRouteAndStaff = input.routeNameSnapshot.trim().length > 0 && input.staffName.trim().length > 0;
  const hasStandardDenominations = input.denominationRowCount === 10;
  const cashBalanced = Math.abs(input.cashDifference) < 0.0001;
  const billCountsComplete = input.totalBillCount > 0;
  const billCountConsistency = input.deliveredBillCount + input.cancelledBillCount <= input.totalBillCount;
  const requiresCashCheck = input.totalCash > 0 || input.cashInHand > 0 || input.cashPhysicalTotal > 0;
  const hasMeaningfulDenominationData = !requiresCashCheck || input.denominationPositiveNoteCount > 0;

  return [
    {
      key: "invoice",
      label: "Invoice entries captured",
      passed: hasInvoiceEntries,
      message: hasInvoiceEntries ? "Invoice rows available." : "No invoice entries found.",
      blocking: true
    },
    {
      key: "denomination-rows",
      label: "Denomination sheet completed",
      passed: hasStandardDenominations,
      message: hasStandardDenominations ? "All standard denominations present." : "Missing denomination rows.",
      blocking: true
    },
    {
      key: "denomination-data",
      label: "Denomination counts recorded",
      passed: hasMeaningfulDenominationData,
      message: hasMeaningfulDenominationData
        ? requiresCashCheck
          ? "Cash-check note counts are recorded."
          : "No cash-check note counts required for this closing sheet."
        : "Record at least one positive denomination note count before submit.",
      blocking: true
    },
    {
      key: "cash",
      label: "Cash reconciliation is balanced",
      passed: cashBalanced,
      message: cashBalanced ? "Ledger and physical cash are aligned." : `Cash difference ${input.cashDifference.toFixed(2)} requires review.`,
      blocking: true
    },
    {
      key: "bill",
      label: "Bill counts are complete and consistent",
      passed: billCountsComplete && billCountConsistency,
      message: !billCountsComplete
        ? "Total bill count must be greater than zero."
        : billCountConsistency
          ? "Delivered + cancelled counts are valid."
          : "Bill counts exceed total.",
      blocking: true
    },
    {
      key: "meta",
      label: "Core metadata is complete",
      passed: hasRouteAndStaff,
      message: hasRouteAndStaff ? "Route and prepared-by values available." : "Missing route or prepared-by value.",
      blocking: false
    }
  ];
}

export function buildReportSubmitChecklistFromEnvelope(report: ReportDetailEnvelope): ReportSubmitValidationCheck[] {
  return buildReportSubmitChecklist({
    routeNameSnapshot: report.report.routeNameSnapshot,
    staffName: report.report.staffName,
    totalBillCount: report.report.totalBillCount,
    deliveredBillCount: report.report.deliveredBillCount,
    cancelledBillCount: report.report.cancelledBillCount,
    cashDifference: report.report.cashDifference,
    totalCash: report.report.totalCash,
    cashInHand: report.report.cashInHand,
    cashPhysicalTotal: report.report.cashPhysicalTotal,
    invoiceEntriesCount: report.invoiceEntries.length,
    denominationRowCount: report.cashDenominations.length,
    denominationPositiveNoteCount: report.cashDenominations.reduce(
      (count, row) => count + (row.noteCount > 0 ? 1 : 0),
      0
    )
  });
}
