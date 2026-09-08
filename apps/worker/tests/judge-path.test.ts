import { describe, expect, it, beforeAll } from "vitest";
import { env, exports } from "cloudflare:workers";
import { D1Adapter } from "@crex/infra";

interface ErrorBody {
  error: { code: string; message: string };
}

interface RunBody {
  id: string;
  project_id: string;
  asset_id: string;
  engine: string;
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
}

interface ReverifyBody {
  previousRunId: string;
  reverificationRunId: string;
  result: "PASS" | "REVIEW" | "BLOCK";
  findingCount: number;
  appliedActionCount: number;
  proposedActionCount: number;
}

interface PassportBody {
  passport: {
    id: string;
    project_id: string;
    asset_id: string;
    version: number;
    overall: number;
    release_status: "DRAFT" | "READY" | "BLOCKED";
    evidence_coverage: number;
    claim_fidelity: number;
    numerical_integrity: number;
    creator_intent_status: string;
    sponsor_compliance: string;
    platform_qa: string;
  };
}

const NOW = "2026-09-08T12:00:00.000Z";
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

interface JudgeScenario {
  projectId: string;
  sourceId: string;
  segmentId: string;
  assetId: string;
}

async function createJudgeScenario(): Promise<JudgeScenario> {
  const projectId = crypto.randomUUID();
  const sourceId = crypto.randomUUID();
  const segmentId = crypto.randomUUID();
  const assetId = crypto.randomUUID();

  await db().prepare(
    `INSERT INTO projects (id, name, target_platforms, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(projectId, "Judge Path E2E", "[]", NOW, NOW);

  await db().prepare(
    `INSERT INTO source_assets
       (id, project_id, object_key, file_name, file_type, size_bytes,
        duration_seconds, checksum, transcription_status, analysis_status,
        status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(sourceId, projectId, `sources/${sourceId}.mp4`, "source.mp4", "video/mp4", 1024, 10, "sha256:judge", "PENDING", "PENDING", "READY", NOW, NOW);

  await db().prepare(
    `INSERT INTO transcript_segments
       (id, source_asset_id, segment_index, start_time, end_time, text, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(segmentId, sourceId, 0, 0, 10, "Judge path source transcript", NOW);

  await db().prepare(
    `INSERT INTO generated_assets
       (id, project_id, asset_type, title, status, integrity, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(assetId, projectId, "SOCIAL_POST", "Judge Path Asset", "READY", INTEGRITY, NOW, NOW);

  return { projectId, sourceId, segmentId, assetId };
}

async function insertClaim(
  projectId: string,
  segmentId: string,
  claimId: string,
  content: string,
  qualifiers: string[] = [],
  type = "CLAIM",
): Promise<void> {
  await db().prepare(
    `INSERT INTO claims (id, project_id, segment_id, type, content, qualifiers, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
  ).run(claimId, projectId, segmentId, type, content, JSON.stringify(qualifiers), NOW);
}

async function insertEvidence(
  claimId: string,
  content: string,
  sourceRange?: { start: number; end: number },
): Promise<void> {
  await db().prepare(
    `INSERT INTO evidence (id, claim_id, type, content, source_range, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    crypto.randomUUID(),
    claimId,
    "TRANSCRIPT",
    content,
    sourceRange !== undefined ? JSON.stringify(sourceRange) : null,
    NOW,
  );
}

async function insertComponent(
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
    componentId,
    assetId,
    content,
    "[]",
    JSON.stringify(claimReferences),
    "[]",
    JSON.stringify({ engine: "judge-path-test" }),
    "REVIEW",
  );
  return componentId;
}

async function insertSponsorRequirement(
  projectId: string,
  value: string,
  required = true,
): Promise<void> {
  await db().prepare(
    `INSERT INTO sponsor_requirements
       (id, project_id, sponsor_name, requirement_type, value, required, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(crypto.randomUUID(), projectId, "JudgeSponsor", "REQUIRED_PHRASE", value, required ? 1 : 0, 1, NOW, NOW);
}

describe("judge path: complete source-to-release journey", () => {
  it("QUALIFIER LOSS -> CONTEXT_REMOVAL -> REPAIR -> RE-VERIFY PASS -> PASSPORT reflects PASS", async () => {
    const s = await createJudgeScenario();
    const claimId = crypto.randomUUID();
    const componentId = crypto.randomUUID();

    await insertClaim(
      s.projectId,
      s.segmentId,
      claimId,
      "The battery lasts approximately 12 hours on a full charge",
      ["approximately"],
    );
    await insertEvidence(claimId, "The battery lasts approximately 12 hours on a full charge");

    await insertComponent(
      s.assetId,
      "The battery lasts 12 hours on a full charge",
      [claimId],
    );

    const verifyRes = await exports.default.fetch("https://example.com/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: s.projectId, assetId: s.assetId }),
    });
    expect(verifyRes.status).toBe(201);
    const verifyBody = (await verifyRes.json()) as RunBody;
    expect(verifyBody.result).toBe("REVIEW");

    const findingsRes = await exports.default.fetch(
      `https://example.com/verify/findings/${verifyBody.id}`,
    );
    expect(findingsRes.status).toBe(200);
    const findingsBody = (await findingsRes.json()) as { findings: FindingBody[] };
    const contextFindings = findingsBody.findings.filter((f) => f.type === "CONTEXT_REMOVAL");
    expect(contextFindings.length).toBe(1);
    expect(contextFindings[0]!.reason).toContain("approximately");
    expect(contextFindings[0]!.severity).toBe("REVIEW");

    const repairRes = await exports.default.fetch("https://example.com/repair", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: s.projectId, assetId: s.assetId, runId: verifyBody.id }),
    });
    expect(repairRes.status).toBe(201);
    const repairBody = (await repairRes.json()) as { actions: RepairActionBody[] };
    expect(repairBody.actions).toHaveLength(1);
    const action = repairBody.actions[0]!;
    expect(action.status).toBe("PROPOSED");
    expect(action.engine).toBe("deterministic-repair-v1");
    expect(action.repaired_text.toLowerCase()).toContain("approximately");
    expect(action.repaired_text.toLowerCase()).toContain("12 hours");

    const reverifyRes = await exports.default.fetch("https://example.com/reverify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: s.projectId, assetId: s.assetId, runId: verifyBody.id }),
    });
    expect(reverifyRes.status).toBe(201);
    const reverifyBody = (await reverifyRes.json()) as ReverifyBody;
    expect(reverifyBody.previousRunId).toBe(verifyBody.id);
    expect(reverifyBody.reverificationRunId).not.toBe(verifyBody.id);
    expect(reverifyBody.appliedActionCount).toBe(1);
    expect(reverifyBody.proposedActionCount).toBe(1);
    expect(reverifyBody.result).toBe("PASS");
    expect(reverifyBody.findingCount).toBe(0);

    const passportRes = await exports.default.fetch("https://example.com/passports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: s.projectId, assetId: s.assetId }),
    });
    expect(passportRes.status).toBe(201);
    const passportBody = (await passportRes.json()) as PassportBody;
    expect(passportBody.passport.release_status).toBe("READY");
    expect(passportBody.passport.overall).toBeGreaterThan(0);
    expect(passportBody.passport.version).toBe(0);
  });

  it("invalid claim reference triggers ATTRIBUTION_DRIFT BLOCK", async () => {
    const s = await createJudgeScenario();
    const fakeClaimId = crypto.randomUUID();
    await insertComponent(s.assetId, "Content referencing a ghost claim", [fakeClaimId]);

    const verifyRes = await exports.default.fetch("https://example.com/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: s.projectId, assetId: s.assetId }),
    });
    expect(verifyRes.status).toBe(201);
    const verifyBody = (await verifyRes.json()) as RunBody;
    expect(verifyBody.result).toBe("BLOCK");

    const findingsRes = await exports.default.fetch(
      `https://example.com/verify/findings/${verifyBody.id}`,
    );
    const findingsBody = (await findingsRes.json()) as { findings: FindingBody[] };
    const attributionFindings = findingsBody.findings.filter(
      (f) => f.type === "ATTRIBUTION_DRIFT",
    );
    expect(attributionFindings.length).toBe(1);
    expect(attributionFindings[0]!.severity).toBe("BLOCK");
    expect(attributionFindings[0]!.reason).toContain("does not exist in the evidence graph");
  });

  it("SCOPE_DRIFT cannot be repaired -> repair returns empty actions", async () => {
    const s = await createJudgeScenario();
    const claimId = crypto.randomUUID();
    await insertClaim(s.projectId, s.segmentId, claimId, "Battery testing lasted eleven controlled hours");
    await insertEvidence(claimId, "Battery testing lasted eleven controlled hours");

    await insertComponent(s.assetId, "Completely unrelated launch announcement", [claimId]);

    const verifyRes = await exports.default.fetch("https://example.com/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: s.projectId, assetId: s.assetId }),
    });
    const verifyBody = (await verifyRes.json()) as RunBody;
    expect(verifyBody.result).toBe("REVIEW");

    const repairRes = await exports.default.fetch("https://example.com/repair", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: s.projectId, assetId: s.assetId, runId: verifyBody.id }),
    });
    expect(repairRes.status).toBe(201);
    const repairBody = (await repairRes.json()) as { actions: RepairActionBody[] };
    expect(repairBody.actions).toEqual([]);

    const reverifyRes = await exports.default.fetch("https://example.com/reverify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: s.projectId, assetId: s.assetId, runId: verifyBody.id }),
    });
    const reverifyBody = (await reverifyRes.json()) as ReverifyBody;
    expect(reverifyBody.appliedActionCount).toBe(0);
    expect(reverifyBody.result).toBe("REVIEW");
  });

  it("SPONSOR_COMPLIANCE BLOCK -> repair appends sponsor phrase -> RE-VERIFY PASS", async () => {
    const s = await createJudgeScenario();
    const claimId = crypto.randomUUID();
    const componentId = crypto.randomUUID();

    await insertClaim(s.projectId, s.segmentId, claimId, "Content without the required sponsor disclosure");
    await insertEvidence(claimId, "Content without the required sponsor disclosure");
    await insertSponsorRequirement(s.projectId, "#ad", true);

    await insertComponent(s.assetId, "Content without the required sponsor disclosure", [claimId]);

    const verifyRes = await exports.default.fetch("https://example.com/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: s.projectId, assetId: s.assetId }),
    });
    const verifyBody = (await verifyRes.json()) as RunBody;
    expect(verifyBody.result).toBe("BLOCK");

    const findingsRes = await exports.default.fetch(
      `https://example.com/verify/findings/${verifyBody.id}`,
    );
    const findingsBody = (await findingsRes.json()) as { findings: FindingBody[] };
    const sponsorFindings = findingsBody.findings.filter((f) => f.type === "SPONSOR_COMPLIANCE");
    expect(sponsorFindings.length).toBe(1);
    expect(sponsorFindings[0]!.severity).toBe("BLOCK");

    const repairRes = await exports.default.fetch("https://example.com/repair", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: s.projectId, assetId: s.assetId, runId: verifyBody.id }),
    });
    const repairBody = (await repairRes.json()) as { actions: RepairActionBody[] };
    expect(repairBody.actions).toHaveLength(1);
    expect(repairBody.actions[0]!.repaired_text.toLowerCase()).toContain("#ad");

    const reverifyRes = await exports.default.fetch("https://example.com/reverify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: s.projectId, assetId: s.assetId, runId: verifyBody.id }),
    });
    const reverifyBody = (await reverifyRes.json()) as ReverifyBody;
    expect(reverifyBody.result).toBe("PASS");
    expect(reverifyBody.appliedActionCount).toBe(1);
  });

  it("passport requested before verification returns DRAFT with overall 70", async () => {
    const s = await createJudgeScenario();
    await insertComponent(s.assetId, "Simple content", []);

    const passportRes = await exports.default.fetch("https://example.com/passports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: s.projectId, assetId: s.assetId }),
    });
    expect(passportRes.status).toBe(201);
    const passportBody = (await passportRes.json()) as PassportBody;
    expect(passportBody.passport.release_status).toBe("DRAFT");
    expect(passportBody.passport.overall).toBe(70);
  });

  it("passport after BLOCK verification returns BLOCKED with overall capped at 40", async () => {
    const s = await createJudgeScenario();
    const claimId = crypto.randomUUID();

    await insertClaim(s.projectId, s.segmentId, claimId, "Price is $49.99", [], "NUMERICAL");
    await insertComponent(s.assetId, "The price is $39.99", [claimId]);

    const verifyRes = await exports.default.fetch("https://example.com/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: s.projectId, assetId: s.assetId }),
    });
    const verifyBody = (await verifyRes.json()) as RunBody;
    expect(verifyBody.result).toBe("BLOCK");

    const passportRes = await exports.default.fetch("https://example.com/passports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: s.projectId, assetId: s.assetId }),
    });
    const passportBody = (await passportRes.json()) as PassportBody;
    expect(passportBody.passport.release_status).toBe("BLOCKED");
    expect(passportBody.passport.overall).toBeLessThanOrEqual(40);
  });

  it("NUMERICAL_DRIFT BLOCK -> repair rewrites number -> RE-VERIFY PASS -> PASSPORT READY", async () => {
    const s = await createJudgeScenario();
    const claimId = crypto.randomUUID();

    await insertClaim(s.projectId, s.segmentId, claimId, "The product costs $49.99", [], "NUMERICAL");
    await insertEvidence(claimId, "The product costs $49.99");
    await insertComponent(s.assetId, "The product costs $39.99 and is worth every penny", [claimId]);

    const verifyRes = await exports.default.fetch("https://example.com/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: s.projectId, assetId: s.assetId }),
    });
    const verifyBody = (await verifyRes.json()) as RunBody;
    expect(verifyBody.result).toBe("BLOCK");

    const repairRes = await exports.default.fetch("https://example.com/repair", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: s.projectId, assetId: s.assetId, runId: verifyBody.id }),
    });
    const repairBody = (await repairRes.json()) as { actions: RepairActionBody[] };
    expect(repairBody.actions).toHaveLength(1);
    expect(repairBody.actions[0]!.repaired_text).toContain("$49.99");

    const reverifyRes = await exports.default.fetch("https://example.com/reverify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: s.projectId, assetId: s.assetId, runId: verifyBody.id }),
    });
    const reverifyBody = (await reverifyRes.json()) as ReverifyBody;
    expect(reverifyBody.result).toBe("PASS");

    const passportRes = await exports.default.fetch("https://example.com/passports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: s.projectId, assetId: s.assetId }),
    });
    const passportBody = (await passportRes.json()) as PassportBody;
    expect(passportBody.passport.release_status).toBe("READY");
    expect(passportBody.passport.overall).toBeGreaterThan(40);
  });

  it("repair action from wrong project is rejected with 409", async () => {
    const s = await createJudgeScenario();
    const otherS = await createJudgeScenario();
    const claimId = crypto.randomUUID();

    await insertClaim(s.projectId, s.segmentId, claimId, "Missing sponsor claim");
    await insertSponsorRequirement(s.projectId, "#sponsor", true);
    await insertComponent(s.assetId, "Content without the sponsor", [claimId]);

    const verifyRes = await exports.default.fetch("https://example.com/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: s.projectId, assetId: s.assetId }),
    });
    const verifyBody = (await verifyRes.json()) as RunBody;

    const repairRes = await exports.default.fetch("https://example.com/repair", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: s.projectId, assetId: s.assetId, runId: verifyBody.id }),
    });
    const repairBody = (await repairRes.json()) as { actions: RepairActionBody[] };
    expect(repairBody.actions).toHaveLength(1);

    const applyRes = await exports.default.fetch(
      `https://example.com/repair/${repairBody.actions[0]!.id}/apply`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId: otherS.projectId }),
      },
    );
    expect(applyRes.status).toBe(409);
    const applyBody = (await applyRes.json()) as ErrorBody;
    expect(applyBody.error.code).toBe("INVALID_REPAIR_STATE");
  });

  it("reverify without a prior verification run fails visibly", async () => {
    const s = await createJudgeScenario();
    await insertComponent(s.assetId, "Some content", []);

    const reverifyRes = await exports.default.fetch("https://example.com/reverify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: s.projectId, assetId: s.assetId }),
    });
    expect(reverifyRes.status).toBe(404);
    const body = (await reverifyRes.json()) as ErrorBody;
    expect(body.error.code).toBe("VERIFICATION_RUN_NOT_FOUND");
  });

  it("passport for nonexistent asset returns 404", async () => {
    const s = await createJudgeScenario();
    const fakeAssetId = crypto.randomUUID();

    const passportRes = await exports.default.fetch("https://example.com/passports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: s.projectId, assetId: fakeAssetId }),
    });
    expect(passportRes.status).toBe(404);
    const body = (await passportRes.json()) as ErrorBody;
    expect(body.error.code).toBe("ASSET_NOT_FOUND");
  });
});
