import { audienceProfileSchema, type AudienceProfile } from "@crex/schemas/src/audience";
import type { SqlDb, SqlValue } from "../sqlite";
import { getRow, insertRow, listRows } from "./shared";

const TABLE = "audience_profiles";
const JSON_FIELDS = ["facts_json"] as const;

function decodeRow(row: Record<string, SqlValue>): AudienceProfile {
  const decoded: Record<string, unknown> = { ...row };

  if (typeof decoded.facts_json === "string") {
    decoded.facts = JSON.parse(decoded.facts_json);
  } else if (decoded.facts_json !== undefined) {
    decoded.facts = decoded.facts_json;
  }
  delete decoded.facts_json;

  return audienceProfileSchema.parse(decoded);
}

function rowOf(profile: AudienceProfile): Record<string, unknown> {
  const { facts, ...rest } = profile;
  return {
    ...rest,
    facts_json: facts,
  };
}

export class AudienceProfileRepository {
  private readonly db: SqlDb;

  constructor(db: SqlDb) {
    this.db = db;
  }

  async insert(profile: AudienceProfile): Promise<AudienceProfile> {
    const parsed = audienceProfileSchema.parse(profile);
    await insertRow(this.db, TABLE, rowOf(parsed));
    return parsed;
  }

  async get(id: string): Promise<AudienceProfile | undefined> {
    const row = await getRow<Record<string, SqlValue>>(
      this.db,
      `SELECT * FROM ${TABLE} WHERE id = ?`,
      [id],
      [...JSON_FIELDS],
    );
    return row === undefined ? undefined : decodeRow(row);
  }

  async listByProject(projectId: string): Promise<AudienceProfile[]> {
    const rows = await listRows<Record<string, SqlValue>>(
      this.db,
      `SELECT * FROM ${TABLE} WHERE project_id = ? ORDER BY created_at`,
      [projectId],
      [...JSON_FIELDS],
    );
    return rows.map(decodeRow);
  }

  async upsert(profile: AudienceProfile): Promise<AudienceProfile> {
    const existing = await this.get(profile.id);
    if (existing) {
      await this.db
        .prepare(
          `UPDATE ${TABLE}
           SET name = ?, facts_json = ?, summary = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(
          profile.name,
          JSON.stringify(profile.facts),
          profile.summary ?? null,
          profile.updated_at,
          profile.id,
        );
      return profile;
    }
    return this.insert(profile);
  }
}
