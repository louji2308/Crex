import type { ApiError, ApiResponse } from "@crex/schemas";
import { createId } from "@crex/schemas";
import { CrexError } from "./errors";

export function ok<T>(payload: T, requestId: string = createId()): ApiResponse<T> {
  return { success: true, payload, request_id: requestId };
}

export function fail<T = unknown>(
  error: ApiError | CrexError,
  requestId: string = createId(),
): ApiResponse<T> {
  const normalized: ApiError =
    error instanceof CrexError ? error.toApiError() : error;
  return { success: false, payload: null as T, request_id: requestId, error: normalized };
}