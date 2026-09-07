import { describe, expect, it } from "vitest";
import { env, exports } from "cloudflare:workers";
import { D1Adapter } from "@crex/infra";

interface ErrorBody {
  error: { code: string; message: string };
}

interface RunBody {
  id: string;
  project_id: string;
  asset_id: string;
  result: "PASS" | "REVIEW" | "BLOCK";
  finding_ids: string[];
  completed_at?: string;
}

interface FindingBody {
  id: string;
  verification_run_id: string;
  type: string;
  severity: "PASS" | "REVIEW" | "BLOCK";
  reason: string;
  asset_id?: string;
  component_id?: string;
  generated_text?: string;
  source_text?: string;
  evidence_ranges: Array<{ start: number; end: number }>;
  recommendation?: string;
}

interface Scenario {
  projectId: string;
  sourceId: string;
  segmentId: string;
  assetId: string;
}

interface ScenarioOptions {
  assetType?: string;
  title?: string;
}

interface ClaimOptions {
  content: string;
  qualifiers?: string[];
  type?: string;
}

interface RepairBody {
  actions: RepairActionBody[];
}

interface RepairActionBody {
  id: string;
  project_id: string;
  finding_id: string;
  asset_id: string;
  component_id?: string;
  status: "PROPOSED" | "APPLIED" | "REJECTED";
  original_text: string;
  repaired_text: string;
  source_references: string[];
  constraint_references: string[];
  engine: string;
  created_at: string;
  updated_at: string;
}

interface ApplyRepairBody {
  action: RepairActionBody;
}

interface ReverifyBody {
  previousRunId: string;
  reverificationRunId: string;
  result: "PASS" | "REVIEW" | "BLOCK";
  findingCount: number;
  appliedActionCount: number;
  proposedActionCount: number;
}

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

