import { D1Adapter } from "@crex/infra";
import { UnderstandingRepository } from "@crex/db/src/repositories/understandings";
import { ClaimRepository } from "@crex/db/src/repositories/claims";
import { EvidenceRepository } from "@crex/db/src/repositories/evidence";
import { CrexError } from "@crex/core/src/errors";
import type { ProviderOptions } from "@crex/ai";
import {
  aiConfigured,
  buildProviderOptions,
} from "./workflows/ai-output";
import { runEvidenceGraph } from "./pipelines/evidence-graph";
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

export interface EvidenceGraphApi {
  handle(request: Request, path: string): Promise<Response | null>;
}

export function createEvidenceGraphApi(env: Env): EvidenceGraphApi {
  const db = new D1Adapter(env.DB);
  const understandings = new UnderstandingRepository(db);
  const claimRepo = new ClaimRepository(db);
  const evidenceRepo = new EvidenceRepository(db);
  const options = buildProviderOptions(env);

  async function handleBuild(request: Request): Promise<Response> {
    let body: { understandingId?: unknown; projectId?: unknown } = {};
    try {
      body = await request.json() as { understandingId?: unknown; projectId?: unknown };
    } catch {
      throw new CrexError("INVALID_BODY", "request body must be valid JSON");
    }
    const { understandingId, projectId } = body;

    if (typeof understandingId !== "string" || !isUuid(understandingId)) {
      throw new CrexError("INVALID_UNDERSTANDING_ID", "understandingId must be a canonical UUID");
    }
    if (typeof projectId !== "string" || !isUuid(projectId)) {
      throw new CrexError("INVALID_PROJECT_ID", "projectId must be a canonical UUID");
    }
    if (!(await projectExists(db, projectId))) {
      throw new CrexError("PROJECT_NOT_FOUND", `project not found: ${projectId}`);
    }

    const understanding = await understandings.get(understandingId);
    if (understanding === undefined) {
      throw new CrexError("UNDERSTANDING_NOT_FOUND", `understanding not found: ${understandingId}`);
    }

    if (!aiConfigured(options)) {
      throw new CrexError("AI_NOT_CONFIGURED", "no AI provider API key is configured");
    }

    const result = await runEvidenceGraph(
      { db, now: () => new Date().toISOString(), uuid: () => crypto.randomUUID() },
      understandingId,
      projectId,
      options,
    );

    return Response.json(result, { status: 201 });
  }

  async function handleListClaims(url: URL): Promise<Response> {
    const projectId = url.searchParams.get("projectId");
    if (projectId === null || !isUuid(projectId)) {
      throw new CrexError("INVALID_PROJECT_ID", "projectId must be a canonical UUID");
    }
    if (!(await projectExists(db, projectId))) {
      throw new CrexError("PROJECT_NOT_FOUND", `project not found: ${projectId}`);
    }
    const items = await claimRepo.listByProject(projectId);
    return Response.json({ claims: items });
  }

  async function handleGetClaim(id: string): Promise<Response> {
    if (!isUuid(id)) {
      throw new CrexError("CLAIM_NOT_FOUND", `claim not found: ${id}`);
    }
    const claim = await claimRepo.get(id);
    if (claim === undefined) {
      throw new CrexError("CLAIM_NOT_FOUND", `claim not found: ${id}`);
    }
    const evidenceItems = await evidenceRepo.listByClaim(id);
    return Response.json({ claim, evidence: evidenceItems });
  }

  async function handleListEvidence(claimId: string): Promise<Response> {
    if (!isUuid(claimId)) {
      throw new CrexError("CLAIM_NOT_FOUND", `claim not found: ${claimId}`);
    }
    const claim = await claimRepo.get(claimId);
    if (claim === undefined) {
      throw new CrexError("CLAIM_NOT_FOUND", `claim not found: ${claimId}`);
    }
    const items = await evidenceRepo.listByClaim(claimId);
    return Response.json({ evidence: items });
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

    if (request.method === "POST" && path === "/evidence-graph/build") {
      return await handleBuild(request);
    }

    if (request.method === "GET" && path === "/evidence-graph") {
      return await handleListClaims(url);
    }

    const evidenceMatch = /^\/evidence-graph\/evidence\/([^/]+)$/.exec(path);
    if (request.method === "GET" && evidenceMatch !== null) {
      const rawId = evidenceMatch[1];
      if (rawId === undefined) return null;
      const id = decodeURIComponent(rawId);
      if (!isUuid(id)) return null;
      return await handleListEvidence(id);
    }

    const claimMatch = /^\/evidence-graph\/([^/]+)$/.exec(path);
    if (request.method === "GET" && claimMatch !== null) {
      const rawId = claimMatch[1];
      if (rawId === undefined) return null;
      const id = decodeURIComponent(rawId);
      if (!isUuid(id)) return null;
      return await handleGetClaim(id);
    }

    return null;
  }
}
