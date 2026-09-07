import { D1Adapter } from "@crex/infra";
import { RepairActionRepository } from "@crex/db/src/repositories/repair-actions";
import { VerificationRunRepository } from "@crex/db/src/repositories/verification-runs";
import { VerificationFindingRepository } from "@crex/db/src/repositories/verification-findings";
import { CrexError } from "@crex/core/src/errors";
import { errorResponse } from "./http";
import { runRepair, applyRepair, type RepairDeps } from "./pipelines/repair";
import { runReverify } from "./pipelines/reverification";

/**
 * Repair + re-verification API.
 *
 * Routes:
 *   POST /repair            {projectId, assetId, runId?}
 *                           -> runRepair, 201 { runId, actions }
 *   POST /repair/:actionId/apply
 *                           {projectId}
 *                           -> applyRepair, 200 { action }
 *   POST /reverify          {projectId, assetId, runId?}
 *                           -> runReverify, 201
 *                              { previousRunId, reverificationRunId, result,
 *                                findingCount, appliedActionCount, proposedActionCount }
 *   GET  /repair/actions?assetId=<uuid>
 *       | /repair/actions?runId=<uuid>
 *                           -> list actions, 200 { actions }
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

async function projectExists(db: D1Adapter, projectId: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 AS found FROM projects WHERE id = ?")
    .get(projectId);
  return row !== undefined;
}

export interface RepairApiDeps {
  now: () => string;
  uuid: () => string;
  projectExists: (projectId: string) => Promise<boolean>;
}

export interface RepairApi {
  handle(request: Request, path: string): Promise<Response | null>;
}

export function createRepairApi(env: Env, deps?: Partial<RepairApiDeps>): RepairApi {
  const db = new D1Adapter(env.DB);

  const resolved: RepairApiDeps = {
    now: deps?.now ?? (() => new Date().toISOString()),
    uuid: deps?.uuid ?? (() => crypto.randomUUID()),
    projectExists: deps?.projectExists ?? ((projectId: string) => projectExists(db, projectId)),
  };

  function repairDeps(): RepairDeps {
    return { db, now: resolved.now, uuid: resolved.uuid };
  }

  interface RepairBody {
    projectId?: unknown;
    assetId?: unknown;
    runId?: unknown;
  }

  async function parseRepairBody(request: Request): Promise<RepairBody> {
    let body: RepairBody = {};
    try {
      body = await request.json() as RepairBody;
    } catch {
      throw new CrexError("INVALID_BODY", "request body must be valid JSON");
    }
    const { projectId, assetId, runId } = body;
    if (typeof projectId !== "string" || !isUuid(projectId)) {
      throw new CrexError("INVALID_PROJECT_ID", "projectId must be a canonical UUID");
    }
    if (typeof assetId !== "string" || !isUuid(assetId)) {
      throw new CrexError("INVALID_ASSET_ID", "assetId must be a canonical UUID");
    }
    if (runId !== undefined && (typeof runId !== "string" || !isUuid(runId))) {
      throw new CrexError("INVALID_REPAIR_REQUEST", "runId must be a canonical UUID");
    }
    if (!(await resolved.projectExists(projectId))) {
      throw new CrexError("PROJECT_NOT_FOUND", `project not found: ${projectId}`);
    }
    return { projectId, assetId, runId };
  }

  async function handleRepair(request: Request): Promise<Response> {
    const body = await parseRepairBody(request);
    const result = await runRepair(repairDeps(), {
      projectId: body.projectId as string,
      assetId: body.assetId as string,
      ...(body.runId === undefined ? {} : { runId: body.runId as string }),
    });
    return Response.json({ runId: result.runId, actions: result.actions }, { status: 201 });
  }

  async function handleApply(actionId: string, request: Request): Promise<Response> {
    if (!isUuid(actionId)) {
      throw new CrexError("REPAIR_ACTION_NOT_FOUND", `repair action not found: ${actionId}`);
    }
    let body: { projectId?: unknown } = {};
    try {
      body = await request.json() as { projectId?: unknown };
    } catch {
      throw new CrexError("INVALID_BODY", "request body must be valid JSON");
    }
    if (typeof body.projectId !== "string" || !isUuid(body.projectId)) {
      throw new CrexError("INVALID_PROJECT_ID", "projectId must be a canonical UUID");
    }
    const action = await applyRepair(repairDeps(), {
      projectId: body.projectId,
      actionId,
    });
    return Response.json({ action });
  }

  async function handleReverify(request: Request): Promise<Response> {
    const body = await parseRepairBody(request);
    const result = await runReverify(repairDeps(), {
      projectId: body.projectId as string,
      assetId: body.assetId as string,
      ...(body.runId === undefined ? {} : { runId: body.runId as string }),
    });
    return Response.json(result, { status: 201 });
  }

  async function handleListActions(url: URL): Promise<Response> {
    const assetId = url.searchParams.get("assetId");
    const runId = url.searchParams.get("runId");
    const runRepo = new VerificationRunRepository(db);
    const findingRepo = new VerificationFindingRepository(db);
    const repairRepo = new RepairActionRepository(db);

    if (assetId !== null) {
      if (!isUuid(assetId)) {
        throw new CrexError("INVALID_ASSET_ID", "assetId must be a canonical UUID");
      }
      const actions = await repairRepo.listByAsset(assetId);
      return Response.json({ actions });
    }
    if (runId !== null) {
      if (!isUuid(runId)) {
        throw new CrexError("INVALID_REPAIR_REQUEST", "runId must be a canonical UUID");
      }
      const run = await runRepo.get(runId);
      if (run === undefined) {
        throw new CrexError("VERIFICATION_RUN_NOT_FOUND", `verification run not found: ${runId}`);
      }
      const findings = await findingRepo.listByRun(runId);
      const findingIds = new Set(findings.map((f) => f.id));
      const all = await repairRepo.list();
      const actions = all.filter((action) => findingIds.has(action.finding_id));
      return Response.json({ actions });
    }
    throw new CrexError(
      "INVALID_REPAIR_REQUEST",
      "either assetId or runId query parameter is required",
    );
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

    if (request.method === "POST" && path === "/repair") {
      return await handleRepair(request);
    }

    if (request.method === "POST" && path === "/reverify") {
      return await handleReverify(request);
    }

    if (request.method === "GET" && path === "/repair/actions") {
      return await handleListActions(url);
    }

    const applyMatch = /^\/repair\/([^/]+)\/apply$/.exec(path);
    if (request.method === "POST" && applyMatch !== null) {
      const actionId = decodeURIComponent(applyMatch[1]!);
      return await handleApply(actionId, request);
    }

    return null;
  }
}