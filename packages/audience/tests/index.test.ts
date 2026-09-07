import { describe, expect, it } from "vitest";
import { createId } from "@crex/schemas/src/helpers";
import type { AudienceObservation, AudienceProfile } from "@crex/schemas/src/audience";
import {
  aggregateProfile,
  computeInsights,
  generateRecommendations,
} from "../src/index";

describe("audience deterministic logic", () => {
  const projectId = createId();

  function makeObs(overrides: Partial<AudienceObservation> = {}): AudienceObservation {
    return {
      id: createId(),
      project_id: projectId,
      metric: "AGE_RANGE",
      value: "25-40",
      confidence: 0.8,
      source: "OBSERVED",
      dedupe_key: `obs-${Math.random()}`,
      created_at: new Date().toISOString(),
      ...overrides,
    };
  }

  describe("aggregateProfile", () => {
    it("aggregates observations by metric picking highest-priority source", () => {
      const obs = [
        makeObs({ metric: "AGE_RANGE", value: "18-25", source: "INFERRED", confidence: 0.5 }),
        makeObs({ metric: "AGE_RANGE", value: "25-40", source: "OBSERVED", confidence: 0.8 }),
        makeObs({ metric: "AGE_RANGE", value: "30-45", source: "CREATOR_DECLARED", confidence: 0.7 }),
      ];

      const result = aggregateProfile(projectId, obs);
      expect(result.profile.facts.AGE_RANGE?.value).toBe("30-45");
      expect(result.profile.facts.AGE_RANGE?.source).toBe("CREATOR_DECLARED");
      expect(result.observationCount).toBe(3);
      expect(result.factKeys).toContain("AGE_RANGE");
    });

    it("prefers higher confidence within the same source priority", () => {
      const obs = [
        makeObs({ metric: "INTERESTS", value: "battery", source: "OBSERVED", confidence: 0.6 }),
        makeObs({ metric: "INTERESTS", value: "gaming", source: "OBSERVED", confidence: 0.9 }),
      ];

      const result = aggregateProfile(projectId, obs);
      expect(result.profile.facts.INTERESTS?.value).toBe("gaming");
    });

    it("ignores observations from other projects", () => {
      const otherProject = createId();
      const obs = [
        makeObs({ project_id: otherProject, value: "other" }),
        makeObs({ project_id: projectId, value: "mine" }),
      ];
      const result = aggregateProfile(projectId, obs);
      expect(result.observationCount).toBe(2);
      expect(result.profile.facts.AGE_RANGE?.value).toBe("mine");
    });

    it("returns empty facts when no observations", () => {
      const result = aggregateProfile(projectId, []);
      expect(result.profile.facts).toEqual({});
      expect(result.observationCount).toBe(0);
    });
  });

  describe("computeInsights", () => {
    it("produces AGGREGATED_PROFILE insight when all agree", () => {
      const obs = [
        makeObs({ metric: "AGE_RANGE", value: "25-40" }),
        makeObs({ metric: "AGE_RANGE", value: "25-40" }),
        makeObs({ metric: "AGE_RANGE", value: "25-40" }),
      ];

      const { insights, hasSufficientData } = computeInsights(projectId, obs, []);
      const agg = insights.find((i) => i.type === "AGGREGATED_PROFILE");
      expect(agg).toBeDefined();
      expect(agg?.sample_size).toBe(3);
      expect(hasSufficientData).toBe(false);
    });

    it("produces DIVERGENCE insight when values differ", () => {
      const obs = [
        makeObs({ metric: "AGE_RANGE", value: "25-40" }),
        makeObs({ metric: "AGE_RANGE", value: "18-25" }),
        makeObs({ metric: "AGE_RANGE", value: "25-40" }),
      ];

      const { insights } = computeInsights(projectId, obs, []);
      expect(insights.some((i) => i.type === "DIVERGENCE")).toBe(true);
    });

    it("produces GAP insight when below minSampleSize", () => {
      const obs = [makeObs({ metric: "AGE_RANGE", value: "25-40" })];

      const { insights } = computeInsights(projectId, obs, [], 3);
      expect(insights.some((i) => i.type === "GAP")).toBe(true);
    });

    it("reports sufficient data when most metrics covered", () => {
      const metrics = [
        "AGE_RANGE", "KNOWLEDGE_LEVEL", "INTERESTS", "RISK_TOLERANCE",
        "PURCHASE_AUTHORITY", "CONTENT_FORMAT_PREFERENCE", "ENGAGEMENT_PATTERN", "BUYING_STAGE",
      ];
      const obs = metrics.slice(0, 6).map((metric) =>
        makeObs({ metric: metric as never, value: "same" }),
      );
      // plus 3 agreeing observations each on a couple metrics for aggregation
      const extra = [
        makeObs({ metric: "AGE_RANGE", value: "25-40" }),
        makeObs({ metric: "AGE_RANGE", value: "25-40" }),
        makeObs({ metric: "AGE_RANGE", value: "25-40" }),
      ];
      const { hasSufficientData } = computeInsights(projectId, [...obs, ...extra], []);
      expect(hasSufficientData).toBe(true);
    });
  });

  describe("generateRecommendations", () => {
    it("produces ACKNOWLEDGE_LIMITS when data insufficient", () => {
      const { insights, hasSufficientData } = computeInsights(projectId, [], []);
      const { recommendations } = generateRecommendations(projectId, insights, hasSufficientData);
      expect(recommendations.some((r) => r.type === "ACKNOWLEDGE_LIMITS")).toBe(true);
    });

    it("produces SPLIT recommendation on divergence", () => {
      const obs = [
        makeObs({ metric: "AGE_RANGE", value: "25-40" }),
        makeObs({ metric: "AGE_RANGE", value: "18-25" }),
        makeObs({ metric: "AGE_RANGE", value: "25-40" }),
      ];
      const { insights, hasSufficientData } = computeInsights(projectId, obs, []);
      const { recommendations } = generateRecommendations(projectId, insights, hasSufficientData);
      expect(recommendations.some((r) => r.type === "SPLIT")).toBe(true);
    });

    it("produces EXPAND recommendation on well-defined profile", () => {
      const metrics = [
        "AGE_RANGE", "KNOWLEDGE_LEVEL", "INTERESTS", "RISK_TOLERANCE",
        "PURCHASE_AUTHORITY", "CONTENT_FORMAT_PREFERENCE", "ENGAGEMENT_PATTERN", "BUYING_STAGE",
      ];
      const obs = [];
      for (const metric of metrics.slice(0, 4)) {
        obs.push(makeObs({ metric: metric as never, value: "same" }));
        obs.push(makeObs({ metric: metric as never, value: "same" }));
        obs.push(makeObs({ metric: metric as never, value: "same" }));
      }
      const { insights, hasSufficientData } = computeInsights(projectId, obs, []);
      expect(hasSufficientData).toBe(true);
      expect(insights.some((i) => i.type === "AGGREGATED_PROFILE")).toBe(true);
      const { recommendations } = generateRecommendations(projectId, insights, hasSufficientData);
      expect(recommendations.some((r) => r.type === "EXPAND")).toBe(true);
    });

    it("all recommendations have deterministic base in this path", () => {
      const { insights, hasSufficientData } = computeInsights(projectId, [], []);
      const { recommendations } = generateRecommendations(projectId, insights, hasSufficientData);
      for (const rec of recommendations) {
        expect(rec.base).toBe("DETERMINISTIC");
        expect(rec.evidence.length).toBeGreaterThan(0);
      }
    });
  });
});
