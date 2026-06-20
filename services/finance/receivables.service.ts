import { z } from "zod";

import { requireFeaturePermission } from "@/lib/auth/permissions";
import { errorResponse, fromPostgrestError, successResponse } from "@/lib/db/response";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { uuidSchema } from "@/lib/validation/common";

const collectionSchema = z.object({
  amount: z.coerce.number().finite().positive(),
  paymentMethod: z.enum(["cash", "cheque", "bank", "other"]),
  referenceNo: z.string().trim().max(120).nullish(),
  notes: z.string().trim().max(500).nullish(),
  collectedAt: z.string().trim().max(20).optional()
});

const creditStatusSchema = z.object({
  status: z.enum(["open", "partially_paid", "settled", "written_off", "disputed"]),
  notes: z.string().trim().max(500).optional()
});

const chequeStatusSchema = z.object({
  status: z.enum(["received", "deposited", "realized", "bounced", "returned", "cancelled"]),
  notes: z.string().trim().max(500).optional()
});

async function readJson(request: Request) {
  return request.json().catch(() => null);
}

function agingBucket(dueDate: string | null, status: string, outstandingAmount: number) {
  if (outstandingAmount <= 0 || status === "settled" || status === "written_off") return "settled";
  if (!dueDate) return "unassigned";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const days = Math.floor((today.getTime() - due.getTime()) / 86_400_000);
  if (days < 0) return "current";
  if (days === 0) return "due_today";
  if (days <= 7) return "1_7";
  if (days <= 14) return "8_14";
  if (days <= 30) return "15_30";
  if (days <= 60) return "31_60";
  if (days <= 90) return "61_90";
  return "90_plus";
}

export class ReceivablesService {
  static async getAging() {
    const auth = await requireFeaturePermission("customers", "view");
    if (auth.response) return auth.response;
    if (!auth.context?.organization) return errorResponse(403, "FORBIDDEN", "Organization access is required.");

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("credit_invoices")
      .select("id, invoice_no, customer_name, invoice_date, due_date, amount, collected_amount, outstanding_amount, status")
      .eq("organization_id", auth.context.organization.id)
      .neq("status", "settled")
      .neq("status", "written_off")
      .gt("outstanding_amount", 0)
      .order("due_date", { ascending: true });

    if (error) return fromPostgrestError(error);

    const invoices = ((data ?? []) as Array<{
      id: string;
      invoice_no: string;
      customer_name: string;
      invoice_date: string;
      due_date: string | null;
      amount: number;
      collected_amount: number;
      outstanding_amount: number;
      status: string;
    }>).map((row) => ({
      id: row.id,
      invoiceNo: row.invoice_no,
      customerName: row.customer_name,
      invoiceDate: row.invoice_date,
      dueDate: row.due_date,
      amount: Number(row.amount),
      collectedAmount: Number(row.collected_amount),
      outstandingAmount: Number(row.outstanding_amount),
      status: row.status,
      agingBucket: agingBucket(row.due_date, row.status, Number(row.outstanding_amount))
    }));

    const buckets = ["current", "due_today", "1_7", "8_14", "15_30", "31_60", "61_90", "90_plus", "unassigned"].map((bucket) => ({
      bucket,
      invoiceCount: invoices.filter((invoice) => invoice.agingBucket === bucket).length,
      outstandingAmount: invoices.filter((invoice) => invoice.agingBucket === bucket).reduce((sum, invoice) => sum + invoice.outstandingAmount, 0)
    }));

    const topCustomers = Array.from(invoices.reduce((map, invoice) => {
      const current = map.get(invoice.customerName) ?? 0;
      map.set(invoice.customerName, current + invoice.outstandingAmount);
      return map;
    }, new Map<string, number>()).entries())
      .map(([customerName, outstandingAmount]) => ({ customerName, outstandingAmount }))
      .sort((a, b) => b.outstandingAmount - a.outstandingAmount)
      .slice(0, 10);

    return successResponse({
      buckets,
      invoices,
      topCustomers,
      totals: {
        invoiceCount: invoices.length,
        outstandingAmount: invoices.reduce((sum, invoice) => sum + invoice.outstandingAmount, 0),
        overdueAmount: invoices.filter((invoice) => !["current", "due_today", "unassigned"].includes(invoice.agingBucket)).reduce((sum, invoice) => sum + invoice.outstandingAmount, 0),
        dueTodayAmount: invoices.filter((invoice) => invoice.agingBucket === "due_today").reduce((sum, invoice) => sum + invoice.outstandingAmount, 0)
      }
    });
  }

