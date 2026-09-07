import { describe, expect, it } from "vitest";
import {
  audienceProfileSchema,
  audienceObservationSchema,
  audienceInsightSchema,
  audienceRecommendationSchema,
  audienceContextSchema,
  audienceFactSourceSchema,
  audienceMetricSchema,
  audienceInsightTypeSchema,
  audienceRecommendationTypeSchema,
  recommendationBaseSchema,
} from "../src/audience";
import { createId, nowIso } from "../src/helpers";

describe("audience schemas", () => {
  const now = nowIso();

  describe("audienceFactSourceSchema", () => {
    it("accepts valid sources", () => {
      expect(audienceFactSourceSchema.parse("CREATOR_DECLARED")).toBe("CREATOR_DECLARED");
      expect(audienceFactSourceSchema.parse("OBSERVED")).toBe("OBSERVED");
      expect(audienceFactSourceSchema.parse("INFERRED")).toBe("INFERRED");
    });

    it("rejects invalid source", () => {
      expect(() => audienceFactSourceSchema.parse("UNKNOWN")).toThrow();
    });
  });

  describe("audienceMetricSchema", () => {
    it("accepts all valid metrics", () => {
      const metrics = [
        "AGE_RANGE", "KNOWLEDGE_LEVEL", "INTERESTS", "RISK_TOLERANCE",
        "PURCHASE_AUTHORITY", "CONTENT_FORMAT_PREFERENCE", "ENGAGEMENT_PATTERN", "BUYING_STAGE",
      ];
      for (const metric of metrics) {
        expect(audienceMetricSchema.parse(metric)).toBe(metric);
      }
    });

    it("rejects invalid metric", () => {
      expect(() => audienceMetricSchema.parse("INVALID")).toThrow();
    });
  });

  describe("audienceProfileSchema", () => {
    it("accepts a valid profile", () => {
      const profile = {
        id: createId(),
        project_id: createId(),
        name: "Tech-Savvy Developers",
        facts: {
          AGE_RANGE: { value: "25-40", source: "OBSERVED", confidence: 0.85 },
          KNOWLEDGE_LEVEL: { value: "expert", source: "CREATOR_DECLARED" },
        },
        summary: "Developers aged 25-40 with expert knowledge",
        created_at: now,
        updated_at: now,
      };
      const result = audienceProfileSchema.parse(profile);
      expect(result.id).toBe(profile.id);
      expect(result.facts.AGE_RANGE?.value).toBe("25-40");
      expect(result.facts.KNOWLEDGE_LEVEL?.source).toBe("CREATOR_DECLARED");
    });

    it("accepts profile without optional fields", () => {
      const profile = {
        id: createId(),
        project_id: createId(),
        name: "Minimal Profile",
        facts: {},
        created_at: now,
        updated_at: now,
      };
      const result = audienceProfileSchema.parse(profile);
      expect(result.summary).toBeUndefined();
    });

    it("rejects empty name", () => {
      expect(() =>
        audienceProfileSchema.parse({
          id: createId(),
          project_id: createId(),
          name: "",
          facts: {},
          created_at: now,
          updated_at: now,
        }),
      ).toThrow();
    });
  });

  describe("audienceObservationSchema", () => {
    it("accepts a valid observation", () => {
      const obs = {
        id: createId(),
        project_id: createId(),
        metric: "AGE_RANGE" as const,
        value: "25-40",
        confidence: 0.85,
        source: "OBSERVED" as const,
        dedupe_key: "obs-age-range-1",
        created_at: now,
      };
      const result = audienceObservationSchema.parse(obs);
      expect(result.confidence).toBe(0.85);
    });

    it("rejects confidence out of range", () => {
      expect(() =>
        audienceObservationSchema.parse({
          id: createId(),
          project_id: createId(),
          metric: "AGE_RANGE",
          value: "25-40",
          confidence: 1.5,
          source: "OBSERVED",
          dedupe_key: "obs-1",
          created_at: now,
        }),
      ).toThrow();
    });

    it("accepts optional source_asset_id", () => {
      const obs = {
        id: createId(),
        project_id: createId(),
        metric: "INTERESTS" as const,
        value: "battery performance",
        confidence: 0.9,
        source_asset_id: createId(),
        source: "INFERRED" as const,
        dedupe_key: "obs-interests-1",
        created_at: now,
      };
      const result = audienceObservationSchema.parse(obs);
      expect(result.source_asset_id).toBeDefined();
    });
  });

  describe("audienceInsightSchema", () => {
    it("accepts a valid insight", () => {
      const insight = {
        id: createId(),
        project_id: createId(),
        type: "AGGREGATED_PROFILE" as const,
        summary: "All observations agree on AGE_RANGE: 25-40",
        evidence: [createId(), createId()],
        sample_size: 5,
        confidence: 0.8,
        created_at: now,
      };
      const result = audienceInsightSchema.parse(insight);
      expect(result.evidence).toHaveLength(2);
    });

    it("rejects empty evidence", () => {
      expect(() =>
        audienceInsightSchema.parse({
          id: createId(),
          project_id: createId(),
          type: "GAP",
          summary: "No data",
          evidence: [],
          sample_size: 0,
          confidence: 0,
          created_at: now,
        }),
      ).toThrow();
    });
  });

  describe("audienceRecommendationSchema", () => {
    it("accepts a valid recommendation", () => {
      const rec = {
        id: createId(),
        project_id: createId(),
        type: "EXPAND" as const,
        base: "DETERMINISTIC" as const,
        statement: "Expand reach",
        rationale: "Profile is well-defined",
        evidence: [createId()],
        limitations: ["Limited to past observations"],
        created_at: now,
      };
      const result = audienceRecommendationSchema.parse(rec);
      expect(result.base).toBe("DETERMINISTIC");
    });

    it("accepts AI_INTERPRETATION base", () => {
      const rec = {
        id: createId(),
        project_id: createId(),
        type: "REFRAME" as const,
        base: "AI_INTERPRETATION" as const,
        statement: "Reframe messaging",
        rationale: "AI analysis suggests alternative framing",
        evidence: [createId()],
        limitations: [],
        created_at: now,
      };
      const result = audienceRecommendationSchema.parse(rec);
      expect(result.base).toBe("AI_INTERPRETATION");
    });
  });

  describe("audienceContextSchema", () => {
    it("accepts a valid context", () => {
      const ctx = {
        project_id: createId(),
        primary_profile: {
          id: createId(),
          project_id: createId(),
          name: "Primary",
          facts: {},
          created_at: now,
          updated_at: now,
        },
        complementary_profiles: [],
        insights: [],
        recommendations: [],
        has_sufficient_data: true,
        created_at: now,
      };
      const result = audienceContextSchema.parse(ctx);
      expect(result.has_sufficient_data).toBe(true);
    });

    it("accepts null primary profile", () => {
      const ctx = {
        project_id: createId(),
        primary_profile: null,
        complementary_profiles: [],
        insights: [],
        recommendations: [],
        has_sufficient_data: false,
        created_at: now,
      };
      const result = audienceContextSchema.parse(ctx);
      expect(result.primary_profile).toBeNull();
    });
  });
});
