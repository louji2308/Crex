import { D1Adapter } from "@crex/infra";
import { ClaimRepository } from "@crex/db/src/repositories/claims";
import { EvidenceRepository } from "@crex/db/src/repositories/evidence";
import { ConstraintRepository } from "@crex/db/src/repositories/constraints";
import { SponsorRequirementRepository } from "@crex/db/src/repositories/sponsor-requirements";
import { GeneratedAssetRepository } from "@crex/db/src/repositories/generated-assets";
import { GeneratedComponentRepository } from "@crex/db/src/repositories/generated-components";
import type { ProviderOptions, ProviderRequest } from "@crex/ai";
import { assetGenerationSchema } from "@crex/schemas/src/ai-tasks";
import type { GeneratedAsset, GeneratedComponent, IntegrityScore, Claim } from "@crex/schemas";
import { CrexError } from "@crex/core/src/errors";
import { runGenerationTask } from "../workflows/ai-output";

export interface GenerationDeps {
  db: D1Adapter;
  now: () => string;
  uuid: () => string;
}

export interface GenerationResult {
  assetIds: string[];
  assetCount: number;
}

const VALID_ASSET_TYPES = [
  "YOUTUBE_TITLE",
  "YOUTUBE_DESCRIPTION",
  "YOUTUBE_CHAPTERS",
  "SHORT",
  "REEL",
  "TIKTOK",
  "SOCIAL_POST",
  "PINNED_COMMENT",
  "THUMBNAIL_CONCEPT",
] as const;

export async function runGeneration(
  deps: GenerationDeps,
  projectId: string,
  options: ProviderOptions,
  assetTypes?: string[],
): Promise<GenerationResult> {
  const { db, now, uuid } = deps;

  const claimsRepo = new ClaimRepository(db);
  const evidenceRepo = new EvidenceRepository(db);
  const constraintsRepo = new ConstraintRepository(db);
  const sponsorRequirementsRepo = new SponsorRequirementRepository(db);
  const assetsRepo = new GeneratedAssetRepository(db);
  const componentsRepo = new GeneratedComponentRepository(db);

  const claims = await claimsRepo.listByProject(projectId);
  if (claims.length === 0) {
    throw new CrexError("NO_CLAIMS", "project has no claims; cannot generate content");
  }

  const constraints = await constraintsRepo.listByProject(projectId);
  const sponsorRequirements = await sponsorRequirementsRepo.listByProject(projectId);

  const evidenceContext = await buildEvidenceContext(claims, evidenceRepo);
  const constraintContext = buildConstraintContext(constraints);
  const sponsorContext = buildSponsorContext(sponsorRequirements);
  const assetTypeList = assetTypes?.filter((t) => (VALID_ASSET_TYPES as readonly string[]).includes(t));

  const request = buildGenerationRequest(
    evidenceContext,
    constraintContext,
    sponsorContext,
    assetTypeList,
    claims,
  );

  const result = await runGenerationTask(request, options, assetGenerationSchema);
  if (!result.valid || result.normalized === undefined) {
    throw new CrexError("GENERATION_FAILED", `AI generation failed: ${result.validation_errors.join("; ")}`);
  }

  const parsed = assetGenerationSchema.parse(result.normalized);
  const createdAt = now();
  const assetIds: string[] = [];

  for (const assetData of parsed.assets) {
    const assetId = uuid();
    const integrity = computeIntegrityScore(claims, assetData, constraints, sponsorRequirements);

    const asset: GeneratedAsset = {
      id: assetId,
      project_id: projectId,
      asset_type: assetData.asset_type as GeneratedAsset["asset_type"],
      title: assetData.title,
      status: integrity.overall >= 80 ? "READY" : "REVIEW",
      integrity,
      created_at: createdAt,
      updated_at: createdAt,
    };

    await assetsRepo.insert(asset);

    for (const compData of assetData.components) {
      const component: GeneratedComponent = {
        component_id: uuid(),
        asset_id: assetId,
        content: compData.content,
        source_references: compData.source_references,
        claim_references: compData.claim_references,
        constraint_references: compData.constraint_references,
        generation_metadata: {
          engine: "crex-generation-v1",
          model: result.model,
        },
        verification_status: "REVIEW",
      };

      await componentsRepo.insert(component);
    }

    assetIds.push(assetId);
  }

  return { assetIds, assetCount: assetIds.length };
}

async function buildEvidenceContext(
  claims: Claim[],
  evidenceRepo: EvidenceRepository,
): Promise<string> {
  const parts: string[] = [];
  for (const claim of claims) {
    const evidenceItems = await evidenceRepo.listByClaim(claim.id);
    const evidenceTexts = evidenceItems.map((e) => `[${e.type}] ${e.content}`).join("; ");
    parts.push(`Claim [${claim.id}] (${claim.type}): ${claim.content}\nEvidence: ${evidenceTexts || "none"}`);
  }
  return parts.join("\n\n");
}

function buildConstraintContext(
  constraints: Array<{ id: string; category: string; summary: string; enabled: boolean }>,
): string {
  const enabled = constraints.filter((c) => c.enabled);
  if (enabled.length === 0) return "No constraints defined.";
  return enabled.map((c) => `- [${c.id}] (${c.category}) ${c.summary}`).join("\n");
}

function buildSponsorContext(
  requirements: Array<{ id: string; sponsor_name: string; requirement_type: string; value: string; required: boolean; enabled: boolean }>,
): string {
  const enabled = requirements.filter((r) => r.enabled);
  if (enabled.length === 0) return "No sponsor requirements defined.";
  return enabled.map((r) => `- [${r.id}] ${r.sponsor_name}: ${r.requirement_type} = "${r.value}"${r.required ? " (REQUIRED)" : ""}`).join("\n");
}

