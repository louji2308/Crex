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
  PROJECT_NOT_FOUND: 404,
  WORKFLOW_STATE_MISSING: 404,
  INSTANCE_NOT_FOUND: 404,
  AI_OUTPUT_NOT_FOUND: 404,
  NOT_FOUND: 404,
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