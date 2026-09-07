import { D1Adapter } from "@crex/infra";
import { GeneratedAssetRepository } from "@crex/db/src/repositories/generated-assets";
import { VerificationRunRepository } from "@crex/db/src/repositories/verification-runs";
import { VerificationFindingRepository } from "@crex/db/src/repositories/verification-findings";
import { ClaimRepository } from "@crex/db/src/repositories/claims";
import { SponsorRequirementRepository } from "@crex/db/src/repositories/sponsor-requirements";
import { ProvenanceRepository } from "@crex/db/src/repositories/provenance";
import type { ProvenanceRow } from "@crex/db/src/repositories/provenance";
import { ReleasePassportRepository } from "@crex/db/src/repositories/release-passports";
import type { GeneratedAsset, ReleasePassport, VerificationFinding, VerificationRun } from "@crex/schemas";
import { CrexError } from "@crex/core/src/errors";

/**
 * Wave 12 — Release Passport pipeline.
 *
 * Builds a deterministic, explainable ReleasePassport from REAL persisted state:
 * the latest verification run + its findings, the generated asset's integrity JSON,
 * project-level claim/asset counts, mandated sponsor requirements, and the latest
 * provenance record. NO AI is involved. Every score and status is computed from
 * persisted rows and documented below.
 *
 * ---------------------------------------------------------------------------
 * SCORE FORMULAS (all clamped to integers 0-100)
 * ---------------------------------------------------------------------------
 * A "penalized dimension" starts from the generation engine's integrity value
 * (asset.integrity.dimensions.<dim>, defaulting to 0 when absent) and is reduced
 * deterministically by findings in the LATEST verification run:
 *
 *   score = clamp(base - 25 * (#BLOCK findings) - 10 * (#REVIEW findings), 0, 100)
 *
 *   evidence_coverage  base = dimensions.evidence_coverage,
 *                      penalized by SCOPE_DRIFT findings
 *   claim_fidelity     base = dimensions.claim_fidelity,
 *                      penalized by CERTAINTY_DRIFT + CONTEXT_REMOVAL + ATTRIBUTION_DRIFT
 *   numerical_integrity base = dimensions.numerical_accuracy,
 *                      penalized by NUMERICAL_DRIFT findings
 *
 * ---------------------------------------------------------------------------
 * STATUS RULES (verificationStatus: PASS | REVIEW | BLOCK)
 * ---------------------------------------------------------------------------
 * creator_intent_status = highest severity among CREATOR_INTENT findings
 *                         (BLOCK > REVIEW > PASS). When no finding exists, the
 *                         status derives from integrity: dimension >= 100 -> PASS,
 *                         dimension < 100 -> REVIEW (conservative).
 * sponsor_compliance    = same rule over SPONSOR_COMPLIANCE findings +
 *                         integrity.dimensions.sponsor_compliance.
 * platform_qa           = same rule over PLATFORM_QA findings +
 *                         integrity.dimensions.platform_qa.
 *
 * ---------------------------------------------------------------------------
 * OVERALL SCORE
 * ---------------------------------------------------------------------------
 *   numericScore = mean(evidence_coverage, claim_fidelity, numerical_integrity)
 *   statusScore  = mean(statusScore(creator_intent), statusScore(sponsor),
 *                       statusScore(platform_qa), runComponent)
 *   statusScore(x) = 100 (PASS) | 50 (REVIEW) | 0 (BLOCK)
 *   runComponent   = 100 (run PASS) | 50 (run REVIEW) | 0 (run BLOCK) | 0 (no run)
 *   base     = round(0.6 * numericScore + 0.4 * statusScore)
 *   overall  = min(base, cap) where cap = 100 (READY) | 70 (DRAFT) | 40 (BLOCKED)
 *
 * The release-status cap guarantees a BLOCKED passport never carries a high
 * score and an unverified DRAFT passport cannot score as if it were released.
 * ---------------------------------------------------------------------------
 * RELEASE_STATUS MAPPING (releaseStatus: DRAFT | READY | BLOCKED)
 * ---------------------------------------------------------------------------
 * 1. No verification run exists            -> DRAFT  (nothing verified; conservative)
 * 2. Latest run result == BLOCK            -> BLOCKED
 * 3. Provenance exists AND it reports a
 *    signature (signing_status == SIGNED)
 *    but verification_status != VALID
 *    (INVALID | UNTRUSTED | MISSING)       -> BLOCKED (signed chain cannot be trusted)
 * 4. Provenance exists AND verification_status != VALID (e.g. UNSIGNED /
 *    not yet verified)                     -> DRAFT  (provenance not established)
 * 5. Latest run result == REVIEW           -> DRAFT  (needs manual review)
 * 6. Mandatory (required && enabled) sponsor
 *    requirements exist but the latest run
 *    has a BLOCK SPONSOR_COMPLIANCE finding -> DRAFT (not READY)
 * 7. Any of creator_intent_status /
 *    sponsor_compliance / platform_qa != PASS -> DRAFT (conservative)
 * 8. Otherwise (run PASS, statuses PASS,
 *    no disqualifying provenance)          -> READY
 *
 * Missing data defaults are honest and conservative:
 *   no integrity -> score base 0; no run -> DRAFT; provenance VALID required for
 *   READY whenever a provenance record exists.
 * ---------------------------------------------------------------------------
 */