function buildGenerationRequest(
  evidenceContext: string,
  constraintContext: string,
  sponsorContext: string,
  assetTypes: string[] | undefined,
  claims: Claim[],
): ProviderRequest {
  const requestedTypes = assetTypes !== undefined && assetTypes.length > 0
    ? assetTypes.join(", ")
    : "YOUTUBE_TITLE, YOUTUBE_DESCRIPTION, YOUTUBE_CHAPTERS, SOCIAL_POST";

  const systemPrompt =
    "You are a content generation engine for advertising compliance. " +
    "Generate content assets (YouTube titles, descriptions, chapters, social posts, etc.) " +
    "based on the provided evidence, constraints, and sponsor requirements. " +
    "Every generated claim must trace to source evidence. " +
    "Respect all constraints and sponsor requirements strictly. " +
    "Respond with strict JSON matching the asset generation schema.";

  const userContent =
    `Generate the following asset types: ${requestedTypes}\n\n` +
    `## Evidence Context (claims and their evidence)\n${evidenceContext}\n\n` +
    `## Creator Constraints\n${constraintContext}\n\n` +
    `## Sponsor Requirements\n${sponsorContext}\n\n` +
    `Available claim IDs for reference: ${claims.map((c) => c.id).join(", ")}\n\n` +
    `For each component, include source_references and claim_references as UUID arrays referencing the relevant claim/evidence IDs. ` +
    `Include constraint_references for any constraints the component satisfies.`;

  return {
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    task: "ASSET_GENERATION",
    response_format: { type: "json_object" },
  };
}

function computeIntegrityScore(
  claims: Claim[],
  asset: { asset_type: string; title: string; components: Array<{ content: string; source_references: string[]; claim_references: string[]; constraint_references: string[] }> },
  constraints: Array<{ id: string; enabled: boolean }>,
  sponsorRequirements: Array<{ id: string; required: boolean; enabled: boolean }>,
): IntegrityScore {
  const reasons: string[] = [];

  const componentsWithClaims = asset.components.filter((c) => c.claim_references.length > 0);
  const evidenceCoverage = asset.components.length > 0
    ? Math.round((componentsWithClaims.length / asset.components.length) * 100)
    : 0;
  if (evidenceCoverage < 100) {
    reasons.push(`${asset.components.length - componentsWithClaims.length} components lack claim references`);
  }

  const referencedClaimIds = new Set(asset.components.flatMap((c) => c.claim_references));
  const claimFidelity = claims.length > 0
    ? Math.round((Math.min(referencedClaimIds.size, claims.length) / claims.length) * 100)
    : 0;
  if (claimFidelity < 100) {
    reasons.push(`${claims.length - referencedClaimIds.size} claims not referenced in generated content`);
  }

  const allText = asset.components.map((c) => c.content).join(" ") + " " + asset.title;
  const numericalPattern = /\b\d+(?:\.\d+)?\s*(?:%|percent|million|billion|thousand|hours|minutes|seconds|days|years)\b/gi;
  const numericalMatches = allText.match(numericalPattern);
  const numericalAccuracy = numericalMatches !== null && numericalMatches.length > 0 ? 80 : 100;
  if (numericalAccuracy < 100) {
    reasons.push("numerical claims present; requires manual verification");
  }

  const enabledConstraints = constraints.filter((c) => c.enabled);
  const referencedConstraints = new Set(asset.components.flatMap((c) => c.constraint_references));
  const creatorIntent = enabledConstraints.length > 0
    ? Math.round((Math.min(referencedConstraints.size, enabledConstraints.length) / enabledConstraints.length) * 100)
    : 100;
  if (creatorIntent < 100) {
    reasons.push(`${enabledConstraints.length - referencedConstraints.size} constraints not referenced`);
  }

  const requiredSponsors = sponsorRequirements.filter((r) => r.required && r.enabled);
  const referencedSponsors = new Set(asset.components.flatMap((c) => c.constraint_references));
  const sponsorCompliance = requiredSponsors.length > 0
    ? Math.round((Math.min(referencedSponsors.size, requiredSponsors.length) / requiredSponsors.length) * 100)
    : 100;
  if (sponsorCompliance < 100) {
    reasons.push(`${requiredSponsors.length} required sponsor requirements not addressed`);
  }

  let platformQa = 100;
  if (asset.asset_type === "YOUTUBE_TITLE" && asset.title.length > 100) {
    platformQa -= 20;
    reasons.push("YouTube title exceeds 100 characters");
  }
  if (asset.asset_type === "YOUTUBE_DESCRIPTION") {
    const descComponent = asset.components[0];
    if (descComponent !== undefined && descComponent.content.length > 5000) {
      platformQa -= 20;
      reasons.push("YouTube description exceeds 5000 characters");
    }
  }

  const overall = Math.round(
    evidenceCoverage * 0.2 +
    claimFidelity * 0.25 +
    numericalAccuracy * 0.15 +
    creatorIntent * 0.2 +
    sponsorCompliance * 0.1 +
    platformQa * 0.1,
  );

  if (reasons.length === 0) {
    reasons.push("all checks passed");
  }

  return {
    dimensions: {
      evidence_coverage: evidenceCoverage,
      claim_fidelity: claimFidelity,
      numerical_accuracy: numericalAccuracy,
      creator_intent: creatorIntent,
      sponsor_compliance: sponsorCompliance,
      platform_qa: platformQa,
    },
    overall,
    reasons,
  };
}
