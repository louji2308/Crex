import { D1Adapter } from "@crex/infra";
import { VerificationRunRepository } from "@crex/db/src/repositories/verification-runs";
import { VerificationFindingRepository } from "@crex/db/src/repositories/verification-findings";
import { GeneratedAssetRepository } from "@crex/db/src/repositories/generated-assets";
import { GeneratedComponentRepository } from "@crex/db/src/repositories/generated-components";
import { ClaimRepository } from "@crex/db/src/repositories/claims";
import { SponsorRequirementRepository } from "@crex/db/src/repositories/sponsor-requirements";
import { RepairActionRepository } from "@crex/db/src/repositories/repair-actions";
import type {
  RepairAction,
  VerificationRun,
  VerificationFinding,
  GeneratedAsset,
  GeneratedComponent,
  Claim,
  SponsorRequirement,
} from "@crex/schemas";
import { CrexError } from "@crex/core/src/errors";
import { withStageTiming } from "../perf";

export interface RepairDeps {
  db: D1Adapter;
  now: () => string;
  uuid: () => string;
}

export interface RepairOptions {
  projectId: string;
  assetId: string;
  runId?: string;
}

export interface RepairResult {
  runId: string;
  actions: RepairAction[];
  affectedAsset: boolean;
  affectedComponentIds: string[];
}

export interface ApplyRepairOptions {
  projectId: string;
  actionId: string;
}

const TITLE_KEY = "__asset_title__";
const REPAIR_ENGINE = "deterministic-repair-v1";

const SUFFIX_MULTIPLIERS: Record<string, number> = {
  k: 1_000,
  K: 1_000,
  m: 1_000_000,
  M: 1_000_000,
  "%": 0.01,
};

/**
 * Resolves the verification run a repair/re-verification should operate on.
 * Explicit run ids must belong to the asset; otherwise the latest run for the
 * asset is used. An asset with no verification run cannot be repaired.
 */
export async function resolveRunForAsset(
  runRepo: VerificationRunRepository,
  assetId: string,
  runId?: string,
): Promise<VerificationRun> {
  if (runId !== undefined) {
    const run = await runRepo.get(runId);
    if (run === undefined) {
      throw new CrexError("VERIFICATION_RUN_NOT_FOUND", `verification run not found: ${runId}`);
    }
    if (run.asset_id !== assetId) {
      throw new CrexError(
        "INVALID_REPAIR_STATE",
        `verification run ${runId} does not belong to asset ${assetId}`,
      );
    }
    return run;
  }
  const runs = await runRepo.listByAsset(assetId);
  const latest = runs[runs.length - 1];
  if (latest === undefined) {
    throw new CrexError(
      "VERIFICATION_RUN_NOT_FOUND",
      `no verification run exists for asset ${assetId}`,
    );
  }
  return latest;
}

interface RepairContext {
  asset: GeneratedAsset;
  components: GeneratedComponent[];
  claims: Claim[];
  sponsorRequirements: SponsorRequirement[];
}

interface RepairCandidateSpec {
  findingId: string;
  key: string;
  baseText: string;
  componentId?: string;
  sourceReferences: string[];
  constraintReferences: string[];
  transform: (text: string) => string | null;
}

interface RepairTarget extends RepairCandidateSpec {
  repaired: string;
}

function buildCandidate(spec: RepairCandidateSpec): RepairTarget | null {
  const repaired = spec.transform(spec.baseText);
  if (repaired === null || repaired === spec.baseText) {
    return null;
  }
  return { ...spec, repaired };
}

/**
 * Computes a targeted, deterministic repair for a verification finding, or null
 * when the finding is not deterministically repairable.
 */
function computeRepairCandidate(
  finding: VerificationFinding,
  ctx: RepairContext,
): RepairTarget | null {
  let spec: RepairCandidateSpec | null = null;
  switch (finding.type) {
    case "SPONSOR_COMPLIANCE":
      spec = sponsorComplianceCandidate(finding, ctx.sponsorRequirements);
      break;
    case "PLATFORM_QA":
      spec = platformQaCandidate(finding, ctx.asset);
      break;
    case "CONTEXT_REMOVAL":
      spec = contextRemovalCandidate(finding, ctx.claims);
      break;
    case "NUMERICAL_DRIFT":
      spec = numericalDriftCandidate(finding, ctx.claims);
      break;
    default:
      spec = null;
  }
  return spec === null ? null : buildCandidate(spec);
}

