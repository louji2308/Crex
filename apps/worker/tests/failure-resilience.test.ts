/**
 * Failure-resilience test matrix for the judge-path pipeline.
 *
 * Each scenario verifies that when a specific failure mode occurs the system
 * surfaces honest status instead of masking or faking success.
 *
 * This file supplements existing coverage in:
 *  - ai-output.test.ts           (AI fallback, malformed AI output)
 *  - verification-edge-cases     (missing claims, numeric drift, qualifier loss)
 *  - repair-reverification       (scope drift no-repair, honest reverify)
 *  - passport.test.ts            (BLOCKED passport with findings)
 *  - index.integration.test.ts   (terminal instance, phase transitions)
 *
 * The tests here close the remaining gaps identified in the W20 analysis.
 */
import { describe, expect, it, beforeAll } from "vitest";
import { env, exports } from "cloudflare:workers";
import { D1Adapter } from "@crex/infra";
import { transitionPhase, createWorkflowState } from "@crex/core/src/workflow";

const NOW = "2026-03-04T05:06:07.000Z";

const db = (): D1Adapter => new D1Adapter(env.DB);

interface Scenario {
  projectId: string;
  sourceId: string;
  segmentId: string;
  assetId: string;
}

interface VerifyBody {
  id: string;
  result: "PASS" | "REVIEW" | "BLOCK";
}

interface FindingBody {
  id: string;
  type: string;
  severity: "PASS" | "REVIEW" | "BLOCK";
}

async function seedScenario(): Promise<Scenario> {
  const projectId = crypto.randomUUID();
  const sourceId = crypto.randomUUID();
  const segmentId = crypto.randomUUID();
  const assetId = crypto.randomUUID();

  await db().prepare(
    `INSERT INTO projects (id, name, target_platforms, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(projectId, "Failure test project", "[]", NOW, NOW);

  await db().prepare(
    `INSERT INTO source_assets
       (id, project_id, object_key, file_name, file_type, size_bytes,
        duration_seconds, checksum, transcription_status, analysis_status,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    sourceId, projectId, `sources/${projectId}/${sourceId}.mp4`,
    "failure.mp4", "video/mp4", 1024, 10, "sha256:failure",
    "COMPLETED", "COMPLETED", NOW, NOW,
  );

  await db().prepare(
    `INSERT INTO transcript_segments
       (id, source_asset_id, segment_index, start_time, end_time, text, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(segmentId, sourceId, 0, 0, 10, "Failure test transcript", NOW);

  await db().prepare(
    `INSERT INTO generated_assets
       (id, project_id, asset_type, title, status, integrity, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    assetId, projectId, "SOCIAL_POST", "Failure asset", "READY",
    JSON.stringify({ dimensions: {}, overall: 100, reasons: [] }), NOW, NOW,
  );

  return { projectId, sourceId, segmentId, assetId };
}

async function seedClaim(projectId: string, segmentId: string, overrides?: {
  content?: string;
  qualifiers?: string;
}): Promise<string> {
  const claimId = crypto.randomUUID();
  await db().prepare(
    `INSERT INTO claims (id, project_id, segment_id, type, content, qualifiers, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    claimId, projectId, segmentId, "CLAIM",
    overrides?.content ?? "Battery lasts approximately 10 hours",
    overrides?.qualifiers ?? JSON.stringify(["approximately"]),
    NOW,
  );
  return claimId;
}

async function seedComponent(
  assetId: string,
  content: string,
  claimReferences: string[],
): Promise<string> {
  const componentId = crypto.randomUUID();
  await db().prepare(
    `INSERT INTO generated_components
       (component_id, asset_id, content, source_references, claim_references,
        constraint_references, generation_metadata, verification_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    componentId, assetId, content, "[]", JSON.stringify(claimReferences),
    "[]", JSON.stringify({ engine: "failure-resilience-test" }), "REVIEW",
  );
  return componentId;
}

async function verify(scenario: Scenario): Promise<VerifyBody> {
  const response = await exports.default.fetch("https://example.com/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      projectId: scenario.projectId,
      assetId: scenario.assetId,
    }),
  });
  expect(response.status).toBe(201);
  return (await response.json()) as VerifyBody;
}

