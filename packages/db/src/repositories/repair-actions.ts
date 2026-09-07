import { repairActionSchema } from "@crex/schemas";
import type { RepairAction } from "@crex/schemas";
import type { SqlDb } from "../sqlite";
import { getRow, insertRow, listRows } from "./shared";

const TABLE = "repair_actions";
const JSON_FIELDS = ["source_references", "constraint_references"] as const;
const REPAIR_STATUSES = ["PROPOSED", "APPLIED", "REJECTED"] as const;

export type RepairActionStatus = (typeof REPAIR_STATUSES)[number];

export class RepairActionRepository {
  private readonly db: SqlDb;

  constructor(db: SqlDb) {
    this.db = db;
  }

  async insert(action: RepairAction): Promise<RepairAction> {
    const parsed = repairActionSchema.parse(action);
    await insertRow(this.db, TABLE, parsed);
    return parsed;
  }

  async get(id: string): Promise<RepairAction | undefined> {
    return getRow<RepairAction>(
      this.db,
      `SELECT * FROM ${TABLE} WHERE id = ?`,
      [id],
      JSON_FIELDS,
    );
  }

  async list(): Promise<RepairAction[]> {
    return listRows<RepairAction>(
      this.db,
      `SELECT * FROM ${TABLE} ORDER BY created_at`,
      [],
      JSON_FIELDS,
    );
  }

  async listByAsset(assetId: string): Promise<RepairAction[]> {
    return listRows<RepairAction>(
      this.db,
      `SELECT * FROM ${TABLE} WHERE asset_id = ? ORDER BY created_at`,
      [assetId],
      JSON_FIELDS,
    );
  }

  async listByFinding(findingId: string): Promise<RepairAction[]> {
    return listRows<RepairAction>(
      this.db,
      `SELECT * FROM ${TABLE} WHERE finding_id = ? ORDER BY created_at`,
      [findingId],
      JSON_FIELDS,
    );
  }

  async listByProject(projectId: string): Promise<RepairAction[]> {
    return listRows<RepairAction>(
      this.db,
      `SELECT * FROM ${TABLE} WHERE project_id = ? ORDER BY created_at`,
      [projectId],
      JSON_FIELDS,
    );
  }

  async updateStatus(
    id: string,
    status: RepairActionStatus,
    updatedAt: string,
  ): Promise<RepairAction | undefined> {
    await this.db
      .prepare(`UPDATE ${TABLE} SET status = ?, updated_at = ? WHERE id = ?`)
      .run(status, updatedAt, id);
    return this.get(id);
  }
}