import { DatabaseSync, type StatementSync } from "node:sqlite";

export type SqlValue = null | number | bigint | string | Uint8Array;

export interface SqlRunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

export interface SqlStatement {
  run(...params: SqlValue[]): SqlRunResult;
  get(...params: SqlValue[]): Record<string, SqlValue> | undefined;
  all(...params: SqlValue[]): Record<string, SqlValue>[];
}

export interface SqlDb {
  readonly isOpen: boolean;
  prepare(sql: string): SqlStatement;
  exec(sql: string): void;
  close(): void;
}

export class SqliteStatement implements SqlStatement {
  private readonly statement: StatementSync;

  constructor(statement: StatementSync) {
    this.statement = statement;
  }

  run(...params: SqlValue[]): SqlRunResult {
    const result = this.statement.run(...params);
    return {
      changes: Number(result.changes),
      lastInsertRowid: result.lastInsertRowid,
    };
  }

  get(...params: SqlValue[]): Record<string, SqlValue> | undefined {
    return this.statement.get(...params);
  }

  all(...params: SqlValue[]): Record<string, SqlValue>[] {
    return this.statement.all(...params);
  }
}

export class SqliteDatabase implements SqlDb {
  private readonly db: DatabaseSync;
  private open = true;

  constructor(location: string) {
    this.db = new DatabaseSync(location);
    this.db.exec("PRAGMA foreign_keys = ON");
  }

  get isOpen(): boolean {
    return this.open;
  }

  prepare(sql: string): SqlStatement {
    this.assertOpen();
    return new SqliteStatement(this.db.prepare(sql));
  }

  exec(sql: string): void {
    this.assertOpen();
    this.db.exec(sql);
  }

  close(): void {
    if (!this.open) {
      return;
    }
    this.db.close();
    this.open = false;
  }

  private assertOpen(): void {
    if (!this.open) {
      throw new Error("SqliteDatabase is closed");
    }
  }
}

export function createSqlDb(location: string): SqlDb {
  return new SqliteDatabase(location);
}