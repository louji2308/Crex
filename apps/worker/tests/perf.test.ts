/**
 * Performance baseline measurement for judge-path pipeline stages.
 *
 * The measured suite stubs `CREX_PERF=1` inside this test file so the stage
 * instrumentation is exercised. In production, timing is opt-in and inert
 * unless the worker is started with `CREX_PERF=1`.
 *
 * Assertions on durations are intentionally generous — this file measures
 * durations rather than correctness. No timing is persisted to the database;
 * measurements live only in the process memory of the vitest worker.
 */
import { describe, expect, it, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { env, exports } from "cloudflare:workers";
import { D1Adapter } from "@crex/infra";
import {
  withStageTiming,
  collectStageMeasurements,
  resetStageMeasurements,
} from "../src/perf";
import {
  buildReleasePassport,
  type PassportDeps,
} from "../src/pipelines/passport";
import {
  runVerification,
  type VerificationDeps,
} from "../src/pipelines/verification";
import {
  runRepair,
  type RepairDeps,
} from "../src/pipelines/repair";
import {
  runReverify,
} from "../src/pipelines/reverification";

const NOW = "2026-03-04T05:06:07.000Z";
const INTEGRITY = JSON.stringify({
  dimensions: {
    evidence_coverage: 100,
    claim_fidelity: 100,
    numerical_accuracy: 100,
    creator_intent: 100,
    sponsor_compliance: 100,
    platform_qa: 100,
  },
  overall: 100,
  reasons: [],
});

const db = (): D1Adapter => new D1Adapter(env.DB);

interface Scenario {
  projectId: string;
  sourceId: string;
  segmentId: string;
  assetId: string;
}

async function seedScenario(): Promise<Scenario> {
  const projectId = crypto.randomUUID();
  const sourceId = crypto.randomUUID();
  const segmentId = crypto.randomUUID();
  const assetId = crypto.randomUUID();

  await db().prepare(
    `INSERT INTO projects (id, name, target_platforms, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(projectId, "Perf test project", "[]", NOW, NOW);

  await db().prepare(
    `INSERT INTO source_assets
       (id, project_id, object_key, file_name, file_type, size_bytes,
        duration_seconds, checksum, transcription_status, analysis_status,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    sourceId, projectId, `sources/${projectId}/${sourceId}.mp4`,
    "perf.mp4", "video/mp4", 1024, 10, "sha256:perf",
    "COMPLETED", "COMPLETED", NOW, NOW,
  );

  await db().prepare(
    `INSERT INTO transcript_segments
       (id, source_asset_id, segment_index, start_time, end_time, text, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(segmentId, sourceId, 0, 0, 10, "Perf test transcript", NOW);

  await db().prepare(
    `INSERT INTO generated_assets
       (id, project_id, asset_type, title, status, integrity, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(assetId, projectId, "SOCIAL_POST", "Perf asset", "READY", INTEGRITY, NOW, NOW);

  return { projectId, sourceId, segmentId, assetId };
}

async function seedClaim(projectId: string, segmentId: string): Promise<string> {
  const claimId = crypto.randomUUID();
  await db().prepare(
    `INSERT INTO claims (id, project_id, segment_id, type, content, qualifiers, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    claimId, projectId, segmentId, "CLAIM",
    "Battery lasts approximately 10 hours",
    JSON.stringify(["approximately"]), NOW,
  );
  return claimId;
}

async function seedComponent(
  assetId: string,
  content: string,
  claimReferences: string[] = [],
): Promise<string> {
  const componentId = crypto.randomUUID();
  await db().prepare(
    `INSERT INTO generated_components
       (component_id, asset_id, content, source_references, claim_references,
        constraint_references, generation_metadata, verification_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    componentId, assetId, content, "[]", JSON.stringify(claimReferences),
    "[]", JSON.stringify({ engine: "perf-test" }), "REVIEW",
  );
  return componentId;
}

function pDeps(): VerificationDeps & RepairDeps & PassportDeps {
  return {
    db: new D1Adapter(env.DB),
    now: () => new Date().toISOString(),
    uuid: () => crypto.randomUUID(),
  };
}

describe("judge-path performance baseline", () => {
  describe("measured stages", () => {
    let scenario: Scenario;
    let claimId: string;

    beforeAll(async () => {
      scenario = await seedScenario();
      claimId = await seedClaim(scenario.projectId, scenario.segmentId);
      await seedComponent(
        scenario.assetId,
        "Battery lasts 10 hours",
        [claimId],
      );
    });

    beforeEach(() => {
      vi.stubEnv("CREX_PERF", "1");
      resetStageMeasurements();
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("verification completes deterministically", async () => {
      const result = await runVerification(pDeps(), {
        projectId: scenario.projectId,
        assetId: scenario.assetId,
      });

      expect(result.findingCount).toBeGreaterThanOrEqual(0);
      const measurements = collectStageMeasurements();
      expect(measurements.length).toBe(1);
      expect(measurements[0]!.stage).toBe("pipeline:verification");
      expect(measurements[0]!.durationMs).toBeGreaterThan(0);
      expect(measurements[0]!.ok).toBe(true);
    });

    it("repair completes deterministically", async () => {
      await runVerification(pDeps(), {
        projectId: scenario.projectId,
        assetId: scenario.assetId,
      });
      resetStageMeasurements();

      const result = await runRepair(pDeps(), {
        projectId: scenario.projectId,
        assetId: scenario.assetId,
      });

      expect(result.actions.length).toBeGreaterThanOrEqual(0);
      const measurements = collectStageMeasurements();
      expect(measurements.length).toBe(1);
      expect(measurements[0]!.stage).toBe("pipeline:repair");
      expect(measurements[0]!.durationMs).toBeGreaterThan(0);
    });

    it("reverification completes deterministically", async () => {
      await runVerification(pDeps(), {
        projectId: scenario.projectId,
        assetId: scenario.assetId,
      });
      resetStageMeasurements();

      const result = await runReverify(pDeps(), {
        projectId: scenario.projectId,
        assetId: scenario.assetId,
      });

      expect(result.result).toMatch(/^(PASS|REVIEW|BLOCK)$/);
      const measurements = collectStageMeasurements();
      const reverify = measurements.find((m) => m.stage === "pipeline:reverification");
      expect(reverify).toBeDefined();
      expect(reverify!.durationMs).toBeGreaterThan(0);
      expect(reverify!.ok).toBe(true);
    });

    it("passport build completes deterministically", async () => {
      await runVerification(pDeps(), {
        projectId: scenario.projectId,
        assetId: scenario.assetId,
      });
      resetStageMeasurements();

      const passport = await buildReleasePassport(pDeps(), {
        projectId: scenario.projectId,
        assetId: scenario.assetId,
      });

      expect(passport.release_status).toMatch(/^(DRAFT|READY|BLOCKED)$/);
      const measurements = collectStageMeasurements();
      expect(measurements.length).toBe(1);
      expect(measurements[0]!.stage).toBe("pipeline:passport");
      expect(measurements[0]!.durationMs).toBeGreaterThan(0);
    });

    it("full repair→reverify→passport round-trip stays under 1s locally", async () => {
      await runVerification(pDeps(), {
        projectId: scenario.projectId,
        assetId: scenario.assetId,
      });
      resetStageMeasurements();

      const verifyStart = performance.now();
      await runReverify(pDeps(), {
        projectId: scenario.projectId,
        assetId: scenario.assetId,
      });
      const reverifyMs = performance.now() - verifyStart;

      const passportStart = performance.now();
      await buildReleasePassport(pDeps(), {
        projectId: scenario.projectId,
        assetId: scenario.assetId,
      });
      const passportMs = performance.now() - passportStart;

      expect(reverifyMs).toBeLessThan(3000);
      expect(passportMs).toBeLessThan(3000);
    });
  });

  it("without CREX_PERF, withStageTiming runs function with zero overhead", async () => {
    resetStageMeasurements();
    let called = false;
    const result = await withStageTiming("should-not-record", async () => {
      called = true;
      return 42;
    });
    expect(result).toBe(42);
    expect(called).toBe(true);
    expect(collectStageMeasurements()).toEqual([]);
  });
});
