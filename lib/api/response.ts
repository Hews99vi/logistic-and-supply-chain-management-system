import { NextResponse } from "next/server";
import type { PostgrestError } from "@supabase/supabase-js";
import { ZodError } from "zod";

import {
  ApiError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError
} from "@/lib/errors/api-error";

export type ApiSuccessResponse<T> = {
  data: T;
};

export type ApiErrorResponse = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export function successResponse<T>(data: T, init?: ResponseInit) {
  return NextResponse.json<ApiSuccessResponse<T>>({ data }, init);
}

export function errorResponse(status: number, code: string, message: string, details?: unknown) {
  return NextResponse.json<ApiErrorResponse>({
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {})
    }
  }, { status });
}

export function toErrorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return errorResponse(error.status, error.code, error.message, error.details);
  }

  if (error instanceof ZodError) {
    return errorResponse(422, "VALIDATION_ERROR", "Validation failed.", error.flatten());
  }

  if (error instanceof Error) {
    return errorResponse(500, "INTERNAL_SERVER_ERROR", error.message);
  }

  return errorResponse(500, "INTERNAL_SERVER_ERROR", "An unexpected error occurred.");
}

export function fromPostgrestError(error: PostgrestError) {
  switch (error.code) {
    case "42501":
      return toErrorResponse(new ForbiddenError(error.message, error.details));
    case "23505":
      return toErrorResponse(new ConflictError(error.message, error.details));
    case "P0002":
      return toErrorResponse(new NotFoundError(error.message, error.details));
    default:
      return errorResponse(400, error.code || "DATABASE_ERROR", error.message, error.details);
  }
}

export function mapUnknownError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  if (error instanceof ZodError) {
    return new ValidationError("Validation failed.", error.flatten());
  }

  if (error instanceof Error) {
    return new ApiError(500, "INTERNAL_SERVER_ERROR", error.message);
  }

  return new ApiError(500, "INTERNAL_SERVER_ERROR", "An unexpected error occurred.");
}

export function parseOrThrow<T>(result: { success: true; data: T } | { success: false; error: ZodError }, message = "Validation failed.") {
  if (!result.success) {
    throw new ValidationError(message, result.error.flatten());
  }

  return result.data;
}

export function requireValue<T>(value: T | null | undefined, error: ApiError): T {
  if (value === null || value === undefined) {
    throw error;
  }

  return value;
}

export async function handleRoute<T>(handler: () => Promise<Response | T>) {
  try {
    const result = await handler();
    if (result instanceof Response) {
      return result;
    }

    return successResponse(result as T);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export {
  ApiError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError
};