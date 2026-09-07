import { claimSchema } from "@crex/schemas";
import type { Claim } from "@crex/schemas";
import type { SqlDb } from "../sqlite";
import { getRow, insertRow, listRows } from "./shared";

const TABLE = "claims";
const JSON_FIELDS = ["qualifiers"] as const;

export class ClaimRepository {
  private readonly db: SqlDb;

  constructor(db: SqlDb) {
    this.db = db;
  }

  async insert(claim: Claim): Promise<Claim> {
    const parsed = claimSchema.parse(claim);
    await insertRow(this.db, TABLE, parsed);
    return parsed;
  }

  async get(id: string): Promise<Claim | undefined> {
    return getRow<Claim>(this.db, `SELECT * FROM ${TABLE} WHERE id = ?`, [id], JSON_FIELDS);
  }

  async list(): Promise<Claim[]> {
    return listRows<Claim>(this.db, `SELECT * FROM ${TABLE} ORDER BY created_at`, [], JSON_FIELDS);
  }

  async listByProject(projectId: string): Promise<Claim[]> {
    return listRows<Claim>(
      this.db,
      `SELECT * FROM ${TABLE} WHERE project_id = ? ORDER BY created_at`,
      [projectId],
      JSON_FIELDS,
    );
  }

  async listBySegment(segmentId: string): Promise<Claim[]> {
    return listRows<Claim>(
      this.db,
      `SELECT * FROM ${TABLE} WHERE segment_id = ? ORDER BY created_at`,
      [segmentId],
      JSON_FIELDS,
    );
  }
}