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
  result: string;
  finding_ids: string[];
  started_at: string;
  completed_at?: string;
}

interface FindingsBody {
  findings: Array<{
    id: string;
    verification_run_id: string;
    type: string;
    severity: string;
    reason: string;
    asset_id?: string;
    component_id?: string;
  }>;
}

const PROJECT_UUID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SOURCE_UUID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SEGMENT_UUID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ASSET_UUID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const COMPONENT_UUID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const NOW = "2026-03-04T05:06:07.000Z";

async function seedProject(projectId = PROJECT_UUID): Promise<void> {
  await new D1Adapter(env.DB).prepare(
    `INSERT INTO projects (id, name, target_platforms, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
  ).run(projectId, "Verification Test Project", "[]", NOW, NOW);
}

async function seedSourceAsset(): Promise<void> {
  await new D1Adapter(env.DB).prepare(
    `INSERT INTO source_assets (id, project_id, object_key, file_name, file_type, size_bytes, duration_seconds, checksum, transcription_status, analysis_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
  ).run(
    SOURCE_UUID,
    PROJECT_UUID,
    `sources/${PROJECT_UUID}/${SOURCE_UUID}-test.mp4`,
    "test.mp4",
    "video/mp4",
    1024,
    10.0,
    "sha256:abc",
    "PENDING",
    "PENDING",
    NOW,
    NOW,
  );
}

async function seedTranscriptSegment(): Promise<void> {
  await new D1Adapter(env.DB).prepare(
    `INSERT INTO transcript_segments (id, source_asset_id, segment_index, start_time, end_time, text, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
  ).run(SEGMENT_UUID, SOURCE_UUID, 0, 0.0, 5.0, "Test transcript text", NOW);
}

async function seedGeneratedAsset(
  projectId = PROJECT_UUID,
  assetId = ASSET_UUID,
  assetType = "YOUTUBE_TITLE",
  title = "Test Asset",
): Promise<void> {
  const integrity = JSON.stringify({
    dimensions: {
      evidence_coverage: 80,
      claim_fidelity: 90,
      numerical_accuracy: 95,
      creator_intent: 85,
      sponsor_compliance: 90,
      platform_qa: 100,
    },
    overall: 90,
    reasons: ["test"],
  });

  await new D1Adapter(env.DB).prepare(
    `INSERT INTO generated_assets (id, project_id, asset_type, title, status, integrity, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
  ).run(assetId, projectId, assetType, title, "READY", integrity, NOW, NOW);
}

async function seedGeneratedComponent(
  assetId = ASSET_UUID,
  componentId = COMPONENT_UUID,
  claimId: string | null = null,
  content = "This is generated content",
): Promise<void> {
  const sourceRefs = JSON.stringify([]);
  const claimRefs = JSON.stringify(claimId !== null ? [claimId] : []);
  const constraintRefs = JSON.stringify([]);
  const genMeta = JSON.stringify({ engine: "test" });

  await new D1Adapter(env.DB).prepare(
    `INSERT INTO generated_components (component_id, asset_id, content, source_references, claim_references, constraint_references, generation_metadata, verification_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(component_id) DO NOTHING`,
  ).run(componentId, assetId, content, sourceRefs, claimRefs, constraintRefs, genMeta, "REVIEW");
}

async function seedClaim(
  claimId: string,
  content = "Test claim content",
  qualifiers: string[] = [],
  type = "CLAIM",
): Promise<void> {
  const quals = JSON.stringify(qualifiers);
  await new D1Adapter(env.DB).prepare(
    `INSERT INTO claims (id, project_id, segment_id, type, content, qualifiers, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
  ).run(claimId, PROJECT_UUID, SEGMENT_UUID, type, content, quals, NOW);
}

async function seedConstraint(
  category = "CLICKBAIT_BAN",
  summary = "No clickbait",
  enabled = true,
  details?: string,
): Promise<string> {
  const id = crypto.randomUUID();
  await new D1Adapter(env.DB).prepare(
    `INSERT INTO constraints (id, project_id, category, source, summary, details, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
  ).run(id, PROJECT_UUID, category, "MANUAL", summary, details ?? null, enabled ? 1 : 0, NOW, NOW);
  return id;
}

async function seedSponsorRequirement(
  value = "#ad",
  required = true,
): Promise<string> {
  const id = crypto.randomUUID();
  await new D1Adapter(env.DB).prepare(
    `INSERT INTO sponsor_requirements (id, project_id, sponsor_name, requirement_type, value, required, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
  ).run(id, PROJECT_UUID, "TestSponsor", "REQUIRED_PHRASE", value, required ? 1 : 0, 1, NOW, NOW);
  return id;
}

async function seedBaseClaimAndComponent(
  claimId: string,
  componentId: string,
  claimContent: string,
  componentContent: string,
  qualifiers: string[] = [],
  type = "CLAIM",
  assetId: string = ASSET_UUID,
): Promise<void> {
  await seedClaim(claimId, claimContent, qualifiers, type);
  await seedGeneratedComponent(assetId, componentId, claimId, componentContent);
}

describe("crex-worker verification API", () => {
  beforeAll(async () => {
    await seedProject();
    await seedSourceAsset();
    await seedTranscriptSegment();
  });

  it("POST /verify returns 201 with valid inputs and creates a run", async () => {
    await seedGeneratedAsset();
    const claimId = "f0000000-0000-4000-8000-000000000001";
    const compId = "f0000000-0000-4000-8000-000000000002";
    await seedBaseClaimAndComponent(claimId, compId, "Test claim", "Test claim content here");

    const res = await exports.default.fetch("https://example.com/verify", {
      method: "POST",
      body: JSON.stringify({ projectId: PROJECT_UUID, assetId: ASSET_UUID }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as RunBody;
    expect(body.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(body.project_id).toBe(PROJECT_UUID);
    expect(body.asset_id).toBe(ASSET_UUID);
    expect(body.engine).toBe("deterministic-v1");
    expect(body.result).toMatch(/^(PASS|REVIEW|BLOCK)$/);
    expect(body.completed_at).toBeTruthy();
  });

  it("POST /verify rejects invalid UUID", async () => {
    const res = await exports.default.fetch("https://example.com/verify", {
      method: "POST",
      body: JSON.stringify({ projectId: "not-a-uuid", assetId: ASSET_UUID }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("INVALID_PROJECT_ID");
  });

  it("POST /verify rejects nonexistent project", async () => {
    const res = await exports.default.fetch("https://example.com/verify", {
      method: "POST",
      body: JSON.stringify({
        projectId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        assetId: ASSET_UUID,
      }),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("PROJECT_NOT_FOUND");
  });

  it("GET /verify/:runId returns run with findings", async () => {
    const localAssetId = "a1000000-0000-4000-8000-000000000001";
    await seedGeneratedAsset(PROJECT_UUID, localAssetId);
    const claimId = "a2000000-0000-4000-8000-000000000001";
    const compId = "a3000000-0000-4000-8000-000000000001";
    await seedBaseClaimAndComponent(claimId, compId, "Run test claim", "Run test content", [], "CLAIM", localAssetId);

    const createRes = await exports.default.fetch("https://example.com/verify", {
      method: "POST",
      body: JSON.stringify({ projectId: PROJECT_UUID, assetId: localAssetId }),
    });
    const created = (await createRes.json()) as RunBody;

    const res = await exports.default.fetch(
      `https://example.com/verify/${created.id}`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { run: RunBody; findings: FindingsBody["findings"] };
    expect(body.run.id).toBe(created.id);
    expect(Array.isArray(body.findings)).toBe(true);
  });

  it("GET /verify?projectId= lists runs for project", async () => {
    const localAssetId = "b1000000-0000-4000-8000-000000000001";
    await seedGeneratedAsset(PROJECT_UUID, localAssetId);
    const claimId = "b2000000-0000-4000-8000-000000000001";
    const compId = "b3000000-0000-4000-8000-000000000001";
    await seedBaseClaimAndComponent(claimId, compId, "List test claim", "List test content", [], "CLAIM", localAssetId);

    await exports.default.fetch("https://example.com/verify", {
      method: "POST",
      body: JSON.stringify({ projectId: PROJECT_UUID, assetId: localAssetId }),
    });

    const res = await exports.default.fetch(
      `https://example.com/verify?projectId=${PROJECT_UUID}`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { runs: RunBody[] };
    expect(body.runs.length).toBeGreaterThan(0);
    expect(body.runs[0]!.project_id).toBe(PROJECT_UUID);
  });

  it("GET /verify/findings/:runId returns findings for a run", async () => {
    const localAssetId = "c1000000-0000-4000-8000-000000000001";
    await seedGeneratedAsset(PROJECT_UUID, localAssetId);
    const claimId = "c2000000-0000-4000-8000-000000000001";
    const compId = "c3000000-0000-4000-8000-000000000001";
    await seedBaseClaimAndComponent(claimId, compId, "Findings test", "Findings test content", [], "CLAIM", localAssetId);

    const createRes = await exports.default.fetch("https://example.com/verify", {
      method: "POST",
      body: JSON.stringify({ projectId: PROJECT_UUID, assetId: localAssetId }),
    });
    const created = (await createRes.json()) as RunBody;

    const res = await exports.default.fetch(
      `https://example.com/verify/findings/${created.id}`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as FindingsBody;
    expect(Array.isArray(body.findings)).toBe(true);
  });

  it("NUMERICAL_DRIFT check catches mismatched numbers", async () => {
    const localAssetId = "d1000000-0000-4000-8000-000000000001";
    await seedGeneratedAsset(PROJECT_UUID, localAssetId);
    const claimId = "d2000000-0000-4000-8000-000000000001";
    const compId = "d3000000-0000-4000-8000-000000000001";
    await seedBaseClaimAndComponent(
      claimId,
      compId,
      "The product costs $49.99",
      "The product is great and affordable",
      [],
      "NUMERICAL",
      localAssetId,
    );

    const res = await exports.default.fetch("https://example.com/verify", {
      method: "POST",
      body: JSON.stringify({ projectId: PROJECT_UUID, assetId: localAssetId }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as RunBody;
    expect(body.result).toBe("BLOCK");

    const findingsRes = await exports.default.fetch(
      `https://example.com/verify/findings/${body.id}`,
    );
    const findingsBody = (await findingsRes.json()) as FindingsBody;
    const numericalFindings = findingsBody.findings.filter(
      (f) => f.type === "NUMERICAL_DRIFT",
    );
    expect(numericalFindings.length).toBeGreaterThan(0);
  });

  it("SPONSOR_COMPLIANCE check catches missing required phrase", async () => {
    const localAssetId = "e1000000-0000-4000-8000-000000000001";
    await seedGeneratedAsset(PROJECT_UUID, localAssetId);
    const claimId = "e2000000-0000-4000-8000-000000000001";
    const compId = "e3000000-0000-4000-8000-000000000001";
    await seedBaseClaimAndComponent(
      claimId,
      compId,
      "Content here",
      "Content without the sponsor disclosure",
      [],
      "CLAIM",
      localAssetId,
    );
    await seedSponsorRequirement("#ad", true);

    const res = await exports.default.fetch("https://example.com/verify", {
      method: "POST",
      body: JSON.stringify({ projectId: PROJECT_UUID, assetId: localAssetId }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as RunBody;
    expect(body.result).toBe("BLOCK");

    const findingsRes = await exports.default.fetch(
      `https://example.com/verify/findings/${body.id}`,
    );
    const findingsBody = (await findingsRes.json()) as FindingsBody;
    const sponsorFindings = findingsBody.findings.filter(
      (f) => f.type === "SPONSOR_COMPLIANCE",
    );
    expect(sponsorFindings.length).toBeGreaterThan(0);
  });

  it("PLATFORM_QA check catches title too long", async () => {
    const longTitle = "A".repeat(120);
    const localAssetId = "e4000000-0000-4000-8000-000000000001";
    await seedGeneratedAsset(PROJECT_UUID, localAssetId, "YOUTUBE_TITLE", longTitle);
    const claimId = "e5000000-0000-4000-8000-000000000001";
    const compId = "e6000000-0000-4000-8000-000000000001";
    await seedBaseClaimAndComponent(claimId, compId, "Some claim", "Some content", [], "CLAIM", localAssetId);

    const res = await exports.default.fetch("https://example.com/verify", {
      method: "POST",
      body: JSON.stringify({ projectId: PROJECT_UUID, assetId: localAssetId }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as RunBody;
    expect(body.result).toBe("BLOCK");

    const findingsRes = await exports.default.fetch(
      `https://example.com/verify/findings/${body.id}`,
    );
    const findingsBody = (await findingsRes.json()) as FindingsBody;
    const platformFindings = findingsBody.findings.filter(
      (f) => f.type === "PLATFORM_QA",
    );
    expect(platformFindings.length).toBeGreaterThan(0);
  });

  it("Result is PASS when no findings are generated", async () => {
    const isolatedProjectId = "ff000000-0000-4000-8000-000000000001";
    const isolatedSourceId = "ff000000-0000-4000-8000-000000000010";
    const isolatedSegmentId = "ff000000-0000-4000-8000-000000000020";
    await seedProject(isolatedProjectId);

    await new D1Adapter(env.DB).prepare(
      `INSERT INTO source_assets (id, project_id, object_key, file_name, file_type, size_bytes, duration_seconds, checksum, transcription_status, analysis_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
    ).run(isolatedSourceId, isolatedProjectId, `sources/${isolatedProjectId}/${isolatedSourceId}.mp4`, "test.mp4", "video/mp4", 1024, 10.0, "sha256:abc", "PENDING", "PENDING", NOW, NOW);

    await new D1Adapter(env.DB).prepare(
      `INSERT INTO transcript_segments (id, source_asset_id, segment_index, start_time, end_time, text, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
    ).run(isolatedSegmentId, isolatedSourceId, 0, 0.0, 5.0, "Test transcript text", NOW);

    const localAssetId = "f1000000-0000-4000-8000-000000000001";
    await seedGeneratedAsset(isolatedProjectId, localAssetId, "SOCIAL_POST", "Short Title");
    const claimId = "f2000000-0000-4000-8000-000000000001";
    const compId = "f3000000-0000-4000-8000-000000000001";

    await new D1Adapter(env.DB).prepare(
      `INSERT INTO claims (id, project_id, segment_id, type, content, qualifiers, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
    ).run(claimId, isolatedProjectId, isolatedSegmentId, "CLAIM", "Simple fact stated clearly", "[]", NOW);

    await new D1Adapter(env.DB).prepare(
      `INSERT INTO generated_components (component_id, asset_id, content, source_references, claim_references, constraint_references, generation_metadata, verification_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(component_id) DO NOTHING`,
    ).run(compId, localAssetId, "This is a simple fact stated clearly in the generated text with enough keyword overlap", "[]", JSON.stringify([claimId]), "[]", JSON.stringify({ engine: "test" }), "REVIEW");

    const res = await exports.default.fetch("https://example.com/verify", {
      method: "POST",
      body: JSON.stringify({ projectId: isolatedProjectId, assetId: localAssetId }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as RunBody;
    expect(body.result).toBe("PASS");
    expect(body.finding_ids.length).toBe(0);
  });

  it("Result is REVIEW when REVIEW findings exist but no BLOCK findings", async () => {
    const isolatedProjectId = "ff000000-0000-4000-8000-000000000002";
    const isolatedSourceId = "ff000000-0000-4000-8000-000000000030";
    const isolatedSegmentId = "ff000000-0000-4000-8000-000000000040";
    await seedProject(isolatedProjectId);

    await new D1Adapter(env.DB).prepare(
      `INSERT INTO source_assets (id, project_id, object_key, file_name, file_type, size_bytes, duration_seconds, checksum, transcription_status, analysis_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
    ).run(isolatedSourceId, isolatedProjectId, `sources/${isolatedProjectId}/${isolatedSourceId}.mp4`, "test.mp4", "video/mp4", 1024, 10.0, "sha256:abc", "PENDING", "PENDING", NOW, NOW);

    await new D1Adapter(env.DB).prepare(
      `INSERT INTO transcript_segments (id, source_asset_id, segment_index, start_time, end_time, text, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
    ).run(isolatedSegmentId, isolatedSourceId, 0, 0.0, 5.0, "Test transcript text", NOW);

    const localAssetId = "f4000000-0000-4000-8000-000000000001";
    await seedGeneratedAsset(isolatedProjectId, localAssetId, "SOCIAL_POST", "Review Title");
    const claimId = "f5000000-0000-4000-8000-000000000001";
    const compId = "f6000000-0000-4000-8000-000000000001";

    await new D1Adapter(env.DB).prepare(
      `INSERT INTO claims (id, project_id, segment_id, type, content, qualifiers, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
    ).run(claimId, isolatedProjectId, isolatedSegmentId, "CLAIM", "According to experts this is true", JSON.stringify(["according to"]), NOW);

    await new D1Adapter(env.DB).prepare(
      `INSERT INTO generated_components (component_id, asset_id, content, source_references, claim_references, constraint_references, generation_metadata, verification_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(component_id) DO NOTHING`,
    ).run(compId, localAssetId, "This is true but the qualifier text is totally different and missing the original phrase entirely", "[]", JSON.stringify([claimId]), "[]", JSON.stringify({ engine: "test" }), "REVIEW");

    const res = await exports.default.fetch("https://example.com/verify", {
      method: "POST",
      body: JSON.stringify({ projectId: isolatedProjectId, assetId: localAssetId }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as RunBody;
    expect(body.result).toBe("REVIEW");
  });
});
