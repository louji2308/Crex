import { releasePassportSchema, type ReleasePassport } from "@crex/schemas";
import type { SqlDb } from "../sqlite";
import { getRow, insertRow, listRows } from "./shared";

const TABLE = "release_passports";
const JSON_FIELDS = [] as const;

/**
 * Persists and reads `release_passports` rows matching the frozen `ReleasePassport` contract.
 *
 * Every column is scalar (integer/text), so no JSON fields are decoded.
 */
export class ReleasePassportRepository {
  private readonly db: SqlDb;

  constructor(db: SqlDb) {
    this.db = db;
  }

  async insert(passport: ReleasePassport): Promise<ReleasePassport> {
    const parsed = releasePassportSchema.parse(passport);
    await insertRow(this.db, TABLE, parsed);
    return parsed;
  }

  async get(id: string): Promise<ReleasePassport | undefined> {
    return getRow<ReleasePassport>(this.db, `SELECT * FROM ${TABLE} WHERE id = ?`, [id], JSON_FIELDS);
  }

  async list(): Promise<ReleasePassport[]> {
    return listRows<ReleasePassport>(
      this.db,
      `SELECT * FROM ${TABLE} ORDER BY created_at DESC`,
      [],
      JSON_FIELDS,
    );
  }

  async listByProject(projectId: string): Promise<ReleasePassport[]> {
    return listRows<ReleasePassport>(
      this.db,
      `SELECT * FROM ${TABLE} WHERE project_id = ? ORDER BY created_at DESC`,
      [projectId],
      JSON_FIELDS,
    );
  }

  async listByAsset(assetId: string): Promise<ReleasePassport[]> {
    return listRows<ReleasePassport>(
      this.db,
      `SELECT * FROM ${TABLE} WHERE asset_id = ? ORDER BY created_at DESC`,
      [assetId],
      JSON_FIELDS,
    );
  }

  async getLatestByAsset(assetId: string): Promise<ReleasePassport | undefined> {
    return getRow<ReleasePassport>(
      this.db,
      `SELECT * FROM ${TABLE} WHERE asset_id = ? ORDER BY version DESC, created_at DESC LIMIT 1`,
      [assetId],
      JSON_FIELDS,
    );
  }
}