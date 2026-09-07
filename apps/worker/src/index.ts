import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowPhase } from "@crex/core/src/workflow";
import { createWorkflowState, transitionPhase } from "@crex/core/src/workflow";
import { CrexError } from "@crex/core/src/errors";
import { D1Adapter, R2ObjectStore } from "@crex/infra";
import type { R2BucketBinding } from "@crex/infra";
import { WorkflowStateRepository } from "@crex/db/src/repositories/workflow-state";
import { SourceAssetRepository } from "@crex/db/src/repositories/source-assets";
import { AiOutputRepository } from "@crex/db/src/repositories/ai-outputs";
import type { AiOutput } from "@crex/schemas/src/api";
import { AI_TASK } from "@crex/schemas/src/enums";
import { sourceUnderstandingSchema } from "@crex/schemas/src/ai-tasks";
import type { ProviderRequest } from "@crex/ai";
import {
  aiConfigured,
  buildProviderOptions,
  providerResultToAiOutput,
  runGenerationTask,
} from "./workflows/ai-output";
import { mapInstanceStatusToPhase } from "./workflows/status-mapping";
import { createSourcesApi } from "./sources-routes";
import { createContractsApi } from "./contracts-routes";
import { createProvenanceApi } from "./provenance-routes";
import { createAudienceApi } from "./audience-routes";
import { createUnderstandingApi } from "./understand-routes";
import { createEvidenceGraphApi } from "./evidence-graph-routes";
import { createVerificationApi } from "./verification-routes";
import { errorResponse, errorResponseForCode } from "./http";
import { IncrementalSha256 } from "@crex/media";

const WORKFLOW_NAME = "crex-source-to-release";

export interface SourceToReleaseParams {
  projectId: string;
  sourceId?: string;
}

export interface WorkflowResult {
  id: string;
  project_id: string;
  workflow_name: string;
  phase: WorkflowPhase;
  started: boolean;
  infra: { db: boolean; r2: boolean };
  source?: { sourceId?: string; status: string };
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

    try {
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

      const sourceId = event.payload.sourceId;
      const ingested = await step.do(
        "ingest-source-asset",
        { retries: { limit: 2, delay: "1 second", backoff: "exponential" } },
        async () => {
          if (sourceId === undefined) {
            return { sourceId: undefined, status: "SKIPPED" };
          }
          const result = await ingestSourceAsset(db, r2, sourceId, projectId);
          await db.prepare(
            `UPDATE workflow_state SET stage = ?, updated_at = ? WHERE id = ?`,
          ).run("SOURCE_INGESTION", new Date().toISOString(), instanceId);
          return result;
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
        source: ingested,
      };
    } catch (error) {
      await recordWorkflowFailure(db, instanceId, error).catch(() => undefined);
      throw error;
    }
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

interface IngestResult {
  sourceId: string;
  status: "READY";
}

async function ingestSourceAsset(
  db: D1Adapter,
  r2: R2ObjectStore,
  sourceId: string,
  projectId: string,
): Promise<IngestResult> {
  const sources = new SourceAssetRepository(db);
  const source = await sources.get(sourceId);
  if (source === undefined) {
    throw new CrexError("SOURCE_NOT_FOUND", `source not found: ${sourceId}`);
  }
  if (source.project_id !== projectId) {
    throw new CrexError(
      "INVALID_SOURCE_STATE",
      `source ${sourceId} does not belong to project ${projectId}`,
    );
  }
  if (source.status !== "VALID") {
    throw new CrexError(
      "INVALID_SOURCE_STATE",
      `source ${sourceId} has status ${source.status}; expected VALID`,
    );
  }

  const head = await r2.head(source.object_key);
  if (head === null || head.size !== source.size_bytes) {
    await sources.transition(sourceId, "FAILED", { onlyIfIn: ["VALID", "PROCESSING"] })
      .catch(() => undefined);
    throw new CrexError(
      "SOURCE_CHECKSUM_MISMATCH",
      `source ${sourceId} object size does not match stored metadata`,
    );
  }

  const object = await r2.get(source.object_key);
  if (object === null || object.body === null) {
    await sources.transition(sourceId, "FAILED", { onlyIfIn: ["VALID", "PROCESSING"] })
      .catch(() => undefined);
    throw new CrexError(
      "STORAGE_UPLOAD_FAILED",
      `source ${sourceId} object could not be read back from R2`,
    );
  }

  const expected = source.checksum?.replace(/^sha256:/, "");
  if (expected !== undefined && expected.length > 0) {
    const hasher = new IncrementalSha256();
    const reader = object.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        hasher.update(value);
      }
    } finally {
      reader.releaseLock();
    }
    if (hasher.digestHex() !== expected) {
      await sources.transition(sourceId, "FAILED", { onlyIfIn: ["VALID", "PROCESSING"] })
        .catch(() => undefined);
      throw new CrexError(
        "SOURCE_CHECKSUM_MISMATCH",
        `source ${sourceId} hash does not match stored checksum`,
      );
    }
  }

