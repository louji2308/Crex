import { audienceInsightSchema, type AudienceInsight } from "@crex/schemas/src/audience";
import type { SqlDb } from "../sqlite";
import { getRow, insertRow, listRows } from "./shared";

const TABLE = "audience_insights";
const JSON_FIELDS = ["evidence_json"] as const;

function decodeRow(row: Record<string, unknown>): AudienceInsight {
  const decoded: Record<string, unknown> = { ...row };

  if (typeof decoded.evidence_json === "string") {
    decoded.evidence = JSON.parse(decoded.evidence_json);
  } else if (decoded.evidence_json !== undefined) {
    decoded.evidence = decoded.evidence_json;
  }
  delete decoded.evidence_json;

  return audienceInsightSchema.parse(decoded);
}

function rowOf(insight: AudienceInsight): Record<string, unknown> {
  const { evidence, ...rest } = insight;
  return {
    ...rest,
    evidence_json: evidence,
  };
}

export class AudienceInsightRepository {
  private readonly db: SqlDb;

  constructor(db: SqlDb) {
    this.db = db;
  }

  async insert(insight: AudienceInsight): Promise<AudienceInsight> {
    const parsed = audienceInsightSchema.parse(insight);
    await insertRow(this.db, TABLE, rowOf(parsed));
    return parsed;
  }

  async get(id: string): Promise<AudienceInsight | undefined> {
    const row = await getRow<Record<string, unknown>>(
      this.db,
      `SELECT * FROM ${TABLE} WHERE id = ?`,
      [id],
      [...JSON_FIELDS],
    );
    return row === undefined ? undefined : decodeRow(row);
  }

  async listByProject(projectId: string): Promise<AudienceInsight[]> {
    const rows = await listRows<Record<string, unknown>>(
      this.db,
      `SELECT * FROM ${TABLE} WHERE project_id = ? ORDER BY created_at`,
      [projectId],
      [...JSON_FIELDS],
    );
    return rows.map(decodeRow);
  }

  async deleteByProject(projectId: string): Promise<void> {
    await this.db.prepare(`DELETE FROM ${TABLE} WHERE project_id = ?`).run(projectId);
  }
}
