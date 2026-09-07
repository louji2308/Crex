import { constraintSchema, type Constraint } from "@crex/schemas";
import type { SqlDb, SqlValue } from "../sqlite";
import { getRow, insertRow, listRows } from "./shared";

const TABLE = "constraints";

function decodeRow(row: Record<string, SqlValue>): Constraint {
  const decoded: Record<string, unknown> = { ...row };
  if (typeof decoded.enabled === "number") {
    decoded.enabled = decoded.enabled === 1;
  }
  return constraintSchema.parse(decoded);
}

export class ConstraintRepository {
  private readonly db: SqlDb;

  constructor(db: SqlDb) {
    this.db = db;
  }

  async insert(constraint: Constraint): Promise<Constraint> {
    const parsed = constraintSchema.parse(constraint);
    await insertRow(this.db, TABLE, parsed);
    return parsed;
  }

  async get(id: string): Promise<Constraint | undefined> {
    const row = await getRow<Record<string, SqlValue>>(this.db, `SELECT * FROM ${TABLE} WHERE id = ?`, [id]);
    return row === undefined ? undefined : decodeRow(row);
  }

  async list(): Promise<Constraint[]> {
    const rows = await listRows<Record<string, SqlValue>>(
      this.db,
      `SELECT * FROM ${TABLE} ORDER BY created_at`,
      [],
    );
    return rows.map(decodeRow);
  }

  async listByProject(projectId: string): Promise<Constraint[]> {
    const rows = await listRows<Record<string, SqlValue>>(
      this.db,
      `SELECT * FROM ${TABLE} WHERE project_id = ? ORDER BY created_at`,
      [projectId],
    );
    return rows.map(decodeRow);
  }
}