  await sources.transition(sourceId, "PROCESSING");
  await sources.transition(sourceId, "READY");
  return { sourceId, status: "READY" };
}

async function recordWorkflowFailure(
  db: D1Adapter,
  id: string,
  error: unknown,
): Promise<void> {
  const code = error instanceof CrexError ? error.code : "INTERNAL_ERROR";
  const message = error instanceof Error ? error.message : String(error);
  await db.prepare(
    `UPDATE workflow_state SET phase = 'FAILED', error = ?, updated_at = ? WHERE id = ?`,
  ).run(JSON.stringify({ code, message }), new Date().toISOString(), id);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      return errorResponse(error);
    }
  },
};

async function handleRequest(request: Request, env: Env): Promise<Response> {
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
    let body: { projectId?: unknown; id?: unknown; sourceId?: unknown } = {};
    try {
      body = await request.json() as { projectId?: unknown; id?: unknown; sourceId?: unknown };
    } catch {
      return errorResponseForCode("INVALID_BODY", "request body must be valid JSON");
    }
    const { projectId, id, sourceId } = body;
    if (typeof projectId !== "string" || !isUuid(projectId)) {
      return errorResponseForCode("INVALID_PROJECT_ID", "projectId must be a canonical UUID");
    }
    if (id !== undefined && (typeof id !== "string" || !isUuid(id))) {
      return errorResponseForCode("INVALID_WORKFLOW_ID", "workflow id must be a canonical UUID");
    }
    if (sourceId !== undefined && (typeof sourceId !== "string" || !isUuid(sourceId))) {
      return errorResponseForCode("INVALID_SOURCE_ID", "sourceId must be a canonical UUID");
    }
    if (!(await projectExists(new D1Adapter(env.DB), projectId))) {
      return errorResponseForCode("PROJECT_NOT_FOUND", `project not found: ${projectId}`);
    }
    const workflowId = id ?? crypto.randomUUID();
    const params: SourceToReleaseParams = { projectId };
    if (sourceId !== undefined) {
      params.sourceId = sourceId;
    }
    const instance = await env.SOURCE_TO_RELEASE.create({ id: workflowId, params });
    const status = await instance.status();
    return Response.json({
      id: instance.id,
      status: status.status,
      phase: mapInstanceStatusToPhase(status.status),
    });
  }

  if (request.method === "GET" && path.startsWith("/workflows/source-to-release/")) {
    const id = decodeURIComponent(path.slice("/workflows/source-to-release/".length));
    if (id.length === 0) {
      return errorResponseForCode("INVALID_WORKFLOW_ID", "workflow id is required");
    }
    const instance = await env.SOURCE_TO_RELEASE.get(id).catch(() => undefined);
    if (instance === undefined) {
      return errorResponseForCode("INSTANCE_NOT_FOUND", `workflow instance not found: ${id}`);
    }
    const status = await instance.status();
    return Response.json({
      id,
      status: status.status,
      phase: mapInstanceStatusToPhase(status.status),
    });
  }

  if (request.method === "POST" && path === "/ai/analyze") {
    return await handleAnalyze(request, env);
  }

  const sourcesApi = createSourcesApi(env);
  const sourceResponse = await sourcesApi.handle(request, path);
  if (sourceResponse !== null) return sourceResponse;

  const contractsApi = createContractsApi(env);
  const contractResponse = await contractsApi.handle(request, path);
  if (contractResponse !== null) return contractResponse;

  const provenanceApi = createProvenanceApi(env);
  const provenanceResponse = await provenanceApi.handle(request, path);
  if (provenanceResponse !== null) return provenanceResponse;

  const audienceApi = createAudienceApi(env);
  const audienceResponse = await audienceApi.handle(request, path);
  if (audienceResponse !== null) return audienceResponse;

  const understandingApi = createUnderstandingApi(env);
  const understandingResponse = await understandingApi.handle(request, path);
  if (understandingResponse !== null) return understandingResponse;

  const verificationApi = createVerificationApi(env);
  const verificationResponse = await verificationApi.handle(request, path);
  if (verificationResponse !== null) return verificationResponse;

  const evidenceGraphApi = createEvidenceGraphApi(env);
  const evidenceGraphResponse = await evidenceGraphApi.handle(request, path);
  if (evidenceGraphResponse !== null) return evidenceGraphResponse;

  return errorResponseForCode("NOT_FOUND", "route not found");
}

