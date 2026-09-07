import { transcriptSchema } from "@crex/schemas";
import type { Transcript } from "@crex/schemas";
import type { SqlDb, SqlValue } from "../sqlite";
import { getRow, insertRow, listRows } from "./shared";

const TABLE = "transcripts";
const JSON_FIELDS = [] as const;

export class TranscriptRepository {
  private readonly db: SqlDb;

  constructor(db: SqlDb) {
    this.db = db;
  }

  async insert(transcript: Transcript): Promise<Transcript> {
    const parsed = transcriptSchema.parse(transcript);
    await insertRow(this.db, TABLE, parsed);
    return parsed;
  }

  async get(id: string): Promise<Transcript | undefined> {
    return getRow<Transcript>(this.db, `SELECT * FROM ${TABLE} WHERE id = ?`, [id], JSON_FIELDS);
  }

  async list(): Promise<Transcript[]> {
    return listRows<Transcript>(this.db, `SELECT * FROM ${TABLE} ORDER BY created_at`, [], JSON_FIELDS);
  }

  async listBySourceAsset(sourceAssetId: string): Promise<Transcript[]> {
    return listRows<Transcript>(
      this.db,
      `SELECT * FROM ${TABLE} WHERE source_asset_id = ? ORDER BY created_at`,
      [sourceAssetId],
      JSON_FIELDS,
    );
  }

  async update(id: string, patch: Partial<Pick<Transcript, "language" | "duration_seconds" | "provider" | "model" | "fallback_used" | "status">>): Promise<Transcript> {
    const updates: string[] = [];
    const values: SqlValue[] = [];

    if (patch.language !== undefined) {
      updates.push("language = ?");
      values.push(patch.language);
    }
    if (patch.duration_seconds !== undefined) {
      updates.push("duration_seconds = ?");
      values.push(patch.duration_seconds);
    }
    if (patch.provider !== undefined) {
      updates.push("provider = ?");
      values.push(patch.provider);
    }
    if (patch.model !== undefined) {
      updates.push("model = ?");
      values.push(patch.model);
    }
    if (patch.fallback_used !== undefined) {
      updates.push("fallback_used = ?");
      values.push(patch.fallback_used ? 1 : 0);
    }
    if (patch.status !== undefined) {
      updates.push("status = ?");
      values.push(patch.status);
    }

    if (updates.length === 0) {
      const row = await this.get(id);
      if (row === undefined) {
        throw new Error(`Transcript with id ${id} not found`);
      }
      return row;
    }

    updates.push("updated_at = ?");
    values.push(new Date().toISOString());
    values.push(id);

    await this.db.prepare(`UPDATE ${TABLE} SET ${updates.join(", ")} WHERE id = ?`).run(...values);
    const row = await this.get(id);
    if (row === undefined) {
      throw new Error(`Transcript with id ${id} not found after update`);
    }
    return row;
  }
}