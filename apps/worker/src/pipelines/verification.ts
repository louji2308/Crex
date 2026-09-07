import { D1Adapter } from "@crex/infra";
import { VerificationRunRepository } from "@crex/db/src/repositories/verification-runs";
import { VerificationFindingRepository } from "@crex/db/src/repositories/verification-findings";
import { GeneratedAssetRepository } from "@crex/db/src/repositories/generated-assets";
import { GeneratedComponentRepository } from "@crex/db/src/repositories/generated-components";
import { ClaimRepository } from "@crex/db/src/repositories/claims";
import { EvidenceRepository } from "@crex/db/src/repositories/evidence";
import { ConstraintRepository } from "@crex/db/src/repositories/constraints";
import { SponsorRequirementRepository } from "@crex/db/src/repositories/sponsor-requirements";
import type {
  VerificationRun,
  VerificationFinding,
  GeneratedAsset,
  GeneratedComponent,
  Claim,
  Evidence,
  Constraint,
  SponsorRequirement,
} from "@crex/schemas";
import { CrexError } from "@crex/core/src/errors";

export interface VerificationDeps {
  db: D1Adapter;
  now: () => string;
  uuid: () => string;
}

export interface VerificationOptions {
  projectId: string;
  assetId: string;
}

export interface VerificationResult {
  runId: string;
  result: "PASS" | "REVIEW" | "BLOCK";
  findingCount: number;
}

const PLATFORM_LIMITS: Record<string, { title?: number; description?: number }> = {
  YOUTUBE_TITLE: { title: 100 },
  YOUTUBE_DESCRIPTION: { description: 5000 },
};

/**
 * Verifies a generated asset against its project's claims, constraints, sponsor requirements, and platform rules.
 *
 * @param options - Identifies the project and generated asset to verify.
 * @returns The verification run ID, overall result, and number of findings.
 * @throws `CrexError` if the asset does not exist or does not belong to the specified project.
 */
export async function runVerification(
  deps: VerificationDeps,
  options: VerificationOptions,
): Promise<VerificationResult> {
  const { db, now, uuid } = deps;
  const { projectId, assetId } = options;

  const assetRepo = new GeneratedAssetRepository(db);
  const componentRepo = new GeneratedComponentRepository(db);
  const claimRepo = new ClaimRepository(db);
  const evidenceRepo = new EvidenceRepository(db);
  const constraintRepo = new ConstraintRepository(db);
  const sponsorReqRepo = new SponsorRequirementRepository(db);
  const findingRepo = new VerificationFindingRepository(db);
  const runRepo = new VerificationRunRepository(db);

  const asset = await assetRepo.get(assetId);
  if (asset === undefined) {
    throw new CrexError("ASSET_NOT_FOUND", `generated asset not found: ${assetId}`);
  }
  if (asset.project_id !== projectId) {
    throw new CrexError(
      "INVALID_ASSET_STATE",
      `asset ${assetId} does not belong to project ${projectId}`,
    );
  }

  const components = await componentRepo.listByAsset(assetId);
  const claims = await claimRepo.listByProject(projectId);
  const constraints = await constraintRepo.listByProject(projectId);
  const sponsorRequirements = await sponsorReqRepo.listByProject(projectId);

  const claimMap = new Map(claims.map((c) => [c.id, c]));
  const evidenceMap = new Map<string, Evidence[]>();
  for (const claim of claims) {
    const evidenceList = await evidenceRepo.listByClaim(claim.id);
    evidenceMap.set(claim.id, evidenceList);
  }

  const runId = uuid();
  const startedAt = now();

  const stubRun: VerificationRun = {
    id: runId,
    project_id: projectId,
    asset_id: assetId,
    engine: "deterministic-v1",
    result: "PASS",
    finding_ids: [],
    started_at: startedAt,
    completed_at: undefined,
  };
  await runRepo.insert(stubRun);

  const findings: VerificationFinding[] = [];

  const seenPlatformTypes = new Set<string>();

  for (const component of components) {
    const componentFindings = runChecksForComponent(
      { uuid, now },
      component,
      asset,
      claimMap,
      evidenceMap,
      constraints,
      sponsorRequirements,
      runId,
      seenPlatformTypes,
    );
    findings.push(...componentFindings);
  }

  for (const finding of findings) {
    await findingRepo.insert(finding);
  }

  let result: "PASS" | "REVIEW" | "BLOCK" = "PASS";
  for (const f of findings) {
    if (f.severity === "BLOCK") {
      result = "BLOCK";
      break;
    }
    if (f.severity === "REVIEW") {
      result = "REVIEW";
    }
  }

  const completedAt = now();
  await db
    .prepare(
      `UPDATE verification_runs SET result = ?, finding_ids = ?, completed_at = ? WHERE id = ?`,
    )
    .run(result, JSON.stringify(findings.map((f) => f.id)), completedAt, runId);

  return { runId, result, findingCount: findings.length };
}

