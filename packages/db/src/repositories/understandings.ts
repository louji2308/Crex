import { understandingSchema } from "@crex/schemas";
import type { Understanding } from "@crex/schemas";
import type { SqlDb } from "../sqlite";
import { getRow, insertRow, listRows } from "./shared";

const TABLE = "understandings";
const JSON_FIELDS = ["media_metadata_json"] as const;

export class UnderstandingRepository {
  private readonly db: SqlDb;

  constructor(db: SqlDb) {
    this.db = db;
  }

  async insert(understanding: Understanding): Promise<Understanding> {
    const parsed = understandingSchema.parse(understanding);
    await insertRow(this.db, TABLE, parsed);
    return parsed;
  }

  async get(id: string): Promise<Understanding | undefined> {
    return getRow<Understanding>(this.db, `SELECT * FROM ${TABLE} WHERE id = ?`, [id], JSON_FIELDS);
  }

  async list(): Promise<Understanding[]> {
    return listRows<Understanding>(this.db, `SELECT * FROM ${TABLE} ORDER BY created_at`, [], JSON_FIELDS);
  }

  async listBySourceAsset(sourceAssetId: string): Promise<Understanding[]> {
    return listRows<Understanding>(
      this.db,
      `SELECT * FROM ${TABLE} WHERE source_asset_id = ? ORDER BY created_at`,
      [sourceAssetId],
      JSON_FIELDS,
    );
  }

  async listReadyBySourceAsset(sourceAssetId: string): Promise<Understanding[]> {
    return listRows<Understanding>(
      this.db,
      `SELECT * FROM ${TABLE} WHERE source_asset_id = ? AND status = 'READY' ORDER BY created_at`,
      [sourceAssetId],
      JSON_FIELDS,
    );
  }

  async updateStatus(id: string, status: Understanding["status"]): Promise<Understanding> {
    const now = new Date().toISOString();
    await this.db.prepare(`UPDATE ${TABLE} SET status = ?, updated_at = ? WHERE id = ?`)
      .run(status, now, id);
    const row = await this.get(id);
    if (!row) {
      throw new Error(`Understanding with id ${id} not found after status update`);
    }
    return row;
  }
}