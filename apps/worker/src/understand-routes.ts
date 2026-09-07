import { D1Adapter, R2ObjectStore } from "@crex/infra";
import type { R2BucketBinding } from "@crex/infra";
import { SourceAssetRepository } from "@crex/db/src/repositories/source-assets";
import { UnderstandingRepository } from "@crex/db/src/repositories/understandings";
import { TranscriptRepository } from "@crex/db/src/repositories/transcripts";
import { SemanticSectionRepository } from "@crex/db/src/repositories/semantic-sections";
import { CrexError } from "@crex/core/src/errors";
import type { ProviderOptions } from "@crex/ai";
import {
  aiConfigured,
  buildProviderOptions,
} from "./workflows/ai-output";
import { runVideoUnderstanding } from "./pipelines/video-understanding";
import { errorResponse } from "./http";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export interface UnderstandingApi {
  handle(request: Request, path: string): Promise<Response | null>;
}

export function createUnderstandingApi(env: Env): UnderstandingApi {
  const db = new D1Adapter(env.DB);
  const r2 = new R2ObjectStore(env.MEDIA as unknown as R2BucketBinding);
  const sources = new SourceAssetRepository(db);
  const understandings = new UnderstandingRepository(db);
  const transcripts = new TranscriptRepository(db);
  const sections = new SemanticSectionRepository(db);

  const options = buildProviderOptions(env);

  async function handleCreate(request: Request): Promise<Response> {
    let body: { sourceAssetId?: unknown } = {};
    try {
      body = (await request.json()) as { sourceAssetId?: unknown };
    } catch {
      throw new CrexError("INVALID_BODY", "request body must be valid JSON");
    }

    const { sourceAssetId } = body;
    if (typeof sourceAssetId !== "string" || !isUuid(sourceAssetId)) {
      throw new CrexError("INVALID_SOURCE_ID", "sourceAssetId must be a canonical UUID");
    }

    const source = await sources.get(sourceAssetId);
    if (source === undefined) {
      throw new CrexError("SOURCE_NOT_FOUND", `source not found: ${sourceAssetId}`);
    }
    if (source.status !== "READY") {
      throw new CrexError(
        "INVALID_SOURCE_STATE",
        `source ${sourceAssetId} has status ${source.status}; expected READY`,
      );
    }

    if (!aiConfigured(options)) {
      throw new CrexError("AI_NOT_CONFIGURED", "no AI provider API key is configured");
    }

    const result = await runVideoUnderstanding(
      { db, r2, now: () => new Date().toISOString(), uuid: () => crypto.randomUUID() },
      sourceAssetId,
      options,
    );

    return Response.json(result, { status: 201 });
  }

  async function handleGet(id: string): Promise<Response> {
    const understanding = await understandings.get(id);
    if (understanding === undefined) {
      throw new CrexError("UNDERSTANDING_NOT_FOUND", `understanding not found: ${id}`);
    }

    const transcriptId = understanding.transcript_id;
    const transcript = transcriptId !== undefined && transcriptId !== null
      ? await transcripts.get(transcriptId)
      : undefined;

    const semanticSections = await sections.listByUnderstanding(id);

    return Response.json({
      understanding,
      transcript: transcript ?? null,
      semanticSections,
    });
  }

  async function handleGetBySourceAsset(sourceAssetId: string): Promise<Response> {
    const items = await understandings.listBySourceAsset(sourceAssetId);
    return Response.json({ understandings: items });
  }

  async function handleGetTranscript(id: string): Promise<Response> {
    const transcript = await transcripts.get(id);
    if (transcript === undefined) {
      throw new CrexError("TRANSCRIPT_NOT_FOUND", `transcript not found: ${id}`);
    }
    return Response.json({ transcript });
  }

  async function handleGetSections(understandingId: string): Promise<Response> {
    const understanding = await understandings.get(understandingId);
    if (understanding === undefined) {
      throw new CrexError("UNDERSTANDING_NOT_FOUND", `understanding not found: ${understandingId}`);
    }
    const items = await sections.listByUnderstanding(understandingId);
    return Response.json({ sections: items });
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
    if (request.method === "POST" && path === "/ai/understand") {
      return await handleCreate(request);
    }

    const sourceMatch = /^\/ai\/understand\/source\/([^/]+)$/.exec(path);
    if (request.method === "GET" && sourceMatch !== null) {
      const rawId = sourceMatch[1];
      if (rawId === undefined) return null;
      const id = decodeURIComponent(rawId);
      if (!isUuid(id)) return null;
      return await handleGetBySourceAsset(id);
    }

    const understandingMatch = /^\/ai\/understand\/([^/]+)$/.exec(path);
    if (request.method === "GET" && understandingMatch !== null) {
      const rawId = understandingMatch[1];
      if (rawId === undefined) return null;
      const id = decodeURIComponent(rawId);
      if (!isUuid(id)) return null;
      return await handleGet(id);
    }

    const transcriptMatch = /^\/ai\/transcript\/([^/]+)$/.exec(path);
    if (request.method === "GET" && transcriptMatch !== null) {
      const rawId = transcriptMatch[1];
      if (rawId === undefined) return null;
      const id = decodeURIComponent(rawId);
      if (!isUuid(id)) return null;
      return await handleGetTranscript(id);
    }

    const sectionsMatch = /^\/ai\/understand\/([^/]+)\/sections$/.exec(path);
    if (request.method === "GET" && sectionsMatch !== null) {
      const rawId = sectionsMatch[1];
      if (rawId === undefined) return null;
      const id = decodeURIComponent(rawId);
      if (!isUuid(id)) return null;
      return await handleGetSections(id);
    }

    return null;
  }
}
