import { describe, expect, it, beforeAll } from "vitest";
import { env, exports } from "cloudflare:workers";
import { D1Adapter } from "@crex/infra";
import { buildMp4, sha256Bytes, truncate } from "@crex/media";
import { createSourcesApi } from "../src/sources-routes";

const PROJECT_UUID = "11111111-1111-4111-8111-111111111111";
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

async function createUpload(projectId: string, fileName: string, fileType?: string) {
  const res = await exports.default.fetch("https://example.com/sources", {
    method: "POST",
    body: JSON.stringify({ projectId, fileName, ...(fileType !== undefined ? { fileType } : {}) }),
  });
  return res;
}

async function putBlob(uploadId: string, bytes: Uint8Array) {
  const res = await exports.default.fetch(`https://example.com/sources/${uploadId}/blob`, {
    method: "PUT",
    headers: {
      "content-type": "application/octet-stream",
      "content-length": String(bytes.byteLength),
    },
    body: new Uint8Array(bytes),
  });
  return res;
}

describe("source ingestion", () => {
  beforeAll(async () => {
    await seedProject();
  });

  it("round-trips a valid MP4 and polls to VALID", async () => {
    const putBytes = buildMp4({ durationSeconds: 2, video: { codec: "avc1", width: 64, height: 64 } });
    const created = await createUpload(PROJECT_UUID, "clip.mp4");
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as { uploadId: string; status: string; objectKey: string };
    expect(createdBody.status).toBe("UPLOADING");

    const put = await putBlob(createdBody.uploadId, putBytes);
    expect(put.status).toBe(200);
    const putBody = (await put.json()) as {
      uploadId: string;
      status: string;
      media: { video: { width: number; codec: string }; audio: { codec: string } };
      sizeBytes: number;
      checksum: string;
      durationSeconds: number;
    };
    expect(putBody.status).toBe("VALID");
    expect(putBody.media.video.width).toBe(64);
    expect(putBody.media.audio.codec).toBeTruthy();
    expect(putBody.sizeBytes).toBe(putBytes.byteLength);
    expect(putBody.checksum).toBe(`sha256:${sha256Bytes(putBytes)}`);

    const poll = await exports.default.fetch(`https://example.com/sources/${createdBody.uploadId}`);
    expect(poll.status).toBe(200);
    const pollBody = (await poll.json()) as {
      status: string;
      media: { video: { width: number; codec: string }; audio: { codec: string } };
      sizeBytes: number;
      checksum: string;
      durationSeconds: number;
    };
    expect(pollBody.status).toBe("VALID");
    expect(pollBody.media.video.width).toBe(64);
    expect(pollBody.media.video.codec).toBe("avc1");
    expect(pollBody.media.audio.codec).toBeTruthy();
    expect(pollBody.checksum).toBe(`sha256:${sha256Bytes(putBytes)}`);
    expect(pollBody.sizeBytes).toBe(putBytes.byteLength);
    expect(pollBody.durationSeconds).toBe(2);
  });

  it("marks an invalid/truncated file as INVALID with a reason", async () => {
    const putBytes = truncate(buildMp4(), 8);
    const created = await createUpload(PROJECT_UUID, "broken.mp4");
    const createdBody = (await created.json()) as { uploadId: string };
    const put = await putBlob(createdBody.uploadId, putBytes);
    expect(put.status).toBe(200);
    const putBody = (await put.json()) as { status: string; reason: string };
    expect(putBody.status).toBe("INVALID");
    expect(putBody.reason).toBeTruthy();
  });

  it("returns 404 PROJECT_NOT_FOUND for an unknown project", async () => {
    const res = await createUpload(UNKNOWN_UUID, "clip.mp4");
    expect(res.status).toBe(404);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("PROJECT_NOT_FOUND");
  });

  it("rejects an unsafe filename with INVALID_FILE_NAME", async () => {
    const res = await createUpload(PROJECT_UUID, "../evil.txt");
    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("INVALID_FILE_NAME");

    const res2 = await createUpload(PROJECT_UUID, "a\\b.mp4");
    expect(res2.status).toBe(400);
    const body2 = (await res2.json()) as ErrorBody;
    expect(body2.error.code).toBe("INVALID_FILE_NAME");
  });

  it("returns 404 UPLOAD_NOT_FOUND for an unknown upload id", async () => {
    const get = await exports.default.fetch(`https://example.com/sources/${UNKNOWN_UUID}`);
    expect(get.status).toBe(404);
    const getBody = (await get.json()) as ErrorBody;
    expect(getBody.error.code).toBe("UPLOAD_NOT_FOUND");

    const put = await putBlob(UNKNOWN_UUID, buildMp4());
    expect(put.status).toBe(404);
    const putBody = (await put.json()) as ErrorBody;
    expect(putBody.error.code).toBe("UPLOAD_NOT_FOUND");
  });

  it("rejects an oversized upload with SOURCE_TOO_LARGE and marks the session FAILED", async () => {
    await seedProject();
    const created = await createUpload(PROJECT_UUID, "big.mp4");
    const createdBody = (await created.json()) as { uploadId: string };
    const big = new Uint8Array(128).fill(1);
    const api = createSourcesApi(env, { maxSizeBytes: 32 });
    const res = await api.handle(
      new Request(`https://example.com/sources/${createdBody.uploadId}/blob`, {
        method: "PUT",
        headers: {
          "content-type": "application/octet-stream",
          "content-length": String(big.byteLength),
        },
        body: big,
      }),
      `/sources/${createdBody.uploadId}/blob`,
    );
    expect(res).not.toBeNull();
    expect(res!.status).toBe(413);
    const body = (await res!.json()) as ErrorBody;
    expect(body.error.code).toBe("SOURCE_TOO_LARGE");

    const poll = await exports.default.fetch(`https://example.com/sources/${createdBody.uploadId}`);
    const pollBody = (await poll.json()) as {
      uploadStatus: string;
      status: string;
      error: string;
    };
    expect(pollBody.uploadStatus).toBe("FAILED");
    expect(pollBody.status).toBe("FAILED");
    expect(pollBody.error).toBeTruthy();
  });

  it("lists sources by project after a successful upload", async () => {
    await seedProject();
    const putBytes = buildMp4({ durationSeconds: 1, video: { codec: "avc1", width: 32, height: 32 } });
    const created = await createUpload(PROJECT_UUID, "listed.mp4");
    const createdBody = (await created.json()) as { uploadId: string };
    await putBlob(createdBody.uploadId, putBytes);

    const res = await exports.default.fetch(
      `https://example.com/sources?projectId=${PROJECT_UUID}`,
    );
    expect(res.status).toBe(200);
    const listBody = (await res.json()) as {
      sources: { uploadId: string; fileName: string; status: string; media: unknown }[];
    };
    expect(listBody.sources.length).toBeGreaterThan(0);
    const found = listBody.sources.find((s) => s.uploadId === createdBody.uploadId);
    expect(found).toBeDefined();
    expect(found!.fileName).toBe("listed.mp4");
    expect(found!.status).toBe("VALID");
  });

  it("serves the upload UI at /sources/ui", async () => {
    const res = await exports.default.fetch("https://example.com/sources/ui");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  it("returns 413 SOURCE_TOO_LARGE when body exceeds declared content-length", async () => {
    await seedProject();
    const created = await createUpload(PROJECT_UUID, "mismatch.mp4");
    const createdBody = (await created.json()) as { uploadId: string };
    const realBytes = buildMp4({ durationSeconds: 1, video: { codec: "avc1", width: 32, height: 32 } });
    const fakeContentLength = 10;
    const api = createSourcesApi(env, { maxSizeBytes: 10_000_000 });
    const res = await api.handle(
      new Request(`https://example.com/sources/${createdBody.uploadId}/blob`, {
        method: "PUT",
        headers: {
          "content-type": "application/octet-stream",
          "content-length": String(fakeContentLength),
        },
        body: new Blob([realBytes.buffer as ArrayBuffer]),
      }),
      `/sources/${createdBody.uploadId}/blob`,
    );
    expect(res).not.toBeNull();
    expect(res!.status).toBe(413);
    const body = (await res!.json()) as ErrorBody;
    expect(body.error.code).toBe("SOURCE_TOO_LARGE");
    expect(body.error.message).not.toContain("FixedLength");
    expect(body.error.message).not.toContain("R2");
  });
});
