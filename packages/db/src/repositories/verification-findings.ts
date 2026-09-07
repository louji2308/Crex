import { verificationFindingSchema } from "@crex/schemas";
import type { VerificationFinding } from "@crex/schemas";
import type { SqlDb } from "../sqlite";
import { getRow, insertRow, listRows } from "./shared";

const TABLE = "verification_findings";
const JSON_FIELDS = ["evidence_ranges"] as const;

export class VerificationFindingRepository {
  private readonly db: SqlDb;

  constructor(db: SqlDb) {
    this.db = db;
  }

  async insert(finding: VerificationFinding): Promise<VerificationFinding> {
    const parsed = verificationFindingSchema.parse(finding);
    await insertRow(this.db, TABLE, parsed);
    return parsed;
  }

  async get(id: string): Promise<VerificationFinding | undefined> {
    return getRow<VerificationFinding>(this.db, `SELECT * FROM ${TABLE} WHERE id = ?`, [id], JSON_FIELDS);
  }

  async list(): Promise<VerificationFinding[]> {
    return listRows<VerificationFinding>(this.db, `SELECT * FROM ${TABLE} ORDER BY created_at`, [], JSON_FIELDS);
  }

  async listByRun(runId: string): Promise<VerificationFinding[]> {
    return listRows<VerificationFinding>(
      this.db,
      `SELECT * FROM ${TABLE} WHERE verification_run_id = ? ORDER BY created_at`,
      [runId],
      JSON_FIELDS,
    );
  }

  async listByAsset(assetId: string): Promise<VerificationFinding[]> {
    return listRows<VerificationFinding>(
      this.db,
      `SELECT * FROM ${TABLE} WHERE asset_id = ? ORDER BY created_at`,
      [assetId],
      JSON_FIELDS,
    );
  }

  async listByComponent(componentId: string): Promise<VerificationFinding[]> {
    return listRows<VerificationFinding>(
      this.db,
      `SELECT * FROM ${TABLE} WHERE component_id = ? ORDER BY created_at`,
      [componentId],
      JSON_FIELDS,
    );
  }
}