  static async postCollection(creditInvoiceId: string, request: Request) {
    const parsedId = uuidSchema.safeParse(creditInvoiceId);
    if (!parsedId.success) return errorResponse(422, "INVALID_ID", "A valid credit invoice id is required.");

    const payload = collectionSchema.safeParse(await readJson(request));
    if (!payload.success) return errorResponse(422, "VALIDATION_ERROR", "Invalid collection payload.", payload.error.flatten());

    const supabase = await createSupabaseServerClient();
    const { data, error } = await (supabase as never as {
      rpc: (name: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: Parameters<typeof fromPostgrestError>[0] | null }>;
    }).rpc("post_credit_collection", {
      target_credit_invoice_id: parsedId.data,
      collection_amount: payload.data.amount,
      collection_method: payload.data.paymentMethod,
      collection_reference: payload.data.referenceNo ?? null,
      collection_notes: payload.data.notes ?? null,
      collection_date: payload.data.collectedAt ?? null
    });

    if (error) return fromPostgrestError(error);
    return successResponse(data);
  }

  static async updateCreditStatus(creditInvoiceId: string, request: Request) {
    const parsedId = uuidSchema.safeParse(creditInvoiceId);
    if (!parsedId.success) return errorResponse(422, "INVALID_ID", "A valid credit invoice id is required.");

    const payload = creditStatusSchema.safeParse(await readJson(request));
    if (!payload.success) return errorResponse(422, "VALIDATION_ERROR", "Invalid credit status payload.", payload.error.flatten());

    const supabase = await createSupabaseServerClient();
    const { data, error } = await (supabase as never as {
      rpc: (name: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: Parameters<typeof fromPostgrestError>[0] | null }>;
    }).rpc("update_credit_invoice_status", {
      target_credit_invoice_id: parsedId.data,
      target_status: payload.data.status,
      status_notes: payload.data.notes ?? null
    });

    if (error) return fromPostgrestError(error);
    return successResponse(data);
  }

  static async listCheques() {
    const auth = await requireFeaturePermission("date_sheet", "view");
    if (auth.response) return auth.response;
    if (!auth.context?.organization) return errorResponse(403, "FORBIDDEN", "Organization access is required.");

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("report_cheques")
      .select("id, daily_report_id, invoice_no, customer_name, cheque_no, bank_name, branch_name, cheque_date, received_date, amount, status, notes, created_at")
      .order("received_date", { ascending: false })
      .limit(500);

    if (error) return fromPostgrestError(error);
    return successResponse({ items: data ?? [] });
  }

  static async updateChequeStatus(chequeId: string, request: Request) {
    const parsedId = uuidSchema.safeParse(chequeId);
    if (!parsedId.success) return errorResponse(422, "INVALID_ID", "A valid cheque id is required.");

    const payload = chequeStatusSchema.safeParse(await readJson(request));
    if (!payload.success) return errorResponse(422, "VALIDATION_ERROR", "Invalid cheque status payload.", payload.error.flatten());

    const supabase = await createSupabaseServerClient();
    const { data, error } = await (supabase as never as {
      rpc: (name: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: Parameters<typeof fromPostgrestError>[0] | null }>;
    }).rpc("update_report_cheque_status", {
      target_cheque_id: parsedId.data,
      target_status: payload.data.status,
      status_notes: payload.data.notes ?? null
    });

    if (error) return fromPostgrestError(error);
    return successResponse(data);
  }
}
