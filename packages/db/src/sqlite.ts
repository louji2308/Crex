import { DatabaseSync, type StatementSync } from "node:sqlite";

export type SqlValue = null | number | bigint | string | Uint8Array;

export interface SqlRunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

export interface SqlStatement {
  run(...params: SqlValue[]): Promise<SqlRunResult>;
  get(...params: SqlValue[]): Promise<Record<string, SqlValue> | undefined>;
  all(...params: SqlValue[]): Promise<Record<string, SqlValue>[]>;
}

export interface SqlBatchItem {
  sql: string;
  params?: SqlValue[];
}

export interface SqlDb {
  readonly isOpen: boolean;
  prepare(sql: string): SqlStatement;
  exec(sql: string): Promise<void>;
  batch(statements: SqlBatchItem[]): Promise<void>;
  close(): Promise<void>;
}

export class SqliteStatement implements SqlStatement {
  private readonly statement: StatementSync;

  constructor(statement: StatementSync) {
    this.statement = statement;
  }

  async run(...params: SqlValue[]): Promise<SqlRunResult> {
    const result = this.statement.run(...params);
    return {
      changes: Number(result.changes),
      lastInsertRowid: result.lastInsertRowid,
    };
  }

  async get(...params: SqlValue[]): Promise<Record<string, SqlValue> | undefined> {
    return this.statement.get(...params);
  }

  async all(...params: SqlValue[]): Promise<Record<string, SqlValue>[]> {
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

  async exec(sql: string): Promise<void> {
    this.assertOpen();
    this.db.exec(sql);
  }

  async batch(statements: SqlBatchItem[]): Promise<void> {
    this.assertOpen();
    this.db.exec("BEGIN");
    try {
      for (const item of statements) {
        this.db.prepare(item.sql).run(...(item.params ?? []));
      }
      this.db.exec("COMMIT");
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {
        // preserve the original failure
      }
      throw error;
    }
  }

  async close(): Promise<void> {
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