export interface PassportDeps {
  db: D1Adapter;
  now: () => string;
  uuid: () => string;
}

export interface PassportOptions {
  projectId: string;
  assetId: string;
}

type VerificationStatus = "PASS" | "REVIEW" | "BLOCK";
type ReleaseStatus = "DRAFT" | "READY" | "BLOCKED";

const BLOCK_PENALTY = 25;
const REVIEW_PENALTY = 10;
const SATISFIED_THRESHOLD = 100;

function clampScore(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function safeScore(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return clampScore(value);
}

function severityCount(
  findings: VerificationFinding[],
  types: readonly string[],
  severity: "BLOCK" | "REVIEW",
): number {
  return findings.filter(
    (finding) => types.includes(finding.type) && finding.severity === severity,
  ).length;
}

/**
 * Reduces an integrity base score by BLOCK/REVIEW findings of the relevant types.
 *
 * @param base - integrity dimension value (0-100), defaulting to 0 when missing
 * @param blockCount - number of BLOCK-severity findings for the dimension
 * @param reviewCount - number of REVIEW-severity findings for the dimension
 */
function penalizedScore(base: number, blockCount: number, reviewCount: number): number {
  return clampScore(base - blockCount * BLOCK_PENALTY - reviewCount * REVIEW_PENALTY);
}

function statusForType(
  findings: VerificationFinding[],
  type: string,
  integrityValue: number,
): VerificationStatus {
  let status: VerificationStatus = "PASS";
  let matched = false;
  for (const finding of findings) {
    if (finding.type !== type) {
      continue;
    }
    matched = true;
    if (finding.severity === "BLOCK") {
      status = "BLOCK";
    } else if (finding.severity === "REVIEW" && status !== "BLOCK") {
      status = "REVIEW";
    }
  }
  if (!matched) {
    return safeScore(integrityValue) >= SATISFIED_THRESHOLD ? "PASS" : "REVIEW";
  }
  return status;
}

function statusScore(status: VerificationStatus): number {
  return status === "PASS" ? 100 : status === "REVIEW" ? 50 : 0;
}

function runComponent(result: VerificationRun["result"] | undefined): number {
  if (result === undefined) {
    return 0;
  }
  return result === "PASS" ? 100 : result === "REVIEW" ? 50 : 0;
}

function overallCap(releaseStatus: ReleaseStatus): number {
  if (releaseStatus === "BLOCKED") {
    return 40;
  }
  if (releaseStatus === "DRAFT") {
    return 70;
  }
  return 100;
}

function computeOverall(args: {
  evidenceCoverage: number;
  claimFidelity: number;
  numericalIntegrity: number;
  creatorIntentStatus: VerificationStatus;
  sponsorCompliance: VerificationStatus;
  platformQa: VerificationStatus;
  latestRunResult: VerificationRun["result"] | undefined;
  releaseStatus: ReleaseStatus;
}): number {
  const numericScore = (args.evidenceCoverage + args.claimFidelity + args.numericalIntegrity) / 3;
  const statusScoreValue =
    (statusScore(args.creatorIntentStatus) +
      statusScore(args.sponsorCompliance) +
      statusScore(args.platformQa) +
      runComponent(args.latestRunResult)) /
    4;
  const base = 0.6 * numericScore + 0.4 * statusScoreValue;
  return Math.min(clampScore(base), overallCap(args.releaseStatus));
}

function computeReleaseStatus(args: {
  latestRun: VerificationRun | undefined;
  runFindings: VerificationFinding[];
  mandatorySponsorCount: number;
  provenance: ProvenanceRow | undefined;
  creatorIntentStatus: VerificationStatus;
  sponsorCompliance: VerificationStatus;
  platformQa: VerificationStatus;
}): ReleaseStatus {
  const { latestRun, runFindings, mandatorySponsorCount, provenance } = args;

  if (latestRun === undefined) {
    return "DRAFT";
  }
  if (latestRun.result === "BLOCK") {
    return "BLOCKED";
  }
  if (
    provenance !== undefined &&
    provenance.signing_status === "SIGNED" &&
    provenance.verification_status !== "VALID"
  ) {
    return "BLOCKED";
  }
  if (provenance !== undefined && provenance.verification_status !== "VALID") {
    return "DRAFT";
  }
  if (latestRun.result === "REVIEW") {
    return "DRAFT";
  }
  if (
    mandatorySponsorCount > 0 &&
    runFindings.some(
      (finding) => finding.type === "SPONSOR_COMPLIANCE" && finding.severity === "BLOCK",
    )
  ) {
    return "DRAFT";
  }
  if (
    args.creatorIntentStatus !== "PASS" ||
    args.sponsorCompliance !== "PASS" ||
    args.platformQa !== "PASS"
  ) {
    return "DRAFT";
  }
  return "READY";
}

/**
 * Returns the most recent verification run for an asset.
 *
 * "Most recent" is defined as the highest `started_at`; ties resolve to the run
 * with the highest `completed_at`, then the highest ID to remain deterministic.
 *
 * @param runs - all runs for the asset
 */
function latestVerificationRun(runs: VerificationRun[]): VerificationRun | undefined {
  if (runs.length === 0) {
    return undefined;
  }
  return [...runs].sort((a, b) => {
    if (a.started_at !== b.started_at) {
      return a.started_at < b.started_at ? 1 : -1;
    }
    const aDone = a.completed_at ?? "";
    const bDone = b.completed_at ?? "";
    if (aDone !== bDone) {
      return aDone < bDone ? 1 : -1;
    }
    return a.id < b.id ? 1 : -1;
  })[0]!;
}

function integrityDimensions(
  asset: GeneratedAsset,
): { evidenceCoverage: number; claimFidelity: number; numericalAccuracy: number; creatorIntent: number; sponsorCompliance: number; platformQa: number } {
  const dimensions = asset.integrity?.dimensions;
  return {
    evidenceCoverage: safeScore(dimensions?.evidence_coverage),
    claimFidelity: safeScore(dimensions?.claim_fidelity),
    numericalAccuracy: safeScore(dimensions?.numerical_accuracy),
    creatorIntent: safeScore(dimensions?.creator_intent),
    sponsorCompliance: safeScore(dimensions?.sponsor_compliance),
    platformQa: safeScore(dimensions?.platform_qa),
  };
}

/**
 * Builds and persists a ReleasePassport for a generated asset.
 *
 * @param deps - D1 adapter plus deterministic time/uuid providers
 * @param options - project and generated asset identifiers
 * @returns The persisted passport
 * @throws `CrexError` with `ASSET_NOT_FOUND` when the asset is missing and
 *         `INVALID_ASSET_STATE` when the asset does not belong to the project.
 */
export async function buildReleasePassport(
  deps: PassportDeps,
  options: PassportOptions,
): Promise<ReleasePassport> {
  const { db, now, uuid } = deps;
  const { projectId, assetId } = options;

  const assetRepo = new GeneratedAssetRepository(db);
  const runRepo = new VerificationRunRepository(db);
  const findingRepo = new VerificationFindingRepository(db);
  const claimRepo = new ClaimRepository(db);
  const sponsorRepo = new SponsorRequirementRepository(db);
  const provenanceRepo = new ProvenanceRepository(db);
  const passportRepo = new ReleasePassportRepository(db);

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

  const runs = await runRepo.listByAsset(assetId);
  const latestRun = latestVerificationRun(runs);
  const runFindings =
    latestRun === undefined ? [] : await findingRepo.listByRun(latestRun.id);

  const assetCount = (await assetRepo.listByProject(projectId)).length;
  const claimCount = (await claimRepo.listByProject(projectId)).length;
  const sponsorRequirements = await sponsorRepo.listByProject(projectId);
  const mandatorySponsorCount = sponsorRequirements.filter(
    (requirement) => requirement.required && requirement.enabled,
  ).length;
  const provenance = await provenanceRepo.getLatestByAssetId(assetId);
  const latestPassport = await passportRepo.getLatestByAsset(assetId);

  const dims = integrityDimensions(asset);

  const evidenceCoverage = penalizedScore(
    dims.evidenceCoverage,
    severityCount(runFindings, ["SCOPE_DRIFT"], "BLOCK"),
    severityCount(runFindings, ["SCOPE_DRIFT"], "REVIEW"),
  );
  const claimFidelity = penalizedScore(
    dims.claimFidelity,
    severityCount(runFindings, ["CERTAINTY_DRIFT", "CONTEXT_REMOVAL", "ATTRIBUTION_DRIFT"], "BLOCK"),
    severityCount(runFindings, ["CERTAINTY_DRIFT", "CONTEXT_REMOVAL", "ATTRIBUTION_DRIFT"], "REVIEW"),
  );
  const numericalIntegrity = penalizedScore(
    dims.numericalAccuracy,
    severityCount(runFindings, ["NUMERICAL_DRIFT"], "BLOCK"),
    severityCount(runFindings, ["NUMERICAL_DRIFT"], "REVIEW"),
  );

  const creatorIntentStatus = statusForType(runFindings, "CREATOR_INTENT", dims.creatorIntent);
  const sponsorCompliance = statusForType(
    runFindings,
    "SPONSOR_COMPLIANCE",
    dims.sponsorCompliance,
  );
  const platformQa = statusForType(runFindings, "PLATFORM_QA", dims.platformQa);

  const releaseStatus = computeReleaseStatus({
    latestRun,
    runFindings,
    mandatorySponsorCount,
    provenance,
    creatorIntentStatus,
    sponsorCompliance,
    platformQa,
  });

  const overall = computeOverall({
    evidenceCoverage,
    claimFidelity,
    numericalIntegrity,
    creatorIntentStatus,
    sponsorCompliance,
    platformQa,
    latestRunResult: latestRun?.result,
    releaseStatus,
  });

  const passport: ReleasePassport = {
    id: uuid(),
    project_id: projectId,
    asset_id: assetId,
    version: (latestPassport?.version ?? -1) + 1,
    asset_count: assetCount,
    claim_count: claimCount,
    evidence_coverage: evidenceCoverage,
    claim_fidelity: claimFidelity,
    numerical_integrity: numericalIntegrity,
    creator_intent_status: creatorIntentStatus,
    sponsor_compliance: sponsorCompliance,
    platform_qa: platformQa,
    overall,
    release_status: releaseStatus,
    created_at: now(),
  };

  return passportRepo.insert(passport);
}