function sponsorComplianceCandidate(
  finding: VerificationFinding,
  requirements: SponsorRequirement[],
): RepairCandidateSpec | null {
  const target = finding.generated_text;
  if (target === undefined) {
    return null;
  }
  const value = sponsorValueForFinding(finding, requirements, target);
  if (value === null) {
    return null;
  }
  const componentId = finding.component_id;
  if (componentId === undefined) {
    return null;
  }
  const insert = (text: string): string => {
    return text.endsWith("\n") ? `${text}${value}` : `${text}\n\n${value}`;
  };
  return {
    findingId: finding.id,
    key: componentId,
    baseText: target,
    componentId,
    sourceReferences: [],
    constraintReferences: [],
    transform: (text: string): string | null => {
      if (text.toLowerCase().includes(value.toLowerCase())) {
        return null;
      }
      const repaired = insert(text);
      return repaired === text ? null : repaired;
    },
  };
}

function sponsorValueForFinding(
  finding: VerificationFinding,
  requirements: SponsorRequirement[],
  target: string,
): string | null {
  const quoted = extractQuotedValue(finding.recommendation);
  if (quoted !== null) {
    const match = requirements.find((r) => r.value === quoted);
    if (match !== undefined) {
      return match.value;
    }
    return quoted;
  }
  const missing = requirements.find(
    (r) =>
      r.required &&
      r.enabled &&
      (r.requirement_type === "REQUIRED_PHRASE" ||
        r.requirement_type === "DISCLOSURE" ||
        r.requirement_type === "REQUIRED_URL") &&
      !target.toLowerCase().includes(r.value.toLowerCase()),
  );
  return missing === undefined ? null : missing.value;
}

function extractQuotedValue(text: string | undefined): string | null {
  if (text === undefined) {
    return null;
  }
  const match = /"([^"]+)"/.exec(text);
  return match === null ? null : match[1]!;
}

function platformQaCandidate(
  finding: VerificationFinding,
  asset: GeneratedAsset,
): RepairCandidateSpec | null {
  const limit = platformLimitFromReason(finding.reason);
  if (limit === null) {
    return null;
  }
  const truncate = (text: string): string | null => {
    if (text.length <= limit) {
      return null;
    }
    return text.slice(0, limit);
  };
  if (finding.generated_text === asset.title) {
    return {
      findingId: finding.id,
      key: TITLE_KEY,
      baseText: asset.title,
      sourceReferences: [],
      constraintReferences: [],
      transform: truncate,
    };
  }
  const componentId = finding.component_id;
  const generatedText = finding.generated_text;
  if (componentId === undefined || generatedText === undefined) {
    return null;
  }
  return {
    findingId: finding.id,
    key: componentId,
    baseText: generatedText,
    componentId,
    sourceReferences: [],
    constraintReferences: [],
    transform: truncate,
  };
}

function platformLimitFromReason(reason: string): number | null {
  const match = /exceeds (\d+) character limit/.exec(reason);
  if (match === null) {
    return null;
  }
  const limit = Number.parseInt(match[1]!, 10);
  return Number.isFinite(limit) && limit > 0 ? limit : null;
}

function contextRemovalCandidate(
  finding: VerificationFinding,
  claims: Claim[],
): RepairCandidateSpec | null {
  const target = finding.generated_text;
  const sourceText = finding.source_text;
  const componentId = finding.component_id;
  if (target === undefined || sourceText === undefined || componentId === undefined) {
    return null;
  }
  const claim = claims.find((c) => c.content === sourceText);
  if (claim === undefined || claim.qualifiers.length === 0) {
    return null;
  }
  const missingQualifiers = claim.qualifiers.filter((q) => {
    if (q.length === 0) {
      return false;
    }
    return !target.toLowerCase().includes(q.toLowerCase());
  });
  if (missingQualifiers.length === 0) {
    return null;
  }
  const prefix = (text: string): string => {
    const stillMissing = claim.qualifiers.filter((q) => {
      if (q.length === 0) {
        return false;
      }
      return !text.toLowerCase().includes(q.toLowerCase());
    });
    return stillMissing.length === 0 ? text : `${stillMissing.join(" ")} ${text}`.trim();
  };
  return {
    findingId: finding.id,
    key: componentId,
    baseText: target,
    componentId,
    sourceReferences: [claim.id],
    constraintReferences: [],
    transform: (text: string): string | null => {
      const repaired = prefix(text);
      return repaired === text ? null : repaired;
    },
  };
}

