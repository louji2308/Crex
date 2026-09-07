import {
  audienceRecommendationSchema,
  type AudienceRecommendation,
} from "@crex/schemas/src/audience";
import type { SqlDb } from "../sqlite";
import { getRow, insertRow, listRows } from "./shared";

const TABLE = "audience_recommendations";
const JSON_FIELDS = ["evidence_json", "limitations_json"] as const;

function decodeRow(row: Record<string, unknown>): AudienceRecommendation {
  const decoded: Record<string, unknown> = { ...row };

  if (typeof decoded.evidence_json === "string") {
    decoded.evidence = JSON.parse(decoded.evidence_json);
  } else if (decoded.evidence_json !== undefined) {
    decoded.evidence = decoded.evidence_json;
  }
  delete decoded.evidence_json;

  if (typeof decoded.limitations_json === "string") {
    decoded.limitations = JSON.parse(decoded.limitations_json);
  } else if (decoded.limitations_json !== undefined) {
    decoded.limitations = decoded.limitations_json;
  }
  delete decoded.limitations_json;

  return audienceRecommendationSchema.parse(decoded);
}

function rowOf(rec: AudienceRecommendation): Record<string, unknown> {
  const { evidence, limitations, ...rest } = rec;
  return {
    ...rest,
    evidence_json: evidence,
    limitations_json: limitations,
  };
}

export class AudienceRecommendationRepository {
  private readonly db: SqlDb;

  constructor(db: SqlDb) {
    this.db = db;
  }

  async insert(recommendation: AudienceRecommendation): Promise<AudienceRecommendation> {
    const parsed = audienceRecommendationSchema.parse(recommendation);
    await insertRow(this.db, TABLE, rowOf(parsed));
    return parsed;
  }

  async get(id: string): Promise<AudienceRecommendation | undefined> {
    const row = await getRow<Record<string, unknown>>(
      this.db,
      `SELECT * FROM ${TABLE} WHERE id = ?`,
      [id],
      [...JSON_FIELDS],
    );
    return row === undefined ? undefined : decodeRow(row);
  }

  async listByProject(projectId: string): Promise<AudienceRecommendation[]> {
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
