"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { DailyReportStatus } from "@/types/domain/report";
import {
  approveReport,
  fetchAuthSession,
  fetchReportDetail,
  rejectReport,
  reopenReport,
  submitReport,
  updateReportDraft
} from "@/features/reports/api/daily-reports-api";
import type { ReportDetailEnvelope } from "@/features/reports/types";

export function useReportWorkspace(reportId: string) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<ReportDetailEnvelope | null>(null);
  const [role, setRole] = useState<"admin" | "supervisor" | "driver" | "cashier" | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [draftForm, setDraftForm] = useState({
    reportDate: "",
    staffName: "",
    remarks: ""
  });

  const [rejectReason, setRejectReason] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [session, report] = await Promise.all([
        fetchAuthSession(),
        fetchReportDetail(reportId)
      ]);

      const reportDetail = report as ReportDetailEnvelope;

      setCurrentUserId(session.user.id);
      setRole(session.user.profileRole);
      setDetail(reportDetail);
      setDraftForm({
        reportDate: reportDetail.report.reportDate,
        staffName: reportDetail.report.staffName,
        remarks: reportDetail.report.remarks ?? ""
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to load report workspace.");
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  useEffect(() => {
    void load();
  }, [load]);

  const status = detail?.report.status;
  const reportOwnerId = detail?.report.preparedBy;

  const canSaveDraft = useMemo(() => {
    if (!detail || !role || !currentUserId) return false;
    if (status !== "draft") return false;

    if (role === "driver") {
      return reportOwnerId === currentUserId;
    }

    return role === "admin" || role === "supervisor" || role === "cashier";
  }, [currentUserId, detail, reportOwnerId, role, status]);

  const canSubmit = useMemo(() => {
    if (!detail || !role || !currentUserId) return false;
    if (status !== "draft") return false;

    if (role === "driver") {
      return reportOwnerId === currentUserId;
    }

    return role === "admin" || role === "supervisor";
  }, [currentUserId, detail, reportOwnerId, role, status]);

  const canApprove = status === "submitted" && (role === "admin" || role === "supervisor");
  const canReject = status === "submitted" && (role === "admin" || role === "supervisor");

  const canReopen = useMemo(() => {
    if (!status || !role) return false;

    if (status === "approved") return role === "admin";
    if (status === "submitted" || status === "rejected") return role === "admin" || role === "supervisor";

    return false;
  }, [role, status]);

  const doAction = useCallback(async (action: () => Promise<unknown>) => {
    setSaving(true);
    setError(null);

    try {
      await action();
      await load();
      setShowRejectForm(false);
      setRejectReason("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Action failed.");
    } finally {
      setSaving(false);
    }
  }, [load]);

  const saveDraft = useCallback(async () => {
    if (!detail) return;

    await doAction(() =>
      updateReportDraft(detail.report.id, {
        reportDate: draftForm.reportDate,
        staffName: draftForm.staffName,
        remarks: draftForm.remarks
      })
    );
  }, [detail, doAction, draftForm]);

  const submit = useCallback(async () => {
    if (!detail) return;
    await doAction(() => submitReport(detail.report.id));
  }, [detail, doAction]);

  const approve = useCallback(async () => {
    if (!detail) return;
    await doAction(() => approveReport(detail.report.id));
  }, [detail, doAction]);

  const reject = useCallback(async () => {
    if (!detail) return;
    await doAction(() => rejectReport(detail.report.id, rejectReason));
  }, [detail, doAction, rejectReason]);

  const reopen = useCallback(async () => {
    if (!detail) return;
    await doAction(() => reopenReport(detail.report.id));
  }, [detail, doAction]);

  return {
    loading,
    error,
    saving,
    detail,
    role,
    status: status as DailyReportStatus | undefined,
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
    reload: load,
    actions: {
      saveDraft,
      submit,
      approve,
      reject,
      reopen
    }
  };
}
