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

  insert(generatedAsset: GeneratedAsset): GeneratedAsset {
    const parsed = generatedAssetSchema.parse(generatedAsset);
    insertRow(this.db, TABLE, parsed);
    return parsed;
  }

  get(id: string): GeneratedAsset | undefined {
    return getRow<GeneratedAsset>(this.db, `SELECT * FROM ${TABLE} WHERE id = ?`, [id], JSON_FIELDS);
  }

  list(): GeneratedAsset[] {
    return listRows<GeneratedAsset>(this.db, `SELECT * FROM ${TABLE} ORDER BY created_at`, [], JSON_FIELDS);
  }

  listByProject(projectId: string): GeneratedAsset[] {
    return listRows<GeneratedAsset>(
      this.db,
      `SELECT * FROM ${TABLE} WHERE project_id = ? ORDER BY created_at`,
      [projectId],
      JSON_FIELDS,
    );
  }
}