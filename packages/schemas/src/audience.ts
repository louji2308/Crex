import { z } from "zod";
import { isoDateTimeSchema, scoreSchema, uuidSchema } from "./primitives";

export const AUDIENCE_FACT_SOURCE = [
  "CREATOR_DECLARED",
  "OBSERVED",
  "INFERRED",
] as const;

export const AUDIENCE_METRIC = [
  "AGE_RANGE",
  "KNOWLEDGE_LEVEL",
  "INTERESTS",
  "RISK_TOLERANCE",
  "PURCHASE_AUTHORITY",
  "CONTENT_FORMAT_PREFERENCE",
  "ENGAGEMENT_PATTERN",
  "BUYING_STAGE",
] as const;

export const AUDIENCE_INSIGHT_TYPE = [
  "AGGREGATED_PROFILE",
  "COMPLEMENTARY_AUDIENCE",
  "DIVERGENCE",
  "GAP",
  "DATA_INSUFFICIENT",
] as const;

export const AUDIENCE_RECOMMENDATION_TYPE = [
  "EXPAND",
  "NARROW",
  "REFRAME",
  "SPLIT",
  "ACKNOWLEDGE_LIMITS",
] as const;

export const RECOMMENDATION_BASE = [
  "DETERMINISTIC",
  "AI_INTERPRETATION",
  "COMBINED",
] as const;

export const audienceFactSourceSchema = z.enum(AUDIENCE_FACT_SOURCE);
export const audienceMetricSchema = z.enum(AUDIENCE_METRIC);
export const audienceInsightTypeSchema = z.enum(AUDIENCE_INSIGHT_TYPE);
export const audienceRecommendationTypeSchema = z.enum(AUDIENCE_RECOMMENDATION_TYPE);
export const recommendationBaseSchema = z.enum(RECOMMENDATION_BASE);

export const audienceFactValueSchema = z.strictObject({
  value: z.string().min(1),
  source: audienceFactSourceSchema,
  confidence: z.number().min(0).max(1).optional(),
});

export type AudienceFactValue = z.infer<typeof audienceFactValueSchema>;

export const audienceProfileSchema = z.strictObject({
  id: uuidSchema,
  project_id: uuidSchema,
  name: z.string().min(1),
  facts: z.record(audienceMetricSchema, audienceFactValueSchema),
  summary: z.string().min(1).optional(),
  created_at: isoDateTimeSchema,
  updated_at: isoDateTimeSchema,
});

export type AudienceProfile = z.infer<typeof audienceProfileSchema>;

export const audienceObservationSchema = z.strictObject({
  id: uuidSchema,
  project_id: uuidSchema,
  metric: audienceMetricSchema,
  value: z.string().min(1),
  confidence: z.number().min(0).max(1),
  source_asset_id: uuidSchema.optional(),
  source: audienceFactSourceSchema,
  dedupe_key: z.string().min(1),
  created_at: isoDateTimeSchema,
});

export type AudienceObservation = z.infer<typeof audienceObservationSchema>;

export const audienceInsightSchema = z.strictObject({
  id: uuidSchema,
  project_id: uuidSchema,
  type: audienceInsightTypeSchema,
  summary: z.string().min(1),
  evidence: z.array(uuidSchema).min(1),
  sample_size: z.number().int().nonnegative(),
  confidence: z.number().min(0).max(1),
  created_at: isoDateTimeSchema,
});

export type AudienceInsight = z.infer<typeof audienceInsightSchema>;

export const audienceRecommendationSchema = z.strictObject({
  id: uuidSchema,
  project_id: uuidSchema,
  type: audienceRecommendationTypeSchema,
  base: recommendationBaseSchema,
  statement: z.string().min(1),
  rationale: z.string().min(1),
  evidence: z.array(uuidSchema).min(1),
  limitations: z.array(z.string().min(1)),
  created_at: isoDateTimeSchema,
});

export type AudienceRecommendation = z.infer<typeof audienceRecommendationSchema>;

export const audienceContextSchema = z.strictObject({
  project_id: uuidSchema,
  primary_profile: audienceProfileSchema.nullable(),
  complementary_profiles: z.array(audienceProfileSchema),
  insights: z.array(audienceInsightSchema),
  recommendations: z.array(audienceRecommendationSchema),
  has_sufficient_data: z.boolean(),
  created_at: isoDateTimeSchema,
});

export type AudienceContext = z.infer<typeof audienceContextSchema>;
