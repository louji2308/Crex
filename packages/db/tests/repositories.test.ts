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

const suite = schemas ? describe : describe.skip;

suite("repositories", () => {
  let db: SqlDb;

  beforeEach(() => {
    db = createSqlDb(":memory:");
    migrate(db);
  });

  afterEach(() => {
    db.close();
  });

  beforeAll(async () => {
    if (schemas === null) {
      return;
    }
    repos = await import("../src/repositories");
    fixtures = await import("./fixtures");
  });

  it("projects: insert, get, list", () => {
    const { ProjectRepository } = reposOf();
    const fx = fixturesOf();
    const repository = new ProjectRepository(db);

    const input = fx.makeProject();
    const inserted = repository.insert(input);
    expect(inserted.id).toBe(fx.PROJECT_ID);
    expect(inserted.name).toBe("Budget Laptop Review");

    const got = repository.get(fx.PROJECT_ID);
    expect(got).toEqual(inserted);
    expect(got?.target_platforms).toEqual(["YOUTUBE", "INSTAGRAM"]);

    expect(repository.list()).toHaveLength(1);
    expect(repository.get("missing")).toBeUndefined();
  });

  it("source_assets: insert, get, listByProject", () => {
    const { ProjectRepository, SourceAssetRepository } = reposOf();
    const fx = fixturesOf();
    new ProjectRepository(db).insert(fx.makeProject());
    const repository = new SourceAssetRepository(db);

    const input = fx.makeSourceAsset();
    const inserted = repository.insert(input);
    expect(inserted.id).toBe(fx.ASSET_ID);

    expect(repository.get(fx.ASSET_ID)).toEqual(inserted);
    expect(repository.listByProject(fx.PROJECT_ID)).toEqual([inserted]);
    expect(repository.listByProject("other-project")).toEqual([]);
    expect(repository.list()).toHaveLength(1);
  });

  it("transcript_segments: insert, get, listBySourceAsset ordered by index", () => {
    const { ProjectRepository, SourceAssetRepository, TranscriptSegmentRepository } = reposOf();
    const fx = fixturesOf();
    new ProjectRepository(db).insert(fx.makeProject());
    new SourceAssetRepository(db).insert(fx.makeSourceAsset());
    const repository = new TranscriptSegmentRepository(db);

    const first = repository.insert(fx.makeTranscriptSegment({ segment_index: 0 }));
    const second = repository.insert(
      fx.makeTranscriptSegment({
        id: "b0000000-0000-4000-8000-000000000013",
        segment_index: 1,
        start_time: 28,
        end_time: 60,
      }),
    );

    expect(repository.get(fx.SEGMENT_ID)).toEqual(first);
    expect(repository.get("b0000000-0000-4000-8000-000000000013")).toEqual(second);
    expect(repository.listBySourceAsset(fx.ASSET_ID).map((s) => s.id)).toEqual([
      fx.SEGMENT_ID,
      "b0000000-0000-4000-8000-000000000013",
    ]);
    expect(repository.listBySourceAsset("other-asset")).toEqual([]);
  });

  it("claims: insert, get, JSON arrays round-trip, listByProject, listBySegment", () => {
    const { ProjectRepository, SourceAssetRepository, TranscriptSegmentRepository, ClaimRepository } = reposOf();
    const fx = fixturesOf();
    new ProjectRepository(db).insert(fx.makeProject());
    new SourceAssetRepository(db).insert(fx.makeSourceAsset());
    new TranscriptSegmentRepository(db).insert(fx.makeTranscriptSegment());
    const repository = new ClaimRepository(db);

    const input = fx.makeClaim();
    const inserted = repository.insert(input);
    expect(inserted.id).toBe(fx.CLAIM_ID);

    const got = repository.get(fx.CLAIM_ID);
    expect(got).toEqual(inserted);
    expect(got?.type).toBe("CLAIM");
    expect(got?.qualifiers).toEqual(["in our test"]);

    expect(repository.listByProject(fx.PROJECT_ID)).toEqual([inserted]);
    expect(repository.listBySegment(fx.SEGMENT_ID)).toEqual([inserted]);
    expect(repository.listBySegment("other-segment")).toEqual([]);
  });

  it("evidence: insert, get, source_range round-trip, listByClaim", () => {
    const repos = reposOf();
    const fx = fixturesOf();
    const { ProjectRepository, SourceAssetRepository, TranscriptSegmentRepository, ClaimRepository, EvidenceRepository } =
      repos;
    new ProjectRepository(db).insert(fx.makeProject());
    new SourceAssetRepository(db).insert(fx.makeSourceAsset());
    new TranscriptSegmentRepository(db).insert(fx.makeTranscriptSegment());
    new ClaimRepository(db).insert(fx.makeClaim());
    const repository = new EvidenceRepository(db);

    const input = fx.makeEvidence();
    const inserted = repository.insert(input);
    expect(inserted.id).toBe(fx.EVIDENCE_ID);

    const got = repository.get(fx.EVIDENCE_ID);
    expect(got).toEqual(inserted);
    expect(got?.source_range).toEqual({ start: 523, end: 557 });

    expect(repository.listByClaim(fx.CLAIM_ID)).toEqual([inserted]);
    expect(repository.listByClaim("other-claim")).toEqual([]);
  });

  it("generated_assets: insert, get, integrity round-trip, listByProject", () => {
    const { ProjectRepository, GeneratedAssetRepository } = reposOf();
    const fx = fixturesOf();
    new ProjectRepository(db).insert(fx.makeProject());
    const repository = new GeneratedAssetRepository(db);

    const input = fx.makeGeneratedAsset();
    const inserted = repository.insert(input);
    expect(inserted.id).toBe(fx.GENERATED_ASSET_ID);

    const got = repository.get(fx.GENERATED_ASSET_ID);
    expect(got).toEqual(inserted);
    expect(got?.integrity.overall).toBe(99);
    expect(got?.integrity.dimensions.numerical_accuracy).toBe(100);

    expect(repository.listByProject(fx.PROJECT_ID)).toEqual([inserted]);
    expect(repository.listByProject("other-project")).toEqual([]);
  });

  it("generated_components: insert, get, reference arrays round-trip, listByAsset", () => {
    const repos = reposOf();
    const fx = fixturesOf();
    const { ProjectRepository, GeneratedAssetRepository, GeneratedComponentRepository } = repos;
    new ProjectRepository(db).insert(fx.makeProject());
    new GeneratedAssetRepository(db).insert(fx.makeGeneratedAsset());
    const repository = new GeneratedComponentRepository(db);

    const input = fx.makeGeneratedComponent();
    const inserted = repository.insert(input);
    expect(inserted.component_id).toBe(fx.COMPONENT_ID);

    const got = repository.get(fx.COMPONENT_ID);
    expect(got).toEqual(inserted);
    expect(got?.source_references).toEqual([fx.SEGMENT_ID]);
    expect(got?.claim_references).toEqual([fx.CLAIM_ID]);
    expect(got?.constraint_references).toEqual([]);
    expect(got?.generation_metadata).toEqual({ engine: "nvidia", model: "llama3-70b" });
    expect(got?.verification_status).toBe("PASS");

    expect(repository.listByAsset(fx.GENERATED_ASSET_ID)).toEqual([inserted]);
    expect(repository.listByAsset("other-asset")).toEqual([]);
  });

  it("verification_runs: insert, get, provider identity preserved, finding_ids round-trip, listByAsset", () => {
    const repos = reposOf();
    const fx = fixturesOf();
    const { ProjectRepository, GeneratedAssetRepository, VerificationRunRepository } = repos;
    new ProjectRepository(db).insert(fx.makeProject());
    new GeneratedAssetRepository(db).insert(fx.makeGeneratedAsset());
    const repository = new VerificationRunRepository(db);

    const input = fx.makeVerificationRun();
    const inserted = repository.insert(input);

    const got = repository.get(fx.RUN_ID);
    expect(got).toEqual(inserted);
    expect(got?.result).toBe("PASS");
    expect(got?.engine).toBe("deterministic:rules");
    expect(got?.finding_ids).toEqual([fx.FINDING_ID]);

    expect(repository.listByAsset(fx.GENERATED_ASSET_ID)).toEqual([inserted]);
    expect(repository.listByAsset("other-asset")).toEqual([]);
  });

  it("verification_findings: insert, get, evidence_ranges round-trip, listByRun", () => {
    const repos = reposOf();
    const fx = fixturesOf();
    const {
      ProjectRepository,
      GeneratedAssetRepository,
      GeneratedComponentRepository,
      VerificationRunRepository,
      VerificationFindingRepository,
    } = repos;
    new ProjectRepository(db).insert(fx.makeProject());
    new GeneratedAssetRepository(db).insert(fx.makeGeneratedAsset());
    new GeneratedComponentRepository(db).insert(fx.makeGeneratedComponent());
    new VerificationRunRepository(db).insert(fx.makeVerificationRun());
    const repository = new VerificationFindingRepository(db);

    const input = fx.makeVerificationFinding();
    const inserted = repository.insert(input);
    expect(inserted.id).toBe(fx.FINDING_ID);

    const got = repository.get(fx.FINDING_ID);
    expect(got).toEqual(inserted);
    expect(got?.type).toBe("SPONSOR_COMPLIANCE");
    expect(got?.severity).toBe("BLOCK");
    expect(got?.evidence_ranges).toEqual([{ start: 523, end: 557 }]);

    expect(repository.listByRun(fx.RUN_ID)).toEqual([inserted]);
    expect(repository.listByRun("other-run")).toEqual([]);
  });

  it("workflow_state: insert, get, listByProject", () => {
    const { ProjectRepository, WorkflowStateRepository } = reposOf();
    const fx = fixturesOf();
    new ProjectRepository(db).insert(fx.makeProject());
    const repository = new WorkflowStateRepository(db);

    const input = fx.makeWorkflowState();
    const inserted = repository.insert(input);
    expect(inserted.id).toBe(fx.WORKFLOW_ID);

    const got = repository.get(fx.WORKFLOW_ID);
    expect(got).toEqual(inserted);
    expect(got?.workflow_name).toBe("analysis");
    expect(got?.phase).toBe("RUNNING");
    expect(got?.stage).toBe("EVIDENCE_GRAPH");

    expect(repository.listByProject(fx.PROJECT_ID)).toEqual([inserted]);
    expect(repository.listByProject("other-project")).toEqual([]);
  });

  it("rejects an insert that violates a foreign key", () => {
    const { SourceAssetRepository } = reposOf();
    const fx = fixturesOf();
    const repository = new SourceAssetRepository(db);

    expect(() =>
      repository.insert(fx.makeSourceAsset({ project_id: "ffffffff-ffff-4fff-8fff-ffffffffffff" })),
    ).toThrow(/foreign key/i);
  });
});