/**
 * Evaluates a generated component for claim fidelity, creator constraints, sponsor requirements, and platform limits.
 *
 * @param component - The generated component to evaluate
 * @param asset - The generated asset containing the component
 * @param claimMap - Claims referenced by the component
 * @param evidenceMap - Evidence associated with each claim
 * @param constraints - Creator constraints to evaluate
 * @param sponsorRequirements - Sponsor requirements to enforce
 * @param runId - Identifier of the verification run
 * @returns Findings produced by the component checks
 */
function runChecksForComponent(
  deps: { uuid: () => string; now: () => string },
  component: GeneratedComponent,
  asset: GeneratedAsset,
  claimMap: Map<string, Claim>,
  evidenceMap: Map<string, Evidence[]>,
  constraints: Constraint[],
  sponsorRequirements: SponsorRequirement[],
  runId: string,
  seenPlatformTypes: Set<string>,
): VerificationFinding[] {
  const findings: VerificationFinding[] = [];
  const { uuid, now } = deps;
  const content = component.content;

  for (const claimId of component.claim_references) {
    const claim = claimMap.get(claimId);
    if (claim === undefined) {
      findings.push({
        id: uuid(),
        verification_run_id: runId,
        type: "ATTRIBUTION_DRIFT",
        severity: "BLOCK",
        reason: `claim reference ${claimId} does not exist in the evidence graph`,
        asset_id: asset.id,
        component_id: component.component_id,
        generated_text: content,
        evidence_ranges: [],
        recommendation: "Remove or correct the invalid claim reference",
        created_at: now(),
      });
      continue;
    }

    if (claim.type === "NUMERICAL") {
      const sourceNumbers = extractNumbers(claim.content);
      const generatedNumbers = extractNumbers(content);
      if (sourceNumbers.length > 0) {
        const allPresent = sourceNumbers.every((num) =>
          generatedNumbers.some((gn) => numbersMatch(num, gn)),
        );
        if (!allPresent) {
          findings.push({
            id: uuid(),
            verification_run_id: runId,
            type: "NUMERICAL_DRIFT",
            severity: "BLOCK",
            reason: `numerical claim "${claim.content}" has values not accurately reflected in generated content`,
            asset_id: asset.id,
            component_id: component.component_id,
            generated_text: content,
            source_text: claim.content,
            evidence_ranges: [],
            recommendation: "Ensure all numerical claims are reproduced exactly",
            created_at: now(),
          });
        }
      }
    }

    if (claim.qualifiers.length > 0) {
      const missingQualifiers = claim.qualifiers.filter(
        (q) => !content.toLowerCase().includes(q.toLowerCase()),
      );
      if (missingQualifiers.length > 0) {
        findings.push({
          id: uuid(),
          verification_run_id: runId,
          type: "CONTEXT_REMOVAL",
          severity: "REVIEW",
          reason: `qualifiers [${missingQualifiers.join(", ")}] from claim not present in generated content`,
          asset_id: asset.id,
          component_id: component.component_id,
          generated_text: content,
          source_text: claim.content,
          evidence_ranges: [],
          recommendation: "Preserve qualifying language from source claims",
          created_at: now(),
        });
      }
    }

    const evidence = evidenceMap.get(claimId) ?? [];
    const keywordOverlap = computeKeywordOverlap(claim.content, content);
    if (keywordOverlap < 0.15) {
      findings.push({
        id: uuid(),
        verification_run_id: runId,
        type: "SCOPE_DRIFT",
        severity: "REVIEW",
        reason: `generated content has low keyword overlap (${(keywordOverlap * 100).toFixed(0)}%) with claim "${claim.content}"`,
        asset_id: asset.id,
        component_id: component.component_id,
        generated_text: content,
        source_text: claim.content,
        evidence_ranges: evidence
          .filter((e) => e.source_range !== undefined)
          .map((e) => e.source_range!),
        recommendation: "Verify generated content does not drift from the source claim",
        created_at: now(),
      });
    }
  }

  const enabledConstraints = constraints.filter((c) => c.enabled);
  for (const constraint of enabledConstraints) {
    const isSatisfied = checkConstraintSatisfied(constraint, content);
    if (!isSatisfied) {
      findings.push({
        id: uuid(),
        verification_run_id: runId,
        type: "CREATOR_INTENT",
        severity: "REVIEW",
        reason: `constraint "${constraint.summary}" (${constraint.category}) may not be satisfied`,
        asset_id: asset.id,
        component_id: component.component_id,
        generated_text: content,
        evidence_ranges: [],
        recommendation: `Review content against constraint: ${constraint.summary}`,
        created_at: now(),
      });
    }
  }

  const requiredSponsorReqs = sponsorRequirements.filter((r) => r.required && r.enabled);
  for (const req of requiredSponsorReqs) {
    if (req.requirement_type === "REQUIRED_PHRASE" || req.requirement_type === "DISCLOSURE") {
      if (!content.toLowerCase().includes(req.value.toLowerCase())) {
        findings.push({
          id: uuid(),
          verification_run_id: runId,
          type: "SPONSOR_COMPLIANCE",
          severity: "BLOCK",
          reason: `required sponsor ${req.requirement_type.toLowerCase()} "${req.value}" not found in generated content`,
          asset_id: asset.id,
          component_id: component.component_id,
          generated_text: content,
          evidence_ranges: [],
          recommendation: `Include the required sponsor phrase: "${req.value}"`,
          created_at: now(),
        });
      }
    }
    if (req.requirement_type === "REQUIRED_URL") {
      if (!content.toLowerCase().includes(req.value.toLowerCase())) {
        findings.push({
          id: uuid(),
          verification_run_id: runId,
          type: "SPONSOR_COMPLIANCE",
          severity: "BLOCK",
          reason: `required sponsor URL "${req.value}" not found in generated content`,
          asset_id: asset.id,
          component_id: component.component_id,
          generated_text: content,
          evidence_ranges: [],
          recommendation: `Include the required URL: "${req.value}"`,
          created_at: now(),
        });
      }
    }
  }

  const platformLimit = PLATFORM_LIMITS[asset.asset_type];
  if (platformLimit !== undefined && !seenPlatformTypes.has(asset.asset_type)) {
    seenPlatformTypes.add(asset.asset_type);
    if (platformLimit.title !== undefined && asset.title.length > platformLimit.title) {
      findings.push({
        id: uuid(),
        verification_run_id: runId,
        type: "PLATFORM_QA",
        severity: "BLOCK",
        reason: `asset title exceeds ${platformLimit.title} character limit for ${asset.asset_type} (actual: ${asset.title.length})`,
        asset_id: asset.id,
        component_id: component.component_id,
        generated_text: asset.title,
        evidence_ranges: [],
        recommendation: `Shorten title to ${platformLimit.title} characters or fewer`,
        created_at: now(),
      });
    }
    if (platformLimit.description !== undefined && content.length > platformLimit.description) {
      findings.push({
        id: uuid(),
        verification_run_id: runId,
        type: "PLATFORM_QA",
        severity: "BLOCK",
        reason: `component content exceeds ${platformLimit.description} character limit for ${asset.asset_type} (actual: ${content.length})`,
        asset_id: asset.id,
        component_id: component.component_id,
        generated_text: content,
        evidence_ranges: [],
        recommendation: `Shorten content to ${platformLimit.description} characters or fewer`,
        created_at: now(),
      });
    }
  }

  return findings;
}

