import { generatedComponentSchema } from "@crex/schemas";
import type { GeneratedComponent } from "@crex/schemas";
import type { SqlDb } from "../sqlite";
import { getRow, insertRow, listRows } from "./shared";

const TABLE = "generated_components";
const JSON_FIELDS = ["source_references", "claim_references", "constraint_references", "generation_metadata"] as const;

export class GeneratedComponentRepository {
  private readonly db: SqlDb;

  constructor(db: SqlDb) {
    this.db = db;
  }

  insert(component: GeneratedComponent): GeneratedComponent {
    const parsed = generatedComponentSchema.parse(component);
    insertRow(this.db, TABLE, parsed);
    return parsed;
  }

  get(id: string): GeneratedComponent | undefined {
    return getRow<GeneratedComponent>(this.db, `SELECT * FROM ${TABLE} WHERE component_id = ?`, [id], JSON_FIELDS);
  }

  list(): GeneratedComponent[] {
    return listRows<GeneratedComponent>(this.db, `SELECT * FROM ${TABLE} ORDER BY component_id`, [], JSON_FIELDS);
  }

  listByAsset(assetId: string): GeneratedComponent[] {
    return listRows<GeneratedComponent>(
      this.db,
      `SELECT * FROM ${TABLE} WHERE asset_id = ? ORDER BY component_id`,
      [assetId],
      JSON_FIELDS,
    );
  }
}