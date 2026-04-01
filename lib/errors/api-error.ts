export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "DATABASE_ERROR"
  | "INTERNAL_SERVER_ERROR"
  | string;

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details?: unknown;

  constructor(status: number, code: ApiErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends ApiError {
  constructor(message = "Validation failed.", details?: unknown, code: ApiErrorCode = "VALIDATION_ERROR") {
    super(422, code, message, details);
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = "Authentication required.", details?: unknown, code: ApiErrorCode = "UNAUTHORIZED") {
    super(401, code, message, details);
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = "Insufficient permissions.", details?: unknown, code: ApiErrorCode = "FORBIDDEN") {
    super(403, code, message, details);
  }
}

export class NotFoundError extends ApiError {
  constructor(message = "Resource not found.", details?: unknown, code: ApiErrorCode = "NOT_FOUND") {
    super(404, code, message, details);
  }
}

export class ConflictError extends ApiError {
  constructor(message = "Conflict.", details?: unknown, code: ApiErrorCode = "CONFLICT") {
    super(409, code, message, details);
  }
}