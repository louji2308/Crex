import { semanticSectionSchema } from "@crex/schemas";
import type { SemanticSection } from "@crex/schemas";
import type { SqlDb } from "../sqlite";
import { getRow, insertRow, listRows } from "./shared";

const TABLE = "semantic_sections";
const JSON_FIELDS = [] as const;

export class SemanticSectionRepository {
  private readonly db: SqlDb;

  constructor(db: SqlDb) {
    this.db = db;
  }

  async insert(section: SemanticSection): Promise<SemanticSection> {
    const parsed = semanticSectionSchema.parse(section);
    await insertRow(this.db, TABLE, parsed);
    return parsed;
  }

  async get(id: string): Promise<SemanticSection | undefined> {
    return getRow<SemanticSection>(this.db, `SELECT * FROM ${TABLE} WHERE id = ?`, [id], JSON_FIELDS);
  }

  async list(): Promise<SemanticSection[]> {
    return listRows<SemanticSection>(this.db, `SELECT * FROM ${TABLE} ORDER BY created_at`, [], JSON_FIELDS);
  }

  async listByUnderstanding(understandingId: string): Promise<SemanticSection[]> {
    return listRows<SemanticSection>(
      this.db,
      `SELECT * FROM ${TABLE} WHERE understanding_id = ? ORDER BY start_ms`,
      [understandingId],
      JSON_FIELDS,
    );
  }

  async listBySourceAsset(sourceAssetId: string): Promise<SemanticSection[]> {
    return listRows<SemanticSection>(
      this.db,
      `SELECT * FROM ${TABLE} WHERE understanding_id IN (SELECT id FROM understandings WHERE source_asset_id = ?)`,
      [sourceAssetId],
      JSON_FIELDS,
    );
  }
}