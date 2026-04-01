"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Printer } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  fetchLoadingSummaryDetail,
  fetchLoadingSummaryItems,
  fetchProductOptions
} from "@/features/loading-summaries/api/loading-summaries-api";
import type { LoadingSummaryItem, LoadingSummaryListItem, ProductOption } from "@/features/loading-summaries/types";
import { buildPackInfoLabel, buildQuantityModeLabel, buildUnitEquivalentLabel } from "@/lib/products/pack-helpers";

const moneyFormat = new Intl.NumberFormat("en-LK", {
  style: "currency",
  currency: "LKR",
  maximumFractionDigits: 2
});

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-LK", {
    year: "numeric",
    month: "short",
    day: "2-digit"
  }).format(new Date(value));
}

function formatDateTime(value: string | null) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("en-LK", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function resolveLoadingStatus(summary: LoadingSummaryListItem) {
  return summary.loadingCompletedAt ? "Evening Reconciliation / History" : "Morning Loading Draft";
}

function resolveProduct(item: LoadingSummaryItem, products: ProductOption[]) {
  const selected = products.find((product) => product.id === item.productId) ?? null;

  if (!selected) {
    return {
      code: item.productCodeSnapshot,
      name: item.productDisplayNameSnapshot ?? item.productNameSnapshot,
      unitPrice: item.unitPriceSnapshot,
      unitSize: item.unitSizeSnapshot,
      unitMeasure: item.unitMeasureSnapshot,
      packSize: item.packSizeSnapshot,
      sellingUnit: item.sellingUnitSnapshot,
      quantityEntryMode: item.quantityEntryModeSnapshot
    };
  }

  return {
    code: selected.productCode,
    name: selected.productName,
    unitPrice: selected.unitPrice,
    unitSize: selected.unitSize,
    unitMeasure: selected.unitMeasure,
    packSize: selected.packSize,
    sellingUnit: selected.sellingUnit,
    quantityEntryMode: selected.quantityEntryMode
  };
}

export function LoadingSummaryPrintView({ summaryId }: { summaryId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<LoadingSummaryListItem | null>(null);
  const [items, setItems] = useState<LoadingSummaryItem[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const [detail, lineItems, productOptions] = await Promise.all([
          fetchLoadingSummaryDetail(summaryId),
          fetchLoadingSummaryItems(summaryId),
          fetchProductOptions()
        ]);

        if (!mounted) return;

        setSummary(detail);
        setItems(lineItems);
        setProducts(productOptions);
      } catch (requestError) {
        if (!mounted) return;
        setError(requestError instanceof Error ? requestError.message : "Failed to load loading summary for print.");
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      mounted = false;
    };
  }, [summaryId]);

  const totals = useMemo(() => {
    return items.reduce(
      (summary, item) => {
        summary.totalLines += 1;
        summary.totalLoadingQty += item.loadingQty;
        summary.totalSalesQty += item.salesQty;
        summary.totalBalanceQty += item.balanceQty;
        summary.totalLorryQty += item.lorryQty;
        summary.totalVarianceQty += item.varianceQty;
        summary.totalValue += item.loadingQty * item.unitPriceSnapshot;
        return summary;
      },
      {
        totalLines: 0,
        totalLoadingQty: 0,
        totalSalesQty: 0,
        totalBalanceQty: 0,
        totalLorryQty: 0,
        totalVarianceQty: 0,
        totalValue: 0
      }
    );
  }, [items]);

  return (
    <div className="min-h-screen bg-slate-100 p-4 print:bg-white print:p-0">
      <style jsx global>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 10mm;
          }

          body {
            background: #fff !important;
          }
        }
      `}</style>

      <div className="mx-auto max-w-7xl rounded-xl border border-slate-200 bg-white shadow-sm print:max-w-none print:rounded-none print:border-0 print:shadow-none">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 p-4 print:hidden">
          <div>
            <h1 className="text-lg font-bold text-slate-900">Loading Summary Print View</h1>
            <p className="text-sm text-slate-500">Use this route sheet for both morning dispatch and evening return history.</p>
          </div>

          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/loading-summaries/${summaryId}`}>
                <ArrowLeft className="h-4 w-4" />
                Back
              </Link>
            </Button>
            <Button size="sm" onClick={() => window.print()}>
              <Printer className="h-4 w-4" />
              Print
            </Button>
          </div>
        </div>

        {loading ? <div className="p-8 text-sm text-slate-600">Loading print layout...</div> : null}

        {!loading && error ? (
          <div className="p-6">
            <Alert variant="destructive">{error}</Alert>
          </div>
        ) : null}

        {!loading && !error && summary ? (
          <div className="space-y-6 p-6 print:p-0">
            <header className="border-b border-slate-200 pb-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Operations / Route Product Movement</p>
                  <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900">Daily Loading & Return Reconciliation Sheet</h2>
                  <p className="mt-1 text-sm text-slate-600">Summary ID: {summary.id}</p>
                  <p className="mt-2 text-xs text-slate-500">Quantities follow each product's configured quantity entry mode. The same route sheet is used in the morning and revisited for evening reconciliation.</p>
                </div>

                <div className="text-right">
                  <p className="text-xs uppercase tracking-wider text-slate-500">Sheet Status</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{resolveLoadingStatus(summary)}</p>
                </div>
              </div>
            </header>

            <section className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-md border border-slate-200 p-3">
                <p className="text-xs uppercase tracking-wider text-slate-500">Date</p>
                <p className="mt-1 font-semibold text-slate-900">{formatDate(summary.reportDate)}</p>
              </div>
              <div className="rounded-md border border-slate-200 p-3">
                <p className="text-xs uppercase tracking-wider text-slate-500">Route</p>
                <p className="mt-1 font-semibold text-slate-900">{summary.routeNameSnapshot}</p>
              </div>
              <div className="rounded-md border border-slate-200 p-3">
                <p className="text-xs uppercase tracking-wider text-slate-500">Territory</p>
                <p className="mt-1 font-semibold text-slate-900">{summary.territoryNameSnapshot}</p>
              </div>
              <div className="rounded-md border border-slate-200 p-3">
                <p className="text-xs uppercase tracking-wider text-slate-500">Prepared By</p>
                <p className="mt-1 font-semibold text-slate-900">{summary.staffName}</p>
              </div>
              <div className="rounded-md border border-slate-200 p-3">
                <p className="text-xs uppercase tracking-wider text-slate-500">Morning Finalized At</p>
                <p className="mt-1 font-semibold text-slate-900">{formatDateTime(summary.loadingCompletedAt)}</p>
              </div>
              <div className="rounded-md border border-slate-200 p-3">
                <p className="text-xs uppercase tracking-wider text-slate-500">Completed By</p>
                <p className="mt-1 font-semibold text-slate-900">{summary.loadingCompletedBy ?? "-"}</p>
              </div>
            </section>

            <section className="overflow-hidden rounded-md border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.14em] text-slate-500">
                  <tr>
                    <th className="px-3 py-3">Line #</th>
                    <th className="px-3 py-3">Product Code</th>
                    <th className="px-3 py-3">Product Name</th>
                    <th className="px-3 py-3 text-right">Loading Qty</th>
                    <th className="px-3 py-3 text-right">Sales Qty</th>
                    <th className="px-3 py-3 text-right">L/Q - S/Q</th>
                    <th className="px-3 py-3 text-right">Lorry Qty</th>
                    <th className="px-3 py-3 text-right">More / Less</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.length === 0 ? (
                    <tr>
                      <td className="px-3 py-8 text-center text-slate-500" colSpan={8}>
                        No route-sheet items recorded.
                      </td>
                    </tr>
                  ) : (
                    items.map((item, index) => {
                      const product = resolveProduct(item, products);
                      const packInfo = buildPackInfoLabel(product);
                      const quantityModeLabel = buildQuantityModeLabel(product);
                      const loadingEquivalent = buildUnitEquivalentLabel(item.loadingQty, product);
                      const salesEquivalent = buildUnitEquivalentLabel(item.salesQty, product);
                      const balanceEquivalent = buildUnitEquivalentLabel(Math.abs(item.balanceQty), product);
                      const lorryEquivalent = buildUnitEquivalentLabel(item.lorryQty, product);
                      const varianceEquivalent = item.varianceQty !== 0 ? buildUnitEquivalentLabel(Math.abs(item.varianceQty), product) : null;

                      return (
                        <tr key={item.id}>
                          <td className="px-3 py-3 font-semibold text-slate-900">{index + 1}</td>
                          <td className="px-3 py-3">{product.code}</td>
                          <td className="px-3 py-3">
                            <p>{product.name}</p>
                            <p className="mt-1 text-xs text-slate-500">{packInfo ?? "Legacy product"}</p>
                            <p className="mt-1 text-xs text-slate-500">Rate {moneyFormat.format(product.unitPrice)}</p>
                          </td>
                          <td className="px-3 py-3 text-right font-semibold">
                            <div>{item.loadingQty}</div>
                            <p className="mt-1 text-xs font-normal text-slate-500">{quantityModeLabel}</p>
                            {loadingEquivalent ? <p className="mt-1 text-xs font-normal text-slate-500">{loadingEquivalent}</p> : null}
                          </td>
                          <td className="px-3 py-3 text-right font-semibold">
                            <div>{item.salesQty}</div>
                            <p className="mt-1 text-xs font-normal text-slate-500">{quantityModeLabel}</p>
                            {salesEquivalent ? <p className="mt-1 text-xs font-normal text-slate-500">{salesEquivalent}</p> : null}
                          </td>
                          <td className="px-3 py-3 text-right font-semibold">
                            <div>{item.balanceQty}</div>
                            <p className="mt-1 text-xs font-normal text-slate-500">{quantityModeLabel}</p>
                            {balanceEquivalent ? <p className="mt-1 text-xs font-normal text-slate-500">{balanceEquivalent}</p> : null}
                          </td>
                          <td className="px-3 py-3 text-right font-semibold">
                            <div>{item.lorryQty}</div>
                            <p className="mt-1 text-xs font-normal text-slate-500">{quantityModeLabel}</p>
                            {lorryEquivalent ? <p className="mt-1 text-xs font-normal text-slate-500">{lorryEquivalent}</p> : null}
                          </td>
                          <td className="px-3 py-3 text-right font-semibold">
                            <div>{item.varianceQty}</div>
                            <p className="mt-1 text-xs font-normal text-slate-500">{item.varianceQty > 0 ? "More" : item.varianceQty < 0 ? "Less" : "Matched"}</p>
                            {varianceEquivalent ? <p className="mt-1 text-xs font-normal text-slate-500">{varianceEquivalent}</p> : null}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                <tfoot className="bg-slate-50 text-sm font-semibold text-slate-900">
                  <tr>
                    <td className="px-3 py-3" colSpan={2}>Totals</td>
                    <td className="px-3 py-3 text-right">{totals.totalLines} lines</td>
                    <td className="px-3 py-3 text-right">{totals.totalLoadingQty}</td>
                    <td className="px-3 py-3 text-right">{totals.totalSalesQty}</td>
                    <td className="px-3 py-3 text-right">{totals.totalBalanceQty}</td>
                    <td className="px-3 py-3 text-right">{totals.totalLorryQty}</td>
                    <td className="px-3 py-3 text-right">{totals.totalVarianceQty}</td>
                  </tr>
                </tfoot>
              </table>
            </section>

            <section className="grid gap-3 text-sm sm:grid-cols-3">
              <div className="rounded-md border border-slate-200 p-3">
                <p className="text-xs uppercase tracking-wider text-slate-500">Loaded Value</p>
                <p className="mt-1 font-semibold text-slate-900">{moneyFormat.format(totals.totalValue)}</p>
              </div>
              <div className="rounded-md border border-slate-200 p-3">
                <p className="text-xs uppercase tracking-wider text-slate-500">Remarks</p>
                <p className="mt-1 whitespace-pre-wrap text-slate-800">{summary.remarks?.trim() ? summary.remarks : "-"}</p>
              </div>
              <div className="rounded-md border border-slate-200 p-3">
                <p className="text-xs uppercase tracking-wider text-slate-500">Loading Notes</p>
                <p className="mt-1 whitespace-pre-wrap text-slate-800">{summary.loadingNotes?.trim() ? summary.loadingNotes : "-"}</p>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}
