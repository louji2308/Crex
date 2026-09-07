import type { SqlBatchItem, SqlDb, SqlRunResult, SqlStatement, SqlValue } from "@crex/db";

export interface D1Result<T = Record<string, unknown>> {
  success: boolean;
  meta: {
    changes: number;
    last_row_id: number;
    rows_read?: number;
    rows_written?: number;
  };
  results: T[];
}

export interface D1StatementLike {
  bind(...params: unknown[]): D1StatementLike;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>;
  run(): Promise<D1Result>;
  raw?(options?: { columnNames?: boolean }): Promise<unknown[][]>;
}

export interface D1DatabaseBinding {
  prepare(sql: string): D1StatementLike;
  batch(statements: D1StatementLike[]): Promise<D1Result[]>;
  exec(sql: string): Promise<{ count: number; duration: number }>;
  withSession?(mode?: string): unknown;
}

function toSqlValue(value: unknown): SqlValue {
  if (value === null) {
    return null;
  }
  switch (typeof value) {
    case "string":
    case "number":
    case "bigint":
      return value;
  }
  if (value instanceof Uint8Array) {
    return value;
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  throw new Error(`D1 returned an unsupported value type: ${String(value)}`);
}

function toRow(record: Record<string, unknown>): Record<string, SqlValue> {
  const row: Record<string, SqlValue> = {};
  for (const [column, value] of Object.entries(record)) {
    row[column] = toSqlValue(value);
  }
  return row;
}

export class D1Statement implements SqlStatement {
  private readonly statement: D1StatementLike;

  constructor(statement: D1StatementLike) {
    this.statement = statement;
  }

  async run(...params: SqlValue[]): Promise<SqlRunResult> {
    const statement = params.length > 0 ? this.statement.bind(...(params as unknown[])) : this.statement;
    const result = await statement.run();
    return {
      changes: Number(result.meta?.changes ?? 0),
      lastInsertRowid: result.meta?.last_row_id ?? 0,
    };
  }

  async get(...params: SqlValue[]): Promise<Record<string, SqlValue> | undefined> {
    const statement = params.length > 0 ? this.statement.bind(...(params as unknown[])) : this.statement;
    const record = await statement.first<Record<string, unknown>>();
    return record === null || record === undefined ? undefined : toRow(record);
  }

  async all(...params: SqlValue[]): Promise<Record<string, SqlValue>[]> {
    const statement = params.length > 0 ? this.statement.bind(...(params as unknown[])) : this.statement;
    const result = await statement.all<Record<string, unknown>>();
    return result.results.map(toRow);
  }
}

export class D1Adapter implements SqlDb {
  readonly isOpen = true;
  private readonly binding: D1DatabaseBinding;

  constructor(binding: D1DatabaseBinding) {
    this.binding = binding;
  }

  prepare(sql: string): SqlStatement {
    return new D1Statement(this.binding.prepare(sql));
  }

  async exec(sql: string): Promise<void> {
    await this.binding.exec(sql);
  }

  async batch(statements: SqlBatchItem[]): Promise<void> {
    const prepared = statements.map((item) => {
      const statement = this.binding.prepare(item.sql);
      return item.params !== undefined && item.params.length > 0
        ? statement.bind(...(item.params as unknown[]))
        : statement;
    });
    await this.binding.batch(prepared);
  }

  async close(): Promise<void> {}
}