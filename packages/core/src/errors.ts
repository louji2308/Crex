import { apiErrorSchema, type ApiError } from "@crex/schemas";

export class CrexError extends Error {
  readonly code: string;
  readonly details: Record<string, unknown> | undefined;
  readonly retryable: boolean;

  constructor(
    code: string,
    message: string,
    options?: { details?: Record<string, unknown>; retryable?: boolean; cause?: unknown },
  ) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = "CrexError";
    this.code = code;
    this.details = options?.details;
    this.retryable = options?.retryable ?? false;
  }

  toApiError(): ApiError {
    const result = apiErrorSchema.safeParse({
      code: this.code,
      message: this.message,
      ...(this.details === undefined ? {} : { details: this.details }),
      ...(this.retryable ? { retryable: true } : {}),
    });
    if (!result.success) {
      throw new Error(`CrexError could not be encoded as ApiError: ${result.error.message}`);
    }
    return result.data;
  }
}