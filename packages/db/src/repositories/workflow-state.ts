import { workflowStateSchema } from "@crex/schemas";
import type { WorkflowState } from "@crex/schemas";
import type { SqlDb } from "../sqlite";
import { getRow, insertRow, listRows } from "./shared";

const TABLE = "workflow_state";
const JSON_FIELDS = [] as const;

export class WorkflowStateRepository {
  private readonly db: SqlDb;

  constructor(db: SqlDb) {
    this.db = db;
  }

  async insert(state: WorkflowState): Promise<WorkflowState> {
    const parsed = workflowStateSchema.parse(state);
    await insertRow(this.db, TABLE, parsed);
    return parsed;
  }

  async get(id: string): Promise<WorkflowState | undefined> {
    return getRow<WorkflowState>(this.db, `SELECT * FROM ${TABLE} WHERE id = ?`, [id], JSON_FIELDS);
  }

  async list(): Promise<WorkflowState[]> {
    return listRows<WorkflowState>(this.db, `SELECT * FROM ${TABLE} ORDER BY created_at`, [], JSON_FIELDS);
  }

  async listByProject(projectId: string): Promise<WorkflowState[]> {
    return listRows<WorkflowState>(
      this.db,
      `SELECT * FROM ${TABLE} WHERE project_id = ? ORDER BY created_at`,
      [projectId],
      JSON_FIELDS,
    );
  }
}