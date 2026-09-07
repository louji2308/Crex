import { sourceAssetSchema } from "@crex/schemas";
import type { SourceAsset } from "@crex/schemas";
import type { SqlDb } from "../sqlite";
import { getRow, insertRow, listRows } from "./shared";

const TABLE = "source_assets";
const JSON_FIELDS = [] as const;

export class SourceAssetRepository {
  private readonly db: SqlDb;

  constructor(db: SqlDb) {
    this.db = db;
  }

  insert(sourceAsset: SourceAsset): SourceAsset {
    const parsed = sourceAssetSchema.parse(sourceAsset);
    insertRow(this.db, TABLE, parsed);
    return parsed;
  }

  get(id: string): SourceAsset | undefined {
    return getRow<SourceAsset>(this.db, `SELECT * FROM ${TABLE} WHERE id = ?`, [id], JSON_FIELDS);
  }

  list(): SourceAsset[] {
    return listRows<SourceAsset>(this.db, `SELECT * FROM ${TABLE} ORDER BY created_at`, [], JSON_FIELDS);
  }

  listByProject(projectId: string): SourceAsset[] {
    return listRows<SourceAsset>(
      this.db,
      `SELECT * FROM ${TABLE} WHERE project_id = ? ORDER BY created_at`,
      [projectId],
      JSON_FIELDS,
    );
  }
}