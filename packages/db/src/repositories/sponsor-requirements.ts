import { sponsorRequirementSchema, type SponsorRequirement } from "@crex/schemas";
import type { SqlDb, SqlValue } from "../sqlite";
import { getRow, insertRow, listRows } from "./shared";

const TABLE = "sponsor_requirements";

function decodeRow(row: Record<string, SqlValue>): SponsorRequirement {
  const decoded: Record<string, unknown> = { ...row };
  if (typeof decoded.required === "number") {
    decoded.required = decoded.required === 1;
  }
  if (typeof decoded.enabled === "number") {
    decoded.enabled = decoded.enabled === 1;
  }
  return sponsorRequirementSchema.parse(decoded);
}

export class SponsorRequirementRepository {
  private readonly db: SqlDb;

  constructor(db: SqlDb) {
    this.db = db;
  }

  async insert(requirement: SponsorRequirement): Promise<SponsorRequirement> {
    const parsed = sponsorRequirementSchema.parse(requirement);
    await insertRow(this.db, TABLE, parsed);
    return parsed;
  }

  async get(id: string): Promise<SponsorRequirement | undefined> {
    const row = await getRow<Record<string, SqlValue>>(
      this.db,
      `SELECT * FROM ${TABLE} WHERE id = ?`,
      [id],
    );
    return row === undefined ? undefined : decodeRow(row);
  }

  async list(): Promise<SponsorRequirement[]> {
    const rows = await listRows<Record<string, SqlValue>>(
      this.db,
      `SELECT * FROM ${TABLE} ORDER BY created_at`,
      [],
    );
    return rows.map(decodeRow);
  }

  async listByProject(projectId: string): Promise<SponsorRequirement[]> {
    const rows = await listRows<Record<string, SqlValue>>(
      this.db,
      `SELECT * FROM ${TABLE} WHERE project_id = ? ORDER BY created_at`,
      [projectId],
    );
    return rows.map(decodeRow);
  }
}