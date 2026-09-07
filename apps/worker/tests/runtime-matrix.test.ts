import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { introspectWorkflowInstance } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { D1Adapter } from "@crex/infra";
import { buildMp4, sha256Bytes, truncate } from "@crex/media";
import { SourceAssetRepository } from "@crex/db/src/repositories/source-assets";
import { CrexError } from "@crex/core/src/errors";
import { createSourcesApi } from "../src/sources-routes";

const PROJECT_UUID = "11111111-1111-4111-8111-111111111111";
const NOW = "2026-01-02T03:04:05.000Z";

interface ErrorBody {
  error: { code: string; message: string };
}

interface MatrixRow {
  case: string;
  expected: string;
  actual: string;
  result: "PASS" | "FAIL";
}

const matrixRows: MatrixRow[] = [];

async function seedProject(projectId = PROJECT_UUID): Promise<void> {
  await new D1Adapter(env.DB).prepare(
    `INSERT INTO projects (id, name, target_platforms, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
  ).run(projectId, "Test Project", "[]", NOW, NOW);
}

async function createUpload(projectId: string, fileName: string, fileType?: string) {
  return exports.default.fetch("https://example.com/sources", {
    method: "POST",
    body: JSON.stringify({ projectId, fileName, ...(fileType !== undefined ? { fileType } : {}) }),
  });
}

async function putBlob(uploadId: string, bytes: Uint8Array) {
  return exports.default.fetch(`https://example.com/sources/${uploadId}/blob`, {
    method: "PUT",
    headers: {
      "content-type": "application/octet-stream",
      "content-length": String(bytes.byteLength),
    },
    body: new Uint8Array(bytes),
  });
}

interface PollBody {
  uploadId: string;
  objectKey: string;
  fileName: string;
  uploadStatus: string;
  status: string;
  media: {
    video: { codec: string; width: number; height: number } | null;
    audio: { codec: string } | null;
  } | null;
  sizeBytes: number | null;
  durationSeconds: number | null;
  checksum: string | null;
  error: string | null;
}

async function pollUpload(uploadId: string): Promise<PollBody> {
  const res = await exports.default.fetch(`https://example.com/sources/${uploadId}`);
  expect(res.status).toBe(200);
  return (await res.json()) as PollBody;
}

