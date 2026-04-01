import { requireAuth } from "@/lib/auth/helpers";
import { errorResponse, fromPostgrestError, successResponse } from "@/lib/db/response";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { uuidSchema } from "@/lib/validation/common";
import { reportAttachmentDeleteSchema } from "@/lib/validation/report-attachment";
import type { DailyReportAttachmentDto } from "@/types/domain/report";

type DailyReportAccessRow = {
  id: string;
  prepared_by: string;
  status: "draft" | "submitted" | "approved" | "rejected";
  deleted_at: string | null;
};

type MembershipLookup = {
  organization_id: string;
};

type StorageListRow = {
  name: string;
  metadata?: {
    size?: number;
    mimetype?: string;
  } | null;
  created_at?: string | null;
};

const STORAGE_BUCKET = "organization-assets";
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf"]);

function sanitizeFileName(originalName: string) {
  const trimmed = originalName.trim();
  const normalized = trimmed.length > 0 ? trimmed : "attachment";
  return normalized
    .replace(/[\\/]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .replace(/-+/g, "-")
    .slice(0, 120) || "attachment";
}

function buildReportAttachmentPrefix(organizationId: string, reportId: string) {
  return `${organizationId}/reports/${reportId}`;
}

function mapAttachment(row: StorageListRow, filePath: string, signedUrl: string | null): DailyReportAttachmentDto {
  return {
    filePath,
    fileName: row.name,
    fileType: row.metadata?.mimetype ?? null,
    fileSize: typeof row.metadata?.size === "number" ? row.metadata.size : null,
    uploadedAt: row.created_at ?? null,
    signedUrl
  };
}

async function resolveActiveOrganizationId(userId: string) {
  const supabase = await createSupabaseServerClient();
  const membershipResult = (await supabase
    .from("organization_memberships")
    .select("organization_id")
    .eq("user_id", userId)
    .eq("status", "ACTIVE")
    .limit(1)
    .maybeSingle()) as {
    data: MembershipLookup | null;
    error: Parameters<typeof fromPostgrestError>[0] | null;
  };

  if (membershipResult.error) {
    return {
      organizationId: null,
      response: fromPostgrestError(membershipResult.error)
    };
  }

  if (!membershipResult.data) {
    return {
      organizationId: null,
      response: errorResponse(
        403,
        "MEMBERSHIP_REQUIRED",
        "An active organization membership is required to access report attachments."
      )
    };
  }

  return {
    organizationId: membershipResult.data.organization_id,
    response: null
  };
}

async function getReportForRead(reportId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = (await supabase
    .from("daily_reports")
    .select("id, prepared_by, status, deleted_at")
    .eq("id", reportId)
    .is("deleted_at", null)
    .maybeSingle()) as {
    data: DailyReportAccessRow | null;
    error: Parameters<typeof fromPostgrestError>[0] | null;
  };

  if (error) {
    return { data: null, response: fromPostgrestError(error) };
  }

  if (!data) {
    return {
      data: null,
      response: errorResponse(404, "REPORT_NOT_FOUND", "Daily report not found.")
    };
  }

  return { data, response: null };
}

async function getEditableAttachmentReport(reportId: string, userId: string, role: string) {
  const report = await getReportForRead(reportId);

  if (report.response || !report.data) {
    return report;
  }

  if (role === "driver" && report.data.prepared_by !== userId) {
    return {
      data: null,
      response: errorResponse(403, "FORBIDDEN", "Drivers can only edit attachments on their own reports.")
    };
  }

  if (report.data.status !== "draft") {
    return {
      data: null,
      response: errorResponse(
        409,
        "REPORT_NOT_EDITABLE",
        "Attachments can only be changed while the daily report is in draft status."
      )
    };
  }

  return report;
}

export class ReportAttachmentService {
  static async listAttachments(reportId: string) {
    const auth = await requireAuth();
    if (auth.response || !auth.context) {
      return auth.response;
    }

    const parsedReportId = uuidSchema.safeParse(reportId);
    if (!parsedReportId.success) {
      return errorResponse(422, "INVALID_REPORT_ID", "A valid report id is required.");
    }

    const report = await getReportForRead(parsedReportId.data);
    if (report.response) {
      return report.response;
    }

    const membership = await resolveActiveOrganizationId(auth.context.user.id);
    if (membership.response || !membership.organizationId) {
      return membership.response ?? errorResponse(403, "MEMBERSHIP_REQUIRED", "Active organization membership required.");
    }

    const prefix = buildReportAttachmentPrefix(membership.organizationId, parsedReportId.data);
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .list(prefix, {
        limit: 200,
        sortBy: { column: "name", order: "asc" }
      });

    if (error) {
      return errorResponse(500, "ATTACHMENTS_LIST_FAILED", error.message);
    }

    const files = (data ?? [])
      .filter((item) => Boolean((item as { name?: string }).name))
      .filter((item) => !(item as { id?: string | null }).id?.endsWith("/")) as StorageListRow[];

    const mapped = await Promise.all(files.map(async (item) => {
      const filePath = `${prefix}/${item.name}`;
      const signed = await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(filePath, 60 * 60);
      const signedUrl = signed.error ? null : signed.data.signedUrl;
      return mapAttachment(item, filePath, signedUrl);
    }));

    return successResponse({ items: mapped });
  }

  static async uploadAttachment(reportId: string, request: Request) {
    const auth = await requireAuth();
    if (auth.response || !auth.context) {
      return auth.response;
    }

    const parsedReportId = uuidSchema.safeParse(reportId);
    if (!parsedReportId.success) {
      return errorResponse(422, "INVALID_REPORT_ID", "A valid report id is required.");
    }

    const report = await getEditableAttachmentReport(
      parsedReportId.data,
      auth.context.user.id,
      auth.context.profile.role
    );

    if (report.response) {
      return report.response;
    }

    const membership = await resolveActiveOrganizationId(auth.context.user.id);
    if (membership.response || !membership.organizationId) {
      return membership.response ?? errorResponse(403, "MEMBERSHIP_REQUIRED", "Active organization membership required.");
    }

    const formData = await request.formData().catch(() => null);
    if (!formData) {
      return errorResponse(422, "VALIDATION_ERROR", "Invalid multipart form data.");
    }

    const file = formData.get("file");

    if (!(file instanceof File)) {
      return errorResponse(422, "VALIDATION_ERROR", "Attachment file is required.");
    }

    if (file.size <= 0) {
      return errorResponse(422, "VALIDATION_ERROR", "File must not be empty.");
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return errorResponse(422, "FILE_TOO_LARGE", "File size exceeds the 10MB limit.");
    }

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return errorResponse(422, "INVALID_FILE_TYPE", "Only PNG, JPEG, WEBP, and PDF files are allowed.");
    }

    const prefix = buildReportAttachmentPrefix(membership.organizationId, parsedReportId.data);
    const safeName = sanitizeFileName(file.name);
    const objectName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
    const filePath = `${prefix}/${objectName}`;

    const bytes = await file.arrayBuffer();
    const supabase = await createSupabaseServerClient();

    const uploadResult = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, bytes, {
        upsert: false,
        contentType: file.type
      });

    if (uploadResult.error) {
      return errorResponse(500, "ATTACHMENT_UPLOAD_FAILED", uploadResult.error.message);
    }

    const signed = await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(filePath, 60 * 60);

    const attachment: DailyReportAttachmentDto = {
      filePath,
      fileName: objectName,
      fileType: file.type || null,
      fileSize: file.size,
      uploadedAt: new Date().toISOString(),
      signedUrl: signed.error ? null : signed.data.signedUrl
    };

    return successResponse(attachment, { status: 201 });
  }

  static async deleteAttachment(reportId: string, request: Request) {
    const auth = await requireAuth();
    if (auth.response || !auth.context) {
      return auth.response;
    }

    const parsedReportId = uuidSchema.safeParse(reportId);
    if (!parsedReportId.success) {
      return errorResponse(422, "INVALID_REPORT_ID", "A valid report id is required.");
    }

    const report = await getEditableAttachmentReport(
      parsedReportId.data,
      auth.context.user.id,
      auth.context.profile.role
    );

    if (report.response) {
      return report.response;
    }

    const membership = await resolveActiveOrganizationId(auth.context.user.id);
    if (membership.response || !membership.organizationId) {
      return membership.response ?? errorResponse(403, "MEMBERSHIP_REQUIRED", "Active organization membership required.");
    }

    const body = await request.json().catch(() => null);
    const parsedBody = reportAttachmentDeleteSchema.safeParse(body);

    if (!parsedBody.success) {
      return errorResponse(422, "VALIDATION_ERROR", "Invalid attachment delete payload.", parsedBody.error.flatten());
    }

    const expectedPrefix = `${buildReportAttachmentPrefix(membership.organizationId, parsedReportId.data)}/`;
    if (!parsedBody.data.filePath.startsWith(expectedPrefix)) {
      return errorResponse(403, "FORBIDDEN", "Attachment does not belong to this report.");
    }

    const supabase = await createSupabaseServerClient();
    const removeResult = await supabase.storage
      .from(STORAGE_BUCKET)
      .remove([parsedBody.data.filePath]);

    if (removeResult.error) {
      return errorResponse(500, "ATTACHMENT_DELETE_FAILED", removeResult.error.message);
    }

    return successResponse({
      filePath: parsedBody.data.filePath,
      deleted: true
    });
  }
}
