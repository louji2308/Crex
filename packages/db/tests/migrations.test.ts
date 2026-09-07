import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSqlDb, type SqlDb } from "../src/sqlite";
import { getMigrationsPath, listMigrations, migrate } from "../src/migrations";

const TABLE_NAMES = [
  "projects",
  "source_assets",
  "transcript_segments",
  "claims",
  "evidence",
  "generated_assets",
  "generated_components",
  "verification_runs",
  "verification_findings",
  "workflow_state",
];

const openDbs: SqlDb[] = [];

function openMemoryDb(): SqlDb {
  const db = createSqlDb(":memory:");
  openDbs.push(db);
  return db;
}

async function tableExists(db: SqlDb, name: string): Promise<boolean> {
  return (
    (await db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name)) !== undefined
  );
}

async function indexExists(db: SqlDb, name: string): Promise<boolean> {
  return (
    (await db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = ?").get(name)) !== undefined
  );
}

afterEach(async () => {
  while (openDbs.length > 0) {
    const db = openDbs.pop();
    if (db !== undefined && db.isOpen) {
      await db.close();
    }
  }
});

function makeTempMigrationsDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "crex-db-migrations-"));
  for (const [name, sql] of Object.entries(files)) {
    writeFileSync(join(dir, name), sql, "utf8");
  }
  return dir;
}