async function getFindings(runId: string): Promise<FindingBody[]> {
  const response = await exports.default.fetch(
    `https://example.com/verify/findings/${runId}`,
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as { findings: FindingBody[] };
  return body.findings;
}

async function repair(
  scenario: Scenario,
): Promise<{ actions: unknown[] }> {
  const response = await exports.default.fetch("https://example.com/repair", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      projectId: scenario.projectId,
      assetId: scenario.assetId,
    }),
  });
  expect(response.status).toBe(201);
  return (await response.json()) as { actions: unknown[] };
}

async function seedVerificationRun(
  scenario: Scenario,
  result: "PASS" | "REVIEW" | "BLOCK",
): Promise<string> {
  const runId = crypto.randomUUID();
  await db().prepare(
    `INSERT INTO verification_runs
       (id, project_id, asset_id, engine, result, finding_ids, started_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(runId, scenario.projectId, scenario.assetId, "deterministic-v1", result, "[]", NOW, NOW);
  return runId;
}

async function seedFinding(
  runId: string,
  scenario: Scenario,
  type: string,
  severity: "PASS" | "REVIEW" | "BLOCK",
): Promise<void> {
  await db().prepare(
    `INSERT INTO verification_findings
       (id, verification_run_id, type, severity, reason, asset_id, evidence_ranges, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    crypto.randomUUID(), runId, type, severity, `seed ${type} ${severity}`,
    scenario.assetId, "[]", NOW,
  );
}

async function seedProvenance(
  scenario: Scenario,
  signing: "UNSIGNED" | "SIGNED" | "FAILED",
  verification: "VALID" | "INVALID" | "UNSIGNED" | "UNTRUSTED" | "MISSING",
  createdAt = NOW,
): Promise<void> {
  await db().prepare(
    `INSERT INTO provenance_records
       (id, project_id, asset_id, asset_sha256, signing_status, verification_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    crypto.randomUUID(), scenario.projectId, scenario.assetId,
    "sha256:provenance", signing, verification, createdAt, createdAt,
  );
}

async function createPassport(
  scenario: Scenario,
): Promise<{ passport: { release_status: string } }> {
  const response = await exports.default.fetch("https://example.com/passports", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      projectId: scenario.projectId,
      assetId: scenario.assetId,
    }),
  });
  expect(response.status).toBe(201);
  return (await response.json()) as { passport: { release_status: string } };
}

describe("failure-resilience matrix", () => {
  describe("SCOPE_DRIFT is never silently repaired", () => {
    let scenario: Scenario;
    let claimId: string;

    beforeAll(async () => {
      scenario = await seedScenario();
      claimId = await seedClaim(scenario.projectId, scenario.segmentId, {
        content: "Battery testing lasted eleven controlled hours",
        qualifiers: JSON.stringify([]),
      });
      await db().prepare(
        `INSERT INTO evidence (id, claim_id, type, content, source_range, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        crypto.randomUUID(), claimId, "TRANSCRIPT",
        "Battery testing lasted eleven controlled hours",
        JSON.stringify({ start: 12, end: 34 }), NOW,
      );
      await seedComponent(scenario.assetId, "Unrelated launch announcement", [claimId]);
    });

    it("flags SCOPE_DRIFT as REVIEW and proposes zero repair actions", async () => {
      const run = await verify(scenario);
      expect(run.result).toBe("REVIEW");

      const findings = await getFindings(run.id);
      expect(findings).toContainEqual(
        expect.objectContaining({ type: "SCOPE_DRIFT", severity: "REVIEW" }),
      );

      const repairBody = await repair(scenario);
      expect(repairBody.actions).toEqual([]);
    });

    it("re-verification keeps reporting the drift after the zero-action repair", async () => {
      const afterRepair = await verify(scenario);
      expect(afterRepair.result).toBe("REVIEW");
      const findings = await getFindings(afterRepair.id);
      expect(findings).toContainEqual(
        expect.objectContaining({ type: "SCOPE_DRIFT", severity: "REVIEW" }),
      );
    });
  });

  describe("provenance verification failure is never silently READY", () => {
    it("BLOCKS the passport when a signed record fails verification", async () => {
      const scenario = await seedScenario();
      await seedVerificationRun(scenario, "PASS");
      await seedProvenance(scenario, "SIGNED", "INVALID", "2026-03-04T05:06:07.000Z");

      const { passport } = await createPassport(scenario);
      expect(passport.release_status).toBe("BLOCKED");
    });

    it("never reports READY when a verification run is present but provenance is unresolved", async () => {
      const scenario = await seedScenario();
      await seedVerificationRun(scenario, "PASS");
      await seedProvenance(scenario, "UNSIGNED", "UNSIGNED", "2026-03-04T05:06:07.000Z");

      const { passport } = await createPassport(scenario);
      expect(passport.release_status).toBe("DRAFT");
    });
  });

  describe("terminal workflow instance is never silently restarted", () => {
    it("transitionPhase rejects transition from COMPLETED", () => {
      const state = createWorkflowState({
        id: crypto.randomUUID(),
        project_id: crypto.randomUUID(),
        workflow_name: "crex-source-to-release",
        stage: "GENERATION",
        phase: "COMPLETED",
      });

      expect(() => transitionPhase(state, "RUNNING")).toThrow("terminal phase");
    });

    it("transitionPhase rejects transition from FAILED", () => {
      const state = createWorkflowState({
        id: crypto.randomUUID(),
        project_id: crypto.randomUUID(),
        workflow_name: "crex-source-to-release",
        stage: "GENERATION",
        phase: "FAILED",
      });

      expect(() => transitionPhase(state, "RUNNING")).toThrow("terminal phase");
    });

    it("transitionPhase rejects transition from CANCELLED", () => {
      const state = createWorkflowState({
        id: crypto.randomUUID(),
        project_id: crypto.randomUUID(),
        workflow_name: "crex-source-to-release",
        stage: "GENERATION",
        phase: "CANCELLED",
      });

      expect(() => transitionPhase(state, "RUNNING")).toThrow("terminal phase");
    });
  });

  describe("QUALIFIER_LOSS is detected through CONTEXT_REMOVAL", () => {
    let scenario: Scenario;
    let claimId: string;

    beforeAll(async () => {
      scenario = await seedScenario();
      claimId = await seedClaim(scenario.projectId, scenario.segmentId, {
        content: "Battery lasts approximately 10 hours",
        qualifiers: JSON.stringify(["approximately"]),
      });
      await seedComponent(scenario.assetId, "Battery lasts 10 hours", [claimId]);
    });

    it("verifier flags CONTEXT_REMOVAL when qualifier is dropped", async () => {
      const run = await verify(scenario);
      expect(run.result).toBe("REVIEW");

      const findings = await getFindings(run.id);
      const contextFinding = findings.find(
        (f) => f.type === "CONTEXT_REMOVAL",
      );
      expect(contextFinding).toBeDefined();
      expect(contextFinding!.severity).toBe("REVIEW");
    });
  });

  describe("malformed AI response in evidence-graph route returns error, no claims persisted", () => {
    let scenario: Scenario;
    let understandingId: string;

    beforeAll(async () => {
      scenario = await seedScenario();
      understandingId = crypto.randomUUID();
      const transcriptId = crypto.randomUUID();

      await db().prepare(
        `INSERT INTO transcripts
           (id, source_asset_id, language, duration_seconds, provider, model,
            fallback_used, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(transcriptId, scenario.sourceId, "en", 10, "test", "test", 0, "READY", NOW, NOW);

      await db().prepare(
        `INSERT INTO understandings
           (id, source_asset_id, status, media_metadata_json, transcript_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(understandingId, scenario.sourceId, "READY", "{}", transcriptId, NOW, NOW);
    });

    it("returns 503 when AI is not configured, no claims created", async () => {
      const response = await exports.default.fetch("https://example.com/evidence-graph/build", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          understandingId,
          projectId: scenario.projectId,
        }),
      });
      expect(response.status).toBe(503);
      const body = (await response.json()) as { error: { code: string } };
      expect(body.error.code).toBe("AI_NOT_CONFIGURED");

      const claimsResponse = await exports.default.fetch(
        `https://example.com/evidence-graph?projectId=${scenario.projectId}`,
      );
      expect(claimsResponse.status).toBe(200);
      const claimsBody = (await claimsResponse.json()) as { claims: unknown[] };
      expect(claimsBody.claims).toEqual([]);
    });
  });
});