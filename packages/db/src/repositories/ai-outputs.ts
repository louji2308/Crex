import { aiOutputSchema, type AiOutput } from "@crex/schemas";
import type { SqlDb, SqlValue } from "../sqlite";
import { insertRow, listRows } from "./shared";

const TABLE = "ai_outputs";
const JSON_FIELDS = ["normalized", "validation_errors"] as const;

function decodeRow(row: Record<string, SqlValue>): AiOutput {
  const decoded: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(row)) {
    if (value === null || value === undefined) {
      continue;
    }
    if ((JSON_FIELDS as readonly string[]).includes(key) && typeof value === "string") {
      decoded[key] = JSON.parse(value);
    } else {
      decoded[key] = value;
    }
  }

  if (typeof decoded.valid === "number") {
    decoded.valid = decoded.valid === 1;
  }
  if (typeof decoded.fallback_used === "number") {
    decoded.fallback_used = decoded.fallback_used === 1;
  }

  delete decoded.project_id;

  return aiOutputSchema.parse(decoded);
}

function rowOf(output: AiOutput, projectId: string): Record<string, unknown> {
  return {
    ...output,
    project_id: projectId,
    valid: output.valid ? 1 : 0,
    fallback_used: output.fallback_used ? 1 : 0,
  };
}

export class AiOutputRepository {
  private readonly db: SqlDb;

  constructor(db: SqlDb) {
    this.db = db;
  }

  async insert(output: AiOutput, projectId: string): Promise<AiOutput> {
    const parsed = aiOutputSchema.parse(output);
    await insertRow(this.db, TABLE, rowOf(parsed, projectId));
    return parsed;
  }

  async get(id: string): Promise<AiOutput | undefined> {
    const row = await this.db.prepare(`SELECT * FROM ${TABLE} WHERE id = ?`).get(id);
    return row === undefined ? undefined : decodeRow(row);
  }

  async listByProject(projectId: string): Promise<AiOutput[]> {
    const rows = await this.db
      .prepare(`SELECT * FROM ${TABLE} WHERE project_id = ? ORDER BY created_at`)
      .all(projectId);
    return rows.map(decodeRow);
  }
}