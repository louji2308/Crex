import { D1Adapter } from "@crex/infra";
import { GeneratedAssetRepository } from "@crex/db/src/repositories/generated-assets";
import { GeneratedComponentRepository } from "@crex/db/src/repositories/generated-components";
import { CrexError } from "@crex/core/src/errors";
import {
  aiConfigured,
  buildProviderOptions,
} from "./workflows/ai-output";
import { runGeneration } from "./pipelines/generation";
import { errorResponse } from "./http";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

async function projectExists(
  db: D1Adapter,
  projectId: string,
): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 AS found FROM projects WHERE id = ?")
    .get(projectId);
  return row !== undefined;
}

export interface GenerationApi {
  handle(request: Request, path: string): Promise<Response | null>;
}

export function createGenerationApi(env: Env): GenerationApi {
  const db = new D1Adapter(env.DB);
  const assetsRepo = new GeneratedAssetRepository(db);
  const componentsRepo = new GeneratedComponentRepository(db);
  const options = buildProviderOptions(env);

  async function handleGenerate(request: Request): Promise<Response> {
    let body: { projectId?: unknown; assetTypes?: unknown } = {};
    try {
      body = (await request.json()) as { projectId?: unknown; assetTypes?: unknown };
    } catch {
      throw new CrexError("INVALID_BODY", "request body must be valid JSON");
    }

    const { projectId, assetTypes } = body;
    if (typeof projectId !== "string" || !isUuid(projectId)) {
      throw new CrexError("INVALID_PROJECT_ID", "projectId must be a canonical UUID");
    }
    if (!(await projectExists(db, projectId))) {
      throw new CrexError("PROJECT_NOT_FOUND", `project not found: ${projectId}`);
    }
    if (assetTypes !== undefined && !Array.isArray(assetTypes)) {
      throw new CrexError("INVALID_ASSET_TYPES", "assetTypes must be an array of strings");
    }
    if (assetTypes !== undefined) {
      for (const t of assetTypes) {
        if (typeof t !== "string") {
          throw new CrexError("INVALID_ASSET_TYPES", "assetTypes must be an array of strings");
        }
      }
    }

    if (!aiConfigured(options)) {
      throw new CrexError("AI_NOT_CONFIGURED", "no AI provider API key is configured");
    }

    const result = await runGeneration(
      { db, now: () => new Date().toISOString(), uuid: () => crypto.randomUUID() },
      projectId,
      options,
      Array.isArray(assetTypes) ? (assetTypes as string[]) : undefined,
    );

    return Response.json(result, { status: 201 });
  }

  async function handleGetAsset(id: string): Promise<Response> {
    const asset = await assetsRepo.get(id);
    if (asset === undefined) {
      throw new CrexError("GENERATED_ASSET_NOT_FOUND", `generated asset not found: ${id}`);
    }
    const components = await componentsRepo.listByAsset(id);
    return Response.json({ asset, components });
  }

  async function handleListByProject(url: URL): Promise<Response> {
    const projectId = url.searchParams.get("projectId");
    if (projectId === null || !isUuid(projectId)) {
      throw new CrexError("INVALID_PROJECT_ID", "projectId must be a canonical UUID");
    }
    if (!(await projectExists(db, projectId))) {
      throw new CrexError("PROJECT_NOT_FOUND", `project not found: ${projectId}`);
    }
    const items = await assetsRepo.listByProject(projectId);
    return Response.json({ assets: items });
  }

  return {
    async handle(request: Request, path: string): Promise<Response | null> {
      try {
        return await dispatch(request, path);
      } catch (error) {
        return errorResponse(error);
      }
    },
  };

  async function dispatch(request: Request, path: string): Promise<Response | null> {
    const url = new URL(request.url);

    if (request.method === "POST" && path === "/generate") {
      return await handleGenerate(request);
    }

    if (request.method === "GET" && path === "/generate") {
      return await handleListByProject(url);
    }

    const assetMatch = /^\/generate\/([^/]+)$/.exec(path);
    if (request.method === "GET" && assetMatch !== null) {
      const rawId = assetMatch[1];
      if (rawId === undefined) return null;
      const id = decodeURIComponent(rawId);
      if (!isUuid(id)) return null;
      return await handleGetAsset(id);
    }

    return null;
  }
}
