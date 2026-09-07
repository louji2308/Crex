import { CrexError } from "@crex/core/src/errors";

export class ProviderRateLimitError extends CrexError {
  constructor(provider: string, message: string, options?: { cause?: unknown }) {
    super("PROVIDER_RATE_LIMIT", message, {
      details: { provider },
      retryable: true,
      cause: options?.cause,
    });
    this.name = "ProviderRateLimitError";
  }
}

export class ProviderTimeoutError extends CrexError {
  constructor(provider: string, message: string, options?: { cause?: unknown }) {
    super("PROVIDER_TIMEOUT", message, {
      details: { provider },
      retryable: true,
      cause: options?.cause,
    });
    this.name = "ProviderTimeoutError";
  }
}

export class ProviderAuthFailedError extends CrexError {
  constructor(provider: string, message: string, options?: { cause?: unknown }) {
    super("PROVIDER_AUTH_FAILED", message, {
      details: { provider },
      retryable: false,
      cause: options?.cause,
    });
    this.name = "ProviderAuthFailedError";
  }
}

export class ProviderNotFoundError extends CrexError {
  constructor(provider: string, message: string, options?: { cause?: unknown }) {
    super("PROVIDER_NOT_FOUND", message, {
      details: { provider },
      retryable: false,
      cause: options?.cause,
    });
    this.name = "ProviderNotFoundError";
  }
}

export class ProviderInvalidRequestError extends CrexError {
  constructor(provider: string, message: string, options?: { cause?: unknown }) {
    super("PROVIDER_INVALID_REQUEST", message, {
      details: { provider },
      retryable: false,
      cause: options?.cause,
    });
    this.name = "ProviderInvalidRequestError";
  }
}

export class ProviderUnavailableError extends CrexError {
  constructor(provider: string, message: string, options?: { cause?: unknown }) {
    super("PROVIDER_UNAVAILABLE", message, {
      details: { provider },
      retryable: true,
      cause: options?.cause,
    });
    this.name = "ProviderUnavailableError";
  }
}

export class ProviderParseError extends CrexError {
  constructor(provider: string, message: string, options?: { cause?: unknown }) {
    super("PROVIDER_PARSE_ERROR", message, {
      details: { provider },
      retryable: true,
      cause: options?.cause,
    });
    this.name = "ProviderParseError";
  }
}

export class ProviderSchemaRejectionError extends CrexError {
  constructor(provider: string, message: string, options?: { cause?: unknown }) {
    super("PROVIDER_SCHEMA_REJECTION", message, {
      details: { provider },
      retryable: true,
      cause: options?.cause,
    });
    this.name = "ProviderSchemaRejectionError";
  }
}

export function isRetryableProviderError(error: unknown): boolean {
  return error instanceof CrexError && error.retryable === true;
}
