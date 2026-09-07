import { describe, it, expect } from "vitest";
import {
  ProjectRepository,
  SourceAssetRepository,
  TranscriptSegmentRepository,
  ClaimRepository,
  EvidenceRepository,
  GeneratedAssetRepository,
  GeneratedComponentRepository,
  VerificationRunRepository,
  VerificationFindingRepository,
} from "@crex/db";
import { withMemoryDb } from "../helpers/memory-db.js";
import {
  projectFixture,
  sourceAssetFixture,
  transcriptSegmentFixture,
  claimFixture,
  evidenceFixture,
  generatedAssetFixture,
  generatedComponentFixture,
  verificationRunFixture,
  verificationFindingFixture,
} from "../fixtures/schemas.js";

describe("schemas + db integration on in-memory SQLite", () => {
  it("migrates all 10 tables", async () => {
    await withMemoryDb(async (db) => {
      const rows = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        .all();
      const names = rows.map((row) => String(row.name)).sort();
      expect(names).toContain("projects");
      expect(names).toContain("source_assets");
      expect(names).toContain("transcript_segments");
      expect(names).toContain("claims");
      expect(names).toContain("evidence");
      expect(names).toContain("generated_assets");
      expect(names).toContain("generated_components");
      expect(names).toContain("verification_runs");
      expect(names).toContain("verification_findings");
      expect(names).toContain("workflow_state");
    });
  });

  it(
    "persists and round-trips a project + source asset + transcript + claim + evidence + component chain",
    async () => {
      await withMemoryDb(async (db) => {
        const projects = new ProjectRepository(db);
        const sources = new SourceAssetRepository(db);
        const segments = new TranscriptSegmentRepository(db);
        const claims = new ClaimRepository(db);
        const evidenceRepo = new EvidenceRepository(db);
        const assets = new GeneratedAssetRepository(db);
        const components = new GeneratedComponentRepository(db);

        const project = projectFixture();
        projects.insert(project);

        const source = sourceAssetFixture({ project_id: project.id });
        sources.insert(source);

        const segment = transcriptSegmentFixture({ source_asset_id: source.id });
        segments.insert(segment);

        const claim = claimFixture({ project_id: project.id, segment_id: segment.id });
        claims.insert(claim);

        const ev = evidenceFixture({ claim_id: claim.id });
        evidenceRepo.insert(ev);

        const asset = generatedAssetFixture({ project_id: project.id });
        assets.insert(asset);

        const component = generatedComponentFixture({ asset_id: asset.id });
        components.insert(component);

        const roundTripSource = sources.get(source.id);
        expect(roundTripSource).not.toBeUndefined();
        expect(roundTripSource!.checksum).toBe(source.checksum);
        expect(roundTripSource!.size_bytes).toBe(source.size_bytes);

        const roundTripClaim = claims.get(claim.id);
        expect(roundTripClaim!.content).toBe(claim.content);
      });
    },
  );

  it("lists claims by transcript and evidence by claim (FK queries)", async () => {
    await withMemoryDb(async (db) => {
      const projects = new ProjectRepository(db);
      const sources = new SourceAssetRepository(db);
      const segments = new TranscriptSegmentRepository(db);
      const claims = new ClaimRepository(db);
      const evidenceRepo = new EvidenceRepository(db);

      const project = projectFixture();
      projects.insert(project);
      const source = sourceAssetFixture({ project_id: project.id });
      sources.insert(source);
      const segment = transcriptSegmentFixture({ source_asset_id: source.id });
      segments.insert(segment);

      const c1 = claimFixture({ project_id: project.id, segment_id: segment.id });
      const c2 = claimFixture({ project_id: project.id, segment_id: segment.id });
      claims.insert(c1);
      claims.insert(c2);

      const bySegment = claims.listBySegment(segment.id);
      expect(bySegment.map((c) => c.id).sort()).toEqual([c1.id, c2.id].sort());

      const ev = evidenceFixture({ claim_id: c1.id });
      evidenceRepo.insert(ev);
      const evs = evidenceRepo.listByClaim(c1.id);
      expect(evs.map((e) => e.id)).toContain(ev.id);
    });
  });

  it("persists a verification run with findings and lists findings by run", async () => {
    await withMemoryDb(async (db) => {
      const projects = new ProjectRepository(db);
      const assets = new GeneratedAssetRepository(db);
      const components = new GeneratedComponentRepository(db);
      const runs = new VerificationRunRepository(db);
      const findings = new VerificationFindingRepository(db);

      const project = projectFixture();
      projects.insert(project);
      const asset = generatedAssetFixture({ project_id: project.id });
      assets.insert(asset);
      const component = generatedComponentFixture({ asset_id: asset.id });
      components.insert(component);

      const run = verificationRunFixture({
        project_id: project.id,
        asset_id: asset.id,
      });
      runs.insert(run);

      const f1 = verificationFindingFixture({
        verification_run_id: run.id,
        asset_id: asset.id,
        component_id: component.component_id,
      });
      const f2 = verificationFindingFixture({
        verification_run_id: run.id,
        asset_id: asset.id,
        component_id: component.component_id,
      });
      findings.insert(f1);
      findings.insert(f2);

      const runBack = runs.get(run.id);
      expect(runBack).not.toBeUndefined();
      expect(runBack!.result).toBe(run.result);

      const listed = findings.listByRun(run.id);
      expect(listed).toHaveLength(2);
      expect(listed.map((f) => f.id).sort()).toEqual([f1.id, f2.id].sort());
    });
  });
});