async function runSourceToRelease(projectId: string, sourceId: string): Promise<string> {
  const res = await exports.default.fetch("https://example.com/workflows/source-to-release", {
    method: "POST",
    body: JSON.stringify({ projectId, sourceId }),
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { id: string; status: string; phase?: string };
  const introspector = await introspectWorkflowInstance(env.SOURCE_TO_RELEASE, body.id);
  try {
    await introspector.waitForStatus("complete");
  } finally {
    await introspector.dispose();
  }
  return body.id;
}

async function runCase(name: string, expected: string, body: () => Promise<string>): Promise<void> {
  let actual = "";
  try {
    actual = await body();
    matrixRows.push({ case: name, expected, actual, result: "PASS" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    matrixRows.push({
      case: name,
      expected,
      actual: actual.length > 0 ? `${actual} | ERROR: ${message}` : `ERROR: ${message}`,
      result: "FAIL",
    });
    throw error;
  }
}

describe("source ingestion runtime matrix", () => {
  beforeAll(async () => {
    await seedProject();
  });

  it("A1: happy path POST->PUT->VALID->workflow->READY", async () => {
    await runCase(
      "A1 happy path",
      "201 UPLOADING; PUT 200 VALID (media/size/sha256/duration match); poll VALID; R2 head size ok; workflow complete; SourceAsset READY",
      async () => {
        const putBytes = buildMp4({ durationSeconds: 2, video: { codec: "avc1", width: 64, height: 64 } });
        const created = await createUpload(PROJECT_UUID, "matrix-clip.mp4");
        expect(created.status).toBe(201);
        const createdBody = (await created.json()) as { uploadId: string; status: string; objectKey: string };
        expect(createdBody.status).toBe("UPLOADING");

        const put = await putBlob(createdBody.uploadId, putBytes);
        expect(put.status).toBe(200);
        const putBody = (await put.json()) as {
          uploadId: string;
          status: string;
          media: {
            video: { codec: string; width: number; height: number } | null;
            audio: { codec: string } | null;
          };
          sizeBytes: number;
          checksum: string;
          durationSeconds: number;
        };
        expect(putBody.status).toBe("VALID");
        expect(putBody.uploadId).toBe(createdBody.uploadId);
        expect(putBody.media.video?.codec).toBe("avc1");
        expect(putBody.media.video?.width).toBe(64);
        expect(putBody.media.video?.height).toBe(64);
        expect(putBody.media.audio?.codec).toBeTruthy();
        expect(putBody.sizeBytes).toBe(putBytes.byteLength);
        expect(putBody.checksum).toBe(`sha256:${sha256Bytes(putBytes)}`);
        expect(putBody.durationSeconds).toBe(2);

        const head = await env.MEDIA.head(createdBody.objectKey);
        expect(head).not.toBeNull();
        expect(head?.size).toBe(putBytes.byteLength);

        const poll = await pollUpload(createdBody.uploadId);
        expect(poll.status).toBe("VALID");
        expect(poll.checksum).toBe(`sha256:${sha256Bytes(putBytes)}`);
        expect(poll.sizeBytes).toBe(putBytes.byteLength);
        expect(poll.durationSeconds).toBe(2);
        expect(poll.media?.video?.width).toBe(64);

        const workflowId = await runSourceToRelease(PROJECT_UUID, createdBody.uploadId);
        const source = await new SourceAssetRepository(new D1Adapter(env.DB)).get(createdBody.uploadId);
        expect(source?.status).toBe("READY");
        expect(source?.checksum).toBe(`sha256:${sha256Bytes(putBytes)}`);
        expect(source?.size_bytes).toBe(putBytes.byteLength);
        expect(source?.duration_seconds).toBe(2);
        expect(source?.object_key).toBe(createdBody.objectKey);

        const wfState = await new D1Adapter(env.DB)
          .prepare("SELECT phase, stage FROM workflow_state WHERE id = ?")
          .get(workflowId);
        expect(wfState?.["phase"]).toBe("COMPLETED");
        expect(wfState?.["stage"]).toBe("SOURCE_INGESTION");

        return `POST 201; PUT 200 VALID (avc1 64x64, ${source?.size_bytes}B, sha256 ok, 2.0s); poll VALID; R2 size ${head?.size}B; workflow ${workflowId} complete; SourceAsset READY`;
      },
    );
  }, 30000);

  it("A2: truncated file -> INVALID, never READY", async () => {
    await runCase(
      "A2 truncated MP4 (8 bytes)",
      "PUT 200 INVALID + reason; poll INVALID; SourceAsset INVALID; never READY",
      async () => {
        const putBytes = truncate(buildMp4(), 8);
        const created = await createUpload(PROJECT_UUID, "truncated.mp4");
        expect(created.status).toBe(201);
        const createdBody = (await created.json()) as { uploadId: string };
        const put = await putBlob(createdBody.uploadId, putBytes);
        expect(put.status).toBe(200);
        const putBody = (await put.json()) as { status: string; reason: string };
        expect(putBody.status).toBe("INVALID");
        expect(putBody.reason).toBeTruthy();

        const poll = await pollUpload(createdBody.uploadId);
        expect(poll.status).toBe("INVALID");
        expect(poll.status).not.toBe("READY");

        const source = await new SourceAssetRepository(new D1Adapter(env.DB)).get(createdBody.uploadId);
        expect(source?.status).toBe("INVALID");
        expect(source?.status).not.toBe("READY");

        return `PUT 200 INVALID (reason=${putBody.reason}); poll INVALID; SourceAsset ${source?.status}; never READY`;
      },
    );
  });

  it("A3: oversized PUT -> 413, session FAILED, never READY", async () => {
    await runCase(
      "A3 oversized PUT (128B / max 32B)",
      "413 SOURCE_TOO_LARGE; poll uploadStatus FAILED + error; no asset; never READY",
      async () => {
        const created = await createUpload(PROJECT_UUID, "oversized.mp4");
        expect(created.status).toBe(201);
        const createdBody = (await created.json()) as { uploadId: string };
        const big = new Uint8Array(128).fill(1);
        const api = createSourcesApi(env, { maxSizeBytes: 32 });
        const res = await api.handle(
          new Request(`https://example.com/sources/${createdBody.uploadId}/blob`, {
            method: "PUT",
            headers: { "content-type": "application/octet-stream", "content-length": String(big.byteLength) },
            body: big,
          }),
          `/sources/${createdBody.uploadId}/blob`,
        );
        expect(res).not.toBeNull();
        expect(res!.status).toBe(413);
        const body = (await res!.json()) as ErrorBody;
        expect(body.error.code).toBe("SOURCE_TOO_LARGE");

        const poll = await pollUpload(createdBody.uploadId);
        expect(poll.uploadStatus).toBe("FAILED");
        expect(poll.status).toBe("FAILED");
        expect(poll.error).toBeTruthy();
        expect(poll.status).not.toBe("READY");

        const source = await new SourceAssetRepository(new D1Adapter(env.DB)).get(createdBody.uploadId);
        expect(source?.status ?? "(no asset)").not.toBe("READY");

        return `413 SOURCE_TOO_LARGE; poll uploadStatus FAILED (${poll.error}); source ${source?.status ?? "none"}; never READY`;
      },
    );
  });

  it("A4: unsafe filenames rejected, safe names accepted and sanitized", async () => {
    await runCase(
      "A4 filename handling",
      "400 INVALID_FILE_NAME for separators (/ \\\\), NUL, control/DEL, \"..\" segment, blank-after-trim; accepted+sanitized for spaces/quotes/unicode/300-char; object_key under sources/{project}/{uploadId}-basename",
      async () => {
        const rejected = [
          { name: "../evil.mp4", why: "traversal separator" },
          { name: "a\\b.mp4", why: "backslash separator" },
          { name: "/absolute.mp4", why: "absolute path" },
          { name: "..", why: "dotdot segment" },
          { name: "a\u0000b.mp4", why: "NUL byte" },
          { name: "a\u0007b.mp4", why: "control char" },
          { name: "a\u007fb.mp4", why: "DEL char" },
          { name: "   ", why: "blank after trim" },
        ];
        for (const c of rejected) {
          const res = await createUpload(PROJECT_UUID, c.name);
          expect(res.status, `filename ${JSON.stringify(c.name)} (${c.why})`).toBe(400);
          const body = (await res.json()) as ErrorBody;
          expect(body.error.code, `filename ${JSON.stringify(c.name)} (${c.why})`).toBe("INVALID_FILE_NAME");
        }

        const prettyBytes = buildMp4({ durationSeconds: 1, video: { codec: "avc1", width: 32, height: 32 } });
        const pretty = await createUpload(PROJECT_UUID, '  my "clip" café.mp4  ');
        expect(pretty.status).toBe(201);
        const prettyBody = (await pretty.json()) as { uploadId: string; fileName: string; objectKey: string };
        expect(prettyBody.fileName).toBe('my "clip" café.mp4');
        expect(prettyBody.objectKey.startsWith(`sources/${PROJECT_UUID}/${prettyBody.uploadId}-`)).toBe(true);
        expect(prettyBody.objectKey.endsWith(`-${prettyBody.fileName}`)).toBe(true);

        const put = await putBlob(prettyBody.uploadId, prettyBytes);
        expect(put.status).toBe(200);
        const row = await new D1Adapter(env.DB)
          .prepare("SELECT object_key, file_name, status FROM source_assets WHERE id = ?")
          .get(prettyBody.uploadId);
        expect(row?.["object_key"]).toBe(prettyBody.objectKey);
        expect(row?.["file_name"]).toBe('my "clip" café.mp4');
        expect(row?.["status"]).toBe("VALID");

        const longBase = "f".repeat(296) + ".mp4";
        expect(longBase.length).toBe(300);
        const longRes = await createUpload(PROJECT_UUID, longBase);
        expect(longRes.status).toBe(201);
        const longBody = (await longRes.json()) as { uploadId: string; fileName: string; objectKey: string };
        expect(longBody.fileName).toBe(longBase);
        expect(longBody.objectKey.startsWith(`sources/${PROJECT_UUID}/${longBody.uploadId}-${longBase}`)).toBe(true);
        const longPut = await putBlob(longBody.uploadId, prettyBytes);
        expect(longPut.status).toBe(200);
        const longPutBody = (await longPut.json()) as { status: string };
        expect(longPutBody.status).toBe("VALID");

        return `${rejected.length} rejected (400 INVALID_FILE_NAME); accepted+sanitized 'my "clip" café.mp4' -> ${prettyBody.objectKey} (VALID row); 300-char accepted -> key length ${longBody.objectKey.length}, PUT VALID`;
      },
    );
  });

  it("A5: storage failure -> 502, session FAILED, no asset, never READY", async () => {
    await runCase(
      "A5 storage failure (putObject throws)",
      "PUT 502 STORAGE_UPLOAD_FAILED; poll uploadStatus FAILED; no SourceAsset row; never READY",
      async () => {
        const created = await createUpload(PROJECT_UUID, "storage-down.mp4");
        expect(created.status).toBe(201);
        const createdBody = (await created.json()) as { uploadId: string; objectKey: string };
        const putBytes = buildMp4();
        const api = createSourcesApi(env, {
          putObject: async () => {
            throw new CrexError("STORAGE_UPLOAD_FAILED", "simulated storage down");
          },
        });
        const res = await api.handle(
          new Request(`https://example.com/sources/${createdBody.uploadId}/blob`, {
            method: "PUT",
            headers: { "content-type": "application/octet-stream", "content-length": String(putBytes.byteLength) },
            body: new Uint8Array(putBytes),
          }),
          `/sources/${createdBody.uploadId}/blob`,
        );
        expect(res).not.toBeNull();
        expect(res!.status).toBe(502);
        const body = (await res!.json()) as ErrorBody;
        expect(body.error.code).toBe("STORAGE_UPLOAD_FAILED");

        const poll = await pollUpload(createdBody.uploadId);
        expect(poll.uploadStatus).toBe("FAILED");
        expect(poll.status).toBe("FAILED");
        expect(poll.error).toBeTruthy();
        expect(poll.status).not.toBe("READY");

        const source = await new SourceAssetRepository(new D1Adapter(env.DB)).get(createdBody.uploadId);
        expect(source).toBeUndefined();

        return `PUT 502 STORAGE_UPLOAD_FAILED; poll FAILED (${poll.error}); SourceAsset none; never READY`;
      },
    );
  });

  it("A6: db failure -> 502, session FAILED, object cleaned up, never READY", async () => {
    await runCase(
      "A6 db failure (insertAsset throws)",
      "PUT 502 STORAGE_UPLOAD_FAILED; poll uploadStatus FAILED; no SourceAsset row; R2 object removed; never READY",
      async () => {
        const created = await createUpload(PROJECT_UUID, "db-down.mp4");
        expect(created.status).toBe(201);
        const createdBody = (await created.json()) as { uploadId: string; objectKey: string };
        const putBytes = buildMp4();
        const api = createSourcesApi(env, {
          insertAsset: async () => {
            throw new Error("simulated db down");
          },
        });
        const res = await api.handle(
          new Request(`https://example.com/sources/${createdBody.uploadId}/blob`, {
            method: "PUT",
            headers: { "content-type": "application/octet-stream", "content-length": String(putBytes.byteLength) },
            body: new Uint8Array(putBytes),
          }),
          `/sources/${createdBody.uploadId}/blob`,
        );
        expect(res).not.toBeNull();
        expect(res!.status).toBe(502);
        const body = (await res!.json()) as ErrorBody;
        expect(body.error.code).toBe("STORAGE_UPLOAD_FAILED");

        const poll = await pollUpload(createdBody.uploadId);
        expect(poll.uploadStatus).toBe("FAILED");
        expect(poll.status).toBe("FAILED");
        expect(poll.error).toBeTruthy();
        expect(poll.status).not.toBe("READY");

        const source = await new SourceAssetRepository(new D1Adapter(env.DB)).get(createdBody.uploadId);
        expect(source).toBeUndefined();

        const head = await env.MEDIA.head(createdBody.objectKey);
        expect(head).toBeNull();

        return `PUT 502 STORAGE_UPLOAD_FAILED; poll FAILED (${poll.error}); SourceAsset none; R2 object removed (head null); never READY`;
      },
    );
  });

  it("A7: refresh/recovery -> durable READY across fresh fetches + D1", async () => {
    await runCase(
      "A7 refresh/recovery",
      "before workflow: VALID (fresh poll + list); after workflow: READY (fresh poll + list + D1 row)",
      async () => {
        const putBytes = buildMp4({ durationSeconds: 2, video: { codec: "avc1", width: 64, height: 64 } });
        const created = await createUpload(PROJECT_UUID, "refresh.mp4");
        expect(created.status).toBe(201);
        const createdBody = (await created.json()) as { uploadId: string; objectKey: string };
        const put = await putBlob(createdBody.uploadId, putBytes);
        expect(put.status).toBe(200);

        const before = await pollUpload(createdBody.uploadId);
        expect(before.status).toBe("VALID");

        const listBefore = await exports.default.fetch(
          `https://example.com/sources?projectId=${PROJECT_UUID}`,
        );
        expect(listBefore.status).toBe(200);
        const listBeforeBody = (await listBefore.json()) as { sources: { uploadId: string; status: string }[] };
        expect(listBeforeBody.sources.find((s) => s.uploadId === createdBody.uploadId)?.status).toBe("VALID");

        await runSourceToRelease(PROJECT_UUID, createdBody.uploadId);

        const after = await pollUpload(createdBody.uploadId);
        expect(after.status).toBe("READY");

        const listAfter = await exports.default.fetch(
          `https://example.com/sources?projectId=${PROJECT_UUID}`,
        );
        expect(listAfter.status).toBe(200);
        const listAfterBody = (await listAfter.json()) as { sources: { uploadId: string; status: string }[] };
        expect(listAfterBody.sources.find((s) => s.uploadId === createdBody.uploadId)?.status).toBe("READY");

        const row = await new D1Adapter(env.DB)
          .prepare("SELECT status, object_key, file_name, checksum FROM source_assets WHERE id = ?")
          .get(createdBody.uploadId);
        expect(row?.["status"]).toBe("READY");
        expect(row?.["object_key"]).toBe(createdBody.objectKey);
        expect(row?.["checksum"]).toBe(`sha256:${sha256Bytes(putBytes)}`);

        return `before workflow: VALID (poll + list); after workflow: READY (poll + list); D1 row ${row?.["status"]} (${row?.["file_name"]})`;
      },
    );
  }, 30000);

  it("A8: interrupted upload -> honest partial state, never READY", async () => {
    await runCase(
      "A8 interrupted upload",
      "partial PUT -> 200 INVALID + reason (poll INVALID/UPLOADING, never READY); pre-upload session stays UPLOADING (never READY)",
      async () => {
        const partial = truncate(buildMp4(), 8);
        const created = await createUpload(PROJECT_UUID, "interrupted.mp4");
        expect(created.status).toBe(201);
        const createdBody = (await created.json()) as { uploadId: string };
        const put = await putBlob(createdBody.uploadId, partial);
        expect(put.status).toBe(200);
        const putBody = (await put.json()) as { status: string; reason: string };
        expect(putBody.status).toBe("INVALID");

        const poll = await pollUpload(createdBody.uploadId);
        expect(["UPLOADING", "VALID", "INVALID", "FAILED"]).toContain(poll.status);
        expect(poll.status).not.toBe("READY");
        const source = await new SourceAssetRepository(new D1Adapter(env.DB)).get(createdBody.uploadId);
        expect(source?.status).not.toBe("READY");

        const neverStarted = await createUpload(PROJECT_UUID, "never-uploaded.mp4");
        expect(neverStarted.status).toBe(201);
        const neverBody = (await neverStarted.json()) as { uploadId: string };
        const emptyPoll = await pollUpload(neverBody.uploadId);
        expect(emptyPoll.uploadStatus).toBe("UPLOADING");
        expect(emptyPoll.status).toBe("UPLOADING");
        expect(emptyPoll.status).not.toBe("READY");

        return `partial PUT ${putBody.status} (${putBody.reason}); poll ${poll.status}/uploadStatus ${poll.uploadStatus}; SourceAsset ${source?.status}; never-uploaded poll UPLOADING; never READY`;
      },
    );
  });
});

afterAll(() => {
  console.log("\n=== SOURCE INGESTION RUNTIME MATRIX (A1-A8) ===");
  console.log("Case | Expected | Actual | Result");
  for (const row of matrixRows) {
    console.log(`${row.case} | ${row.expected} | ${row.actual} | ${row.result}`);
  }
});