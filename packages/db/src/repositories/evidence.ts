import { evidenceSchema } from "@crex/schemas";
import type { Evidence } from "@crex/schemas";
import type { SqlDb } from "../sqlite";
import { getRow, insertRow, listRows } from "./shared";

const TABLE = "evidence";
const JSON_FIELDS = ["source_range"] as const;

export class EvidenceRepository {
  private readonly db: SqlDb;

  constructor(db: SqlDb) {
    this.db = db;
  }

  async insert(evidence: Evidence): Promise<Evidence> {
    const parsed = evidenceSchema.parse(evidence);
    await insertRow(this.db, TABLE, parsed);
    return parsed;
  }

  async get(id: string): Promise<Evidence | undefined> {
    return getRow<Evidence>(this.db, `SELECT * FROM ${TABLE} WHERE id = ?`, [id], JSON_FIELDS);
  }

  async list(): Promise<Evidence[]> {
    return listRows<Evidence>(this.db, `SELECT * FROM ${TABLE} ORDER BY created_at`, [], JSON_FIELDS);
  }

  async listByClaim(claimId: string): Promise<Evidence[]> {
    return listRows<Evidence>(
      this.db,
      `SELECT * FROM ${TABLE} WHERE claim_id = ? ORDER BY created_at`,
      [claimId],
      JSON_FIELDS,
    );
  }
}