import {
  audienceFactSourceSchema,
  audienceInsightTypeSchema,
  audienceMetricSchema,
  audienceRecommendationTypeSchema,
  recommendationBaseSchema,
  type AudienceFactValue,
  type AudienceInsight,
  type AudienceObservation,
  type AudienceProfile,
  type AudienceRecommendation,
} from "@crex/schemas/src/audience";
import { createId, nowIso } from "@crex/schemas/src/helpers";

export interface AggregationResult {
  profile: AudienceProfile;
  observationCount: number;
  factKeys: string[];
}

export function aggregateProfile(
  projectId: string,
  observations: AudienceObservation[],
  profileId?: string,
  profileName?: string,
): AggregationResult {
  const byMetric = new Map<string, AudienceObservation[]>();

  for (const obs of observations) {
    if (obs.project_id !== projectId) {
      continue;
    }
    const existing = byMetric.get(obs.metric) ?? [];
    existing.push(obs);
    byMetric.set(obs.metric, existing);
  }

  const facts: Record<string, AudienceFactValue> = {};

  for (const [metric, obsList] of byMetric) {
    const best = pickBestObservation(obsList);
    if (best) {
      facts[metric] = {
        value: best.value,
        source: best.source,
        confidence: best.confidence,
      };
    }
  }

  const id = profileId ?? createId();
  const now = nowIso();

  const profile: AudienceProfile = {
    id,
    project_id: projectId,
    name: profileName ?? "Aggregated Profile",
    facts,
    created_at: now,
    updated_at: now,
  };

  return {
    profile,
    observationCount: observations.length,
    factKeys: Object.keys(facts),
  };
}

function pickBestObservation(observations: AudienceObservation[]): AudienceObservation | undefined {
  if (observations.length === 0) {
    return undefined;
  }

  const sorted = [...observations].sort((a, b) => {
    const sourcePriority: Record<string, number> = {
      CREATOR_DECLARED: 3,
      OBSERVED: 2,
      INFERRED: 1,
    };
    const aPriority = sourcePriority[a.source] ?? 0;
    const bPriority = sourcePriority[b.source] ?? 0;

    if (aPriority !== bPriority) {
      return bPriority - aPriority;
    }
    return b.confidence - a.confidence;
  });

  return sorted[0];
}

export interface InsightResult {
  insights: AudienceInsight[];
  hasSufficientData: boolean;
}

export function computeInsights(
  projectId: string,
  observations: AudienceObservation[],
  profiles: AudienceProfile[],
  minSampleSize: number = 3,
): InsightResult {
  const projectObs = observations.filter((o) => o.project_id === projectId);
  const byMetric = groupByMetric(projectObs);

  const insights: AudienceInsight[] = [];
  const now = nowIso();

  for (const [metric, obsList] of byMetric) {
    if (obsList.length >= minSampleSize) {
      const values = obsList.map((o) => o.value);
      const uniqueValues = [...new Set(values)];

      if (uniqueValues.length === 1) {
        insights.push({
          id: createId(),
          project_id: projectId,
          type: "AGGREGATED_PROFILE",
          summary: `All ${obsList.length} observations agree on ${metric}: "${uniqueValues[0]}"`,
          evidence: obsList.map((o) => o.id),
          sample_size: obsList.length,
          confidence: averageConfidence(obsList),
          created_at: now,
        });
      } else if (uniqueValues.length > 1) {
        insights.push({
          id: createId(),
          project_id: projectId,
          type: "DIVERGENCE",
          summary: `Divergent observations for ${metric}: ${uniqueValues.join(", ")}`,
          evidence: obsList.map((o) => o.id),
          sample_size: obsList.length,
          confidence: averageConfidence(obsList),
          created_at: now,
        });
      }
    } else if (obsList.length > 0 && obsList.length < minSampleSize) {
      insights.push({
        id: createId(),
        project_id: projectId,
        type: "GAP",
        summary: `Insufficient data for ${metric}: only ${obsList.length} observations (need ${minSampleSize})`,
        evidence: obsList.map((o) => o.id),
        sample_size: obsList.length,
        confidence: averageConfidence(obsList),
        created_at: now,
      });
    }
  }

  const totalMetrics = Object.keys(audienceMetricSchema.enum).length;
  const coveredMetrics = byMetric.size;
  const hasSufficientData = coveredMetrics >= Math.ceil(totalMetrics * 0.5);

  if (!hasSufficientData) {
    insights.push({
      id: createId(),
      project_id: projectId,
      type: "DATA_INSUFFICIENT",
      summary: `Only ${coveredMetrics}/${totalMetrics} audience metrics have observations`,
      evidence: projectObs.slice(0, 10).map((o) => o.id),
      sample_size: projectObs.length,
      confidence: projectObs.length > 0 ? averageConfidence(projectObs) : 0,
      created_at: now,
    });
  }

  return { insights, hasSufficientData };
}

function groupByMetric(observations: AudienceObservation[]): Map<string, AudienceObservation[]> {
  const map = new Map<string, AudienceObservation[]>();
  for (const obs of observations) {
    const existing = map.get(obs.metric) ?? [];
    existing.push(obs);
    map.set(obs.metric, existing);
  }
  return map;
}

function averageConfidence(observations: AudienceObservation[]): number {
  if (observations.length === 0) return 0;
  const sum = observations.reduce((acc, obs) => acc + obs.confidence, 0);
  return Math.round((sum / observations.length) * 100) / 100;
}

export interface RecommendationResult {
  recommendations: AudienceRecommendation[];
}

export function generateRecommendations(
  projectId: string,
  insights: AudienceInsight[],
  hasSufficientData: boolean,
): RecommendationResult {
  const now = nowIso();
  const recommendations: AudienceRecommendation[] = [];

  if (!hasSufficientData) {
    const gapInsights = insights.filter((i) => i.type === "GAP" || i.type === "DATA_INSUFFICIENT");
    if (gapInsights.length > 0) {
      recommendations.push({
        id: createId(),
        project_id: projectId,
        type: "ACKNOWLEDGE_LIMITS",
        base: "DETERMINISTIC",
        statement: "Audience data is insufficient for reliable targeting",
        rationale: `Only ${gapInsights.length} metrics have data. Collect more observations before making targeting decisions.`,
        evidence: gapInsights.map((i) => i.id),
        limitations: [
          "Profile may not represent the actual audience",
          "Recommendations based on limited data may be misleading",
        ],
        created_at: now,
      });
    }
  }

  const divergences = insights.filter((i) => i.type === "DIVERGENCE");
  for (const div of divergences) {
    recommendations.push({
      id: createId(),
      project_id: projectId,
      type: "SPLIT",
      base: "DETERMINISTIC",
      statement: `Consider audience segmentation for: ${div.summary}`,
      rationale: "Divergent observations suggest multiple audience segments with different needs.",
      evidence: [div.id],
      limitations: [
        "Segmentation increases complexity",
        "May reduce reach per segment",
      ],
      created_at: now,
    });
  }

  const aggregations = insights.filter((i) => i.type === "AGGREGATED_PROFILE");
  if (aggregations.length > 0 && hasSufficientData) {
    recommendations.push({
      id: createId(),
      project_id: projectId,
      type: "EXPAND",
      base: "DETERMINISTIC",
      statement: "Audience profile is well-defined — expand reach with confidence",
      rationale: `${aggregations.length} metrics have consistent observations. The profile is reliable for targeting.`,
      evidence: aggregations.map((i) => i.id),
      limitations: [
        "Profile reflects past observations, not future behavior",
        "New segments may not match current profile",
      ],
      created_at: now,
    });
  }

  return { recommendations };
}