describe("migrate", () => {
  it("applies pending migrations to an in-memory database", async () => {
    const db = openMemoryDb();
    const result = await migrate(db);

    expect(result.applied).toEqual(["0001_init.sql"]);
    expect(result.skipped).toEqual([]);

    for (const table of TABLE_NAMES) {
      expect(await tableExists(db, table), `expected table ${table} to exist`).toBe(true);
    }

    const migrationFile = listMigrations()[0];
    expect(migrationFile).toBeDefined();
    const record = await db.prepare("SELECT name, checksum, applied_at FROM _migrations").all();
    expect(record).toHaveLength(1);
    expect(record[0]).toMatchObject({ name: "0001_init.sql", checksum: migrationFile?.checksum });
    expect(record[0]?.applied_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("re-running migrate is a no-op", async () => {
    const db = openMemoryDb();
    const first = await migrate(db);
    expect(first.applied).toEqual(["0001_init.sql"]);

    const second = await migrate(db);
    expect(second.applied).toEqual([]);
    expect(second.skipped).toEqual(["0001_init.sql"]);

    const count = (await db.prepare("SELECT COUNT(*) AS count FROM _migrations").get()) as {
      count: number;
    };
    expect(count.count).toBe(1);

    for (const table of TABLE_NAMES) {
      expect(await tableExists(db, table), `expected table ${table} to exist`).toBe(true);
    }
  });

  it("creates indexes on lookup paths", async () => {
    const db = openMemoryDb();
    await migrate(db);
    const expectedIndexes = [
      "idx_source_assets_project_id",
      "idx_transcript_segments_source_asset_id",
      "idx_transcript_segments_asset_index",
      "idx_claims_project_id",
      "idx_claims_segment_id",
      "idx_evidence_claim_id",
      "idx_generated_assets_project_id",
      "idx_generated_components_asset_id",
      "idx_verification_runs_project_id",
      "idx_verification_runs_asset_id",
      "idx_verification_findings_run_id",
      "idx_verification_findings_asset_id",
      "idx_verification_findings_component_id",
      "idx_workflow_state_project_id",
    ];
    for (const index of expectedIndexes) {
      expect(await indexExists(db, index), `expected index ${index} to exist`).toBe(true);
    }
  });

  it("applies migrations in filename order from a synthetic directory", async () => {
    const db = openMemoryDb();
    const dir = makeTempMigrationsDir({
      "0001_a.sql": "CREATE TABLE IF NOT EXISTS tbl_a (id TEXT PRIMARY KEY);",
      "0002_b.sql": "CREATE TABLE IF NOT EXISTS tbl_b (id TEXT PRIMARY KEY);",
      "0003_c.sql": "CREATE TABLE IF NOT EXISTS tbl_c (id TEXT PRIMARY KEY);",
      "1000_d.sql": "CREATE TABLE IF NOT EXISTS tbl_d (id TEXT PRIMARY KEY);",
      "not-a-migration.txt": "ignored",
      "plain.sql": "CREATE TABLE IF NOT EXISTS tbl_plain (id TEXT PRIMARY KEY);",
    });

    const result = await migrate(db, { migrationsDir: dir });
    expect(result.applied).toEqual(["0001_a.sql", "0002_b.sql", "0003_c.sql", "1000_d.sql"]);
    expect(await tableExists(db, "tbl_a")).toBe(true);
    expect(await tableExists(db, "tbl_b")).toBe(true);
    expect(await tableExists(db, "tbl_c")).toBe(true);
    expect(await tableExists(db, "tbl_d")).toBe(true);
    expect(await tableExists(db, "tbl_plain")).toBe(false);

    rmSync(dir, { recursive: true, force: true });
  });

  it("skips already-applied synthetic migrations", async () => {
    const db = openMemoryDb();
    const dir = makeTempMigrationsDir({
      "0001_a.sql": "CREATE TABLE IF NOT EXISTS tbl_a (id TEXT PRIMARY KEY);",
      "0002_b.sql": "CREATE TABLE IF NOT EXISTS tbl_b (id TEXT PRIMARY KEY);",
    });

    const first = await migrate(db, { migrationsDir: dir });
    expect(first.applied).toEqual(["0001_a.sql", "0002_b.sql"]);

    const second = await migrate(db, { migrationsDir: dir });
    expect(second.applied).toEqual([]);
    expect(second.skipped).toEqual(["0001_a.sql", "0002_b.sql"]);

    rmSync(dir, { recursive: true, force: true });
  });

  it("rejects an applied migration whose checksum changed", async () => {
    const db = openMemoryDb();
    const dir = makeTempMigrationsDir({
      "0001_a.sql": "CREATE TABLE IF NOT EXISTS tbl_a (id TEXT PRIMARY KEY);",
    });
    await migrate(db, { migrationsDir: dir });

    writeFileSync(join(dir, "0001_a.sql"), "CREATE TABLE IF NOT EXISTS tbl_a (id TEXT PRIMARY KEY, x TEXT);", "utf8");

    await expect(migrate(db, { migrationsDir: dir })).rejects.toThrow(/checksum/i);
    rmSync(dir, { recursive: true, force: true });
  });

  it("rolls back the whole batch when a migration fails", async () => {
    const db = openMemoryDb();
    const dir = makeTempMigrationsDir({
      "0001_a.sql": [
        "CREATE TABLE IF NOT EXISTS rollback_probe (id TEXT PRIMARY KEY);",
        "THIS IS NOT VALID SQL;",
      ].join("\n"),
    });

    await expect(migrate(db, { migrationsDir: dir })).rejects.toThrow(/failed to apply migration 0001_a\.sql/);

    expect(await tableExists(db, "rollback_probe")).toBe(false);
    expect(await tableExists(db, "_migrations")).toBe(false);

    writeFileSync(join(dir, "0001_a.sql"), "CREATE TABLE IF NOT EXISTS rollback_probe (id TEXT PRIMARY KEY);", "utf8");
    const retry = await migrate(db, { migrationsDir: dir });
    expect(retry.applied).toEqual(["0001_a.sql"]);
    expect(await tableExists(db, "rollback_probe")).toBe(true);

    rmSync(dir, { recursive: true, force: true });
  });

  it("applies migrations provided through an injected listMigrations provider", async () => {
    const db = openMemoryDb();
    const sql = "CREATE TABLE IF NOT EXISTS injected_tbl (id TEXT PRIMARY KEY);";
    const result = await migrate(db, {
      listMigrations: () => [
        { name: "0001_injected.sql", path: "injected", checksum: "abc", sql },
      ],
    });
    expect(result.applied).toEqual(["0001_injected.sql"]);
    expect(await tableExists(db, "injected_tbl")).toBe(true);
  });

  it("getMigrationsPath resolves the package migrations directory", () => {
    const dir = getMigrationsPath();
    const entries = readdirSync(dir);
    expect(entries).toContain("0001_init.sql");
  });
});