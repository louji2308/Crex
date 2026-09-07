import { D1Adapter } from "@crex/infra";
import { VerificationRunRepository } from "@crex/db/src/repositories/verification-runs";
import { VerificationFindingRepository } from "@crex/db/src/repositories/verification-findings";
import { GeneratedAssetRepository } from "@crex/db/src/repositories/generated-assets";
import { RepairActionRepository } from "@crex/db/src/repositories/repair-actions";
import { CrexError } from "@crex/core/src/errors";
import { runVerification, type VerificationDeps } from "./verification";
import { applyRepair, resolveRunForAsset } from "./repair";

export interface ReverifyOptions {
  projectId: string;
  assetId: string;
  runId?: string;
}

export interface ReverifyResult {
  previousRunId: string;
  reverificationRunId: string;
  result: "PASS" | "REVIEW" | "BLOCK";
  findingCount: number;
  appliedActionCount: number;
  proposedActionCount: number;
}

/**
 * Applies every PROPOSED repair action produced for the given/latest
 * verification run of an asset, then re-runs the independent verification
 * engine to produce a real new verification run. The re-verification result is
 * always the outcome of a fresh verifier run, never a consequence of the repair
 * completing. An asset with no proposed repairs is honest state, not an error.
 */
export async function runReverify(
  deps: VerificationDeps,
  options: ReverifyOptions,
): Promise<ReverifyResult> {
  const { db } = deps;
  const { projectId, assetId } = options;

  const assetRepo = new GeneratedAssetRepository(db);
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
  const runFindings = await findingRepo.listByRun(targetRun.id);
  const runFindingIds = new Set(runFindings.map((f) => f.id));

  const assetActions = await repairRepo.listByAsset(assetId);
  const proposed = assetActions.filter(
    (action) => action.status === "PROPOSED" && runFindingIds.has(action.finding_id),
  );

  let appliedActionCount = 0;
  for (const action of proposed) {
    await applyRepair(deps, { projectId, actionId: action.id });
    appliedActionCount++;
  }

  const verificationResult = await runVerification(deps, { projectId, assetId });

  return {
    previousRunId: targetRun.id,
    reverificationRunId: verificationResult.runId,
    result: verificationResult.result,
    findingCount: verificationResult.findingCount,
    appliedActionCount,
    proposedActionCount: proposed.length,
  };
}