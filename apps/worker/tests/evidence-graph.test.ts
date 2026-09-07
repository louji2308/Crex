import { describe, expect, it, beforeAll } from "vitest";
import { env, exports } from "cloudflare:workers";
import { D1Adapter } from "@crex/infra";

const PROJECT_UUID = "22222222-2222-4222-8222-222222222222";
const UNKNOWN_UUID = "99999999-9999-4999-8999-999999999999";
const NOW = "2026-01-02T03:04:05.000Z";

interface ErrorBody {
  error: { code: string; message: string };
}

async function seedProject(projectId = PROJECT_UUID): Promise<void> {
  await new D1Adapter(env.DB).prepare(
    `INSERT INTO projects (id, name, target_platforms, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
  ).run(projectId, "Test Project", "[]", NOW, NOW);
}

async function seedSourceAsset(
  sourceId: string,
  projectId: string,
): Promise<void> {
  await new D1Adapter(env.DB).prepare(
    `INSERT INTO source_assets (id, project_id, object_key, file_name, file_type, status, transcription_status, analysis_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
  ).run(sourceId, projectId, "test/key.mp4", "test.mp4", "video/mp4", "READY", "PENDING", "PENDING", NOW, NOW);
}

async function seedTranscript(
  transcriptId: string,
  sourceAssetId: string,
): Promise<void> {
  await new D1Adapter(env.DB).prepare(
    `INSERT INTO transcripts (id, source_asset_id, language, duration_seconds, provider, model, fallback_used, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
  ).run(transcriptId, sourceAssetId, "en", 10, "test", "test", 0, "READY", NOW, NOW);
}

async function seedUnderstanding(
  understandingId: string,
  sourceAssetId: string,
  transcriptId: string,
  status = "READY",
): Promise<void> {
  await new D1Adapter(env.DB).prepare(
    `INSERT INTO understandings (id, source_asset_id, status, media_metadata_json, transcript_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
  ).run(understandingId, sourceAssetId, status, "{}", transcriptId, NOW, NOW);
}

async function seedTranscriptSegment(
  segmentId: string,
  sourceAssetId: string,
  segmentIndex: number,
  text: string,
): Promise<void> {
  await new D1Adapter(env.DB).prepare(
    `INSERT INTO transcript_segments (id, source_asset_id, segment_index, start_time, end_time, text, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
  ).run(segmentId, sourceAssetId, segmentIndex, segmentIndex * 5, segmentIndex * 5 + 5, text, NOW);
}

async function seedClaim(
  claimId: string,
  projectId: string,
  segmentId: string,
  content: string,
): Promise<void> {
  await new D1Adapter(env.DB).prepare(
    `INSERT INTO claims (id, project_id, segment_id, type, content, qualifiers, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(claimId, projectId, segmentId, "CLAIM", content, "[]", NOW);
}

async function seedEvidence(
  evidenceId: string,
  claimId: string,
  content: string,
): Promise<void> {
  await new D1Adapter(env.DB).prepare(
    `INSERT INTO evidence (id, claim_id, type, content, source_range, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(evidenceId, claimId, "TRANSCRIPT", content, null, NOW);
}

describe("evidence graph routes", () => {
  beforeAll(async () => {
    await seedProject();
  });

  it("returns 400 for invalid understandingId UUID", async () => {
    const res = await exports.default.fetch("https://example.com/evidence-graph/build", {
      method: "POST",
      body: JSON.stringify({ understandingId: "not-a-uuid", projectId: PROJECT_UUID }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("INVALID_UNDERSTANDING_ID");
  });

  it("returns 400 for invalid projectId UUID", async () => {
    const res = await exports.default.fetch("https://example.com/evidence-graph/build", {
      method: "POST",
      body: JSON.stringify({ understandingId: UNKNOWN_UUID, projectId: "not-a-uuid" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("INVALID_PROJECT_ID");
  });

  it("returns 404 for nonexistent understanding", async () => {
    const res = await exports.default.fetch("https://example.com/evidence-graph/build", {
      method: "POST",
      body: JSON.stringify({ understandingId: UNKNOWN_UUID, projectId: PROJECT_UUID }),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("UNDERSTANDING_NOT_FOUND");
  });

  it("returns 404 for nonexistent project", async () => {
    const sourceId = crypto.randomUUID();
    const transcriptId = crypto.randomUUID();
    const understandingId = crypto.randomUUID();

    await seedSourceAsset(sourceId, PROJECT_UUID);
    await seedTranscript(transcriptId, sourceId);
    await seedUnderstanding(understandingId, sourceId, transcriptId);

    const res = await exports.default.fetch("https://example.com/evidence-graph/build", {
      method: "POST",
      body: JSON.stringify({ understandingId, projectId: UNKNOWN_UUID }),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("PROJECT_NOT_FOUND");
  });

  it("returns 400 for missing body in POST /evidence-graph/build", async () => {
    const res = await exports.default.fetch("https://example.com/evidence-graph/build", {
      method: "POST",
      body: "not json",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("INVALID_BODY");
  });

  it("returns 503 when AI is not configured", async () => {
    const sourceId = crypto.randomUUID();
    const transcriptId = crypto.randomUUID();
    const understandingId = crypto.randomUUID();

    await seedSourceAsset(sourceId, PROJECT_UUID);
    await seedTranscript(transcriptId, sourceId);
    await seedUnderstanding(understandingId, sourceId, transcriptId);

    const res = await exports.default.fetch("https://example.com/evidence-graph/build", {
      method: "POST",
      body: JSON.stringify({ understandingId, projectId: PROJECT_UUID }),
    });
    expect(res.status).toBe(503);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("AI_NOT_CONFIGURED");
  });

  it("GET /evidence-graph?projectId= returns empty claims list", async () => {
    const res = await exports.default.fetch(
      `https://example.com/evidence-graph?projectId=${PROJECT_UUID}`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { claims: unknown[] };
    expect(body.claims).toEqual([]);
  });

  it("GET /evidence-graph?projectId= with invalid UUID returns 400", async () => {
    const res = await exports.default.fetch(
      "https://example.com/evidence-graph?projectId=not-a-uuid",
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("INVALID_PROJECT_ID");
  });

  it("GET /evidence-graph?projectId= with nonexistent project returns 404", async () => {
    const res = await exports.default.fetch(
      `https://example.com/evidence-graph?projectId=${UNKNOWN_UUID}`,
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("PROJECT_NOT_FOUND");
  });

  it("GET /evidence-graph/:claimId returns 404 for unknown claim", async () => {
    const res = await exports.default.fetch(
      `https://example.com/evidence-graph/${UNKNOWN_UUID}`,
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("CLAIM_NOT_FOUND");
  });

  it("GET /evidence-graph/evidence/:claimId returns 404 for unknown claim", async () => {
    const res = await exports.default.fetch(
      `https://example.com/evidence-graph/evidence/${UNKNOWN_UUID}`,
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("CLAIM_NOT_FOUND");
  });

  it("GET /evidence-graph/:claimId returns claim with evidence", async () => {
    const sourceId = crypto.randomUUID();
    const segmentId = crypto.randomUUID();
    const claimId = crypto.randomUUID();
    const evidenceId = crypto.randomUUID();

    await seedSourceAsset(sourceId, PROJECT_UUID);
    await seedTranscriptSegment(segmentId, sourceId, 0, "Test segment text");
    await seedClaim(claimId, PROJECT_UUID, segmentId, "Test claim content");
    await seedEvidence(evidenceId, claimId, "Test segment text");

    const claimRes = await exports.default.fetch(
      `https://example.com/evidence-graph/${claimId}`,
    );
    expect(claimRes.status).toBe(200);
    const claimBody = (await claimRes.json()) as {
      claim: { id: string; content: string };
      evidence: unknown[];
    };
    expect(claimBody.claim.id).toBe(claimId);
    expect(claimBody.claim.content).toBe("Test claim content");
    expect(claimBody.evidence).toHaveLength(1);

    const evidenceRes = await exports.default.fetch(
      `https://example.com/evidence-graph/evidence/${claimId}`,
    );
    expect(evidenceRes.status).toBe(200);
    const evidenceBody = (await evidenceRes.json()) as { evidence: unknown[] };
    expect(evidenceBody.evidence).toHaveLength(1);
  });

  it("GET /evidence-graph?projectId= returns seeded claims", async () => {
    const sourceId = crypto.randomUUID();
    const segmentId = crypto.randomUUID();
    const claimId = crypto.randomUUID();

    await seedSourceAsset(sourceId, PROJECT_UUID);
    await seedTranscriptSegment(segmentId, sourceId, 0, "Another segment");
    await seedClaim(claimId, PROJECT_UUID, segmentId, "Another claim");

    const res = await exports.default.fetch(
      `https://example.com/evidence-graph?projectId=${PROJECT_UUID}`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { claims: { id: string }[] };
    expect(body.claims.length).toBeGreaterThanOrEqual(1);
  });
});