function numericalDriftCandidate(
  finding: VerificationFinding,
  claims: Claim[],
): RepairCandidateSpec | null {
  const target = finding.generated_text;
  const sourceText = finding.source_text;
  const componentId = finding.component_id;
  if (target === undefined || sourceText === undefined || componentId === undefined) {
    return null;
  }
  const claim = claims.find((c) => c.content === sourceText);
  return {
    findingId: finding.id,
    key: componentId,
    baseText: target,
    componentId,
    sourceReferences: claim === undefined ? [] : [claim.id],
    constraintReferences: [],
    transform: (text: string): string | null => repairNumericalDrift(sourceText, text),
  };
}

interface TokenNumber {
  raw: string;
  value: number;
  start: number;
  end: number;
}

function extractTokenNumbers(text: string): TokenNumber[] {
  const tokens: TokenNumber[] = [];
  const pattern = /-?\d[\d,]*(?:\.\d+)?(?:[%$kKmM])?/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const raw = match[0];
    const cleaned = raw.replace(/,/g, "");
    const suffix = cleaned[cleaned.length - 1];
    let value: number;
    if (suffix !== undefined && suffix in SUFFIX_MULTIPLIERS) {
      const num = parseFloat(cleaned.slice(0, -1));
      value = num * (SUFFIX_MULTIPLIERS[suffix]!);
    } else {
      value = parseFloat(cleaned);
    }
    if (!Number.isNaN(value)) {
      tokens.push({ raw, value, start: match.index, end: match.index + raw.length });
    }
  }
  return tokens;
}

function numbersMatch(a: number, b: number): boolean {
  if (a === b) {
    return true;
  }
  if (a === 0 || b === 0) {
    return false;
  }
  const relativeDiff = Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b));
  return relativeDiff < 0.01;
}

/**
 * Corrects a numerical drift by substituting each positionally-corresponding
 * generated number with the source value when that source value is absent from
 * the generated text and the generated value is not itself preserved elsewhere.
 */
function repairNumericalDrift(sourceText: string, generatedText: string): string | null {
  const sourceTokens = extractTokenNumbers(sourceText);
  const generatedTokens = extractTokenNumbers(generatedText);
  if (sourceTokens.length === 0 || generatedTokens.length === 0) {
    return null;
  }
  const generatedValues = generatedTokens.map((t) => t.value);
  const replacements: Array<{ start: number; end: number; text: string }> = [];
  for (let i = 0; i < sourceTokens.length; i++) {
    const sourceToken = sourceTokens[i]!;
    const generatedToken = generatedTokens[i];
    if (generatedToken === undefined) {
      break;
    }
    if (numbersMatch(sourceToken.value, generatedToken.value)) {
      continue;
    }
    const sourceAbsent = !generatedValues.some((v) => numbersMatch(v, sourceToken.value));
    const generatedNeeded = sourceTokens.some((st) => numbersMatch(st.value, generatedToken.value));
    if (sourceAbsent && !generatedNeeded) {
      replacements.push({
        start: generatedToken.start,
        end: generatedToken.end,
        text: sourceToken.raw,
      });
    }
  }
  if (replacements.length === 0) {
    return null;
  }
  let repaired = generatedText;
  for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
    repaired =
      repaired.slice(0, replacement.start) +
      replacement.text +
      repaired.slice(replacement.end);
  }
  return repaired === generatedText ? null : repaired;
}

/**
 * Produces PROPOSED, deterministic, evidence-aware RepairActions for a
 * verification run's BLOCK/REVIEW findings. No AI is invoked. Semantic finding
 * types (SCOPE_DRIFT, CERTAINTY_DRIFT, ATTRIBUTION_DRIFT, CREATOR_INTENT) are
 * not auto-repaired and produce no action.
 */
export async function runRepair(
  deps: RepairDeps,
  options: RepairOptions,
): Promise<RepairResult> {
  return withStageTiming("pipeline:repair", () =>
    runRepairInner(deps, options),
  );
}

