"use client";

import { useMemo, useRef, useState } from "react";
import { Download, Eye, FileUp, Loader2, Trash2, UploadCloud } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { DailyReportAttachmentDto } from "@/types/domain/report";

type ReportAttachmentsPanelProps = {
  rows: DailyReportAttachmentDto[];
  loading: boolean;
  uploading: boolean;
  uploadProgress: number;
  deletingPath: string | null;
  error: string | null;
  canEdit: boolean;
  onUpload: (file: File) => Promise<void>;
  onDelete: (filePath: string) => Promise<void>;
  onRefresh: () => Promise<void>;
};

function formatBytes(value: number | null) {
  if (value === null || Number.isNaN(value)) return "-";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDateTime(value: string | null) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("en-LK", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function ReportAttachmentsPanel({
  rows,
  loading,
  uploading,
  uploadProgress,
  deletingPath,
  error,
  canEdit,
  onUpload,
  onDelete,
  onRefresh
}: ReportAttachmentsPanelProps) {
  const [dragActive, setDragActive] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const aTime = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0;
      const bTime = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [rows]);

  const handleFileSelection = async (file: File | null) => {
    if (!file) return;

    setLocalError(null);
    try {
      await onUpload(file);
    } catch (uploadError) {
      setLocalError(uploadError instanceof Error ? uploadError.message : "Failed to upload file.");
    } finally {
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>Attachments</CardTitle>
          <CardDescription>Upload and manage supporting files for this report.</CardDescription>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => void onRefresh()}
            disabled={loading || uploading}
          >
            Refresh
          </Button>
          <Button
            onClick={() => inputRef.current?.click()}
            disabled={!canEdit || uploading || loading}
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
            Upload File
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept=".png,.jpg,.jpeg,.webp,.pdf,application/pdf,image/png,image/jpeg,image/webp"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            void handleFileSelection(file);
          }}
          disabled={!canEdit || uploading}
        />

        {error ? <Alert variant="destructive">{error}</Alert> : null}
        {localError ? <Alert variant="destructive">{localError}</Alert> : null}

        {!canEdit ? (
          <Alert>Attachments are read-only because this report is no longer in draft.</Alert>
        ) : null}

        <div
          onDragOver={(event) => {
            event.preventDefault();
            if (canEdit && !uploading) setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragActive(false);
            if (!canEdit || uploading) return;
            const file = event.dataTransfer.files?.[0] ?? null;
            void handleFileSelection(file);
          }}
          className={`rounded-lg border-2 border-dashed p-6 text-center transition ${dragActive ? "border-blue-400 bg-blue-50" : "border-slate-300 bg-slate-50"}`}
        >
          <UploadCloud className="mx-auto h-8 w-8 text-slate-500" />
          <p className="mt-2 text-sm font-semibold text-slate-800">Drag and drop a file here</p>
          <p className="text-xs text-slate-500">PNG, JPEG, WEBP, PDF up to 10MB</p>
          <Button
            type="button"
            variant="secondary"
            className="mt-3"
            onClick={() => inputRef.current?.click()}
            disabled={!canEdit || uploading}
          >
            Choose File
          </Button>
        </div>

        {uploading ? (
          <div className="space-y-2 rounded-md border border-blue-200 bg-blue-50 p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-blue-800">Uploading...</span>
              <span className="text-blue-800">{uploadProgress}%</span>
            </div>
            <div className="h-2 rounded-full bg-blue-100">
              <div className="h-2 rounded-full bg-blue-500 transition-all" style={{ width: `${uploadProgress}%` }} />
            </div>
          </div>
        ) : null}

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.14em] text-slate-500">
              <tr>
                <th className="px-3 py-3">File Name</th>
                <th className="px-3 py-3">File Type</th>
                <th className="px-3 py-3 text-right">File Size</th>
                <th className="px-3 py-3">Uploaded At</th>
                <th className="px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 4 }).map((_, index) => (
                  <tr key={`loading-${index}`}>
                    <td className="px-3 py-3" colSpan={5}>
                      <Skeleton className="h-9 w-full" />
                    </td>
                  </tr>
                ))
              ) : sortedRows.length === 0 ? (
                <tr>
                  <td className="px-3 py-10 text-center text-slate-500" colSpan={5}>
                    No attachments uploaded for this report yet.
                  </td>
                </tr>
              ) : (
                sortedRows.map((row) => (
                  <tr key={row.filePath}>
                    <td className="px-3 py-3 font-medium text-slate-900">{row.fileName}</td>
                    <td className="px-3 py-3 text-slate-600">{row.fileType ?? "-"}</td>
                    <td className="px-3 py-3 text-right text-slate-700">{formatBytes(row.fileSize)}</td>
                    <td className="px-3 py-3 text-slate-700">{formatDateTime(row.uploadedAt)}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <a
                          href={row.signedUrl ?? "#"}
                          target="_blank"
                          rel="noreferrer"
                          aria-disabled={!row.signedUrl}
                          className={`inline-flex h-8 w-8 items-center justify-center rounded-md border ${row.signedUrl ? "border-slate-200 text-slate-700 hover:bg-slate-100" : "pointer-events-none border-slate-100 text-slate-300"}`}
                        >
                          <Eye className="h-4 w-4" />
                        </a>
                        <a
                          href={row.signedUrl ?? "#"}
                          download={row.fileName}
                          aria-disabled={!row.signedUrl}
                          className={`inline-flex h-8 w-8 items-center justify-center rounded-md border ${row.signedUrl ? "border-slate-200 text-slate-700 hover:bg-slate-100" : "pointer-events-none border-slate-100 text-slate-300"}`}
                        >
                          <Download className="h-4 w-4" />
                        </a>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!canEdit || uploading || deletingPath === row.filePath}
                          onClick={() => void onDelete(row.filePath)}
                        >
                          {deletingPath === row.filePath ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
