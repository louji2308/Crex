import { CrexError } from "@crex/core/src/errors";
import type { ApiError } from "@crex/schemas/src/api";

const STATUS_BY_CODE: Readonly<Record<string, number>> = {
  INVALID_BODY: 400,
  INVALID_PROJECT_ID: 400,
  INVALID_WORKFLOW_ID: 400,
  INVALID_AI_REQUEST: 400,
  INVALID_WORKFLOW_PHASE: 400,
  INVALID_WORKFLOW_STAGE: 400,
  INVALID_WORKFLOW_TRANSITION: 400,
  INVALID_WORKFLOW_STATE: 400,
  INVALID_AI_OUTPUT: 400,
  INVALID_FILE_NAME: 400,
  INVALID_SOURCE_ID: 400,
  INVALID_ASSET_TYPES: 400,
  PROJECT_NOT_FOUND: 404,
  WORKFLOW_STATE_MISSING: 404,
  INSTANCE_NOT_FOUND: 404,
  AI_OUTPUT_NOT_FOUND: 404,
  UPLOAD_NOT_FOUND: 404,
  SOURCE_NOT_FOUND: 404,
  UNDERSTANDING_NOT_FOUND: 404,
  TRANSCRIPT_NOT_FOUND: 404,
  INVALID_UNDERSTANDING_STATE: 409,
  INVALID_UNDERSTANDING_ID: 400,
  CLAIM_NOT_FOUND: 404,
  GENERATED_ASSET_NOT_FOUND: 404,
  VERIFICATION_RUN_NOT_FOUND: 404,
  REPAIR_ACTION_NOT_FOUND: 404,
  ASSET_NOT_FOUND: 404,
  PASSPORT_NOT_FOUND: 404,
  INVALID_PASSPORT_STATE: 409,
  INVALID_ASSET_ID: 400,
  INVALID_ASSET_STATE: 409,
  INVALID_REPAIR_STATE: 409,
  INVALID_REPAIR_REQUEST: 400,
  NOT_FOUND: 404,
  SOURCE_UPLOAD_STATE: 409,
  INVALID_SOURCE_STATE: 409,
  NO_CLAIMS: 409,
  SOURCE_CHECKSUM_MISMATCH: 409,
  SOURCE_TOO_LARGE: 413,
  STORAGE_UPLOAD_FAILED: 502,
  STORAGE_READ_FAILED: 502,
  GENERATION_FAILED: 502,
  AI_NOT_CONFIGURED: 503,
  INFRASTRUCTURE_UNAVAILABLE: 503,
};

export function toHttpStatus(code: string): number {
  return STATUS_BY_CODE[code] ?? 500;
}

export function errorResponse(error: unknown): Response {
  const apiError: ApiError =
    error instanceof CrexError
      ? error.toApiError()
      : {
          code: "INTERNAL_ERROR",
          message: error instanceof Error ? error.message : "internal error",
        };
  return Response.json({ error: apiError }, { status: toHttpStatus(apiError.code) });
}

export function errorResponseForCode(code: string, message: string): Response {
  return errorResponse(new CrexError(code, message));
}