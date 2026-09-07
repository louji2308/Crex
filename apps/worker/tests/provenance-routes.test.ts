import { describe, expect, it, beforeAll } from "vitest";
import { env, exports } from "cloudflare:workers";
import { D1Adapter } from "@crex/infra";
import { buildMp4 } from "@crex/media";
import { sha256Bytes } from "@crex/media";

interface RecordBody {
  id: string;
  project_id: string;
  asset_id: string;
  asset_sha256: string;
  signing_status: string;
  verification_status: string;
  created_at: string;
  manifest?: {
    manifest_json: Record<string, unknown>;
    signature_verified: boolean;
  };
}

interface VerifyBody {
  verification_status: string;
  recorded_sha256: string | null;
  computed_sha256: string | null;
  reasons: string[];
  record: RecordBody | null;
}

interface ErrorBody {
  error: { code: string; message: string };
}

const PROJECT_UUID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ASSET_UUID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const RECORD_UUID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const NOW = "2026-01-02T03:04:05.000Z";
const OBJECT_KEY = `sources/${PROJECT_UUID}/${ASSET_UUID}-test-clip.mp4`;

async function seedProject(projectId = PROJECT_UUID): Promise<void> {
  await new D1Adapter(env.DB).prepare(
    `INSERT INTO projects (id, name, target_platforms, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
  ).run(projectId, "Test Project", "[]", NOW, NOW);
}

async function seedSourceAssetWithBlob(
  projectId = PROJECT_UUID,
  assetId = ASSET_UUID,
  objectKey = OBJECT_KEY,
): Promise<Uint8Array> {
  const putBytes = buildMp4({ durationSeconds: 2, video: { codec: "avc1", width: 64, height: 64 } });
  const bytes = new Uint8Array(putBytes);
  const checksum = `sha256:${sha256Bytes(bytes)}`;

  await new D1Adapter(env.DB).prepare(
    `INSERT INTO source_assets (id, project_id, file_name, file_type, object_key, status, size_bytes, checksum, transcription_status, analysis_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
  ).run(assetId, projectId, "test-clip.mp4", "video/mp4", objectKey, "VALID", bytes.byteLength, checksum, "PENDING", "PENDING", NOW, NOW);

  await (env.MEDIA as unknown as R2Bucket).put(objectKey, bytes);
  return bytes;
}

describe("crex-worker provenance HTTP API", () => {
  beforeAll(async () => {
    await seedProject();
    await seedSourceAssetWithBlob();
  });

  it("POST /provenance/records creates a record with correct fields", async () => {
    const res = await exports.default.fetch("https://example.com/provenance/records", {
      method: "POST",
      body: JSON.stringify({
        asset_id: ASSET_UUID,
        project_id: PROJECT_UUID,
        title: "Test Clip",
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as RecordBody;
    expect(body.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(body.project_id).toBe(PROJECT_UUID);
    expect(body.asset_id).toBe(ASSET_UUID);
    expect(body.asset_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(body.signing_status).toBe("UNSIGNED");
    expect(body.verification_status).toBe("UNSIGNED");
    expect(body.created_at).toBeTruthy();
    expect(body.manifest?.signature_verified).toBe(false);
    expect(body.manifest?.manifest_json).toBeDefined();
  });

  it("POST /provenance/records rejects duplicate asset_id", async () => {
    const res = await exports.default.fetch("https://example.com/provenance/records", {
      method: "POST",
      body: JSON.stringify({
        asset_id: ASSET_UUID,
        project_id: PROJECT_UUID,
        title: "Duplicate Attempt",
      }),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("PROVENANCE_RECORD_EXISTS");
  });

  it("POST /provenance/records rejects missing title", async () => {
    const res = await exports.default.fetch("https://example.com/provenance/records", {
      method: "POST",
      body: JSON.stringify({
        asset_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        project_id: PROJECT_UUID,
      }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("INVALID_TITLE");
  });

  it("POST /provenance/records rejects non-UUID asset_id", async () => {
    const res = await exports.default.fetch("https://example.com/provenance/records", {
      method: "POST",
      body: JSON.stringify({
        asset_id: "not-a-uuid",
        project_id: PROJECT_UUID,
        title: "Bad ID",
      }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("INVALID_ASSET_ID");
  });

  it("POST /provenance/records rejects unknown project", async () => {
    const res = await exports.default.fetch("https://example.com/provenance/records", {
      method: "POST",
      body: JSON.stringify({
        asset_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        project_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        title: "Unknown Project",
      }),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("PROJECT_NOT_FOUND");
  });

  it("POST /provenance/records rejects unknown asset", async () => {
    const res = await exports.default.fetch("https://example.com/provenance/records", {
      method: "POST",
      body: JSON.stringify({
        asset_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        project_id: PROJECT_UUID,
        title: "Unknown Asset",
      }),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("SOURCE_NOT_FOUND");
  });

  it("GET /provenance/records/:id returns the created record", async () => {
    const getAssetUuid = "11111111-1111-4111-8111-111111111111";
    const getKey = `sources/${PROJECT_UUID}/${getAssetUuid}-fetch.mp4`;
    await seedSourceAssetWithBlob(PROJECT_UUID, getAssetUuid, getKey);

    const createdRes = await exports.default.fetch("https://example.com/provenance/records", {
      method: "POST",
      body: JSON.stringify({
        asset_id: getAssetUuid,
        project_id: PROJECT_UUID,
        title: "Fetch Test",
      }),
    });
    expect(createdRes.status).toBe(201);
    const created = (await createdRes.json()) as RecordBody;

    const res = await exports.default.fetch(
      `https://example.com/provenance/records/${created.id}`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as RecordBody;
    expect(body.id).toBe(created.id);
    expect(body.asset_id).toBe(getAssetUuid);
  });

  it("GET /provenance/records/:id returns 404 for unknown record", async () => {
    const res = await exports.default.fetch(
      `https://example.com/provenance/records/${RECORD_UUID}`,
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("PROVENANCE_NOT_FOUND");
  });

  it("GET /provenance/records/:id rejects invalid UUID", async () => {
    const res = await exports.default.fetch(
      "https://example.com/provenance/records/not-a-uuid",
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("INVALID_RECORD_ID");
  });

  it("GET /provenance/verify returns MISSING when no record exists", async () => {
    const missingAssetId = "22222222-2222-4222-8222-222222222222";
    const missingKey = `sources/${PROJECT_UUID}/${missingAssetId}-missing.mp4`;
    await seedSourceAssetWithBlob(PROJECT_UUID, missingAssetId, missingKey);

    const res = await exports.default.fetch(
      `https://example.com/provenance/verify?asset_id=${missingAssetId}`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as VerifyBody;
    expect(body.verification_status).toBe("MISSING");
    expect(body.recorded_sha256).toBeNull();
    expect(body.computed_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(body.reasons).toContain("no provenance record found for this asset");
    expect(body.record).toBeNull();
  });

  it("GET /provenance/verify returns UNSIGNED when hash matches and status is UNSIGNED", async () => {
    const res = await exports.default.fetch(
      `https://example.com/provenance/verify?asset_id=${ASSET_UUID}`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as VerifyBody;
    expect(body.verification_status).toBe("UNSIGNED");
    expect(body.recorded_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(body.computed_sha256).toBe(body.recorded_sha256);
    expect(body.reasons).toEqual(["Assertion present but no signature claim"]);
  });

  it("GET /provenance/verify returns INVALID when hash mismatches", async () => {
    const mismatchAssetId = "33333333-3333-4333-8333-333333333333";
    await seedProject();

    const putBytes = buildMp4({ durationSeconds: 1, video: { codec: "avc1", width: 32, height: 32 } });
    const bytes = new Uint8Array(putBytes);
    const actualSha256 = sha256Bytes(bytes);
    const mismatchKey = `sources/${PROJECT_UUID}/${mismatchAssetId}-mismatch.mp4`;
    await (env.MEDIA as unknown as R2Bucket).put(mismatchKey, bytes);

    await new D1Adapter(env.DB).prepare(
      `INSERT INTO source_assets (id, project_id, file_name, file_type, object_key, status, size_bytes, checksum, transcription_status, analysis_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
    ).run(mismatchAssetId, PROJECT_UUID, "mismatch.mp4", "video/mp4", mismatchKey, "VALID", bytes.byteLength, `sha256:${actualSha256}`, "PENDING", "PENDING", NOW, NOW);

    await exports.default.fetch("https://example.com/provenance/records", {
      method: "POST",
      body: JSON.stringify({
        asset_id: mismatchAssetId,
        project_id: PROJECT_UUID,
        title: "Mismatch Test",
      }),
    });

    const db = new D1Adapter(env.DB);
    await db.prepare(
      `UPDATE provenance_records SET asset_sha256 = ? WHERE asset_id = ?`,
    ).run("0000000000000000000000000000000000000000000000000000000000000000", mismatchAssetId);

    const res = await exports.default.fetch(
      `https://example.com/provenance/verify?asset_id=${mismatchAssetId}`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as VerifyBody;
    expect(body.verification_status).toBe("INVALID");
    expect(body.reasons.length).toBeGreaterThan(0);
    expect(body.reasons[0]).toContain("asset hash mismatch");
  });

  it("GET /provenance/verify rejects missing asset_id query param", async () => {
    const res = await exports.default.fetch("https://example.com/provenance/verify");
    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("INVALID_ASSET_ID");
  });

  it("GET /provenance/verify rejects invalid UUID in asset_id", async () => {
    const res = await exports.default.fetch(
      "https://example.com/provenance/verify?asset_id=not-a-uuid",
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("INVALID_ASSET_ID");
  });
});
