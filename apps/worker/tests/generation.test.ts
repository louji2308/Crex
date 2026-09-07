import { describe, expect, it, beforeAll } from "vitest";
import { env, exports } from "cloudflare:workers";
import { D1Adapter } from "@crex/infra";

interface ErrorBody {
  error: { code: string; message: string };
}

interface AssetsListBody {
  assets: Array<{ id: string; project_id: string; asset_type: string; title: string }>;
}

const PROJECT_UUID = "11111111-1111-4111-8111-111111111111";
const CLAIM_UUID = "22222222-2222-4222-8222-222222222222";
const EVIDENCE_UUID = "33333333-3333-4333-8333-333333333333";
const SEGMENT_UUID = "44444444-4444-4444-8444-444444444444";
const SOURCE_UUID = "55555555-5555-4555-8555-555555555555";
const NOW = "2026-01-02T03:04:05.000Z";

async function seedProject(projectId = PROJECT_UUID): Promise<void> {
  await new D1Adapter(env.DB).prepare(
    `INSERT INTO projects (id, name, target_platforms, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
  ).run(projectId, "Generation Test Project", '["YOUTUBE"]', NOW, NOW);
}

async function seedEvidenceGraph(): Promise<void> {
  const db = new D1Adapter(env.DB);

  await db.prepare(
    `INSERT INTO source_assets (id, project_id, file_name, file_type, object_key, status, transcription_status, analysis_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
  ).run(SOURCE_UUID, PROJECT_UUID, "test.mp4", "video/mp4", "sources/test.mp4", "READY", "COMPLETED", "COMPLETED", NOW, NOW);

  await db.prepare(
    `INSERT INTO transcripts (id, source_asset_id, language, duration_seconds, provider, model, fallback_used, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
  ).run("66666666-6666-4666-8666-666666666666", SOURCE_UUID, "en", 120, "test", "test", 0, "READY", NOW, NOW);

  await db.prepare(
    `INSERT INTO transcript_segments (id, source_asset_id, segment_index, start_time, end_time, text, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
  ).run(SEGMENT_UUID, SOURCE_UUID, 0, 0, 10, "Test segment text", NOW);

  await db.prepare(
    `INSERT INTO claims (id, project_id, segment_id, type, content, qualifiers, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
  ).run(CLAIM_UUID, PROJECT_UUID, SEGMENT_UUID, "CLAIM", "Test claim content", "[]", NOW);

  await db.prepare(
    `INSERT INTO evidence (id, claim_id, type, content, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
  ).run(EVIDENCE_UUID, CLAIM_UUID, "TRANSCRIPT", "Test evidence content", NOW);
}

async function seedConstraint(): Promise<void> {
  const db = new D1Adapter(env.DB);
  await db.prepare(
    `INSERT INTO constraints (id, project_id, category, source, summary, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
  ).run("77777777-7777-4777-8777-777777777777", PROJECT_UUID, "TONE", "MANUAL", "Keep tone professional", 1, NOW, NOW);
}

describe("crex-worker generation API", () => {
  beforeAll(async () => {
    await seedProject();
    await seedEvidenceGraph();
    await seedConstraint();
  });

  it("POST /generate rejects missing projectId", async () => {
    const res = await exports.default.fetch("https://example.com/generate", {
      method: "POST",
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("INVALID_PROJECT_ID");
  });

  it("POST /generate rejects invalid UUID projectId", async () => {
    const res = await exports.default.fetch("https://example.com/generate", {
      method: "POST",
      body: JSON.stringify({ projectId: "not-a-uuid" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("INVALID_PROJECT_ID");
  });

  it("POST /generate returns 404 for nonexistent project", async () => {
    const res = await exports.default.fetch("https://example.com/generate", {
      method: "POST",
      body: JSON.stringify({ projectId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("PROJECT_NOT_FOUND");
  });

  it("POST /generate returns 503 when AI not configured", async () => {
    const res = await exports.default.fetch("https://example.com/generate", {
      method: "POST",
      body: JSON.stringify({ projectId: PROJECT_UUID }),
    });
    expect(res.status).toBe(503);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("AI_NOT_CONFIGURED");
  });

  it("POST /generate rejects invalid assetTypes", async () => {
    const res = await exports.default.fetch("https://example.com/generate", {
      method: "POST",
      body: JSON.stringify({ projectId: PROJECT_UUID, assetTypes: "not-an-array" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("INVALID_ASSET_TYPES");
  });

  it("GET /generate returns 400 without projectId", async () => {
    const res = await exports.default.fetch("https://example.com/generate");
    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("INVALID_PROJECT_ID");
  });

  it("GET /generate returns assets list for valid projectId", async () => {
    const res = await exports.default.fetch(
      `https://example.com/generate?projectId=${PROJECT_UUID}`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as AssetsListBody;
    expect(Array.isArray(body.assets)).toBe(true);
  });

  it("GET /generate/:assetId returns 404 for invalid UUID", async () => {
    const res = await exports.default.fetch("https://example.com/generate/not-a-uuid");
    expect(res.status).toBe(404);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("GET /generate/:assetId returns 404 for nonexistent asset", async () => {
    const res = await exports.default.fetch(
      "https://example.com/generate/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("GENERATED_ASSET_NOT_FOUND");
  });
});
