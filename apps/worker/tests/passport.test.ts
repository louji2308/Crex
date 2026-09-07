import { describe, expect, it } from "vitest";
import { env, exports } from "cloudflare:workers";
import { D1Adapter } from "@crex/infra";

interface ErrorBody {
  error: { code: string; message: string };
}

interface PassportBody {
  id: string;
  project_id: string;
  asset_id: string;
  version: number;
  asset_count: number;
  claim_count: number;
  evidence_coverage: number;
  claim_fidelity: number;
  numerical_integrity: number;
  creator_intent_status: "PASS" | "REVIEW" | "BLOCK";
  sponsor_compliance: "PASS" | "REVIEW" | "BLOCK";
  platform_qa: "PASS" | "REVIEW" | "BLOCK";
  overall: number;
  release_status: "DRAFT" | "READY" | "BLOCKED";
  created_at: string;
}

interface Scenario {
  projectId: string;
  sourceId: string;
  segmentId: string;
  assetId: string;
}

const NOW = "2026-03-04T05:06:07.000Z";
const LATER = "2026-03-04T05:06:08.000Z";
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
const SHA256 = "a".repeat(64);

const db = (): D1Adapter => new D1Adapter(env.DB);

async function seedScenario(): Promise<Scenario> {
  const projectId = crypto.randomUUID();
  const sourceId = crypto.randomUUID();
  const segmentId = crypto.randomUUID();
  const assetId = crypto.randomUUID();

  await db().prepare(
    `INSERT INTO projects (id, name, target_platforms, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(projectId, "Passport project", "[]", NOW, NOW);

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
    "passport.mp4",
    "video/mp4",
    1024,
    10,
    `sha256:${SHA256}`,
    "COMPLETED",
    "COMPLETED",
    NOW,
    NOW,
  );

  await db().prepare(
    `INSERT INTO transcript_segments
       (id, source_asset_id, segment_index, start_time, end_time, text, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(segmentId, sourceId, 0, 0, 10, "Passport source transcript", NOW);

  await seedGeneratedAsset({ projectId, assetId });
  return { projectId, sourceId, segmentId, assetId };
}

async function seedGeneratedAsset(options: {
  projectId: string;
  assetId?: string;
}): Promise<string> {
  const assetId = options.assetId ?? crypto.randomUUID();
  await db().prepare(
    `INSERT INTO generated_assets
       (id, project_id, asset_type, title, status, integrity, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    assetId,
    options.projectId,
    "SOCIAL_POST",
    "Passport asset",
    "READY",
    INTEGRITY,
    NOW,
    NOW,
  );
  return assetId;
}

async function seedClaim(scenario: Scenario): Promise<string> {
  const claimId = crypto.randomUUID();
  await db().prepare(
    `INSERT INTO claims (id, project_id, segment_id, type, content, qualifiers, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    claimId,
    scenario.projectId,
    scenario.segmentId,
    "CLAIM",
    "The sponsor offer is live now",
    "[]",
    NOW,
  );
  return claimId;
}

async function seedSponsorRequirement(
  projectId: string,
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
    projectId,
    "Test Sponsor",
    requirementType,
    value,
    options.required === false ? 0 : 1,
    options.enabled === false ? 0 : 1,
    NOW,
    NOW,
  );
}

interface RunOptions {
  result: "PASS" | "REVIEW" | "BLOCK";
  startedAt?: string;
  completedAt?: string;
}

async function seedVerificationRun(
  scenario: Scenario,
  options: RunOptions,
): Promise<string> {
  const runId = crypto.randomUUID();
  await db().prepare(
    `INSERT INTO verification_runs
       (id, project_id, asset_id, engine, result, finding_ids, started_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    runId,
    scenario.projectId,
    scenario.assetId,
    "deterministic-v1",
    options.result,
    "[]",
    options.startedAt ?? NOW,
    options.completedAt ?? options.startedAt ?? NOW,
  );
  return runId;
}

interface FindingOptions {
  type: string;
  severity: "PASS" | "REVIEW" | "BLOCK";
}

async function seedFinding(
  runId: string,
  assetId: string,
  options: FindingOptions,
): Promise<void> {
  await db().prepare(
    `INSERT INTO verification_findings
       (id, verification_run_id, type, severity, reason, asset_id, evidence_ranges, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    crypto.randomUUID(),
    runId,
    options.type,
    options.severity,
    `seed ${options.type} ${options.severity}`,
    assetId,
    "[]",
    NOW,
  );
}

async function seedProvenance(
  scenario: Scenario,
  options: { signing: "UNSIGNED" | "SIGNED" | "FAILED" | "SIGNING"; verification: "VALID" | "INVALID" | "UNSIGNED" | "UNTRUSTED" | "MISSING" },
): Promise<void> {
  await db().prepare(
    `INSERT INTO provenance_records
       (id, project_id, asset_id, asset_sha256, signing_status, verification_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    crypto.randomUUID(),
    scenario.projectId,
    scenario.assetId,
    SHA256,
    options.signing,
    options.verification,
    NOW,
    NOW,
  );
}

async function createPassport(scenario: Scenario): Promise<PassportBody> {
  const response = await exports.default.fetch("https://example.com/passports", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ projectId: scenario.projectId, assetId: scenario.assetId }),
  });
  expect(response.status).toBe(201);
  const body = (await response.json()) as { passport: PassportBody };
  return body.passport;
}

describe("passport creation", () => {
  it("creates a deterministic passport from integrity state with no verification", async () => {
    const scenario = await seedScenario();
    await seedClaim(scenario);
    await seedClaim(scenario);

    const passport = await createPassport(scenario);

    expect(passport).toMatchObject({
      project_id: scenario.projectId,
      asset_id: scenario.assetId,
      version: 0,
      asset_count: 1,
      claim_count: 2,
      evidence_coverage: 100,
      claim_fidelity: 100,
      numerical_integrity: 100,
      creator_intent_status: "PASS",
      sponsor_compliance: "PASS",
      platform_qa: "PASS",
      overall: 70,
      release_status: "DRAFT",
    });
    expect(passport.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(passport.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("bumps the version on the second creation", async () => {
    const scenario = await seedScenario();
    const first = await createPassport(scenario);
    const second = await createPassport(scenario);

    expect(first.version).toBe(0);
    expect(second.version).toBe(1);
  });
});

describe("release status mapping", () => {
  it("is READY when the latest run passes with sponsor requirements satisfied", async () => {
    const scenario = await seedScenario();
    await seedSponsorRequirement(
      scenario.projectId,
      "REQUIRED_PHRASE",
      "sponsor tagline",
      { required: true, enabled: true },
    );
    await seedVerificationRun(scenario, { result: "PASS" });

    const passport = await createPassport(scenario);

    expect(passport.release_status).toBe("READY");
    expect(passport.overall).toBe(100);
    expect(passport.creator_intent_status).toBe("PASS");
    expect(passport.sponsor_compliance).toBe("PASS");
    expect(passport.platform_qa).toBe("PASS");
  });

  it("is BLOCKED when the latest run result is BLOCK", async () => {
    const scenario = await seedScenario();
    const runId = await seedVerificationRun(scenario, { result: "BLOCK" });
    await seedFinding(runId, scenario.assetId, {
      type: "SPONSOR_COMPLIANCE",
      severity: "BLOCK",
    });

    const passport = await createPassport(scenario);

    expect(passport.release_status).toBe("BLOCKED");
    expect(passport.sponsor_compliance).toBe("BLOCK");
    expect(passport.overall).toBe(40);
  });

  it("is DRAFT when provenance is UNSIGNED despite a passing run", async () => {
    const scenario = await seedScenario();
    await seedVerificationRun(scenario, { result: "PASS" });
    await seedProvenance(scenario, { signing: "UNSIGNED", verification: "UNSIGNED" });

    const passport = await createPassport(scenario);

    expect(passport.release_status).toBe("DRAFT");
  });

  it("is BLOCKED when a signed provenance chain fails verification", async () => {
    const scenario = await seedScenario();
    await seedVerificationRun(scenario, { result: "PASS" });
    await seedProvenance(scenario, { signing: "SIGNED", verification: "INVALID" });

    const passport = await createPassport(scenario);

    expect(passport.release_status).toBe("BLOCKED");
  });
});

describe("aggregation", () => {
  it("reflects real project asset and claim counts", async () => {
    const scenario = await seedScenario();
    await seedGeneratedAsset({ projectId: scenario.projectId });
    await seedClaim(scenario);
    await seedClaim(scenario);

    const passport = await createPassport(scenario);

    expect(passport.asset_count).toBe(2);
    expect(passport.claim_count).toBe(2);
  });

  it("penalizes scores from findings in the latest run", async () => {
    const scenario = await seedScenario();
    const runId = await seedVerificationRun(scenario, { result: "BLOCK" });
    await seedFinding(runId, scenario.assetId, { type: "SCOPE_DRIFT", severity: "REVIEW" });
    await seedFinding(runId, scenario.assetId, { type: "NUMERICAL_DRIFT", severity: "BLOCK" });

    const passport = await createPassport(scenario);

    expect(passport.evidence_coverage).toBe(90);
    expect(passport.numerical_integrity).toBe(75);
    expect(passport.release_status).toBe("BLOCKED");
    expect(passport.overall).toBe(40);
  });
});

describe("errors and routing", () => {
  it("returns 404 PASSPORT_NOT_FOUND for an unknown passport id", async () => {
    const response = await exports.default.fetch(
      `https://example.com/passports/${crypto.randomUUID()}`,
    );
    expect(response.status).toBe(404);
    const body = (await response.json()) as ErrorBody;
    expect(body.error.code).toBe("PASSPORT_NOT_FOUND");
  });

  it("returns 404 PASSPORT_NOT_FOUND for an unknown asset latest lookup", async () => {
    const response = await exports.default.fetch(
      `https://example.com/passports/${crypto.randomUUID()}/latest`,
    );
    expect(response.status).toBe(404);
    const body = (await response.json()) as ErrorBody;
    expect(body.error.code).toBe("PASSPORT_NOT_FOUND");
  });

  it("rejects an asset owned by a different project with 409", async () => {
    const assetScenario = await seedScenario();
    const otherProject = await seedScenario();
    const response = await exports.default.fetch("https://example.com/passports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: otherProject.projectId,
        assetId: assetScenario.assetId,
      }),
    });

    expect(response.status).toBe(409);
    const body = (await response.json()) as ErrorBody;
    expect(body.error.code).toBe("INVALID_ASSET_STATE");
  });

  it("rejects an unknown project with 404", async () => {
    const scenario = await seedScenario();
    const response = await exports.default.fetch("https://example.com/passports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: crypto.randomUUID(),
        assetId: scenario.assetId,
      }),
    });

    expect(response.status).toBe(404);
    const body = (await response.json()) as ErrorBody;
    expect(body.error.code).toBe("PROJECT_NOT_FOUND");
  });

  it("returns the latest passport for an asset", async () => {
    const scenario = await seedScenario();
    const created = await createPassport(scenario);

    const response = await exports.default.fetch(
      `https://example.com/passports/${scenario.assetId}/latest`,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { passport: PassportBody };
    expect(body.passport).toEqual(created);
  });

  it("returns a passport by id", async () => {
    const scenario = await seedScenario();
    const created = await createPassport(scenario);

    const response = await exports.default.fetch(
      `https://example.com/passports/${created.id}`,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { passport: PassportBody };
    expect(body.passport).toEqual(created);
  });

  it("lists passports for a project", async () => {
    const scenario = await seedScenario();
    const created = await createPassport(scenario);

    const response = await exports.default.fetch(
      `https://example.com/passports?projectId=${scenario.projectId}`,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { passports: PassportBody[] };
    expect(body.passports).toHaveLength(1);
    expect(body.passports[0]).toEqual(created);
    expect(body.passports[0]!.project_id).toBe(scenario.projectId);
  });
});

describe("latest run selection", () => {
  it("uses the newest run when a later run blocks", async () => {
    const scenario = await seedScenario();
    await seedVerificationRun(scenario, { result: "REVIEW", startedAt: NOW });
    await seedVerificationRun(scenario, { result: "BLOCK", startedAt: LATER });

    const passport = await createPassport(scenario);

    expect(passport.release_status).toBe("BLOCKED");
  });

  it("uses the newest run when a later run passes", async () => {
    const scenario = await seedScenario();
    const blockRunId = await seedVerificationRun(scenario, { result: "BLOCK", startedAt: NOW });
    await seedFinding(blockRunId, scenario.assetId, {
      type: "SPONSOR_COMPLIANCE",
      severity: "BLOCK",
    });
    await seedVerificationRun(scenario, { result: "PASS", startedAt: LATER });

    const passport = await createPassport(scenario);

    expect(passport.release_status).toBe("READY");
    expect(passport.sponsor_compliance).toBe("PASS");
  });
});