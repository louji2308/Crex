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

  async insert(component: GeneratedComponent): Promise<GeneratedComponent> {
    const parsed = generatedComponentSchema.parse(component);
    await insertRow(this.db, TABLE, parsed);
    return parsed;
  }

  async get(id: string): Promise<GeneratedComponent | undefined> {
    return getRow<GeneratedComponent>(this.db, `SELECT * FROM ${TABLE} WHERE component_id = ?`, [id], JSON_FIELDS);
  }

  async list(): Promise<GeneratedComponent[]> {
    return listRows<GeneratedComponent>(this.db, `SELECT * FROM ${TABLE} ORDER BY component_id`, [], JSON_FIELDS);
  }

  async listByAsset(assetId: string): Promise<GeneratedComponent[]> {
    return listRows<GeneratedComponent>(
      this.db,
      `SELECT * FROM ${TABLE} WHERE asset_id = ? ORDER BY component_id`,
      [assetId],
      JSON_FIELDS,
    );
  }

  async updateContent(componentId: string, content: string): Promise<GeneratedComponent | undefined> {
    await this.db
      .prepare(`UPDATE ${TABLE} SET content = ?, verification_status = 'REVIEW' WHERE component_id = ?`)
      .run(content, componentId);
    return this.get(componentId);
  }
}