async function handleAnalyze(request: Request, env: Env): Promise<Response> {
  let body: { projectId?: unknown; task?: unknown } = {};
  try {
    body = await request.json() as { projectId?: unknown; task?: unknown };
  } catch {
    return errorResponseForCode("INVALID_BODY", "request body must be valid JSON");
  }
  const { projectId, task } = body;
  if (typeof projectId !== "string" || !isUuid(projectId)) {
    return errorResponseForCode("INVALID_PROJECT_ID", "projectId must be a canonical UUID");
  }

  const db = new D1Adapter(env.DB);
  const project = await getProject(db, projectId);
  if (project === undefined) {
    return errorResponseForCode("PROJECT_NOT_FOUND", `project not found: ${projectId}`);
  }

  if (task !== undefined && (typeof task !== "string" || !(AI_TASK as readonly string[]).includes(task))) {
    return errorResponseForCode("INVALID_AI_REQUEST", "task must be a known AI task");
  }
  if (task !== undefined && task !== "SEMANTIC_UNDERSTANDING") {
    return errorResponseForCode(
      "INVALID_AI_REQUEST",
      "task is recognized but not wired yet; only SEMANTIC_UNDERSTANDING is supported",
    );
  }
  const aiTask: AiOutput["task"] = "SEMANTIC_UNDERSTANDING";

  const options = buildProviderOptions(env);
  if (!aiConfigured(options)) {
    return errorResponseForCode("AI_NOT_CONFIGURED", "no AI provider API key is configured");
  }

  const targetSchema = aiTask === "SEMANTIC_UNDERSTANDING" ? sourceUnderstandingSchema : undefined;
  const result = await runGenerationTask(
    buildProviderRequest(project.name, project.description, aiTask),
    options,
    targetSchema,
  );
  const output = providerResultToAiOutput(result, aiTask);
  await new AiOutputRepository(db).insert(output, projectId);

  return Response.json({ output }, { status: 201 });
}

function buildProviderRequest(
  projectName: string,
  description: string | undefined,
  task: AiOutput["task"],
): ProviderRequest {
  const userContent =
    description === undefined
      ? `Project: ${projectName}\n\nAnalyze this project's existing content basis.`
      : `Project: ${projectName}\nDescription: ${description}\n\nAnalyze this project's existing content basis.`;
  return {
    messages: [
      {
        role: "system",
        content:
          "You are an objective media-claims analyst for advertising compliance. " +
          'Respond with strict JSON matching {"summary": string, "claims": string[]}. ' +
          "The summary must objectively describe the source. Each claim must be a single factual assertion " +
          "the source makes, stated verbatim where possible.",
      },
      { role: "user", content: userContent },
    ],
    task,
    response_format: { type: "json_object" },
  };
}

async function getProject(
  db: D1Adapter,
  projectId: string,
): Promise<{ name: string; description: string | undefined } | undefined> {
  const row = await db.prepare("SELECT name, description FROM projects WHERE id = ?").get(projectId);
  if (row === undefined) {
    return undefined;
  }
  return {
    name: String(row.name ?? ""),
    description: typeof row.description === "string" ? row.description : undefined,
  };
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