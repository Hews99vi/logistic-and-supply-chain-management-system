"use client";

import { useCallback, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileUp, Loader2, Upload, X } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProductOption } from "@/features/reports/types";
import {
  hasExistingFormData,
  parseFlatDataCSV,
  type FlatDataParseResult,
} from "@/features/reports/utils/flatDataParser";

type FlatDataImportPanelProps = {
  /** Products loaded from the database for code → UUID resolution */
  products: ProductOption[];
  /** Existing invoice rows to check for prior data */
  existingInvoiceRows: Array<{ id?: string; invoiceNo?: string }>;
  /** Existing inventory rows to check for prior data */
  existingInventoryRows: Array<{ id?: string; salesQty?: number }>;
  /** Existing return/damage rows to check for prior data */
  existingReturnDamageRows: Array<{ id?: string }>;
  /** Whether the report is in an editable state */
  canEdit: boolean;
  /** Whether any save operation is in progress */
  saving: boolean;
  /** Optional visible reason when import is blocked */
  disabledReason?: string | null;
  /** Callback when import is confirmed with parsed data */
  onImportConfirmed: (result: FlatDataParseResult & { success: true }, options: { allowOverwrite: boolean }) => Promise<void>;
};

type ImportPhase =
  | "idle"
  | "reading"
  | "parsed"
  | "confirm-overwrite"
  | "importing"
  | "done";

