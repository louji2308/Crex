import { describe, expect, it } from "vitest";
import { introspectWorkflowInstance } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { D1Adapter } from "@crex/infra";
import { WorkflowStateRepository } from "@crex/db/src/repositories/workflow-state";

interface HealthBody {
  ok: boolean;
  bindings: { db: boolean; r2: boolean; workflow: boolean };
}

interface ApiBody {
  id: string;
  status: string;
  phase?: string;
}

interface ErrorBody {
  error: { code: string; message: string };
}

const PROJECT_UUID = "11111111-1111-4111-8111-111111111111";
const WORKFLOW_UUID = "22222222-2222-4222-8222-222222222222";
const WORKFLOW2_UUID = "55555555-5555-4555-8555-555555555555";
const STATE_UUID = "33333333-3333-4333-8333-333333333333";
const STATE2_UUID = "44444444-4444-4444-8444-444444444444";
const NOW = "2026-01-02T03:04:05.000Z";

async function seedProject(projectId = PROJECT_UUID): Promise<void> {
  await new D1Adapter(env.DB).prepare(
    `INSERT INTO projects (id, name, target_platforms, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
  ).run(projectId, "Test Project", "[]", NOW, NOW);
}

describe("crex-worker HTTP API", () => {
  it("GET /health reports bindings present", async () => {
    const res = await exports.default.fetch("https://example.com/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as HealthBody;
    expect(body.ok).toBe(true);
    expect(body.bindings.db).toBe(true);
    expect(body.bindings.r2).toBe(true);
    expect(body.bindings.workflow).toBe(true);
  });

  it("GET /health reports workflow binding via create", async () => {
    expect(typeof env.SOURCE_TO_RELEASE.create).toBe("function");
  });

  it("POST /workflows/source-to-release rejects missing projectId", async () => {
    const res = await exports.default.fetch("https://example.com/workflows/source-to-release", {
      method: "POST",
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("INVALID_PROJECT_ID");
  });

  it("POST /workflows/source-to-release rejects non-UUID projectId", async () => {
    const res = await exports.default.fetch("https://example.com/workflows/source-to-release", {
      method: "POST",
      body: JSON.stringify({ projectId: "proj-test-1" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("INVALID_PROJECT_ID");
  });

  it("POST /workflows/source-to-release returns 404 for unknown project", async () => {
    const res = await exports.default.fetch("https://example.com/workflows/source-to-release", {
      method: "POST",
      body: JSON.stringify({ projectId: WORKFLOW_UUID }),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("PROJECT_NOT_FOUND");
  });

  it("POST /workflows/source-to-release runs the workflow to completion", async () => {
    await seedProject();
    const res = await exports.default.fetch("https://example.com/workflows/source-to-release", {
      method: "POST",
      body: JSON.stringify({ projectId: PROJECT_UUID, id: WORKFLOW_UUID }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiBody;
    expect(body.id).toBe(WORKFLOW_UUID);
    expect(body.status).toBeTruthy();

    const introspector = await introspectWorkflowInstance(env.SOURCE_TO_RELEASE, WORKFLOW_UUID);
    try {
      await introspector.waitForStatus("complete");
    } finally {
      await introspector.dispose();
    }
    const row = await new D1Adapter(env.DB)
      .prepare("SELECT phase FROM workflow_state WHERE id = ?")
      .get(WORKFLOW_UUID);
    expect(row?.["phase"]).toBe("COMPLETED");
  });

  it("GET /workflows/source-to-release/:id reports workflow status", async () => {
    await seedProject();
    const created = await exports.default.fetch("https://example.com/workflows/source-to-release", {
      method: "POST",
      body: JSON.stringify({ projectId: PROJECT_UUID, id: WORKFLOW2_UUID }),
    });
    expect(created.status).toBe(200);

    const got = await exports.default.fetch(`https://example.com/workflows/source-to-release/${WORKFLOW2_UUID}`);
    expect(got.status).toBe(200);
    const body = (await got.json()) as ApiBody;
    expect(body.id).toBe(WORKFLOW2_UUID);
    expect(body.status).toBeTruthy();

    const introspector = await introspectWorkflowInstance(env.SOURCE_TO_RELEASE, WORKFLOW2_UUID);
    try {
      await introspector.waitForStatus("complete");
    } finally {
      await introspector.dispose();
    }
  });

  it("unknown route returns 404", async () => {
    const res = await exports.default.fetch("https://example.com/nope");
    expect(res.status).toBe(404);
  });
});

describe("crex-worker D1 after migration", () => {
  it("applies migrations and supports workflow_state insert/read", async () => {
    await seedProject();
    const db = new D1Adapter(env.DB);
    const repo = new WorkflowStateRepository(db);
    await repo.insert({
      id: STATE_UUID,
      project_id: PROJECT_UUID,
      workflow_name: "crex-source-to-release",
      phase: "QUEUED",
      stage: "SOURCE_INGESTION",
      created_at: NOW,
      updated_at: NOW,
    });
    const got = await repo.get(STATE_UUID);
    expect(got).toBeDefined();
    expect(got?.phase).toBe("QUEUED");
  });

  it("raw UPDATE reflects phase transition", async () => {
    await seedProject();
    const db = new D1Adapter(env.DB);
    await db.prepare(
      `INSERT INTO workflow_state (id, project_id, workflow_name, phase, stage, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(STATE2_UUID, PROJECT_UUID, "crex-source-to-release", "QUEUED", "SOURCE_INGESTION", NOW, NOW);
    await db.prepare(`UPDATE workflow_state SET phase = ?, updated_at = ? WHERE id = ?`)
      .run("COMPLETED", NOW, STATE2_UUID);
    const row = await db.prepare(`SELECT phase FROM workflow_state WHERE id = ?`).get(STATE2_UUID);
    expect(row?.["phase"]).toBe("COMPLETED");
  });
});