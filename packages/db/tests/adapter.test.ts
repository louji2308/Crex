import { afterEach, describe, expect, it } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSqlDb, type SqlDb } from "../src/sqlite";

const openDbs: SqlDb[] = [];
const tempFiles: string[] = [];

function openMemoryDb(): SqlDb {
  const db = createSqlDb(":memory:");
  openDbs.push(db);
  return db;
}

async function closeDb(db: SqlDb): Promise<void> {
  if (db.isOpen) {
    await db.close();
  }
}

afterEach(async () => {
  while (openDbs.length > 0) {
    const db = openDbs.pop();
    if (db !== undefined) {
      await closeDb(db);
    }
  }
  while (tempFiles.length > 0) {
    rmSync(tempFiles.pop()!, { force: true });
  }
});

describe("SqliteDatabase", () => {
  it("supports prepare().run()/get()/all() with typed round-tripping", async () => {
    const db = openMemoryDb();
    await db.exec("CREATE TABLE samples (id TEXT PRIMARY KEY, title TEXT, count INTEGER, ratio REAL, note TEXT)");

    const inserted = await db
      .prepare("INSERT INTO samples (id, title, count, ratio, note) VALUES (?, ?, ?, ?, ?)")
      .run("s1", "alpha", 3, 0.5, null);
    expect(inserted.changes).toBe(1);
    expect(inserted.lastInsertRowid).toBe(1);

    const got = await db.prepare("SELECT * FROM samples WHERE id = ?").get("s1");
    expect(got).toEqual({ id: "s1", title: "alpha", count: 3, ratio: 0.5, note: null });

    const rows = await db.prepare("SELECT id FROM samples").all();
    expect(rows).toEqual([{ id: "s1" }]);
  });

  it("get returns undefined when no row matches", async () => {
    const db = openMemoryDb();
    await db.exec("CREATE TABLE samples (id TEXT PRIMARY KEY)");
    expect(await db.prepare("SELECT * FROM samples WHERE id = ?").get("missing")).toBeUndefined();
  });

  it("reports changes from run", async () => {
    const db = openMemoryDb();
    await db.exec("CREATE TABLE samples (id TEXT PRIMARY KEY)");
    await db.prepare("INSERT INTO samples (id) VALUES (?)").run("s1");
    const updated = await db.prepare("UPDATE samples SET id = ? WHERE id = ?").run("s2", "s1");
    expect(updated.changes).toBe(1);
  });

  it("batch runs multiple statements atomically", async () => {
    const db = openMemoryDb();
    await db.batch([
      { sql: "CREATE TABLE samples (id TEXT PRIMARY KEY, title TEXT)" },
      { sql: "INSERT INTO samples (id, title) VALUES (?, ?)", params: ["s1", "alpha"] },
    ]);
    const rows = await db.prepare("SELECT * FROM samples").all();
    expect(rows).toEqual([{ id: "s1", title: "alpha" }]);
  });

  it("batch rolls back all statements when one fails", async () => {
    const db = openMemoryDb();
    await expect(
      db.batch([
        { sql: "CREATE TABLE samples (id TEXT PRIMARY KEY)" },
        { sql: "THIS IS NOT VALID SQL" },
      ]),
    ).rejects.toThrow();
    const exists = await db.prepare("SELECT 1 AS one FROM sqlite_master WHERE type = 'table' AND name = 'samples'").get();
    expect(exists).toBeUndefined();
  });

  it("throws before operating on a closed database", async () => {
    const db = openMemoryDb();
    await db.exec("CREATE TABLE samples (id TEXT PRIMARY KEY)");
    await db.close();
    expect(db.isOpen).toBe(false);
    expect(() => db.prepare("SELECT 1")).toThrow(/closed/i);
    await expect(db.exec("CREATE TABLE other (id TEXT PRIMARY KEY)")).rejects.toThrow(/closed/i);
  });

  it("closing twice is safe", async () => {
    const db = openMemoryDb();
    await db.close();
    await db.close();
  });

  it("persists a file-backed database across close and reopen", async () => {
    const file = join(tmpdir(), `crex-db-adapter-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`);
    tempFiles.push(file);

    const first = createSqlDb(file);
    openDbs.push(first);
    await first.exec("CREATE TABLE samples (id TEXT PRIMARY KEY, title TEXT)");
    await first.prepare("INSERT INTO samples (id, title) VALUES (?, ?)").run("s1", "persisted");
    await first.close();

    const second = createSqlDb(file);
    openDbs.push(second);
    expect(await second.prepare("SELECT * FROM samples WHERE id = ?").get("s1")).toEqual({
      id: "s1",
      title: "persisted",
    });
    expect(existsSync(file)).toBe(true);
  });

  it("enables foreign key enforcement", async () => {
    const db = openMemoryDb();
    await db.exec("CREATE TABLE owners (id TEXT PRIMARY KEY)");
    await db.exec("CREATE TABLE pets (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES owners(id))");
    await expect(
      db.prepare("INSERT INTO pets (id, owner_id) VALUES (?, ?)").run("p1", "no-such-owner"),
    ).rejects.toThrow(/foreign key/i);
  });

  it("returns bigint rowids only when values exceed safe integer range", async () => {
    const db = openMemoryDb();
    await db.exec("CREATE TABLE samples (id TEXT PRIMARY KEY)");
    const result = await db.prepare("INSERT INTO samples (id) VALUES (?)").run("s1");
    expect(typeof result.lastInsertRowid).toBe("number");
  });
});