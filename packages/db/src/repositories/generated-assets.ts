import { generatedAssetSchema } from "@crex/schemas";
import type { GeneratedAsset } from "@crex/schemas";
import type { SqlDb } from "../sqlite";
import { getRow, insertRow, listRows } from "./shared";

const TABLE = "generated_assets";
const JSON_FIELDS = ["integrity"] as const;

export class GeneratedAssetRepository {
  private readonly db: SqlDb;

  constructor(db: SqlDb) {
    this.db = db;
  }

  async insert(generatedAsset: GeneratedAsset): Promise<GeneratedAsset> {
    const parsed = generatedAssetSchema.parse(generatedAsset);
    await insertRow(this.db, TABLE, parsed);
    return parsed;
  }

  async get(id: string): Promise<GeneratedAsset | undefined> {
    return getRow<GeneratedAsset>(this.db, `SELECT * FROM ${TABLE} WHERE id = ?`, [id], JSON_FIELDS);
  }

  async list(): Promise<GeneratedAsset[]> {
    return listRows<GeneratedAsset>(this.db, `SELECT * FROM ${TABLE} ORDER BY created_at`, [], JSON_FIELDS);
  }

  async listByProject(projectId: string): Promise<GeneratedAsset[]> {
    return listRows<GeneratedAsset>(
      this.db,
      `SELECT * FROM ${TABLE} WHERE project_id = ? ORDER BY created_at`,
      [projectId],
      JSON_FIELDS,
    );
  }
}