import { describe, expect, it, beforeAll, vi } from "vitest";
import { env, exports } from "cloudflare:workers";
import { D1Adapter } from "@crex/infra";
import { buildMp4 } from "@crex/media";

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

async function createUploadAndIngest(projectId: string): Promise<string> {
  const createRes = await exports.default.fetch("https://example.com/sources", {
    method: "POST",
    body: JSON.stringify({ projectId, fileName: "test-clip.mp4" }),
  });
  const createBody = (await createRes.json()) as { uploadId: string };
  const uploadId = createBody.uploadId;

  const putBytes = buildMp4({ durationSeconds: 2, video: { codec: "avc1", width: 64, height: 64 } });
  await exports.default.fetch(`https://example.com/sources/${uploadId}/blob`, {
    method: "PUT",
    headers: {
      "content-type": "application/octet-stream",
      "content-length": String(putBytes.byteLength),
    },
    body: new Uint8Array(putBytes),
  });

  return uploadId;
}

describe("video understanding", () => {
  beforeAll(async () => {
    await seedProject();
  });

  it("returns UNDERSTANDING_NOT_FOUND for unknown understanding id", async () => {
    const res = await exports.default.fetch(`https://example.com/ai/understand/${UNKNOWN_UUID}`);
    expect(res.status).toBe(404);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("UNDERSTANDING_NOT_FOUND");
  });

  it("returns TRANSCRIPT_NOT_FOUND for unknown transcript id", async () => {
    const res = await exports.default.fetch(`https://example.com/ai/transcript/${UNKNOWN_UUID}`);
    expect(res.status).toBe(404);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("TRANSCRIPT_NOT_FOUND");
  });

  it("returns INVALID_SOURCE_ID for non-UUID sourceAssetId", async () => {
    const res = await exports.default.fetch("https://example.com/ai/understand", {
      method: "POST",
      body: JSON.stringify({ sourceAssetId: "not-a-uuid" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("INVALID_SOURCE_ID");
  });

  it("returns SOURCE_NOT_FOUND for unknown source", async () => {
    const res = await exports.default.fetch("https://example.com/ai/understand", {
      method: "POST",
      body: JSON.stringify({ sourceAssetId: UNKNOWN_UUID }),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("SOURCE_NOT_FOUND");
  });

  it("returns INVALID_SOURCE_STATE for non-READY source", async () => {
    const uploadId = await createUploadAndIngest(PROJECT_UUID);
    const res = await exports.default.fetch("https://example.com/ai/understand", {
      method: "POST",
      body: JSON.stringify({ sourceAssetId: uploadId }),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("INVALID_SOURCE_STATE");
  });

  it("returns empty understandings list for source with no understandings", async () => {
    const uploadId = await createUploadAndIngest(PROJECT_UUID);
    const res = await exports.default.fetch(`https://example.com/ai/understand/source/${uploadId}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { understandings: unknown[] };
    expect(body.understandings).toEqual([]);
  });

  it("rejects missing body in POST /ai/understand", async () => {
    const res = await exports.default.fetch("https://example.com/ai/understand", {
      method: "POST",
      body: "not json",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("INVALID_BODY");
  });
});
