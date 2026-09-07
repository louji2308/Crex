import { CrexError } from "@crex/core/src/errors";
import type { SqlDb } from "../sqlite";
import { getRow, insertRow } from "./shared";

const TABLE = "source_uploads";

export type SourceUploadStatus = "UPLOADING" | "UPLOADED" | "FAILED";

export interface SourceUpload {
  id: string;
  projectId: string;
  objectKey: string;
  fileName: string;
  fileType: string;
  status: SourceUploadStatus;
  error: string;
  createdAt: string;
  updatedAt: string;
}

interface SourceUploadRow {
  id: string;
  project_id: string;
  object_key: string;
  file_name: string;
  file_type: string;
  status: SourceUploadStatus;
  error: string;
  created_at: string;
  updated_at: string;
}

function toSourceUpload(row: SourceUploadRow): SourceUpload {
  return {
    id: row.id,
    projectId: row.project_id,
    objectKey: row.object_key,
    fileName: row.file_name,
    fileType: row.file_type,
    status: row.status,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SourceUploadRepository {
  private readonly db: SqlDb;

  constructor(db: SqlDb) {
    this.db = db;
  }

  async begin(input: {
    id: string;
    projectId: string;
    objectKey: string;
    fileName: string;
    fileType: string;
  }): Promise<SourceUpload> {
    const now = new Date().toISOString();
    const row: SourceUploadRow = {
      id: input.id,
      project_id: input.projectId,
      object_key: input.objectKey,
      file_name: input.fileName,
      file_type: input.fileType,
      status: "UPLOADING",
      error: "",
      created_at: now,
      updated_at: now,
    };
    await insertRow(this.db, TABLE, row as unknown as Record<string, unknown>);
    return toSourceUpload(row);
  }

  async get(id: string): Promise<SourceUpload | null> {
    const row = await getRow<SourceUploadRow>(this.db, `SELECT * FROM ${TABLE} WHERE id = ?`, [id]);
    return row === undefined ? null : toSourceUpload(row);
  }

  async markUploaded(id: string): Promise<SourceUpload> {
    const changed = (
      await this.db.prepare(`UPDATE ${TABLE} SET status = 'UPLOADED', updated_at = ? WHERE id = ?`).run(
        new Date().toISOString(),
        id,
      )
    ).changes;
    if (changed !== 1) {
      throw new CrexError("UPLOAD_NOT_FOUND", `source upload ${id} not found`);
    }
    const updated = await this.get(id);
    if (updated === null) {
      throw new CrexError("UPLOAD_NOT_FOUND", `source upload ${id} not found`);
    }
    return updated;
  }

  async markFailed(id: string, error: string): Promise<SourceUpload> {
    const changed = (
      await this.db
        .prepare(`UPDATE ${TABLE} SET status = 'FAILED', error = ?, updated_at = ? WHERE id = ?`)
        .run(error, new Date().toISOString(), id)
    ).changes;
    if (changed !== 1) {
      throw new CrexError("UPLOAD_NOT_FOUND", `source upload ${id} not found`);
    }
    const updated = await this.get(id);
    if (updated === null) {
      throw new CrexError("UPLOAD_NOT_FOUND", `source upload ${id} not found`);
    }
    return updated;
  }
}