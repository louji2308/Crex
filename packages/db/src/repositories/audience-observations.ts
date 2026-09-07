import { audienceObservationSchema, type AudienceObservation } from "@crex/schemas/src/audience";
import type { SqlDb } from "../sqlite";
import { getRow, insertRow, listRows } from "./shared";

const TABLE = "audience_observations";

export class AudienceObservationRepository {
  private readonly db: SqlDb;

  constructor(db: SqlDb) {
    this.db = db;
  }

  async insert(observation: AudienceObservation): Promise<AudienceObservation> {
    const parsed = audienceObservationSchema.parse(observation);
    await insertRow(this.db, TABLE, parsed);
    return parsed;
  }

  async upsert(observation: AudienceObservation): Promise<AudienceObservation> {
    const parsed = audienceObservationSchema.parse(observation);
    const existing = await this.getByDedupeKey(parsed.project_id, parsed.dedupe_key);
    if (existing) {
      return existing;
    }
    await insertRow(this.db, TABLE, parsed);
    return parsed;
  }

  async get(id: string): Promise<AudienceObservation | undefined> {
    return getRow<AudienceObservation>(
      this.db,
      `SELECT * FROM ${TABLE} WHERE id = ?`,
      [id],
    );
  }

  async getByDedupeKey(projectId: string, dedupeKey: string): Promise<AudienceObservation | undefined> {
    return getRow<AudienceObservation>(
      this.db,
      `SELECT * FROM ${TABLE} WHERE project_id = ? AND dedupe_key = ?`,
      [projectId, dedupeKey],
    );
  }

  async listByProject(projectId: string): Promise<AudienceObservation[]> {
    return listRows<AudienceObservation>(
      this.db,
      `SELECT * FROM ${TABLE} WHERE project_id = ? ORDER BY created_at`,
      [projectId],
    );
  }

  async listByMetric(projectId: string, metric: string): Promise<AudienceObservation[]> {
    return listRows<AudienceObservation>(
      this.db,
      `SELECT * FROM ${TABLE} WHERE project_id = ? AND metric = ? ORDER BY created_at`,
      [projectId, metric],
    );
  }
}
