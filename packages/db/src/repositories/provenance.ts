import type { SqlDb, SqlValue } from "../sqlite";
import { getRow, insertRow, listRows, toDbValue } from "./shared";

const TABLE = "provenance_records";

export interface ProvenanceManifest {
  manifest_json: Record<string, unknown>;
  signer?: { name: string; issuer: string };
  embedded_at?: string;
  signature_verified: boolean;
}

export interface ProvenanceRow {
  id: string;
  project_id: string;
  asset_id: string;
  asset_sha256: string;
  signing_status: "UNSIGNED" | "SIGNING" | "SIGNED" | "FAILED";
  verification_status: "VALID" | "INVALID" | "UNSIGNED" | "UNTRUSTED" | "MISSING";
  manifest: ProvenanceManifest | undefined;
  created_at: string;
  updated_at: string;
}

interface DbRow extends Record<string, SqlValue> {
  id: string;
  project_id: string;
  asset_id: string;
  asset_sha256: string;
  signing_status: string;
  verification_status: string;
  c2pa_manifest_json: string | null;
  c2pa_signer_json: string | null;
  created_at: string;
  updated_at: string;
}

function decodeRow(row: DbRow): ProvenanceRow {
  let manifest: ProvenanceManifest | undefined;
  const manifestJson = row.c2pa_manifest_json;
  const signerJson = row.c2pa_signer_json;

  if (manifestJson != null) {
    const parsed = typeof manifestJson === "string" ? JSON.parse(manifestJson) : manifestJson;
    const signer =
      signerJson != null
        ? typeof signerJson === "string"
          ? JSON.parse(signerJson)
          : signerJson
        : undefined;
    manifest = { ...parsed, signer } as ProvenanceManifest;
  }

  return {
    id: row.id,
    project_id: row.project_id,
    asset_id: row.asset_id,
    asset_sha256: row.asset_sha256,
    signing_status: row.signing_status as ProvenanceRow["signing_status"],
    verification_status: row.verification_status as ProvenanceRow["verification_status"],
    manifest,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function encodeRow(row: Record<string, unknown>): Record<string, unknown> {
  const encoded: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (key === "manifest" && value !== undefined && value !== null) {
      const manifest = value as ProvenanceManifest;
      encoded.c2pa_manifest_json = JSON.stringify({ manifest_json: manifest.manifest_json });
      if (manifest.signer !== undefined) {
        encoded.c2pa_signer_json = JSON.stringify(manifest.signer);
      }
      if (manifest.embedded_at !== undefined) {
        encoded.c2pa_manifest_json = JSON.stringify({
          manifest_json: manifest.manifest_json,
          embedded_at: manifest.embedded_at,
        });
      }
      if (manifest.signature_verified !== undefined) {
        const existing = JSON.parse(encoded.c2pa_manifest_json as string);
        existing.signature_verified = manifest.signature_verified;
        encoded.c2pa_manifest_json = JSON.stringify(existing);
      }
    } else {
      encoded[key] = value;
    }
  }
  return encoded;
}

export interface CreateProvenanceInput {
  id: string;
  project_id: string;
  asset_id: string;
  asset_sha256: string;
  signing_status: "UNSIGNED" | "SIGNING" | "SIGNED" | "FAILED";
  verification_status: "VALID" | "INVALID" | "UNSIGNED" | "UNTRUSTED" | "MISSING";
}

export class ProvenanceRepository {
  private readonly db: SqlDb;

  constructor(db: SqlDb) {
    this.db = db;
  }

  async createProvisionally(input: CreateProvenanceInput): Promise<ProvenanceRow> {
    const now = new Date().toISOString();
    const fields: Record<string, unknown> = {
      id: input.id,
      project_id: input.project_id,
      asset_id: input.asset_id,
      asset_sha256: input.asset_sha256,
      signing_status: input.signing_status,
      verification_status: input.verification_status,
      created_at: now,
      updated_at: now,
    };
    await insertRow(this.db, TABLE, fields);
    return this.getById(input.id) as Promise<ProvenanceRow>;
  }

  async getById(id: string): Promise<ProvenanceRow | undefined> {
    const row = await getRow<DbRow>(this.db, `SELECT * FROM ${TABLE} WHERE id = ?`, [id]);
    return row === undefined ? undefined : decodeRow(row);
  }

  async getByAssetId(assetId: string): Promise<ProvenanceRow[]> {
    const rows = await listRows<DbRow>(
      this.db,
      `SELECT * FROM ${TABLE} WHERE asset_id = ? ORDER BY created_at DESC, id DESC`,
      [assetId],
    );
    return rows.map(decodeRow);
  }

  async getLatestByAssetId(assetId: string): Promise<ProvenanceRow | undefined> {
    const row = await getRow<DbRow>(
      this.db,
      `SELECT * FROM ${TABLE} WHERE asset_id = ? ORDER BY created_at DESC, id DESC LIMIT 1`,
      [assetId],
    );
    return row === undefined ? undefined : decodeRow(row);
  }

  async setManifest(
    id: string,
    manifest: ProvenanceManifest,
  ): Promise<ProvenanceRow> {
    const now = new Date().toISOString();
    const encoded = encodeRow({ manifest });
    await this.db
      .prepare(
        `UPDATE ${TABLE} SET c2pa_manifest_json = ?, c2pa_signer_json = ?, updated_at = ? WHERE id = ?`,
      )
      .run(
        (encoded.c2pa_manifest_json as SqlValue) ?? null,
        (encoded.c2pa_signer_json as SqlValue) ?? null,
        now,
        id,
      );
    const updated = await this.getById(id);
    if (updated === undefined) {
      throw new Error(`PROVENANCE_NOT_FOUND: ${id}`);
    }
    return updated;
  }

  async setSigningStatus(
    id: string,
    status: "UNSIGNED" | "SIGNING" | "SIGNED" | "FAILED",
  ): Promise<ProvenanceRow> {
    const now = new Date().toISOString();
    await this.db
      .prepare(`UPDATE ${TABLE} SET signing_status = ?, updated_at = ? WHERE id = ?`)
      .run(status, now, id);
    const updated = await this.getById(id);
    if (updated === undefined) {
      throw new Error(`PROVENANCE_NOT_FOUND: ${id}`);
    }
    return updated;
  }

  async setVerificationStatus(
    id: string,
    status: "VALID" | "INVALID" | "UNSIGNED" | "UNTRUSTED" | "MISSING",
  ): Promise<ProvenanceRow> {
    const now = new Date().toISOString();
    await this.db
      .prepare(`UPDATE ${TABLE} SET verification_status = ?, updated_at = ? WHERE id = ?`)
      .run(status, now, id);
    const updated = await this.getById(id);
    if (updated === undefined) {
      throw new Error(`PROVENANCE_NOT_FOUND: ${id}`);
    }
    return updated;
  }

  async listByProjectId(projectId: string): Promise<ProvenanceRow[]> {
    const rows = await listRows<DbRow>(
      this.db,
      `SELECT * FROM ${TABLE} WHERE project_id = ? ORDER BY created_at DESC`,
      [projectId],
    );
    return rows.map(decodeRow);
  }
}
