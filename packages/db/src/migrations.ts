import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SqlDb, SqlValue } from "./sqlite";

const MIGRATION_PATTERN = /^\d{4}_.+\.sql$/;

export interface MigrationFile {
  name: string;
  path: string;
  checksum: string;
  sql: string;
}

export interface MigrateOptions {
  migrationsDir?: string;
}

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

export function getMigrationsPath(): string {
  return fileURLToPath(new URL("../migrations/", import.meta.url));
}

export function listMigrations(migrationsDir: string = getMigrationsPath()): MigrationFile[] {
  const names = readdirSync(migrationsDir)
    .filter((name) => MIGRATION_PATTERN.test(name))
    .sort();
  return names.map((name) => {
    const path = join(migrationsDir, name);
    const sql = readFileSync(path, "utf8");
    return { name, path, checksum: checksumOf(sql), sql };
  });
}

function checksumOf(sql: string): string {
  return createHash("sha256").update(sql, "utf8").digest("hex");
}

function nowIso(): string {
  return new Date().toISOString();
}

export function migrate(db: SqlDb, options: MigrateOptions = {}): MigrationResult {
  const migrationsDir = options.migrationsDir ?? getMigrationsPath();
  const files = listMigrations(migrationsDir);

  const applied: string[] = [];
  const skipped: string[] = [];
  let inTransaction = false;

  db.exec("BEGIN");
  inTransaction = true;
  try {
    db.exec(
      "CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)",
    );
    const records = db.prepare("SELECT name, checksum FROM _migrations").all() as Array<{
      name: SqlValue;
      checksum: SqlValue;
    }>;
    const appliedChecksums = new Map<string, string>();
    for (const record of records) {
      appliedChecksums.set(String(record.name), String(record.checksum));
    }

    const pending: MigrationFile[] = [];
    for (const file of files) {
      const knownChecksum = appliedChecksums.get(file.name);
      if (knownChecksum === undefined) {
        pending.push(file);
        continue;
      }
      if (knownChecksum !== file.checksum) {
        throw new Error(`migration ${file.name} was already applied with a different checksum`);
      }
      skipped.push(file.name);
    }

    for (const file of pending) {
      try {
        db.exec(file.sql);
      } catch (error) {
        throw new Error(
          `failed to apply migration ${file.name}: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }
      db.prepare("INSERT INTO _migrations (name, checksum, applied_at) VALUES (?, ?, ?)").run(
        file.name,
        file.checksum,
        nowIso(),
      );
      applied.push(file.name);
    }

    db.exec("COMMIT");
    inTransaction = false;
  } catch (error) {
    if (inTransaction) {
      try {
        db.exec("ROLLBACK");
      } catch {
        // preserve the original failure
      }
    }
    throw error;
  }

  return { applied, skipped };
}