async function runRepairInner(
  deps: RepairDeps,
  options: RepairOptions,
): Promise<RepairResult> {
  const { db, now, uuid } = deps;
  const { projectId, assetId } = options;

  const assetRepo = new GeneratedAssetRepository(db);
  const componentRepo = new GeneratedComponentRepository(db);
  const claimRepo = new ClaimRepository(db);
  const sponsorReqRepo = new SponsorRequirementRepository(db);
  const runRepo = new VerificationRunRepository(db);
  const findingRepo = new VerificationFindingRepository(db);
  const repairRepo = new RepairActionRepository(db);

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

  const targetRun = await resolveRunForAsset(runRepo, assetId, options.runId);
  const findings = await findingRepo.listByRun(targetRun.id);
  const claims = await claimRepo.listByProject(projectId);
  const sponsorRequirements = await sponsorReqRepo.listByProject(projectId);
  const components = await componentRepo.listByAsset(assetId);

  const ctx: RepairContext = { asset, components, claims, sponsorRequirements };
  const targets = new Map<string, RepairTarget>();

  for (const finding of findings) {
    if (finding.severity !== "BLOCK" && finding.severity !== "REVIEW") {
      continue;
    }
    const candidate = computeRepairCandidate(finding, ctx);
    if (candidate === null) {
      continue;
    }
    const existing = targets.get(candidate.key);
    if (existing === undefined) {
      targets.set(candidate.key, candidate);
      continue;
    }
    const merged = candidate.transform(existing.repaired);
    if (merged !== null && merged !== existing.repaired) {
      existing.repaired = merged;
    }
  }

  const createdNow = now();
  const actions: RepairAction[] = [];
  for (const target of targets.values()) {
    if (target.repaired === target.baseText) {
      continue;
    }
    const action: RepairAction = {
      id: uuid(),
      project_id: projectId,
      finding_id: target.findingId,
      asset_id: assetId,
      component_id: target.componentId,
      status: "PROPOSED",
      original_text: target.baseText,
      repaired_text: target.repaired,
      source_references: target.sourceReferences,
      constraint_references: target.constraintReferences,
      engine: REPAIR_ENGINE,
      created_at: createdNow,
      updated_at: createdNow,
    };
    await repairRepo.insert(action);
    actions.push(action);
  }

  const effective = [...targets.values()].filter((t) => t.repaired !== t.baseText);
  return {
    runId: targetRun.id,
    actions,
    affectedAsset: effective.some((t) => t.key === TITLE_KEY),
    affectedComponentIds: effective
      .filter((t) => t.key !== TITLE_KEY)
      .map((t) => t.key),
  };
}

/**
 * Applies a single RepairAction to the generated asset or component it targets
 * and flips its status to APPLIED. Applying an action from another project is
 * rejected; applying an already-applied action is idempotent.
 */
export async function applyRepair(
  deps: RepairDeps,
  options: ApplyRepairOptions,
): Promise<RepairAction> {
  const { db, now } = deps;
  const { projectId, actionId } = options;

  const repairRepo = new RepairActionRepository(db);
  const assetRepo = new GeneratedAssetRepository(db);
  const componentRepo = new GeneratedComponentRepository(db);

  const action = await repairRepo.get(actionId);
  if (action === undefined) {
    throw new CrexError("REPAIR_ACTION_NOT_FOUND", `repair action not found: ${actionId}`);
  }
  if (action.project_id !== projectId) {
    throw new CrexError(
      "INVALID_REPAIR_STATE",
      `repair action ${actionId} does not belong to project ${projectId}`,
    );
  }
  if (action.status === "REJECTED") {
    throw new CrexError(
      "INVALID_REPAIR_STATE",
      `repair action ${actionId} is REJECTED and cannot be applied`,
    );
  }
  if (action.status === "APPLIED") {
    return action;
  }

  if (action.component_id !== undefined) {
    const component = await componentRepo.get(action.component_id);
    if (component === undefined) {
      throw new CrexError(
        "INVALID_REPAIR_STATE",
        `generated component ${action.component_id} no longer exists`,
      );
    }
    await componentRepo.updateContent(action.component_id, action.repaired_text);
  } else {
    const asset = await assetRepo.get(action.asset_id);
    if (asset === undefined) {
      throw new CrexError("ASSET_NOT_FOUND", `generated asset ${action.asset_id} no longer exists`);
    }
    await assetRepo.updateTitle(action.asset_id, action.repaired_text, now());
  }

  const appliedAt = now();
  const applied = await repairRepo.updateStatus(actionId, "APPLIED", appliedAt);
  if (applied === undefined) {
    throw new CrexError(
      "REPAIR_ACTION_NOT_FOUND",
      `repair action disappeared while applying: ${actionId}`,
    );
  }
  return applied;
}