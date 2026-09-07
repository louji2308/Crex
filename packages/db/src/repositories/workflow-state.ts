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

  insert(state: WorkflowState): WorkflowState {
    const parsed = workflowStateSchema.parse(state);
    insertRow(this.db, TABLE, parsed);
    return parsed;
  }

  get(id: string): WorkflowState | undefined {
    return getRow<WorkflowState>(this.db, `SELECT * FROM ${TABLE} WHERE id = ?`, [id], JSON_FIELDS);
  }

  list(): WorkflowState[] {
    return listRows<WorkflowState>(this.db, `SELECT * FROM ${TABLE} ORDER BY created_at`, [], JSON_FIELDS);
  }

  listByProject(projectId: string): WorkflowState[] {
    return listRows<WorkflowState>(
      this.db,
      `SELECT * FROM ${TABLE} WHERE project_id = ? ORDER BY created_at`,
      [projectId],
      JSON_FIELDS,
    );
  }
}