import { verificationRunSchema } from "@crex/schemas";
import type { VerificationRun } from "@crex/schemas";
import type { SqlDb } from "../sqlite";
import { getRow, insertRow, listRows } from "./shared";

const TABLE = "verification_runs";
const JSON_FIELDS = ["finding_ids"] as const;

export class VerificationRunRepository {
  private readonly db: SqlDb;

  constructor(db: SqlDb) {
    this.db = db;
  }

  insert(run: VerificationRun): VerificationRun {
    const parsed = verificationRunSchema.parse(run);
    insertRow(this.db, TABLE, parsed);
    return parsed;
  }

  get(id: string): VerificationRun | undefined {
    return getRow<VerificationRun>(this.db, `SELECT * FROM ${TABLE} WHERE id = ?`, [id], JSON_FIELDS);
  }

  list(): VerificationRun[] {
    return listRows<VerificationRun>(this.db, `SELECT * FROM ${TABLE} ORDER BY started_at`, [], JSON_FIELDS);
  }

  listByAsset(assetId: string): VerificationRun[] {
    return listRows<VerificationRun>(
      this.db,
      `SELECT * FROM ${TABLE} WHERE asset_id = ? ORDER BY started_at`,
      [assetId],
      JSON_FIELDS,
    );
  }
}