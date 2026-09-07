import { D1Adapter, R2ObjectStore } from "@crex/infra";
import type { R2BucketBinding } from "@crex/infra";
import { SourceAssetRepository } from "@crex/db/src/repositories/source-assets";
import { ProvenanceRepository } from "@crex/db/src/repositories/provenance";
import { createProvenanceService } from "./provenance";
import type { ProvenanceService } from "./provenance";

export interface ProvenanceApi {
  handle(request: Request, path: string): Promise<Response | null>;
}

export function createProvenanceApi(env: Env): ProvenanceApi {
  const db = new D1Adapter(env.DB);
  const r2 = new R2ObjectStore(env.MEDIA as unknown as R2BucketBinding);
  const provenanceRepo = new ProvenanceRepository(db);
  const sourceRepo = new SourceAssetRepository(db);

  const service = createProvenanceService(provenanceRepo, sourceRepo, {
    now: () => new Date().toISOString(),
    uuid: () => crypto.randomUUID(),
    projectExists: async (projectId) => {
      const row = await db.prepare("SELECT 1 AS found FROM projects WHERE id = ?").get(projectId);
      return row !== undefined;
    },
    getSourceAsset: (id) => sourceRepo.get(id),
    getObjectBytes: async (key) => {
      const obj = await r2.get(key);
      if (obj === null || obj.body === null) return null;
      const chunks: Uint8Array[] = [];
      const reader = obj.body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      const total = chunks.reduce((n, c) => n + c.length, 0);
      const merged = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }
      return merged;
    },
  });

  return { handle };

  async function handle(request: Request, path: string): Promise<Response | null> {
    const method = request.method;

    if (method === "POST" && path === "/provenance/records") {
      return handleCreateRecord(request);
    }

    const recordMatch = path.match(/^\/provenance\/records\/(.+)$/i);
    if (method === "GET" && recordMatch !== null && recordMatch[1] !== undefined) {
      return handleGetRecord(recordMatch[1]);
    }

    if (method === "GET" && path === "/provenance/verify") {
      return handleVerify(request);
    }

    return null;
  }

  async function handleCreateRecord(request: Request): Promise<Response> {
    let body: { asset_id?: unknown; project_id?: unknown; title?: unknown } = {};
    try {
      body = await request.json() as typeof body;
    } catch {
      return errorResp("INVALID_BODY", "request body must be valid JSON");
    }

    const { asset_id: assetId, project_id: projectId, title } = body;

    if (typeof assetId !== "string" || !isUuid(assetId)) {
      return errorResp("INVALID_ASSET_ID", "asset_id must be a canonical UUID");
    }
    if (typeof projectId !== "string" || !isUuid(projectId)) {
      return errorResp("INVALID_PROJECT_ID", "project_id must be a canonical UUID");
    }
    if (typeof title !== "string" || title.trim().length === 0) {
      return errorResp("INVALID_TITLE", "title must be a non-empty string");
    }

    const projectRow = await db.prepare("SELECT 1 AS found FROM projects WHERE id = ?").get(projectId);
    if (projectRow === undefined) {
      return errorResp("PROJECT_NOT_FOUND", `project not found: ${projectId}`);
    }

    try {
      const record = await service.createRecord({
        assetId,
        projectId,
        title: title as string,
      });
      return Response.json(record, { status: 201 });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.startsWith("PROVENANCE_RECORD_EXISTS:")) {
        const existingId = msg.split(":")[1];
        return errorResp(
          "PROVENANCE_RECORD_EXISTS",
          `provenance record already exists for asset ${assetId}: ${existingId}`,
        );
      }
      if (msg === "SOURCE_NOT_FOUND") {
        return errorResp("SOURCE_NOT_FOUND", `source asset not found: ${assetId}`);
      }
      if (msg === "INVALID_SOURCE_STATE") {
        return errorResp(
          "INVALID_SOURCE_STATE",
          `source ${assetId} does not belong to project ${projectId}`,
        );
      }
      throw error;
    }
  }

  async function handleGetRecord(id: string): Promise<Response> {
    if (!isUuid(id)) {
      return errorResp("INVALID_RECORD_ID", "record id must be a canonical UUID");
    }

    const record = await service.getRecord(id);
    if (record === undefined) {
      return errorResp("PROVENANCE_NOT_FOUND", `provenance record not found: ${id}`);
    }

    return Response.json(record);
  }

  async function handleVerify(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const assetId = url.searchParams.get("asset_id");

    if (assetId === null || !isUuid(assetId)) {
      return errorResp("INVALID_ASSET_ID", "asset_id query parameter is required and must be a canonical UUID");
    }

    try {
      const result = await service.verifyAsset(assetId);
      return Response.json(result);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg === "SOURCE_NOT_FOUND") {
        return errorResp("SOURCE_NOT_FOUND", `source asset not found: ${assetId}`);
      }
      if (msg === "STORAGE_READ_FAILED") {
        return errorResp("STORAGE_READ_FAILED", `could not read source object from R2`);
      }
      throw error;
    }
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function errorResp(code: string, message: string): Response {
  return new Response(
    JSON.stringify({ error: { code, message } }),
    { status: STATUS_BY_CODE[code] ?? 500, headers: { "Content-Type": "application/json" } },
  );
}

const STATUS_BY_CODE: Record<string, number> = {
  INVALID_BODY: 400,
  INVALID_ASSET_ID: 400,
  INVALID_PROJECT_ID: 400,
  INVALID_RECORD_ID: 400,
  INVALID_TITLE: 400,
  PROJECT_NOT_FOUND: 404,
  SOURCE_NOT_FOUND: 404,
  PROVENANCE_NOT_FOUND: 404,
  PROVENANCE_RECORD_EXISTS: 409,
  INVALID_SOURCE_STATE: 409,
  STORAGE_READ_FAILED: 500,
};