export function FlatDataImportPanel({
  products,
  existingInvoiceRows,
  existingInventoryRows,
  existingReturnDamageRows,
  canEdit,
  saving,
  disabledReason,
  onImportConfirmed,
}: FlatDataImportPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<ImportPhase>("idle");
  const [parseResult, setParseResult] = useState<FlatDataParseResult | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [importError, setImportError] = useState<string | null>(null);

  const resetState = useCallback(() => {
    setPhase("idle");
    setParseResult(null);
    setFileName("");
    setImportError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const handleFileSelected = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      setFileName(file.name);
      setPhase("reading");
      setImportError(null);

      try {
        const csvText = await file.text();
        const result = parseFlatDataCSV(csvText, products);
        setParseResult(result);

        if (!result.success) {
          setPhase("parsed");
          return;
        }

        // Safety check: does the form already have data?
        const hasData = hasExistingFormData(
          existingInvoiceRows,
          existingInventoryRows,
          existingReturnDamageRows
        );

        if (hasData) {
          setPhase("confirm-overwrite");
        } else {
          setPhase("parsed");
        }
      } catch {
        setParseResult({
          success: false,
          error: {
            type: "parse_error",
            message: "Failed to read the file. Please ensure it is a valid CSV file.",
          },
        });
        setPhase("parsed");
      }
    },
    [products, existingInvoiceRows, existingInventoryRows, existingReturnDamageRows]
  );

  const handleConfirmImport = useCallback(async (options?: { allowOverwrite?: boolean }) => {
    if (parseResult?.success) {
      setPhase("importing");
      setImportError(null);

      try {
        await onImportConfirmed(parseResult, { allowOverwrite: Boolean(options?.allowOverwrite) });
        setPhase("done");
      } catch (requestError) {
        setImportError(requestError instanceof Error ? requestError.message : "Failed to import CSV data.");
        setPhase("parsed");
      }
    }
  }, [onImportConfirmed, parseResult]);

  const handleTriggerFileInput = () => {
    if (!canEdit || saving) return;
    fileInputRef.current?.click();
  };

  const isBlocked = !canEdit;

  return (
    <Card className={isBlocked ? "border-slate-200 bg-slate-50/70" : "border-blue-200 bg-blue-50/30"}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileUp className={isBlocked ? "h-5 w-5 text-slate-500" : "h-5 w-5 text-blue-600"} />
          Upload Flat Data
        </CardTitle>
        <CardDescription>
          Upload the daily Ambewela CSV after morning loading is finalized. It fills sales, invoices, returns, and bill counts without changing loading quantities.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {isBlocked ? (
          <Alert className="border-amber-200 bg-amber-50 text-amber-800">
            {disabledReason ?? "No permission to import Flat Data."}
          </Alert>
        ) : null}

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={handleFileSelected}
          disabled={saving || isBlocked}
        />

        {phase === "idle" && (
          <div className="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-blue-300 bg-white/60 px-6 py-8">
            <Upload className="h-10 w-10 text-blue-400" />
            <p className="text-sm text-slate-600">
              Select the route-day Flat Data CSV exported from the mother-company system.
            </p>
            <Button variant="outline" onClick={handleTriggerFileInput} disabled={saving || isBlocked}>
              <Upload className="h-4 w-4" />
              Choose CSV File
            </Button>
          </div>
        )}

        {phase === "reading" && (
          <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-white px-4 py-6">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
            <span className="text-sm text-slate-700">
              Reading <span className="font-semibold">{fileName}</span>...
            </span>
          </div>
        )}

        {phase === "importing" && (
          <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-white px-4 py-6">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
            <span className="text-sm text-slate-700">
              Saving imported CSV data...
            </span>
          </div>
        )}

        {phase === "parsed" && parseResult && !parseResult.success && (
          <div className="space-y-3">
            <Alert variant="destructive">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="space-y-1">
                  <p className="font-semibold">Import Failed</p>
                  <p className="text-sm">{parseResult.error.message}</p>
                  {parseResult.error.missingProductCodes && (
                    <div className="mt-2 rounded border border-red-200 bg-red-50 p-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-red-700">Missing Product Codes</p>
                      <ul className="mt-1 space-y-0.5 text-sm">
                        {parseResult.error.missingProductCodes.map((code) => (
                          <li key={code} className="font-mono text-red-800">{code}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </Alert>
            <Button variant="outline" onClick={resetState}>
              <X className="h-4 w-4" /> Dismiss
            </Button>
          </div>
        )}

        {phase === "parsed" && parseResult?.success && (
          <div className="space-y-4">
            {importError ? (
              <Alert variant="destructive">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-semibold">Import Save Failed</p>
                    <p className="text-sm">{importError}</p>
                  </div>
                </div>
              </Alert>
            ) : null}

            <div className="rounded-lg border border-green-200 bg-green-50/50 p-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <p className="font-semibold text-green-800">
                  CSV parsed successfully: <span className="font-mono">{fileName}</span>
                </p>
              </div>

              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                <div className="rounded border border-green-200 bg-white px-3 py-2">
                  <p className="text-xs uppercase tracking-wider text-slate-500">Invoices</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">
                    {parseResult.summary.uniqueInvoices}
                  </p>
                </div>
                <div className="rounded border border-green-200 bg-white px-3 py-2">
                  <p className="text-xs uppercase tracking-wider text-slate-500">Products Sold</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">
                    {parseResult.summary.uniqueProducts}
                  </p>
                  <p className="text-xs text-slate-500">
                    Total qty: {parseResult.summary.totalSalesQty}
                  </p>
                </div>
                <div className="rounded border border-green-200 bg-white px-3 py-2">
                  <p className="text-xs uppercase tracking-wider text-slate-500">Returns (Damage)</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">
                    {parseResult.summary.totalReturnRows}
                  </p>
                  <p className="text-xs text-slate-500">
                    Total damage qty: {parseResult.summary.totalDamageQty}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={() => void handleConfirmImport({ allowOverwrite: false })} disabled={saving || isBlocked}>
                <CheckCircle2 className="h-4 w-4" />
                Confirm Import
              </Button>
              <Button variant="outline" onClick={resetState} disabled={saving}>
                <X className="h-4 w-4" />
                Cancel
              </Button>
            </div>
          </div>
        )}

        {phase === "confirm-overwrite" && parseResult?.success && (
          <div className="space-y-4">
            <Alert>
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <div className="space-y-2">
                  <p className="font-semibold text-amber-900">Existing Data Detected</p>
                  <p className="text-sm text-amber-800">
                    This report already has saved data in the Invoice, Inventory, or Return/Damage sections.
                    Confirming the import will immediately <strong>overwrite</strong> the existing entries in those sections.
                  </p>
                  <p className="text-sm text-amber-800">
                    Are you sure you want to proceed?
                  </p>
                </div>
              </div>
            </Alert>

            <div className="rounded-lg border border-green-200 bg-green-50/50 p-4">
              <p className="text-sm font-semibold text-green-800">
                CSV Preview: <span className="font-mono">{fileName}</span>
              </p>
              <div className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
                <div className="rounded border border-green-200 bg-white px-3 py-2">
                  <p className="text-xs uppercase tracking-wider text-slate-500">Invoices</p>
                  <p className="mt-1 text-lg font-semibold">{parseResult.summary.uniqueInvoices}</p>
                </div>
                <div className="rounded border border-green-200 bg-white px-3 py-2">
                  <p className="text-xs uppercase tracking-wider text-slate-500">Products Sold</p>
                  <p className="mt-1 text-lg font-semibold">{parseResult.summary.uniqueProducts}</p>
                </div>
                <div className="rounded border border-green-200 bg-white px-3 py-2">
                  <p className="text-xs uppercase tracking-wider text-slate-500">Returns</p>
                  <p className="mt-1 text-lg font-semibold">{parseResult.summary.totalReturnRows}</p>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                className="bg-amber-600 hover:bg-amber-700"
                onClick={() => {
                  void handleConfirmImport({ allowOverwrite: true });
                }}
                disabled={saving || isBlocked}
              >
                <AlertTriangle className="h-4 w-4" />
                Yes, Overwrite & Import
              </Button>
              <Button variant="outline" onClick={resetState} disabled={saving}>
                <X className="h-4 w-4" />
                Cancel
              </Button>
            </div>
          </div>
        )}

        {phase === "done" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <span className="text-sm font-semibold text-green-800">
                CSV data imported and saved successfully. Review the populated data in each tab before submitting the report.
              </span>
            </div>
            <Button variant="outline" size="sm" onClick={resetState}>
              Import Another File
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
