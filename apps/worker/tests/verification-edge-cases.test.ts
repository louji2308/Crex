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
  ).run(projectId, "Verification edge-case project", "[]", NOW, NOW);

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
    "verification.mp4",
    "video/mp4",
    1024,
    10,
    "sha256:verification",
    "COMPLETED",
    "COMPLETED",
    NOW,
    NOW,
  );

  await db().prepare(
    `INSERT INTO transcript_segments
       (id, source_asset_id, segment_index, start_time, end_time, text, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(segmentId, sourceId, 0, 0, 10, "Verification source transcript", NOW);

  await db().prepare(
    `INSERT INTO generated_assets
       (id, project_id, asset_type, title, status, integrity, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    assetId,
    projectId,
    options.assetType ?? "SOCIAL_POST",
    options.title ?? "Verification asset",
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
    JSON.stringify({ engine: "verification-edge-case-test" }),
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

async function seedConstraint(
  scenario: Scenario,
  category: string,
  details: string | undefined,
  enabled = true,
): Promise<void> {
  await db().prepare(
    `INSERT INTO constraints
       (id, project_id, category, source, summary, details, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    crypto.randomUUID(),
    scenario.projectId,
    category,
    "MANUAL",
    `Test ${category}`,
    details ?? null,
    enabled ? 1 : 0,
    NOW,
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
    "Test Sponsor",
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

async function seedMatchingClaimAndComponent(
  scenario: Scenario,
  text = "Battery testing lasted eleven controlled hours",
): Promise<string> {
  const claimId = await seedClaim(scenario, { content: text });
  await seedComponent(scenario, text, [claimId]);
  return claimId;
}

describe("verification route edge cases", () => {
  it("rejects malformed JSON before attempting verification", async () => {
    const response = await exports.default.fetch("https://example.com/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not-json",
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_BODY", message: "request body must be valid JSON" },
    });
  });

  it("returns a client error for an invalid asset identifier", async () => {
    const scenario = await seedScenario();
    const response = await exports.default.fetch("https://example.com/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: scenario.projectId, assetId: "not-a-uuid" }),
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as ErrorBody;
    expect(body.error.code).toBe("INVALID_ASSET_ID");
  });

  it("returns not found for an unknown verification run", async () => {
    const response = await exports.default.fetch(
      `https://example.com/verify/${crypto.randomUUID()}`,
    );

    expect(response.status).toBe(404);
    const body = (await response.json()) as ErrorBody;
    expect(body.error.code).toBe("VERIFICATION_RUN_NOT_FOUND");
  });

  it("rejects an asset owned by a different project", async () => {
    const assetScenario = await seedScenario();
    const otherProject = await seedScenario();
    const response = await exports.default.fetch("https://example.com/verify", {
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
});

describe("verification finding generation", () => {
  it("blocks a component that references a missing claim", async () => {
    const scenario = await seedScenario();
    const componentId = await seedComponent(
      scenario,
      "Content with a stale claim reference",
      [crypto.randomUUID()],
    );

    const run = await verify(scenario);
    const findings = await getFindings(run.id);

    expect(run.result).toBe("BLOCK");
    expect(findings).toEqual([
      expect.objectContaining({
        verification_run_id: run.id,
        type: "ATTRIBUTION_DRIFT",
        severity: "BLOCK",
        asset_id: scenario.assetId,
        component_id: componentId,
        evidence_ranges: [],
      }),
    ]);
    expect(run.finding_ids).toEqual(findings.map((finding) => finding.id));
  });

  it("copies supporting source ranges into a scope-drift finding", async () => {
    const scenario = await seedScenario();
    const claimId = await seedClaim(scenario, {
      content: "Battery testing lasted eleven controlled hours",
    });
    await seedEvidence(claimId, { start: 12, end: 34 });
    await seedComponent(scenario, "Unrelated launch announcement", [claimId]);

    const run = await verify(scenario);
    const findings = await getFindings(run.id);
    const finding = findings.find((candidate) => candidate.type === "SCOPE_DRIFT");

    expect(run.result).toBe("REVIEW");
    expect(finding).toMatchObject({
      severity: "REVIEW",
      source_text: "Battery testing lasted eleven controlled hours",
      generated_text: "Unrelated launch announcement",
      evidence_ranges: [{ start: 12, end: 34 }],
    });
  });

  it("matches qualifiers case-insensitively", async () => {
    const scenario = await seedScenario();
    const claimId = await seedClaim(scenario, {
      content: "According to reviewers the battery lasts eleven hours",
      qualifiers: ["According to reviewers"],
    });
    await seedComponent(
      scenario,
      "ACCORDING TO REVIEWERS the battery lasts eleven hours",
      [claimId],
    );

    const run = await verify(scenario);
    expect(run.result).toBe("PASS");
    await expect(getFindings(run.id)).resolves.toEqual([]);
  });

  it.each([
    ["CLICKBAIT_BAN", undefined, "You won't believe this battery result"],
    ["ABSOLUTE_CLAIM_BAN", "best, guaranteed", "This is the best battery guaranteed"],
    ["TONE", "shocking, hostile", "A shocking result with otherwise neutral wording"],
  ])("creates a creator-intent finding for %s violations", async (category, details, content) => {
    const scenario = await seedScenario();
    await seedConstraint(scenario, category, details);
    await seedComponent(scenario, content);

    const run = await verify(scenario);
    const findings = await getFindings(run.id);

    expect(run.result).toBe("REVIEW");
    expect(findings).toEqual([
      expect.objectContaining({
        type: "CREATOR_INTENT",
        severity: "REVIEW",
        generated_text: content,
      }),
    ]);
  });

  it("ignores disabled creator constraints", async () => {
    const scenario = await seedScenario();
    await seedConstraint(scenario, "CLICKBAIT_BAN", undefined, false);
    await seedComponent(scenario, "You won't believe this battery result");

    const run = await verify(scenario);
    expect(run.result).toBe("PASS");
    await expect(getFindings(run.id)).resolves.toEqual([]);
  });

  it.each(["REQUIRED_PHRASE", "DISCLOSURE", "REQUIRED_URL"])(
    "blocks a missing required sponsor %s",
    async (requirementType) => {
      const scenario = await seedScenario();
      await seedSponsorRequirement(scenario, requirementType, "sponsor.example/offer");
      await seedComponent(scenario, "Content without the sponsor requirement");

      const run = await verify(scenario);
      const findings = await getFindings(run.id);

      expect(run.result).toBe("BLOCK");
      expect(findings).toEqual([
        expect.objectContaining({
          type: "SPONSOR_COMPLIANCE",
          severity: "BLOCK",
        }),
      ]);
    },
  );

  it("matches sponsor requirements case-insensitively and ignores optional ones", async () => {
    const scenario = await seedScenario();
    await seedSponsorRequirement(scenario, "REQUIRED_URL", "HTTPS://SPONSOR.EXAMPLE/OFFER");
    await seedSponsorRequirement(scenario, "REQUIRED_PHRASE", "optional tagline", {
      required: false,
    });
    await seedComponent(
      scenario,
      "Visit https://sponsor.example/offer for the full details.",
    );

    const run = await verify(scenario);
    expect(run.result).toBe("PASS");
    await expect(getFindings(run.id)).resolves.toEqual([]);
  });
});

describe("verification boundaries and regressions", () => {
  it("allows a YouTube title at exactly 100 characters", async () => {
    const scenario = await seedScenario({
      assetType: "YOUTUBE_TITLE",
      title: "T".repeat(100),
    });
    await seedMatchingClaimAndComponent(scenario);

    const run = await verify(scenario);
    expect(run.result).toBe("PASS");
    await expect(getFindings(run.id)).resolves.toEqual([]);
  });

  it("blocks a YouTube title above 100 characters only once per asset", async () => {
    const scenario = await seedScenario({
      assetType: "YOUTUBE_TITLE",
      title: "T".repeat(101),
    });
    const claimId = await seedClaim(scenario, {
      content: "Battery testing lasted eleven controlled hours",
    });
    await seedComponent(scenario, "Battery testing lasted eleven controlled hours", [claimId]);
    await seedComponent(scenario, "Controlled battery testing lasted eleven hours", [claimId]);

    const run = await verify(scenario);
    const platformFindings = (await getFindings(run.id)).filter(
      (finding) => finding.type === "PLATFORM_QA",
    );

    expect(run.result).toBe("BLOCK");
    expect(platformFindings).toHaveLength(1);
    expect(platformFindings[0]).toMatchObject({
      generated_text: "T".repeat(101),
      severity: "BLOCK",
    });
  });

  it("enforces the YouTube description limit immediately above 5000 characters", async () => {
    const atLimit = await seedScenario({ assetType: "YOUTUBE_DESCRIPTION" });
    await seedComponent(atLimit, "D".repeat(5000));
    const atLimitRun = await verify(atLimit);

    const overLimit = await seedScenario({ assetType: "YOUTUBE_DESCRIPTION" });
    await seedComponent(overLimit, "D".repeat(5001));
    const overLimitRun = await verify(overLimit);
    const overLimitFindings = await getFindings(overLimitRun.id);

    expect(atLimitRun.result).toBe("PASS");
    expect(overLimitRun.result).toBe("BLOCK");
    expect(overLimitFindings).toEqual([
      expect.objectContaining({
        type: "PLATFORM_QA",
        generated_text: "D".repeat(5001),
      }),
    ]);
  });

  it.each([
    ["100", "99.01", "PASS"],
    ["100", "99", "BLOCK"],
    ["0", "0", "PASS"],
    ["0", "1", "BLOCK"],
  ] as const)(
    "compares numerical claims at the one-percent boundary (%s vs %s)",
    async (sourceNumber, generatedNumber, expectedResult) => {
      const scenario = await seedScenario();
      const claimId = await seedClaim(scenario, {
        type: "NUMERICAL",
        content: `Battery score is ${sourceNumber} points`,
      });
      await seedComponent(
        scenario,
        `Battery score is ${generatedNumber} points`,
        [claimId],
      );

      const run = await verify(scenario);
      const numericalFindings = (await getFindings(run.id)).filter(
        (finding) => finding.type === "NUMERICAL_DRIFT",
      );

      expect(run.result).toBe(expectedResult);
      expect(numericalFindings).toHaveLength(expectedResult === "BLOCK" ? 1 : 0);
    },
  );

  it.each([
    ["1k", "1,000"],
    ["1M", "1,000,000"],
    ["1,000", "1000"],
  ])("treats equivalent formatted numbers as equal (%s and %s)", async (source, generated) => {
    const scenario = await seedScenario();
    const claimId = await seedClaim(scenario, {
      type: "NUMERICAL",
      content: `The video reached ${source} viewers`,
    });
    await seedComponent(scenario, `The video reached ${generated} viewers`, [claimId]);

    const run = await verify(scenario);
    const numericalFindings = (await getFindings(run.id)).filter(
      (finding) => finding.type === "NUMERICAL_DRIFT",
    );

    expect(run.result).toBe("PASS");
    expect(numericalFindings).toEqual([]);
  });

  it("does not collapse a million-suffixed value to one", async () => {
    const scenario = await seedScenario();
    const claimId = await seedClaim(scenario, {
      type: "NUMERICAL",
      content: "The video reached 1M viewers",
    });
    await seedComponent(scenario, "The video reached 1 viewer", [claimId]);

    const run = await verify(scenario);
    const findings = await getFindings(run.id);

    expect(run.result).toBe("BLOCK");
    expect(findings).toContainEqual(
      expect.objectContaining({ type: "NUMERICAL_DRIFT", severity: "BLOCK" }),
    );
  });
});
