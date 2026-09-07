import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { listMigrations, migrate, WorkflowStateRepository, type SqlBatchItem } from "@crex/db";
import { D1Adapter, type D1DatabaseBinding } from "../src/d1";

const EXPECTED_MIGRATIONS = listMigrations().map((file) => file.name);

const TABLE_NAMES = [
  "_migrations",
  "ai_outputs",
  "claims",
  "constraints",
  "evidence",
  "generated_assets",
  "generated_components",
  "projects",
  "source_assets",
  "source_uploads",
  "sponsor_requirements",
  "transcript_segments",
  "verification_findings",
  "verification_runs",
  "workflow_state",
];

let mf: Miniflare;
let binding: D1DatabaseBinding;

beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      workers: [
        {
          script: `export default { async fetch() { return new Response("ok"); } };`,
          modules: true,
          d1Databases: { DB: "test-db" },
        },
      ],
    }),
  );
  binding = (await mf.getD1Database("DB")) as unknown as D1DatabaseBinding;
});

afterAll(async () => {
  await mf.dispose();
});

describe("D1Adapter", () => {
  it("runs real migrations against the D1 emulation", async () => {
    const db = new D1Adapter(binding);
    const result = await migrate(db);
    expect(result.applied).toEqual(EXPECTED_MIGRATIONS);
    expect(result.skipped).toHaveLength(0);
  });

  it("records applied migrations and is idempotent", async () => {
    const db = new D1Adapter(binding);
    const again = await migrate(db);
    expect(again.applied).toHaveLength(0);
    expect(again.skipped).toEqual(EXPECTED_MIGRATIONS);
  });

  it("creates all project tables", async () => {
    const db = new D1Adapter(binding);
    const rows = await db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'",
      )
      .all();
    const names = rows.map((row) => String(row.name)).sort();
    expect(names).toEqual([...TABLE_NAMES].sort());
  });

  it("round-trips a workflow state through the repository", async () => {
    const db = new D1Adapter(binding);
    await db
      .prepare(
        "INSERT INTO projects (id, name, target_platforms, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(
        "10000000-0000-0000-0000-000000000001",
        "probe",
        "[]",
        "2026-01-02T03:04:05.000Z",
        "2026-01-02T03:04:05.000Z",
      );
    const repo = new WorkflowStateRepository(db);
    const state = {
      id: "90000000-0000-0000-0000-000000000001",
      project_id: "10000000-0000-0000-0000-000000000001",
      workflow_name: "crex-primary",
      phase: "RUNNING",
      stage: "SOURCE_INGESTION",
      created_at: "2026-01-02T03:04:05.000Z",
      updated_at: "2026-01-02T03:04:05.000Z",
    } as const;
    await repo.insert(state);
    const back = await repo.get(state.id);
    expect(back).not.toBeUndefined();
    expect(back!.workflow_name).toBe("crex-primary");
    expect(back!.phase).toBe("RUNNING");
    const byProject = await repo.listByProject(state.project_id);
    expect(byProject.map((item) => item.id)).toContain(state.id);
  });

  it("reports changes and last row id from run", async () => {
    const db = new D1Adapter(binding);
    const result = await db
      .prepare(
        "INSERT INTO projects (id, name, target_platforms, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(
        "20000000-0000-0000-0000-000000000001",
        "probe",
        "[]",
        "2026-01-02T03:04:05.000Z",
        "2026-01-02T03:04:05.000Z",
      );
    expect(result.changes).toBe(1);
  });

  it("binds parameters through prepared statements", async () => {
    const db = new D1Adapter(binding);
    const rows = await db
      .prepare("SELECT name FROM sqlite_master WHERE type = ? AND name = ?")
      .all("table", "projects");
    expect(rows).toEqual([{ name: "projects" }]);
  });

  it("rolls back a batch when any statement fails", async () => {
    const db = new D1Adapter(binding);
    const statements: SqlBatchItem[] = [
      { sql: "CREATE TABLE batch_probe (id TEXT PRIMARY KEY)" },
      { sql: "INSERT INTO batch_probe (id) VALUES (?)", params: ["probe"] },
      { sql: "THIS IS NOT VALID SQL" },
    ];
    await expect(db.batch(statements)).rejects.toThrow();
    const exists = await db
      .prepare("SELECT 1 AS one FROM sqlite_master WHERE type = 'table' AND name = 'batch_probe'")
      .get();
    expect(exists).toBeUndefined();
  });

  it("exec runs multi-statement SQL", async () => {
    const db = new D1Adapter(binding);
    await db.exec("CREATE TABLE exec_probe (id TEXT PRIMARY KEY); INSERT INTO exec_probe (id) VALUES ('x')");
    const got = await db.prepare("SELECT id FROM exec_probe").get();
    expect(got).toEqual({ id: "x" });
  });
});