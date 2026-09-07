import { z } from "zod";
import { isoDateTimeSchema, uuidSchema } from "./primitives";
import { aiTaskSchema } from "./enums";

export const apiErrorSchema = z.strictObject({
  code: z.string().min(1),
  message: z.string().min(1),
  details: z.record(z.string(), z.unknown()).optional(),
  retryable: z.boolean().optional(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

export interface ApiResponse<T = unknown> {
  success: boolean;
  payload: T;
  request_id: string;
  error?: ApiError;
}

export function apiResponseSchema<T>(
  payload: z.ZodType<T>,
): z.ZodType<ApiResponse<T>> {
  return z
    .strictObject({
      success: z.boolean(),
      payload,
      request_id: uuidSchema,
      error: apiErrorSchema.optional(),
    })
    .superRefine((response, ctx) => {
      if (response.success && response.error !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["error"],
          message: "error must be absent when success is true",
        });
      }
      if (!response.success && response.error === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["error"],
          message: "error is required when success is false",
        });
      }
    }) as z.ZodType<ApiResponse<T>>;
}

export const aiOutputSchema = z.strictObject({
  id: uuidSchema,
  task: aiTaskSchema,
  provider: z.string().min(1),
  model: z.string().min(1),
  raw_output: z.string(),
  normalized: z.unknown(),
  schema_version: z.string().min(1),
  valid: z.boolean(),
  validation_errors: z.array(z.string().min(1)),
  fallback_used: z.boolean(),
  created_at: isoDateTimeSchema,
});

export type AiOutput = z.infer<typeof aiOutputSchema>;