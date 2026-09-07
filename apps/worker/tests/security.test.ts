import { describe, expect, it, beforeAll } from "vitest";
import { env, exports } from "cloudflare:workers";
import { D1Adapter } from "@crex/infra";

interface ErrorBody {
  error: { code: string; message: string };
}

const PROJECT_UUID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_PROJECT_UUID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ASSET_UUID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OTHER_ASSET_UUID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const NOW = "2026-01-02T03:04:05.000Z";

async function seedProject(projectId: string): Promise<void> {
  await new D1Adapter(env.DB).prepare(
    `INSERT INTO projects (id, name, target_platforms, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
  ).run(projectId, "Test Project", "[]", NOW, NOW);
}

async function seedSourceAsset(assetId: string, projectId: string): Promise<void> {
  await new D1Adapter(env.DB).prepare(
    `INSERT INTO source_assets (id, project_id, file_name, file_type, object_key, status, size_bytes, checksum, transcription_status, analysis_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
  ).run(assetId, projectId, "clip.mp4", "video/mp4", `sources/${projectId}/${assetId}-clip.mp4`, "VALID", 1, "sha256:0000000000000000000000000000000000000000000000000000000000000000", "PENDING", "PENDING", NOW, NOW);
}

async function seedGeneratedAsset(assetId: string, projectId: string): Promise<void> {
  await new D1Adapter(env.DB).prepare(
    `INSERT INTO generated_assets (id, project_id, asset_type, title, status, integrity, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
  ).run(
    assetId,
    projectId,
    "YOUTUBE_TITLE",
    "Test Asset",
    "READY",
    JSON.stringify({ overall: 99 }),
    NOW,
    NOW,
  );
}

async function seedVerificationRun(runId: string, projectId: string): Promise<void> {
  await new D1Adapter(env.DB).prepare(
    `INSERT INTO verification_runs (id, project_id, asset_id, engine, result, finding_ids, started_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
  ).run(runId, projectId, OTHER_ASSET_UUID, "deterministic:rules", "PASS", "[]", NOW, NOW);
}

describe("crex-worker security regression tests", () => {
  beforeAll(async () => {
    await seedProject(PROJECT_UUID);
    await seedProject(OTHER_PROJECT_UUID);
    await seedSourceAsset(ASSET_UUID, PROJECT_UUID);
    await seedSourceAsset(OTHER_ASSET_UUID, OTHER_PROJECT_UUID);
    await seedGeneratedAsset(OTHER_ASSET_UUID, OTHER_PROJECT_UUID);
  });

  it("GET /workflows/source-to-release/:id rejects a non-UUID instance id", async () => {
    const res = await exports.default.fetch(
      "https://example.com/workflows/source-to-release/not-a-uuid",
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("INVALID_WORKFLOW_ID");
  });

  it("source list is scoped to the requested project", async () => {
    const own = await exports.default.fetch(
      `https://example.com/sources?projectId=${PROJECT_UUID}`,
    );
    expect(own.status).toBe(200);
    const ownBody = (await own.json()) as { sources: { uploadId: string }[] };
    expect(ownBody.sources.some((s) => s.uploadId === ASSET_UUID)).toBe(true);

    const other = await exports.default.fetch(
      `https://example.com/sources?projectId=${OTHER_PROJECT_UUID}`,
    );
    expect(other.status).toBe(200);
    const otherBody = (await other.json()) as { sources: { uploadId: string }[] };
    expect(otherBody.sources.some((s) => s.uploadId === ASSET_UUID)).toBe(false);
    expect(otherBody.sources.some((s) => s.uploadId === OTHER_ASSET_UUID)).toBe(true);
  });

  it("provenance record creation rejects an asset that belongs to another project", async () => {
    const res = await exports.default.fetch("https://example.com/provenance/records", {
      method: "POST",
      body: JSON.stringify({
        asset_id: ASSET_UUID,
        project_id: OTHER_PROJECT_UUID,
        title: "Cross-project attempt",
      }),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("INVALID_SOURCE_STATE");
  });

  it("verification run list is scoped to the requested project", async () => {
    await seedVerificationRun("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", PROJECT_UUID);
    await seedVerificationRun("ffffffff-ffff-4fff-8fff-ffffffffffff", OTHER_PROJECT_UUID);

    const own = await exports.default.fetch(
      `https://example.com/verify?projectId=${PROJECT_UUID}`,
    );
    expect(own.status).toBe(200);
    const ownBody = (await own.json()) as { runs: { id: string; project_id: string }[] };
    expect(ownBody.runs.length).toBe(1);
    expect(ownBody.runs[0]?.project_id).toBe(PROJECT_UUID);

    const other = await exports.default.fetch(
      `https://example.com/verify?projectId=${OTHER_PROJECT_UUID}`,
    );
    expect(other.status).toBe(200);
    const otherBody = (await other.json()) as { runs: { project_id: string }[] };
    expect(otherBody.runs.every((r) => r.project_id === OTHER_PROJECT_UUID)).toBe(true);
  });
});