import { probeMediaFile, type MediaProbe } from "./probe";

export const MEDIA_VALIDATION_REASONS = [
  "empty_file",
  "too_large",
  "unsupported_container",
  "missing_streams",
] as const;

export type MediaValidationReason = (typeof MEDIA_VALIDATION_REASONS)[number];

export interface MediaValidation {
  valid: boolean;
  reason?: MediaValidationReason;
  media?: MediaProbe;
}

export interface ValidateMediaOptions {
  maxSizeBytes?: number;
}

export function validateMediaFile(
  bytes: Uint8Array,
  opts?: ValidateMediaOptions,
): MediaValidation {
  if (bytes.length === 0) {
    return { valid: false, reason: "empty_file" };
  }
  if (opts?.maxSizeBytes !== undefined && bytes.length > opts.maxSizeBytes) {
    return { valid: false, reason: "too_large" };
  }
  const media = probeMediaFile(bytes);
  if (media.container === "") {
    return { valid: false, reason: "unsupported_container" };
  }
  if (media.video === null && media.audio === null) {
    return { valid: false, reason: "missing_streams" };
  }
  return { valid: true, media };
}