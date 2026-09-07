import { sourceAssetSchema } from "@crex/schemas";
import type { SourceAsset } from "@crex/schemas";
import { CrexError } from "@crex/core/src/errors";
import type { SqlDb } from "../sqlite";
import { getRow, insertRow, listRows, toDbValue } from "./shared";

const TABLE = "source_assets";
const JSON_FIELDS = ["media"] as const;

export type SourceState = SourceAsset["status"];

export const SOURCE_STATE_TRANSITIONS: Record<SourceState, readonly SourceState[]> = {
  UPLOADING: ["UPLOADED"],
  UPLOADED: ["VALIDATING"],
  VALIDATING: ["VALID", "INVALID", "FAILED"],
  VALID: ["PROCESSING", "READY"],
  PROCESSING: ["READY", "FAILED"],
  INVALID: ["FAILED"],
  FAILED: [],
  READY: [],
};

const DEFAULT_ALLOWED_FROM: Record<SourceState, SourceState[]> = {
  UPLOADING: [],
  UPLOADED: [],
  VALIDATING: [],
  VALID: [],
  INVALID: [],
  PROCESSING: [],
  READY: [],
  FAILED: [],
};

for (const from of Object.keys(SOURCE_STATE_TRANSITIONS) as SourceState[]) {
  for (const target of SOURCE_STATE_TRANSITIONS[from] ?? []) {
    DEFAULT_ALLOWED_FROM[target] = [...(DEFAULT_ALLOWED_FROM[target] ?? []), from];
  }
}

export class SourceAssetRepository {
  private readonly db: SqlDb;

  constructor(db: SqlDb) {
    this.db = db;
  }

  async insert(sourceAsset: SourceAsset): Promise<SourceAsset> {
    const parsed = sourceAssetSchema.parse(sourceAsset);
    await insertRow(this.db, TABLE, parsed);
    return parsed;
  }

  async get(id: string): Promise<SourceAsset | undefined> {
    return getRow<SourceAsset>(this.db, `SELECT * FROM ${TABLE} WHERE id = ?`, [id], JSON_FIELDS);
  }

  async list(): Promise<SourceAsset[]> {
    return listRows<SourceAsset>(this.db, `SELECT * FROM ${TABLE} ORDER BY created_at`, [], JSON_FIELDS);
  }

  async listByProject(projectId: string): Promise<SourceAsset[]> {
    return listRows<SourceAsset>(
      this.db,
      `SELECT * FROM ${TABLE} WHERE project_id = ? ORDER BY created_at`,
      [projectId],
      JSON_FIELDS,
    );
  }

  async update(id: string, patch: Partial<SourceAsset>): Promise<SourceAsset> {
    const existing = await this.get(id);
    if (existing === undefined) {
      throw new CrexError("SOURCE_NOT_FOUND", `source ${id} not found`);
    }
    const merged = sourceAssetSchema.parse({
      ...existing,
      ...patch,
      id,
      updated_at: new Date().toISOString(),
    });
    const entries = Object.entries(merged);
    const setList = entries
      .map(([column]) => `${column} = ?`)
      .join(", ");
    const values = entries.map(([, value]) => toDbValue(value));
    await this.db.prepare(`UPDATE ${TABLE} SET ${setList} WHERE id = ?`).run(...values, id);
    return merged;
  }

  async transition(id: string, to: SourceState, opts: { onlyIfIn?: SourceState[] } = {}): Promise<SourceAsset> {
    const allowedFrom = opts.onlyIfIn ?? DEFAULT_ALLOWED_FROM[to] ?? [];
    let changed = 0;
    if (allowedFrom.length > 0) {
      const placeholderList = allowedFrom.map(() => "?").join(", ");
      changed = (
        await this.db
          .prepare(`UPDATE ${TABLE} SET status = ?, updated_at = ? WHERE id = ? AND status IN (${placeholderList})`)
          .run(to, new Date().toISOString(), id, ...allowedFrom)
      ).changes;
    }
    if (changed !== 1) {
      const current = await this.get(id);
      if (current === undefined) {
        throw new CrexError("SOURCE_NOT_FOUND", `source ${id} not found`);
      }
      throw new CrexError("INVALID_SOURCE_STATE", `cannot transition source ${id} from ${current.status} to ${to}`, {
        details: { from: current.status, to },
      });
    }
    const updated = await this.get(id);
    if (updated === undefined) {
      throw new CrexError("SOURCE_NOT_FOUND", `source ${id} not found`);
    }
    return updated;
  }
}