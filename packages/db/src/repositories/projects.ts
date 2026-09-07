import { projectSchema } from "@crex/schemas";
import type { Project } from "@crex/schemas";
import type { SqlDb } from "../sqlite";
import { getRow, insertRow, listRows } from "./shared";

const TABLE = "projects";
const JSON_FIELDS = ["target_platforms", "audience"] as const;

export class ProjectRepository {
  private readonly db: SqlDb;

  constructor(db: SqlDb) {
    this.db = db;
  }

  insert(project: Project): Project {
    const parsed = projectSchema.parse(project);
    insertRow(this.db, TABLE, parsed);
    return parsed;
  }

  get(id: string): Project | undefined {
    return getRow<Project>(this.db, `SELECT * FROM ${TABLE} WHERE id = ?`, [id], JSON_FIELDS);
  }

  list(): Project[] {
    return listRows<Project>(this.db, `SELECT * FROM ${TABLE} ORDER BY created_at`, [], JSON_FIELDS);
  }
}