import { createSqlDb, migrate, type SqlDb } from "@crex/db";

export async function withMemoryDb<T>(
  fn: (db: SqlDb, ctx: { close: () => void }) => T | Promise<T>,
): Promise<T> {
  const db = createSqlDb(":memory:");
  migrate(db);
  const ctx = { close: () => db.close() };
  try {
    return await fn(db, ctx);
  } finally {
    db.close();
  }
}