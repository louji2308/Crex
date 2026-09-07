import { D1Adapter } from "@crex/infra";
import { VerificationRunRepository } from "@crex/db/src/repositories/verification-runs";
import { VerificationFindingRepository } from "@crex/db/src/repositories/verification-findings";
import type { VerificationRun, VerificationFinding } from "@crex/schemas";
import { CrexError } from "@crex/core/src/errors";
import { errorResponse } from "./http";
import { runVerification, type VerificationDeps } from "./pipelines/verification";

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

export interface VerificationApiDeps {
  now: () => string;
  uuid: () => string;
  projectExists: (projectId: string) => Promise<boolean>;
}

export interface VerificationApi {
  handle(request: Request, path: string): Promise<Response | null>;
}

export function createVerificationApi(env: Env, deps?: Partial<VerificationApiDeps>): VerificationApi {
  const db = new D1Adapter(env.DB);
  const runRepo = new VerificationRunRepository(db);
  const findingRepo = new VerificationFindingRepository(db);

  const resolved: VerificationApiDeps = {
    now: deps?.now ?? (() => new Date().toISOString()),
    uuid: deps?.uuid ?? (() => crypto.randomUUID()),
    projectExists: deps?.projectExists ?? ((projectId: string) => projectExists(db, projectId)),
  };

  async function handleVerify(request: Request): Promise<Response> {
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

    const verificationDeps: VerificationDeps = {
      db,
      now: resolved.now,
      uuid: resolved.uuid,
    };

    const result = await runVerification(verificationDeps, { projectId, assetId });

    const run = await runRepo.get(result.runId);
    return Response.json(run ?? { id: result.runId, result: result.result }, { status: 201 });
  }

  async function handleGetRun(id: string): Promise<Response> {
    if (!isUuid(id)) {
      throw new CrexError("VERIFICATION_RUN_NOT_FOUND", `verification run not found: ${id}`);
    }
    const run = await runRepo.get(id);
    if (run === undefined) {
      throw new CrexError("VERIFICATION_RUN_NOT_FOUND", `verification run not found: ${id}`);
    }
    const findings = await findingRepo.listByRun(id);
    return Response.json({ run, findings });
  }

  async function handleListRuns(url: URL): Promise<Response> {
    const projectId = url.searchParams.get("projectId");
    if (projectId === null || !isUuid(projectId)) {
      throw new CrexError("INVALID_PROJECT_ID", "projectId must be a canonical UUID");
    }
    if (!(await resolved.projectExists(projectId))) {
      throw new CrexError("PROJECT_NOT_FOUND", `project not found: ${projectId}`);
    }
    const runs = await runRepo.list();
    const filtered = runs.filter((r) => r.project_id === projectId);
    return Response.json({ runs: filtered });
  }

  async function handleListFindings(runId: string): Promise<Response> {
    if (!isUuid(runId)) {
      throw new CrexError("VERIFICATION_RUN_NOT_FOUND", `verification run not found: ${runId}`);
    }
    const run = await runRepo.get(runId);
    if (run === undefined) {
      throw new CrexError("VERIFICATION_RUN_NOT_FOUND", `verification run not found: ${runId}`);
    }
    const findings = await findingRepo.listByRun(runId);
    return Response.json({ findings });
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

    if (request.method === "POST" && path === "/verify") {
      return await handleVerify(request);
    }

    if (request.method === "GET" && path === "/verify") {
      return await handleListRuns(url);
    }

    const findingsMatch = /^\/verify\/findings\/([^/]+)$/.exec(path);
    if (request.method === "GET" && findingsMatch !== null) {
      const runId = decodeURIComponent(findingsMatch[1]!);
      return await handleListFindings(runId);
    }

    const runMatch = /^\/verify\/([^/]+)$/.exec(path);
    if (request.method === "GET" && runMatch !== null) {
      const id = decodeURIComponent(runMatch[1]!);
      return await handleGetRun(id);
    }

    return null;
  }
}
