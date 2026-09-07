import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SqlBatchItem, SqlDb } from "./sqlite";

const MIGRATION_PATTERN = /^\d{4}_.+\.sql$/;

export interface MigrationFile {
  name: string;
  path: string;
  checksum: string;
  sql: string;
}

export interface MigrateOptions {
  migrationsDir?: string;
  listMigrations?: () => MigrationFile[] | Promise<MigrationFile[]>;
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

function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;
  let blockCommentEnd = -1;

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    const next = sql[i + 1];

    if (inLineComment) {
      if (char === "\n") {
        inLineComment = false;
        current += char;
      }
      continue;
    }

    if (inBlockComment) {
      if (char === "*" && next === "/") {
        inBlockComment = false;
        i++;
      }
      continue;
    }

    if (inSingleQuote) {
      current += char;
      if (char === "'") {
        inSingleQuote = false;
      }
      continue;
    }

    if (inDoubleQuote) {
      current += char;
      if (char === '"') {
        inDoubleQuote = false;
      }
      continue;
    }

    if (char === "-" && next === "-") {
      inLineComment = true;
      i++;
      continue;
    }

    if (char === "/" && next === "*") {
      inBlockComment = true;
      i++;
      continue;
    }

    if (char === "'") {
      inSingleQuote = true;
      current += char;
      continue;
    }

    if (char === '"') {
      inDoubleQuote = true;
      current += char;
      continue;
    }

    if (char === ";") {
      const trimmed = current.trim();
      if (trimmed.length > 0) {
        statements.push(trimmed);
      }
      current = "";
      continue;
    }

    current += char;
  }

  const trailing = current.trim();
  if (trailing.length > 0) {
    statements.push(trailing);
  }

  return statements;
}

export async function migrate(db: SqlDb, options: MigrateOptions = {}): Promise<MigrationResult> {
  const provider =
    options.listMigrations ??
    (() => {
      const migrationsDir = options.migrationsDir ?? getMigrationsPath();
      return listMigrations(migrationsDir);
    });
  const files = await provider();

  const appliedChecksums = new Map<string, string>();
  const hasTable =
    (await db.prepare("SELECT 1 AS one FROM sqlite_master WHERE type = 'table' AND name = '_migrations'").get()) !==
    undefined;
  if (hasTable) {
    const records = await db.prepare("SELECT name, checksum FROM _migrations").all();
    for (const record of records) {
      appliedChecksums.set(String(record.name), String(record.checksum));
    }
  }

  const pending: MigrationFile[] = [];
  const skipped: string[] = [];
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

  if (pending.length === 0) {
    return { applied: [], skipped };
  }

  const statements: SqlBatchItem[] = [
    {
      sql: "CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)",
    },
  ];
  const applied: string[] = [];
  for (const file of pending) {
    const parts = splitSqlStatements(file.sql);
    if (parts.length === 0) {
      throw new Error(`migration ${file.name} contains no SQL statements`);
    }
    for (const part of parts) {
      statements.push({ sql: part });
    }
    statements.push({
      sql: "INSERT INTO _migrations (name, checksum, applied_at) VALUES (?, ?, ?)",
      params: [file.name, file.checksum, nowIso()],
    });
    applied.push(file.name);
  }

  try {
    await db.batch(statements);
  } catch (error) {
    const name = pending[0]?.name ?? "?";
    throw new Error(
      `failed to apply migration ${name}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }

  return { applied, skipped };
}
