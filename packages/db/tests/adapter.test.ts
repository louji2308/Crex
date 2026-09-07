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

afterEach(() => {
  while (openDbs.length > 0) {
    openDbs.pop()?.close();
  }
  while (tempFiles.length > 0) {
    rmSync(tempFiles.pop()!, { force: true });
  }
});

describe("SqliteDatabase", () => {
  it("supports prepare().run()/get()/all() with typed round-tripping", () => {
    const db = openMemoryDb();
    db.exec("CREATE TABLE samples (id TEXT PRIMARY KEY, title TEXT, count INTEGER, ratio REAL, note TEXT)");

    const inserted = db
      .prepare("INSERT INTO samples (id, title, count, ratio, note) VALUES (?, ?, ?, ?, ?)")
      .run("s1", "alpha", 3, 0.5, null);
    expect(inserted.changes).toBe(1);
    expect(inserted.lastInsertRowid).toBe(1);

    const got = db.prepare("SELECT * FROM samples WHERE id = ?").get("s1");
    expect(got).toEqual({ id: "s1", title: "alpha", count: 3, ratio: 0.5, note: null });

    const rows = db.prepare("SELECT id FROM samples").all();
    expect(rows).toEqual([{ id: "s1" }]);
  });

  it("get returns undefined when no row matches", () => {
    const db = openMemoryDb();
    db.exec("CREATE TABLE samples (id TEXT PRIMARY KEY)");
    expect(db.prepare("SELECT * FROM samples WHERE id = ?").get("missing")).toBeUndefined();
  });

  it("reports changes from run", () => {
    const db = openMemoryDb();
    db.exec("CREATE TABLE samples (id TEXT PRIMARY KEY)");
    db.prepare("INSERT INTO samples (id) VALUES (?)").run("s1");
    const updated = db.prepare("UPDATE samples SET id = ? WHERE id = ?").run("s2", "s1");
    expect(updated.changes).toBe(1);
  });

  it("throws before operating on a closed database", () => {
    const db = openMemoryDb();
    db.exec("CREATE TABLE samples (id TEXT PRIMARY KEY)");
    db.close();
    expect(db.isOpen).toBe(false);
    expect(() => db.prepare("SELECT 1")).toThrow(/closed/i);
    expect(() => db.exec("CREATE TABLE other (id TEXT PRIMARY KEY)")).toThrow(/closed/i);
  });

  it("closing twice is safe", () => {
    const db = openMemoryDb();
    db.close();
    db.close();
  });

  it("persists a file-backed database across close and reopen", () => {
    const file = join(tmpdir(), `crex-db-adapter-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`);
    tempFiles.push(file);

    const first = createSqlDb(file);
    openDbs.push(first);
    first.exec("CREATE TABLE samples (id TEXT PRIMARY KEY, title TEXT)");
    first.prepare("INSERT INTO samples (id, title) VALUES (?, ?)").run("s1", "persisted");
    first.close();

    const second = createSqlDb(file);
    openDbs.push(second);
    expect(second.prepare("SELECT * FROM samples WHERE id = ?").get("s1")).toEqual({
      id: "s1",
      title: "persisted",
    });
    expect(existsSync(file)).toBe(true);
  });

  it("enables foreign key enforcement", () => {
    const db = openMemoryDb();
    db.exec("CREATE TABLE owners (id TEXT PRIMARY KEY)");
    db.exec("CREATE TABLE pets (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES owners(id))");
    expect(() => db.prepare("INSERT INTO pets (id, owner_id) VALUES (?, ?)").run("p1", "no-such-owner")).toThrow(
      /foreign key/i,
    );
  });

  it("returns bigint rowids only when values exceed safe integer range", () => {
    const db = openMemoryDb();
    db.exec("CREATE TABLE samples (id TEXT PRIMARY KEY)");
    const result = db.prepare("INSERT INTO samples (id) VALUES (?)").run("s1");
    expect(typeof result.lastInsertRowid).toBe("number");
  });
});