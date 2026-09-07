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

  insert(evidence: Evidence): Evidence {
    const parsed = evidenceSchema.parse(evidence);
    insertRow(this.db, TABLE, parsed);
    return parsed;
  }

  get(id: string): Evidence | undefined {
    return getRow<Evidence>(this.db, `SELECT * FROM ${TABLE} WHERE id = ?`, [id], JSON_FIELDS);
  }

  list(): Evidence[] {
    return listRows<Evidence>(this.db, `SELECT * FROM ${TABLE} ORDER BY created_at`, [], JSON_FIELDS);
  }

  listByClaim(claimId: string): Evidence[] {
    return listRows<Evidence>(
      this.db,
      `SELECT * FROM ${TABLE} WHERE claim_id = ? ORDER BY created_at`,
      [claimId],
      JSON_FIELDS,
    );
  }
}