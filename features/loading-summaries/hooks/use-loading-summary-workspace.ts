"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  fetchAuthSession,
  fetchLoadingSummaryDetail,
  finalizeLoadingSummary,
  updateLoadingSummary
} from "@/features/loading-summaries/api/loading-summaries-api";
import type { LoadingSummaryListItem } from "@/features/loading-summaries/types";

export function useLoadingSummaryWorkspace(summaryId: string) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [summary, setSummary] = useState<LoadingSummaryListItem | null>(null);
  const [role, setRole] = useState<"admin" | "supervisor" | "driver" | "cashier" | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [draftForm, setDraftForm] = useState({
    reportDate: "",
    staffName: "",
    remarks: "",
    loadingNotes: ""
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [session, detail] = await Promise.all([
        fetchAuthSession(),
        fetchLoadingSummaryDetail(summaryId)
      ]);

      setRole(session.user.profileRole);
      setCurrentUserId(session.user.id);
      setSummary(detail);
      setDraftForm({
        reportDate: detail.reportDate,
        staffName: detail.staffName,
        remarks: detail.remarks ?? "",
        loadingNotes: detail.loadingNotes ?? ""
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to load loading summary.");
    } finally {
      setLoading(false);
    }
  }, [summaryId]);

  useEffect(() => {
    void load();
  }, [load]);

  const isNotFound = useMemo(() => {
    if (!error) return false;
    return error.toLowerCase().includes("not found");
  }, [error]);

  const canAccessAsManager = useMemo(() => {
    if (!summary || !role || !currentUserId) return false;
    if (summary.status !== "draft") return false;

    if (role === "driver") {
      return summary.preparedBy === currentUserId;
    }

    return role === "admin" || role === "supervisor";
  }, [currentUserId, role, summary]);

  const canEditMorningLoading = useMemo(() => {
    if (!summary) return false;
    return canAccessAsManager && !summary.loadingCompletedAt;
  }, [canAccessAsManager, summary]);

  const canEditEveningReconciliation = useMemo(() => {
    if (!summary) return false;
    return canAccessAsManager && Boolean(summary.loadingCompletedAt);
  }, [canAccessAsManager, summary]);

  const saveDraft = useCallback(async () => {
    if (!summary || !canEditMorningLoading) return;

    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const updated = await updateLoadingSummary(summary.id, {
        reportDate: draftForm.reportDate,
        staffName: draftForm.staffName,
        remarks: draftForm.remarks,
        loadingNotes: draftForm.loadingNotes
      });

      setSummary(updated);
      setDraftForm({
        reportDate: updated.reportDate,
        staffName: updated.staffName,
        remarks: updated.remarks ?? "",
        loadingNotes: updated.loadingNotes ?? ""
      });
      setSuccessMessage("Loading summary draft saved.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to save loading summary.");
    } finally {
      setSaving(false);
    }
  }, [canEditMorningLoading, draftForm, summary]);

  const finalize = useCallback(async () => {
    if (!summary || !canEditMorningLoading) return false;

    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await finalizeLoadingSummary(summary.id, draftForm.loadingNotes || undefined);
      const refreshed = await fetchLoadingSummaryDetail(summary.id);

      setSummary(refreshed);
      setDraftForm({
        reportDate: refreshed.reportDate,
        staffName: refreshed.staffName,
        remarks: refreshed.remarks ?? "",
        loadingNotes: refreshed.loadingNotes ?? ""
      });
      setSuccessMessage("Morning loading finalized. Return to this same sheet this evening to enter sales and lorry reconciliation.");
      return true;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to finalize loading summary.");
      return false;
    } finally {
      setSaving(false);
    }
  }, [canEditMorningLoading, draftForm.loadingNotes, summary]);

  return {
    loading,
    saving,
    error,
    isNotFound,
    successMessage,
    summary,
    role,
    currentUserId,
    draftForm,
    setDraftForm,
    canManage: canAccessAsManager,
    canEditMorningLoading,
    canEditEveningReconciliation,
    reload: load,
    actions: {
      saveDraft,
      finalize
    }
  };
}