const SUFFIX_MULTIPLIERS: Record<string, number> = {
  k: 1_000,
  K: 1_000,
  m: 1_000_000,
  M: 1_000_000,
  "%": 0.01,
};

/**
 * Extracts numeric values from text, including optional signs, decimals, percentages, currency symbols, and magnitude suffixes (k, K, m, M).
 *
 * @param text - The text to scan for numeric values
 * @returns The numeric values found in `text`
 */
function extractNumbers(text: string): number[] {
  const matches = text.match(/-?\d[\d,]*(?:\.\d+)?(?:[%$kKmM])?/g) ?? [];
  return matches
    .map((m) => {
      const cleaned = m.replace(/,/g, "");
      const suffix = cleaned[cleaned.length - 1];
      if (suffix !== undefined && suffix in SUFFIX_MULTIPLIERS) {
        const num = parseFloat(cleaned.slice(0, -1));
        if (Number.isNaN(num)) return NaN;
        return num * SUFFIX_MULTIPLIERS[suffix];
      }
      return parseFloat(cleaned);
    })
    .filter((n) => !Number.isNaN(n));
}

/**
 * Determines whether two numeric values match within a one-percent relative difference.
 *
 * @returns `true` if the values are equal or differ by less than one percent, `false` otherwise.
 */