async function seedScenario(options: ScenarioOptions = {}): Promise<Scenario> {
  const projectId = crypto.randomUUID();
  const sourceId = crypto.randomUUID();
  const segmentId = crypto.randomUUID();
  const assetId = crypto.randomUUID();

  await db().prepare(
    `INSERT INTO projects (id, name, target_platforms, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(projectId, "Repair re-verification project", "[]", NOW, NOW);

  await db().prepare(
    `INSERT INTO source_assets
       (id, project_id, object_key, file_name, file_type, size_bytes,
        duration_seconds, checksum, transcription_status, analysis_status,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    sourceId,
    projectId,
    `sources/${projectId}/${sourceId}.mp4`,
    "repair.mp4",
    "video/mp4",
    1024,
    10,
    "sha256:repair",
    "COMPLETED",
    "COMPLETED",
    NOW,
    NOW,
  );

  await db().prepare(
    `INSERT INTO transcript_segments
       (id, source_asset_id, segment_index, start_time, end_time, text, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(segmentId, sourceId, 0, 0, 10, "Repair source transcript", NOW);

  await db().prepare(
    `INSERT INTO generated_assets
       (id, project_id, asset_type, title, status, integrity, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    assetId,
    projectId,
    options.assetType ?? "SOCIAL_POST",
    options.title ?? "Repair asset",
    "READY",
    INTEGRITY,
    NOW,
    NOW,
  );

  return { projectId, sourceId, segmentId, assetId };
}

async function seedClaim(scenario: Scenario, options: ClaimOptions): Promise<string> {
  const claimId = crypto.randomUUID();
  await db().prepare(
    `INSERT INTO claims (id, project_id, segment_id, type, content, qualifiers, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    claimId,
    scenario.projectId,
    scenario.segmentId,
    options.type ?? "CLAIM",
    options.content,
    JSON.stringify(options.qualifiers ?? []),
    NOW,
  );
  return claimId;
}

async function seedComponent(
  scenario: Scenario,
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
    componentId,
    scenario.assetId,
    content,
    "[]",
    JSON.stringify(claimReferences),
    "[]",
    JSON.stringify({ engine: "repair-reverification-test" }),
    "REVIEW",
  );
  return componentId;
}

async function seedEvidence(
  claimId: string,
  sourceRange: { start: number; end: number },
): Promise<void> {
  await db().prepare(
    `INSERT INTO evidence (id, claim_id, type, content, source_range, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    crypto.randomUUID(),
    claimId,
    "TRANSCRIPT",
    "Supporting transcript evidence",
    JSON.stringify(sourceRange),
    NOW,
  );
}

async function seedSponsorRequirement(
  scenario: Scenario,
  requirementType: string,
  value: string,
  options: { required?: boolean; enabled?: boolean } = {},
): Promise<void> {
  await db().prepare(
    `INSERT INTO sponsor_requirements
       (id, project_id, sponsor_name, requirement_type, value, required, enabled,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    crypto.randomUUID(),
    scenario.projectId,
    "Repair Sponsor",
    requirementType,
    value,
    options.required === false ? 0 : 1,
    options.enabled === false ? 0 : 1,
    NOW,
    NOW,
  );
}

async function verify(scenario: Scenario): Promise<RunBody> {
  const response = await exports.default.fetch("https://example.com/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ projectId: scenario.projectId, assetId: scenario.assetId }),
  });
  expect(response.status).toBe(201);
  return response.json() as Promise<RunBody>;
}

async function getFindings(runId: string): Promise<FindingBody[]> {
  const response = await exports.default.fetch(
    `https://example.com/verify/findings/${runId}`,
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as { findings: FindingBody[] };
  return body.findings;
}

async function repair(scenario: Scenario, runId?: string): Promise<RepairBody> {
  const body = runId === undefined
    ? { projectId: scenario.projectId, assetId: scenario.assetId }
    : { projectId: scenario.projectId, assetId: scenario.assetId, runId };
  const response = await exports.default.fetch("https://example.com/repair", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  expect(response.status).toBe(201);
  return response.json() as Promise<RepairBody>;
}

async function applyAction(
  scenario: Scenario,
  actionId: string,
): Promise<ApplyRepairBody> {
  const response = await exports.default.fetch(
    `https://example.com/repair/${actionId}/apply`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: scenario.projectId }),
    },
  );
  expect(response.status).toBe(200);
  return response.json() as Promise<ApplyRepairBody>;
}

async function reverify(scenario: Scenario, runId?: string): Promise<ReverifyBody> {
  const body = runId === undefined
    ? { projectId: scenario.projectId, assetId: scenario.assetId }
    : { projectId: scenario.projectId, assetId: scenario.assetId, runId };
  const response = await exports.default.fetch("https://example.com/reverify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  expect(response.status).toBe(201);
  return response.json() as Promise<ReverifyBody>;
}

async function listActionsByAsset(assetId: string): Promise<RepairActionBody[]> {
  const response = await exports.default.fetch(
    `https://example.com/repair/actions?assetId=${assetId}`,
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as { actions: RepairActionBody[] };
  return body.actions;
}

describe("repair engine", () => {
  it("rejects repair for an asset with no verification run", async () => {
    const scenario = await seedScenario();
    await seedComponent(scenario, "Any content");

    const response = await exports.default.fetch("https://example.com/repair", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: scenario.projectId, assetId: scenario.assetId }),
    });

    expect(response.status).toBe(404);
    const body = (await response.json()) as ErrorBody;
    expect(body.error.code).toBe("VERIFICATION_RUN_NOT_FOUND");
  });

  it("proposes a sponsor repair and applies it to reach PASS", async () => {
    const scenario = await seedScenario();
    await seedSponsorRequirement(scenario, "REQUIRED_PHRASE", "sponsor.example/offer");
    await seedComponent(scenario, "Content without the sponsor requirement");

    const run = await verify(scenario);
    expect(run.result).toBe("BLOCK");

    const repairBody = await repair(scenario, run.id);
    expect(repairBody.actions).toHaveLength(1);
    const action = repairBody.actions[0]!;
    expect(action).toMatchObject({
      status: "PROPOSED",
      engine: "deterministic-repair-v1",
      original_text: "Content without the sponsor requirement",
      source_references: [],
      constraint_references: [],
    });
    expect(action.repaired_text.toLowerCase()).toContain("sponsor.example/offer");

    const listed = await listActionsByAsset(scenario.assetId);
    expect(listed).toHaveLength(1);
    expect(listed[0]!.id).toBe(action.id);

    const reverifyBody = await reverify(scenario, run.id);
    expect(reverifyBody).toMatchObject({
      previousRunId: run.id,
      result: "PASS",
      findingCount: 0,
      appliedActionCount: 1,
      proposedActionCount: 1,
    });
    expect(reverifyBody.reverificationRunId).not.toBe(run.id);

    const after = await listActionsByAsset(scenario.assetId);
    expect(after[0]!.status).toBe("APPLIED");

    const component = await db().prepare(
      "SELECT content FROM generated_components WHERE component_id = ?",
    ).get(listed[0]!.component_id as string);
    expect(String(component?.content ?? "").toLowerCase()).toContain("sponsor.example/offer");
  });

  it("truncates an oversized YouTube title on apply and re-verifies clean", async () => {
    const scenario = await seedScenario({
      assetType: "YOUTUBE_TITLE",
      title: "T".repeat(101),
    });
    const claimId = await seedClaim(scenario, {
      content: "Battery testing lasted eleven controlled hours",
    });
    await seedComponent(scenario, "Battery testing lasted eleven controlled hours", [claimId]);

    const run = await verify(scenario);
    const titleFindings = (await getFindings(run.id)).filter(
      (finding) => finding.type === "PLATFORM_QA",
    );
    expect(titleFindings).toHaveLength(1);
    expect(titleFindings[0]!.generated_text).toBe("T".repeat(101));

    const repairBody = await repair(scenario, run.id);
    expect(repairBody.actions).toHaveLength(1);
    const action = repairBody.actions[0]!;
    expect(action.component_id).toBeUndefined();
    expect(action.original_text).toBe("T".repeat(101));
    expect(action.repaired_text).toBe("T".repeat(100));

    const applied = await applyAction(scenario, action.id);
    expect(applied.action.status).toBe("APPLIED");

    const row = await db().prepare(
      "SELECT title FROM generated_assets WHERE id = ?",
    ).get(scenario.assetId);
    expect(String(row?.title ?? "")).toBe("T".repeat(100));

    const reverifyBody = await reverify(scenario, run.id);
    expect(reverifyBody).toMatchObject({
      previousRunId: run.id,
      result: "PASS",
      findingCount: 0,
      appliedActionCount: 0,
      proposedActionCount: 0,
    });
  });

  it("fixes a numerical drift by rewriting the generated number", async () => {
    const scenario = await seedScenario();
    const claimId = await seedClaim(scenario, {
      type: "NUMERICAL",
      content: "Battery score is 100 points",
    });
    await seedComponent(scenario, "Battery score is 99 points", [claimId]);

    const run = await verify(scenario);
    const numericalFindings = (await getFindings(run.id)).filter(
      (finding) => finding.type === "NUMERICAL_DRIFT",
    );
    expect(numericalFindings).toHaveLength(1);

    const repairBody = await repair(scenario, run.id);
    expect(repairBody.actions).toHaveLength(1);
    expect(repairBody.actions[0]!.repaired_text).toBe("Battery score is 100 points");
    expect(repairBody.actions[0]!.source_references).toEqual([claimId]);

    const reverifyBody = await reverify(scenario, run.id);
    expect(reverifyBody).toMatchObject({
      previousRunId: run.id,
      result: "PASS",
      findingCount: 0,
      appliedActionCount: 1,
      proposedActionCount: 1,
    });

    const after = await listActionsByAsset(scenario.assetId);
    expect(after[0]!.status).toBe("APPLIED");
  });

  it("honestly reports an unrepaired verification run as a real new BLOCK", async () => {
    const scenario = await seedScenario();
    const claimId = await seedClaim(scenario, {
      type: "NUMERICAL",
      content: "Battery score is 100 points",
    });
    await seedComponent(scenario, "Battery score is 99 points", [claimId]);

    const run = await verify(scenario);
    expect(run.result).toBe("BLOCK");

    const reverifyBody = await reverify(scenario, run.id);
    expect(reverifyBody).toMatchObject({
      previousRunId: run.id,
      result: "BLOCK",
      appliedActionCount: 0,
      proposedActionCount: 0,
    });
    expect(reverifyBody.reverificationRunId).not.toBe(run.id);

    const latestFindings = await getFindings(reverifyBody.reverificationRunId);
    expect(latestFindings).toContainEqual(
      expect.objectContaining({ type: "NUMERICAL_DRIFT", severity: "BLOCK" }),
    );
  });

  it("does not propose a repair for a scope drift", async () => {
    const scenario = await seedScenario();
    const claimId = await seedClaim(scenario, {
      content: "Battery testing lasted eleven controlled hours",
    });
    await seedEvidence(claimId, { start: 12, end: 34 });
    await seedComponent(scenario, "Unrelated launch announcement", [claimId]);

    const run = await verify(scenario);
    expect(run.result).toBe("REVIEW");

    const repairBody = await repair(scenario, run.id);
    expect(repairBody.actions).toEqual([]);
    await expect(listActionsByAsset(scenario.assetId)).resolves.toEqual([]);
  });

  it("returns not found for an unknown repair action", async () => {
    const scenario = await seedScenario();
    const response = await exports.default.fetch(
      `https://example.com/repair/${crypto.randomUUID()}/apply`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId: scenario.projectId }),
      },
    );

    expect(response.status).toBe(404);
    const body = (await response.json()) as ErrorBody;
    expect(body.error.code).toBe("REPAIR_ACTION_NOT_FOUND");
  });

  it("rejects applying an action from another project", async () => {
    const scenario = await seedScenario();
    const otherProject = await seedScenario();
    await seedSponsorRequirement(scenario, "REQUIRED_PHRASE", "sponsor.example/offer");
    await seedComponent(scenario, "Content without the sponsor requirement");

    const run = await verify(scenario);
    const repairBody = await repair(scenario, run.id);
    expect(repairBody.actions).toHaveLength(1);
    const actionId = repairBody.actions[0]!.id;

    const response = await exports.default.fetch(
      `https://example.com/repair/${actionId}/apply`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId: otherProject.projectId }),
      },
    );

    expect(response.status).toBe(409);
    const body = (await response.json()) as ErrorBody;
    expect(body.error.code).toBe("INVALID_REPAIR_STATE");
  });

  it("lists actions by verification run when assetId is omitted", async () => {
    const scenario = await seedScenario();
    await seedSponsorRequirement(scenario, "REQUIRED_PHRASE", "other.example/offer");
    await seedComponent(scenario, "Content missing the other offer");

    const run = await verify(scenario);
    const repairBody = await repair(scenario, run.id);
    expect(repairBody.actions).toHaveLength(1);

    const response = await exports.default.fetch(
      `https://example.com/repair/actions?runId=${run.id}`,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { actions: RepairActionBody[] };
    expect(body.actions.map((action) => action.id)).toEqual(
      repairBody.actions.map((action) => action.id),
    );
  });
});