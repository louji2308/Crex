import type { SqlDb, SqlValue } from "../sqlite";

function quoteIdentifier(identifier: string): string {
  return `"${identifier}"`;
}

export function toDbValue(value: unknown): SqlValue {
  if (value === null || value === undefined) {
    return null;
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint" ||
    value instanceof Uint8Array
  ) {
    return value;
  }
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  return JSON.stringify(value);
}

export async function insertRow(db: SqlDb, table: string, row: Record<string, unknown>): Promise<void> {
  const columns = Object.keys(row);
  const values = columns.map((column) => toDbValue(row[column]));
  const columnList = columns.map(quoteIdentifier).join(", ");
  const placeholderList = columns.map(() => "?").join(", ");
  await db.prepare(`INSERT INTO ${table} (${columnList}) VALUES (${placeholderList})`).run(...values);
}

export function decodeRow<T>(row: Record<string, SqlValue>, jsonFields: readonly string[]): T {
  const decoded: Record<string, unknown> = {};
  for (const key of Object.keys(row)) {
    const value = row[key];
    if (value === null || value === undefined) {
      continue;
    }
    if (jsonFields.includes(key) && typeof value === "string") {
      decoded[key] = JSON.parse(value);
    } else {
      decoded[key] = value;
    }
  }
  return decoded as T;
}

export async function getRow<T>(
  db: SqlDb,
  sql: string,
  params: SqlValue[],
  jsonFields: readonly string[] = [],
): Promise<T | undefined> {
  const row = await db.prepare(sql).get(...params);
  return row === undefined ? undefined : decodeRow<T>(row, jsonFields);
}

export async function listRows<T>(
  db: SqlDb,
  sql: string,
  params: SqlValue[] = [],
  jsonFields: readonly string[] = [],
): Promise<T[]> {
  const rows = await db.prepare(sql).all(...params);
  return rows.map((row) => decodeRow<T>(row, jsonFields));
}