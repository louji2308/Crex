import { z } from "zod";

export const sourceUnderstandingSchema = z.strictObject({
  summary: z.string().min(1),
  claims: z.array(z.string().min(1)).min(1),
});

export type SourceUnderstanding = z.infer<typeof sourceUnderstandingSchema>;

export const claimExtractionSchema = z.strictObject({
  claims: z
    .array(
      z.strictObject({
        text: z.string().min(1),
        type: z.string().min(1),
        spans: z.array(
          z.strictObject({
            segment_index: z.number().int().nonnegative(),
            start: z.number().int().nonnegative(),
            end: z.number().int().nonnegative(),
          }),
        ),
      }),
    )
    .min(1),
});

export type ClaimExtraction = z.infer<typeof claimExtractionSchema>;

export const aiTaskContentSchema = z.discriminatedUnion("task", [
  z.strictObject({ task: z.literal("SEMANTIC_UNDERSTANDING"), content: sourceUnderstandingSchema }),
  z.strictObject({ task: z.literal("CLAIM_EXTRACTION"), content: claimExtractionSchema }),
]);

export type AiTaskContent = z.infer<typeof aiTaskContentSchema>;