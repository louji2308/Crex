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

  insert(claim: Claim): Claim {
    const parsed = claimSchema.parse(claim);
    insertRow(this.db, TABLE, parsed);
    return parsed;
  }

  get(id: string): Claim | undefined {
    return getRow<Claim>(this.db, `SELECT * FROM ${TABLE} WHERE id = ?`, [id], JSON_FIELDS);
  }

  list(): Claim[] {
    return listRows<Claim>(this.db, `SELECT * FROM ${TABLE} ORDER BY created_at`, [], JSON_FIELDS);
  }

  listByProject(projectId: string): Claim[] {
    return listRows<Claim>(
      this.db,
      `SELECT * FROM ${TABLE} WHERE project_id = ? ORDER BY created_at`,
      [projectId],
      JSON_FIELDS,
    );
  }

  listBySegment(segmentId: string): Claim[] {
    return listRows<Claim>(
      this.db,
      `SELECT * FROM ${TABLE} WHERE segment_id = ? ORDER BY created_at`,
      [segmentId],
      JSON_FIELDS,
    );
  }
}