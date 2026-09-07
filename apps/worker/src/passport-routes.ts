import { D1Adapter } from "@crex/infra";
import { ReleasePassportRepository } from "@crex/db/src/repositories/release-passports";
import { CrexError } from "@crex/core/src/errors";
import { errorResponse } from "./http";
import { buildReleasePassport, type PassportDeps } from "./pipelines/passport";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Determines whether a string is a valid canonical UUID.
 *
 * @param value - The string to validate
 * @returns `true` if `value` is a canonical UUID, `false` otherwise.
 */
function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/**
 * Passport HTTP API.
 *
 * Routes (documented contract):
 *   POST /passports                    body {projectId, assetId}   -> 201 { passport }
 *   GET  /passports?projectId=<uuid>   -> 200 { passports }
 *   GET  /passports/:id                -> 200 { passport }  | 404 PASSPORT_NOT_FOUND
 *   GET  /passports/:assetId/latest    -> 200 { passport }  | 404 PASSPORT_NOT_FOUND
 *
 * Every route is deterministic and reflects persisted verification, integrity,
 * and provenance state. No AI and no fabricated data.
 */
export interface PassportApiDeps {
  now: () => string;
  uuid: () => string;
  projectExists: (projectId: string) => Promise<boolean>;
}

export interface PassportApi {
  handle(request: Request, path: string): Promise<Response | null>;
}

/**
 * Creates a passport API backed by the provided environment.
 *
 * @param env - The Worker environment containing the database binding
 * @param deps - Optional overrides for time, UUID, and project existence checks
 * @returns An API for handling release-passport requests
 */
export function createPassportApi(env: Env, deps?: Partial<PassportApiDeps>): PassportApi {
  const db = new D1Adapter(env.DB);
  const passportRepo = new ReleasePassportRepository(db);

  const resolved: PassportApiDeps = {
    now: deps?.now ?? (() => new Date().toISOString()),
    uuid: deps?.uuid ?? (() => crypto.randomUUID()),
    projectExists:
      deps?.projectExists ??
      (async (projectId: string) => {
        const row = await db.prepare("SELECT 1 AS found FROM projects WHERE id = ?").get(projectId);
        return row !== undefined;
      }),
  };

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

    if (request.method === "POST" && path === "/passports") {
      return await handleCreate(request);
    }

    if (request.method === "GET" && path === "/passports") {
      return await handleList(url);
    }

    const latestMatch = /^\/passports\/([^/]+)\/latest$/.exec(path);
    if (request.method === "GET" && latestMatch !== null) {
      const assetId = decodeURIComponent(latestMatch[1]!);
      return await handleLatest(assetId);
    }

    const getMatch = /^\/passports\/([^/]+)$/.exec(path);
    if (request.method === "GET" && getMatch !== null) {
      const id = decodeURIComponent(getMatch[1]!);
      return await handleGet(id);
    }

    return null;
  }

  async function handleCreate(request: Request): Promise<Response> {
    let body: { projectId?: unknown; assetId?: unknown } = {};
    try {
      body = await request.json() as { projectId?: unknown; assetId?: unknown };
    } catch {
      throw new CrexError("INVALID_BODY", "request body must be valid JSON");
    }
    const { projectId, assetId } = body;
    if (typeof projectId !== "string" || !isUuid(projectId)) {
      throw new CrexError("INVALID_PROJECT_ID", "projectId must be a canonical UUID");
    }
    if (typeof assetId !== "string" || !isUuid(assetId)) {
      throw new CrexError("INVALID_ASSET_ID", "assetId must be a canonical UUID");
    }
    if (!(await resolved.projectExists(projectId))) {
      throw new CrexError("PROJECT_NOT_FOUND", `project not found: ${projectId}`);
    }

    const passportDeps: PassportDeps = {
      db,
      now: resolved.now,
      uuid: resolved.uuid,
    };

    const passport = await buildReleasePassport(passportDeps, { projectId, assetId });
    return Response.json({ passport }, { status: 201 });
  }

  async function handleList(url: URL): Promise<Response> {
    const projectId = url.searchParams.get("projectId");
    if (projectId === null || !isUuid(projectId)) {
      throw new CrexError(
        "INVALID_PROJECT_ID",
        "projectId query parameter must be a canonical UUID",
      );
    }
    if (!(await resolved.projectExists(projectId))) {
      throw new CrexError("PROJECT_NOT_FOUND", `project not found: ${projectId}`);
    }
    const passports = await passportRepo.listByProject(projectId);
    return Response.json({ passports });
  }

  async function handleGet(id: string): Promise<Response> {
    if (!isUuid(id)) {
      throw new CrexError("PASSPORT_NOT_FOUND", `passport not found: ${id}`);
    }
    const passport = await passportRepo.get(id);
    if (passport === undefined) {
      throw new CrexError("PASSPORT_NOT_FOUND", `passport not found: ${id}`);
    }
    return Response.json({ passport });
  }

  async function handleLatest(assetId: string): Promise<Response> {
    if (!isUuid(assetId)) {
      throw new CrexError("PASSPORT_NOT_FOUND", `no passport found for asset: ${assetId}`);
    }
    const passport = await passportRepo.getLatestByAsset(assetId);
    if (passport === undefined) {
      throw new CrexError("PASSPORT_NOT_FOUND", `no passport found for asset: ${assetId}`);
    }
    return Response.json({ passport });
  }
}