function numbersMatch(a: number, b: number): boolean {
  if (a === b) return true;
  if (a === 0 || b === 0) return false;
  const relativeDiff = Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b));
  return relativeDiff < 0.01;
}

/**
 * Measures the proportion of significant source words present in the generated text.
 *
 * @param source - The reference text whose words are compared
 * @param generated - The text checked for matching words
 * @returns A value from 0 to 1 representing the source-word overlap; 1 when the source has no significant words
 */
function computeKeywordOverlap(source: string, generated: string): number {
  const sourceWords = new Set(
    source
      .toLowerCase()
      .split(/\s+/)
      .map((w) => w.replace(/[^a-z0-9]/g, ""))
      .filter((w) => w.length > 2),
  );
  const generatedWords = new Set(
    generated
      .toLowerCase()
      .split(/\s+/)
      .map((w) => w.replace(/[^a-z0-9]/g, ""))
      .filter((w) => w.length > 2),
  );
  if (sourceWords.size === 0) return 1;
  let overlap = 0;
  for (const word of sourceWords) {
    if (generatedWords.has(word)) overlap++;
  }
  return overlap / sourceWords.size;
}

/**
 * Determines whether content satisfies the specified constraint.
 *
 * @param constraint - The constraint whose requirements are evaluated
 * @param content - The content to check
 * @returns `true` if the content satisfies the constraint, `false` otherwise
 */
function checkConstraintSatisfied(constraint: Constraint, content: string): boolean {
  const lowerContent = content.toLowerCase();

  switch (constraint.category) {
    case "CLICKBAIT_BAN": {
      const clickbaitPatterns = [
        "you won't believe",
        "shocking",
        "what happens next",
        "this one trick",
      ];
      return !clickbaitPatterns.some((p) => lowerContent.includes(p));
    }
    case "ABSOLUTE_CLAIM_BAN": {
      const absolutePatterns = [
        "always",
        "never",
        "100%",
        "guaranteed",
        "best",
        "worst",
        "only",
      ];
      const lowerDetails = (constraint.details ?? "").toLowerCase();
      for (const pattern of absolutePatterns) {
        if (lowerContent.includes(pattern)) {
          if (lowerDetails.length === 0 || lowerDetails.includes(pattern)) {
            return false;
          }
        }
      }
      return true;
    }
    case "TONE": {
      if (constraint.details !== undefined && constraint.details.length > 0) {
        const banned = constraint.details
          .toLowerCase()
          .split(",")
          .map((s) => s.trim());
        return !banned.some((b) => b.length > 0 && lowerContent.includes(b));
      }
      return true;
    }
    default:
      return true;
  }
}
