import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowPhase } from "@crex/core/src/workflow";
import { createWorkflowState, transitionPhase } from "@crex/core/src/workflow";
import { CrexError } from "@crex/core/src/errors";
import { D1Adapter, R2ObjectStore } from "@crex/infra";
import type { R2BucketBinding } from "@crex/infra";
import { WorkflowStateRepository } from "@crex/db/src/repositories/workflow-state";

const WORKFLOW_NAME = "crex-source-to-release";

export interface SourceToReleaseParams {
  projectId: string;
}

export interface WorkflowResult {
  id: string;
  project_id: string;
  workflow_name: string;
  phase: WorkflowPhase;
  started: boolean;
  infra: { db: boolean; r2: boolean };
}

export class SourceToReleaseWorkflow extends WorkflowEntrypoint<Env, SourceToReleaseParams> {
  override async run(
    event: WorkflowEvent<SourceToReleaseParams>,
    step: WorkflowStep,
  ): Promise<WorkflowResult> {
    const { projectId } = event.payload;
    if (!projectId || projectId.trim().length === 0) {
      throw new CrexError("INVALID_PROJECT_ID", "projectId is required");
    }
    const instanceId = event.instanceId;
    const db = new D1Adapter(this.env.DB);
    const r2 = new R2ObjectStore(this.env.MEDIA as unknown as R2BucketBinding);
    const repository = new WorkflowStateRepository(db);

    const bootstrap = await step.do(
      "bootstrap-workflow-state",
      { retries: { limit: 2, delay: "1 second", backoff: "exponential" } },
      async () => {
        const existing = await repository.get(instanceId);
        if (existing === undefined) {
          const created = createWorkflowState({
            id: instanceId,
            project_id: projectId,
            workflow_name: WORKFLOW_NAME,
            stage: "SOURCE_INGESTION",
          });
          await repository.insert(created);
          return { created: true, phase: created.phase as WorkflowPhase };
        }
        return { created: false, phase: existing.phase as WorkflowPhase };
      },
    );

    await step.do("transition-to-running", async () => {
      const current = await repository.get(instanceId);
      if (current === undefined) {
        throw new CrexError("WORKFLOW_STATE_MISSING", "workflow state missing after bootstrap");
      }
      const next = transitionPhase(current, "RUNNING");
      await db.prepare(`UPDATE workflow_state SET phase = ?, updated_at = ? WHERE id = ?`)
        .run(next.phase, next.updated_at, instanceId);
      return { phase: next.phase };
    });

    const infra = await step.do(
      "verify-infrastructure",
      { retries: { limit: 2, delay: "1 second", backoff: "exponential" } },
      async () => {
        const dbOk = await probeDatabase(db);
        const r2Ok = await probeR2(r2);
        if (!dbOk || !r2Ok) {
          throw new CrexError("INFRASTRUCTURE_UNAVAILABLE", "required infrastructure unavailable", {
            retryable: true,
          });
        }
        return { db: dbOk, r2: r2Ok };
      },
    );

    await step.do("record-completion", async () => {
      const now = new Date().toISOString();
      const current = await repository.get(instanceId);
      const completed = current === undefined
        ? transitionPhase(
            createWorkflowState({
              id: instanceId,
              project_id: projectId,
              workflow_name: WORKFLOW_NAME,
              stage: "SOURCE_INGESTION",
            }),
            "COMPLETED",
            now,
          )
        : transitionPhase(current, "COMPLETED", now);
      await db.prepare(
        `UPDATE workflow_state SET phase = ?, updated_at = ?, completed_at = ? WHERE id = ?`,
      ).run(
        completed.phase,
        completed.updated_at,
        completed.completed_at ?? now,
        instanceId,
      );
      return { phase: completed.phase, completed_at: completed.completed_at };
    });

    return {
      id: instanceId,
      project_id: projectId,
      workflow_name: WORKFLOW_NAME,
      phase: "COMPLETED",
      started: bootstrap.created,
      infra,
    };
  }
}

async function probeDatabase(db: D1Adapter): Promise<boolean> {
  try {
    const row = await db.prepare("SELECT 1 AS ok").get();
    return row !== undefined;
  } catch {
    return false;
  }
}

async function probeR2(r2: R2ObjectStore): Promise<boolean> {
  try {
    await r2.head("__crex_probe__");
    return true;
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "GET" && path === "/health") {
      return Response.json({
        ok: true,
        service: "crex-worker",
        bindings: {
          db: typeof env.DB.prepare === "function",
          r2: typeof env.MEDIA.head === "function",
          workflow: typeof env.SOURCE_TO_RELEASE.create === "function",
        },
      });
    }

    if (request.method === "POST" && path === "/workflows/source-to-release") {
      let body: { projectId?: unknown; id?: unknown } = {};
      try {
        body = await request.json() as { projectId?: unknown; id?: unknown };
      } catch {
        return errorResponse("INVALID_BODY", "request body must be valid JSON", 400);
      }
      const { projectId, id } = body;
      if (typeof projectId !== "string" || !isUuid(projectId)) {
        return errorResponse("INVALID_PROJECT_ID", "projectId must be a canonical UUID", 400);
      }
      if (id !== undefined && (typeof id !== "string" || !isUuid(id))) {
        return errorResponse("INVALID_WORKFLOW_ID", "workflow id must be a canonical UUID", 400);
      }
      const exists = await projectExists(new D1Adapter(env.DB), projectId);
      if (!exists) {
        return errorResponse("PROJECT_NOT_FOUND", `project not found: ${projectId}`, 404);
      }
      const workflowId = id ?? crypto.randomUUID();
      const instance = await env.SOURCE_TO_RELEASE.create({ id: workflowId, params: { projectId } });
      const status = await instance.status();
      return Response.json({
        id: instance.id,
        status: status.status,
        phase: statusToPhase(status.status),
      });
    }

    if (request.method === "GET" && path.startsWith("/workflows/source-to-release/")) {
      const id = decodeURIComponent(path.slice("/workflows/source-to-release/".length));
      if (id.length === 0) {
        return errorResponse("INVALID_WORKFLOW_ID", "workflow id is required", 400);
      }
      const instance = await env.SOURCE_TO_RELEASE.get(id).catch(() => undefined);
      if (instance === undefined) {
        return errorResponse("INSTANCE_NOT_FOUND", `workflow instance not found: ${id}`, 404);
      }
      const status = await instance.status();
      return Response.json({
        id,
        status: status.status,
        phase: statusToPhase(status.status),
      });
    }

    return errorResponse("NOT_FOUND", "route not found", 404);
  },
};

function statusToPhase(status: string): string | undefined {
  switch (status) {
    case "queued":
      return "QUEUED";
    case "running":
    case "waiting":
    case "waitingForPause":
    case "paused":
      return "RUNNING";
    case "complete":
      return "COMPLETED";
    case "errored":
      return "FAILED";
    case "terminated":
      return "CANCELLED";
    default:
      return undefined;
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

async function projectExists(db: D1Adapter, projectId: string): Promise<boolean> {
  const row = await db.prepare("SELECT 1 AS found FROM projects WHERE id = ?").get(projectId);
  return row !== undefined;
}

function errorResponse(code: string, message: string, status: number): Response {
  return Response.json({ error: { code, message } }, { status });
}