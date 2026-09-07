import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createSqlDb, type SqlDb } from "../src/sqlite";
import { migrate } from "../src/migrations";

let schemas: typeof import("@crex/schemas") | null = null;
try {
  schemas = await import("@crex/schemas");
} catch {
  schemas = null;
}

let repos: typeof import("../src/repositories") | null = null;
let fixtures: typeof import("./fixtures") | null = null;
let barrel: typeof import("../src") | null = null;

function reposOf(): typeof import("../src/repositories") {
  if (repos === null) {
    throw new Error("repositories unavailable: pending @crex/schemas integration");
  }
  return repos;
}

function fixturesOf(): typeof import("./fixtures") {
  if (fixtures === null) {
    throw new Error("fixtures unavailable: pending @crex/schemas integration");
  }
  return fixtures;
}

function barrelOf(): typeof import("../src") {
  if (barrel === null) {
    throw new Error("barrel unavailable: pending @crex/schemas integration");
  }
  return barrel;
}

const suite = schemas ? describe : describe.skip;

suite("integration", () => {
  let db: SqlDb;

  beforeEach(async () => {
    db = createSqlDb(":memory:");
    await migrate(db);
  });

  afterEach(async () => {
    if (db.isOpen) {
      await db.close();
    }
  });

  beforeAll(async () => {
    if (schemas === null) {
      return;
    }
    repos = await import("../src/repositories");
    fixtures = await import("./fixtures");
    barrel = await import("../src");
  });

  it("barrel exports the SqlDb surface, migration runner, and all repositories", () => {
    const barrelExports = barrelOf();
    expect(barrelExports.createSqlDb).toBeTypeOf("function");
    expect(barrelExports.SqliteDatabase).toBeTypeOf("function");
    expect(barrelExports.migrate).toBeTypeOf("function");
    expect(barrelExports.getMigrationsPath).toBeTypeOf("function");
    expect(barrelExports.listMigrations).toBeTypeOf("function");
    for (const repository of [
      "ProjectRepository",
      "SourceAssetRepository",
      "TranscriptSegmentRepository",
      "ClaimRepository",
      "EvidenceRepository",
      "GeneratedAssetRepository",
      "GeneratedComponentRepository",
      "VerificationRunRepository",
      "VerificationFindingRepository",
      "WorkflowStateRepository",
    ]) {
      expect(barrelExports[repository as keyof typeof barrelExports]).toBeTypeOf("function");
    }
  });

  it("persists the full project-to-finding chain with real provenance", async () => {
    const repos = reposOf();
    const fx = fixturesOf();
    const projectRepository = new repos.ProjectRepository(db);
    const sourceAssetRepository = new repos.SourceAssetRepository(db);
    const transcriptSegmentRepository = new repos.TranscriptSegmentRepository(db);
    const claimRepository = new repos.ClaimRepository(db);
    const evidenceRepository = new repos.EvidenceRepository(db);
    const generatedAssetRepository = new repos.GeneratedAssetRepository(db);
    const generatedComponentRepository = new repos.GeneratedComponentRepository(db);
    const verificationRunRepository = new repos.VerificationRunRepository(db);
    const verificationFindingRepository = new repos.VerificationFindingRepository(db);
    const workflowStateRepository = new repos.WorkflowStateRepository(db);

    const project = await projectRepository.insert(fx.makeProject());
    const sourceAsset = await sourceAssetRepository.insert(fx.makeSourceAsset());
    const segment = await transcriptSegmentRepository.insert(fx.makeTranscriptSegment());
    const claim = await claimRepository.insert(fx.makeClaim());
    const evidence = await evidenceRepository.insert(fx.makeEvidence());
    const generatedAsset = await generatedAssetRepository.insert(fx.makeGeneratedAsset());
    const component = await generatedComponentRepository.insert(fx.makeGeneratedComponent());
    const run = await verificationRunRepository.insert(fx.makeVerificationRun());
    const finding = await verificationFindingRepository.insert(fx.makeVerificationFinding());
    const workflow = await workflowStateRepository.insert(fx.makeWorkflowState());

    expect((await projectRepository.get(project.id))?.name).toBe("Budget Laptop Review");
    expect(await sourceAssetRepository.listByProject(project.id)).toHaveLength(1);
    expect(await transcriptSegmentRepository.listBySourceAsset(sourceAsset.id)).toHaveLength(1);
    expect(await claimRepository.listBySegment(segment.id)).toHaveLength(1);
    expect(await evidenceRepository.listByClaim(claim.id)).toHaveLength(1);
    expect(await generatedAssetRepository.listByProject(project.id)).toHaveLength(1);
    expect(await generatedComponentRepository.listByAsset(generatedAsset.id)).toHaveLength(1);
    expect(await verificationRunRepository.listByAsset(generatedAsset.id)).toHaveLength(1);
    expect(await verificationFindingRepository.listByRun(run.id)).toHaveLength(1);
    expect(await workflowStateRepository.listByProject(project.id)).toHaveLength(1);

    const storedRun = await verificationRunRepository.get(run.id);
    expect(storedRun?.result).toBe("PASS");
    expect(storedRun?.engine).toBe("deterministic:rules");
    expect(storedRun?.finding_ids).toEqual([finding.id]);

    const storedFinding = await verificationFindingRepository.get(finding.id);
    expect(storedFinding?.severity).toBe("BLOCK");
    expect(storedFinding?.evidence_ranges).toEqual([{ start: 523, end: 557 }]);

    const storedComponent = await generatedComponentRepository.get(component.component_id);
    expect(storedComponent?.content).toBe(component.content);
    expect(storedComponent?.verification_status).toBe("PASS");
  });
});