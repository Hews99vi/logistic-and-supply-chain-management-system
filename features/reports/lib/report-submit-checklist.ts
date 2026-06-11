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
  loadingCompletedAt: string | null;
  totalBillCount: number;
  deliveredBillCount: number;
  cancelledBillCount: number;
  cashDifference: number;
  totalCash: number;
  cashInHand: number;
  cashPhysicalTotal: number;
  invoiceEntriesCount: number;
  inventoryEntriesCount: number;
  invalidInventoryCount: number;
  positiveVarianceCount: number;
  unresolvedMissingStockCount: number;
  denominationRowCount: number;
  denominationPositiveNoteCount: number;
};

export function buildReportSubmitChecklist(input: ReportSubmitChecklistInput): ReportSubmitValidationCheck[] {
  const hasInvoiceEntries = input.invoiceEntriesCount > 0;
  const loadingFinalized = Boolean(input.loadingCompletedAt);
  const hasInventoryEntries = input.inventoryEntriesCount > 0;
  const inventoryQuantitiesValid = input.invalidInventoryCount === 0;
  const moreStockResolved = input.positiveVarianceCount === 0;
  const missingStockResolved = input.unresolvedMissingStockCount === 0;
  const hasRouteAndStaff = input.routeNameSnapshot.trim().length > 0 && input.staffName.trim().length > 0;
  const hasStandardDenominations = input.denominationRowCount === 10;
  const cashBalanced = Math.abs(input.cashDifference) < 0.0001;
  const billCountsComplete = input.totalBillCount > 0;
  const billCountConsistency = input.deliveredBillCount + input.cancelledBillCount <= input.totalBillCount;
  const requiresCashCheck = input.totalCash > 0 || input.cashInHand > 0 || input.cashPhysicalTotal > 0;
  const hasMeaningfulDenominationData = !requiresCashCheck || input.denominationPositiveNoteCount > 0;

  return [
    {
      key: "loading-finalized",
      label: "Morning loading finalized",
      passed: loadingFinalized,
      message: loadingFinalized ? "The lorry loading has been finalized." : "Finalize the morning loading summary before DATE submit.",
      blocking: true
    },
    {
      key: "inventory-lines",
      label: "Route product movement captured",
      passed: hasInventoryEntries,
      message: hasInventoryEntries ? "Product movement rows are available." : "Add at least one route product movement row.",
      blocking: true
    },
    {
      key: "inventory-quantities",
      label: "Stock movement quantities are valid",
      passed: inventoryQuantitiesValid,
      message: inventoryQuantitiesValid
        ? "Sales and lorry counts are valid selling-unit quantities."
        : "Fix invalid stock rows before submit.",
      blocking: true
    },
    {
      key: "more-stock",
      label: "More-stock variances corrected",
      passed: moreStockResolved,
      message: moreStockResolved
        ? "No unexplained more-stock variance remains."
        : "Correct positive more-stock variance before submit.",
      blocking: true
    },
    {
      key: "missing-stock",
      label: "Missing stock deductions resolved",
      passed: missingStockResolved,
      message: missingStockResolved
        ? "Missing stock has no pending deduction decisions."
        : "Approve or waive missing-stock driver deductions before submit.",
      blocking: true
    },
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
    loadingCompletedAt: report.report.loadingCompletedAt,
    totalBillCount: report.report.totalBillCount,
    deliveredBillCount: report.report.deliveredBillCount,
    cancelledBillCount: report.report.cancelledBillCount,
    cashDifference: report.report.cashDifference,
    totalCash: report.report.totalCash,
    cashInHand: report.report.cashInHand,
    cashPhysicalTotal: report.report.cashPhysicalTotal,
    invoiceEntriesCount: report.invoiceEntries.length,
    inventoryEntriesCount: report.inventoryEntries.length,
    invalidInventoryCount: report.inventoryEntries.filter((row) => row.salesQty > row.loadingQty || row.lorryQty < 0).length,
    positiveVarianceCount: report.inventoryEntries.filter((row) => row.varianceQty > 0).length,
    unresolvedMissingStockCount: report.driverDeductions.filter((row) => row.status === "pending").length,
    denominationRowCount: report.cashDenominations.length,
    denominationPositiveNoteCount: report.cashDenominations.reduce(
      (count, row) => count + (row.noteCount > 0 ? 1 : 0),
      0
    )
  });
}
