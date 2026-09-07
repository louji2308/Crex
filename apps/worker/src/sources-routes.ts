import { D1Adapter, R2ObjectStore } from "@crex/infra";
import type { R2BucketBinding, R2ObjectBody } from "@crex/infra";
import { SourceAssetRepository } from "@crex/db/src/repositories/source-assets";
import { SourceUploadRepository } from "@crex/db/src/repositories/source-uploads";
import type { SourceUpload } from "@crex/db/src/repositories/source-uploads";
import type { SourceAsset, SourceMedia } from "@crex/schemas/src/domain";
import { CrexError } from "@crex/core/src/errors";
import { IncrementalSha256, validateMediaFile } from "@crex/media";
import type { MediaProbe } from "@crex/media";
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

function sanitizeFileName(fileName: string): string {
  const parts = fileName.split(/[/\\]/);
  const base = parts[parts.length - 1] ?? "";
  return base.trim();
}

function validateUploadFileName(fileName: unknown): string {
  if (typeof fileName !== "string" || fileName.length === 0) {
    throw new CrexError("INVALID_FILE_NAME", "fileName must be a non-empty string");
  }
  for (let i = 0; i < fileName.length; i++) {
    const code = fileName.charCodeAt(i);
    if (fileName[i] === "/" || fileName[i] === "\\") {
      throw new CrexError("INVALID_FILE_NAME", "fileName must not contain path separators");
    }
    if (code === 0) {
      throw new CrexError("INVALID_FILE_NAME", "fileName must not contain a NUL byte");
    }
    if (code < 0x20 || code === 0x7f) {
      throw new CrexError("INVALID_FILE_NAME", "fileName must not contain control characters");
    }
  }
  if (fileName.split(/[/\\]/).some((part) => part === "..")) {
    throw new CrexError("INVALID_FILE_NAME", "fileName must not contain '..' path segments");
  }
  const safeName = sanitizeFileName(fileName);
  if (safeName.length === 0) {
    throw new CrexError("INVALID_FILE_NAME", "fileName must contain a usable name");
  }
  return safeName;
}

function toApiUpload(session: SourceUpload, source: SourceAsset | undefined) {
  return {
    uploadId: session.id,
    projectId: session.projectId,
    objectKey: session.objectKey,
    fileName: session.fileName,
    fileType: session.fileType,
    uploadStatus: session.status,
    status: source?.status ?? session.status,
    media: source?.media ?? null,
    sizeBytes: source?.size_bytes ?? null,
    durationSeconds: source?.duration_seconds ?? null,
    checksum: source?.checksum ?? null,
    error: session.status === "FAILED" ? session.error : null,
  };
}

function toSourceMedia(probe: MediaProbe): SourceMedia {
  return {
    container: probe.container,
    video: probe.video,
    audio: probe.audio,
  };
}

export interface SourcesDeps {
  maxSizeBytes: number;
  now: () => string;
  uuid: () => string;
  projectExists: (projectId: string) => Promise<boolean>;
  getUpload: (uploadId: string) => Promise<SourceUpload | null>;
  putObject: (key: string, value: ReadableStream<Uint8Array> | Uint8Array, contentType: string) => Promise<{ size: number }>;
  getObjectBytes: (key: string) => Promise<Uint8Array | null>;
  deleteObject: (key: string) => Promise<void>;
  markUploaded: (id: string) => Promise<SourceUpload>;
  markFailed: (id: string, error: string) => Promise<SourceUpload>;
  insertAsset: (asset: SourceAsset) => Promise<SourceAsset>;
  getAsset: (id: string) => Promise<SourceAsset | undefined>;
  getAssetByKey: (key: string) => Promise<SourceAsset | undefined>;
  updateAsset: (id: string, patch: Partial<SourceAsset>) => Promise<SourceAsset>;
  transitionAsset: (id: string, to: SourceAsset["status"], opts?: { onlyIfIn?: SourceAsset["status"][] }) => Promise<SourceAsset>;
  listAssetsByProject: (projectId: string) => Promise<SourceAsset[]>;
}

async function readObjectBytes(obj: R2ObjectBody | null): Promise<Uint8Array> {
  if (obj === null) {
    throw new CrexError("STORAGE_UPLOAD_FAILED", "uploaded object could not be read back");
  }
  const buffer = await obj.arrayBuffer();
  return new Uint8Array(buffer);
}

export interface SourcesApi {
  handle(request: Request, path: string): Promise<Response | null>;
}

export function createSourcesApi(env: Env, deps?: Partial<SourcesDeps>): SourcesApi {
  const db = new D1Adapter(env.DB);
  const sourceAssets = new SourceAssetRepository(db);
  const sourceUploads = new SourceUploadRepository(db);
  const r2 = new R2ObjectStore(env.MEDIA as unknown as R2BucketBinding);

  const resolved: SourcesDeps = {
    maxSizeBytes: deps?.maxSizeBytes ?? Number(env.SOURCE_MAX_SIZE_BYTES ?? 104857600),
    now: deps?.now ?? (() => new Date().toISOString()),
    uuid: deps?.uuid ?? (() => crypto.randomUUID()),
    projectExists: deps?.projectExists ?? ((projectId: string) => projectExists(db, projectId)),
    getUpload: deps?.getUpload ?? ((uploadId: string) => sourceUploads.get(uploadId)),
    putObject: deps?.putObject ?? (async (key, value, contentType) => {
      const object = await r2.put(key, value, { contentType });
      return { size: object.size };
    }),
    getObjectBytes: deps?.getObjectBytes ?? (async (key) => {
      const obj = await r2.get(key);
      return obj === null ? null : readObjectBytes(obj);
    }),
    deleteObject: deps?.deleteObject ?? ((key: string) => r2.delete(key)),
    markUploaded: deps?.markUploaded ?? ((id: string) => sourceUploads.markUploaded(id)),
    markFailed: deps?.markFailed ?? ((id: string, error: string) => sourceUploads.markFailed(id, error)),
    insertAsset: deps?.insertAsset ?? ((asset: SourceAsset) => sourceAssets.insert(asset)),
    getAsset: deps?.getAsset ?? ((id: string) => sourceAssets.get(id)),
    getAssetByKey: deps?.getAssetByKey ?? (async (key) => {
      const found = (await sourceAssets.list()).filter((asset) => asset.object_key === key);
      return found[0] ?? undefined;
    }),
    updateAsset: deps?.updateAsset ?? ((id: string, patch: Partial<SourceAsset>) => sourceAssets.update(id, patch)),
    transitionAsset: deps?.transitionAsset ?? ((id: string, to: SourceAsset["status"], opts?: { onlyIfIn?: SourceAsset["status"][] }) => sourceAssets.transition(id, to, opts)),
    listAssetsByProject: deps?.listAssetsByProject ?? ((projectId: string) => sourceAssets.listByProject(projectId)),
  };

  async function handleCreate(request: Request): Promise<Response> {
    let body: { projectId?: unknown; fileName?: unknown; fileType?: unknown } = {};
    try {
      body = await request.json() as { projectId?: unknown; fileName?: unknown; fileType?: unknown };
    } catch {
      throw new CrexError("INVALID_BODY", "request body must be valid JSON");
    }
    const { projectId, fileName, fileType } = body;
    if (typeof projectId !== "string" || !isUuid(projectId)) {
      throw new CrexError("INVALID_PROJECT_ID", "projectId must be a canonical UUID");
    }
    if (!(await resolved.projectExists(projectId))) {
      throw new CrexError("PROJECT_NOT_FOUND", `project not found: ${projectId}`);
    }
    const safeName = validateUploadFileName(fileName);
    const normalizedType =
      fileType === undefined ? "application/octet-stream" : String(fileType);

    const uploadId = resolved.uuid();
    const objectKey = `sources/${projectId}/${uploadId}-${safeName}`;

    await sourceUploads.begin({
      id: uploadId,
      projectId,
      objectKey,
      fileName: safeName,
      fileType: normalizedType,
    });

    return Response.json(
      {
        uploadId,
        projectId,
        objectKey,
        fileName: safeName,
        fileType: normalizedType,
        status: "UPLOADING",
      },
      { status: 201 },
    );
  }

  async function handleUpload(request: Request, uploadId: string): Promise<Response> {
    if (!isUuid(uploadId)) {
      throw new CrexError("UPLOAD_NOT_FOUND", `upload not found: ${uploadId}`);
    }
    const session = await resolved.getUpload(uploadId);
    if (session === null) {
      throw new CrexError("UPLOAD_NOT_FOUND", `upload not found: ${uploadId}`);
    }
    if (session.status !== "UPLOADING") {
      throw new CrexError("SOURCE_UPLOAD_STATE", "upload already final");
    }

    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > resolved.maxSizeBytes) {
      await resolved.markFailed(uploadId, "too_large").catch(() => undefined);
      throw new CrexError("SOURCE_TOO_LARGE", "upload exceeds max size");
    }

    const hasher = new IncrementalSha256();
    let count = 0;
    const guard = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        count += chunk.byteLength;
        if (count > resolved.maxSizeBytes) {
          controller.error(new CrexError("SOURCE_TOO_LARGE", "upload exceeds max size"));
          return;
        }
        hasher.update(chunk);
        controller.enqueue(chunk);
      },
    });

    const body = request.body;
    if (body === null) {
      throw new CrexError("INVALID_BODY", "upload request must include a body");
    }

    try {
      let stored: { checksum: string; total: number };
      if (Number.isFinite(contentLength)) {
        const fixed = new FixedLengthStream(contentLength);
        const piped = body.pipeThrough(guard).pipeThrough(fixed);
        await resolved.putObject(session.objectKey, piped, session.fileType);
        stored = { checksum: hasher.digestHex(), total: count };
      } else {
        const { bytes, checksum, count: total } = await drainBody(body, uploadId, hasher);
        await resolved.putObject(session.objectKey, bytes, session.fileType);
        stored = { checksum, total };
      }

      const bytes = await resolved.getObjectBytes(session.objectKey);
      if (bytes === null) {
        throw new CrexError("STORAGE_UPLOAD_FAILED", "uploaded object could not be read back");
      }

      const validation = validateMediaFile(bytes, { maxSizeBytes: resolved.maxSizeBytes });
      const now = resolved.now();
      await resolved.insertAsset({
        id: uploadId,
        project_id: session.projectId,
        object_key: session.objectKey,
        file_name: session.fileName,
        file_type: session.fileType,
        size_bytes: stored.total,
        checksum: `sha256:${stored.checksum}`,
        status: "UPLOADED",
        transcription_status: "PENDING",
        analysis_status: "PENDING",
        created_at: now,
        updated_at: now,
      });
      await resolved.transitionAsset(uploadId, "VALIDATING");

      if (validation.valid && validation.media !== undefined) {
        const media = toSourceMedia(validation.media);
        await resolved.updateAsset(uploadId, {
          media,
          duration_seconds: validation.media.durationSeconds ?? undefined,
        });
        await resolved.transitionAsset(uploadId, "VALID");
        return Response.json({
          uploadId,
          status: "VALID",
          media: validation.media,
          sizeBytes: stored.total,
          checksum: `sha256:${stored.checksum}`,
          durationSeconds: validation.media.durationSeconds ?? null,
        });
      } else {
        await resolved.updateAsset(uploadId, { media: undefined });
        await resolved.transitionAsset(uploadId, "INVALID");
        return Response.json({
          uploadId,
          status: "INVALID",
          reason: validation.reason ?? "invalid",
          media: validation.media ?? null,
        });
      }
    } catch (error) {
      if (error instanceof CrexError && error.code === "SOURCE_TOO_LARGE") {
        await resolved.markFailed(uploadId, "too_large").catch(() => undefined);
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      await resolved.markFailed(uploadId, message).catch(() => undefined);
      await resolved.deleteObject(session.objectKey).catch(() => undefined);
      await resolved.getAssetByKey(session.objectKey).then(async (asset) => {
        if (asset !== undefined) {
          await resolved.transitionAsset(asset.id, "FAILED").catch(() => undefined);
        }
      });
      throw new CrexError("STORAGE_UPLOAD_FAILED", message);
    }
  }

  async function drainBody(
    body: ReadableStream<Uint8Array>,
    uploadId: string,
    hasher: IncrementalSha256,
  ): Promise<{ bytes: Uint8Array; checksum: string; count: number }> {
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let count = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        count += value.byteLength;
        if (count > resolved.maxSizeBytes) {
          await resolved.markFailed(uploadId, "too_large").catch(() => undefined);
          throw new CrexError("SOURCE_TOO_LARGE", "upload exceeds max size");
        }
        hasher.update(value);
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(count);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { bytes, checksum: hasher.digestHex(), count };
  }

  async function handleStatus(uploadId: string): Promise<Response> {
    if (!isUuid(uploadId)) {
      throw new CrexError("UPLOAD_NOT_FOUND", `upload not found: ${uploadId}`);
    }
    const session = await resolved.getUpload(uploadId);
    if (session === null) {
      throw new CrexError("UPLOAD_NOT_FOUND", `upload not found: ${uploadId}`);
    }
    let source: SourceAsset | undefined;
    try {
      source = await resolved.getAsset(uploadId);
    } catch {
      source = undefined;
    }
    return Response.json(toApiUpload(session, source));
  }

  async function handleList(url: URL): Promise<Response> {
    const projectId = url.searchParams.get("projectId");
    if (projectId === null || !isUuid(projectId)) {
      throw new CrexError("INVALID_PROJECT_ID", "projectId must be a canonical UUID");
    }
    if (!(await resolved.projectExists(projectId))) {
      throw new CrexError("PROJECT_NOT_FOUND", `project not found: ${projectId}`);
    }
    const assets = await resolved.listAssetsByProject(projectId);
    const sessions = new Map<string, SourceUpload>();
    for (const id of assets.map((asset) => asset.id)) {
      const session = await resolved.getUpload(id);
      if (session !== null) {
        sessions.set(id, session);
      }
    }
    const sources = assets.map((asset) => {
      const session = sessions.get(asset.id);
      return {
        uploadId: asset.id,
        projectId,
        objectKey: asset.object_key,
        fileName: asset.file_name,
        fileType: asset.file_type,
        uploadStatus: session?.status ?? "UPLOADED",
        status: asset.status,
        media: asset.media ?? null,
        sizeBytes: asset.size_bytes ?? null,
        durationSeconds: asset.duration_seconds ?? null,
        checksum: asset.checksum ?? null,
        error: session !== undefined && session.status === "FAILED" ? session.error : null,
      };
    });
    return Response.json({ sources });
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

    if (request.method === "GET" && path === "/sources/ui") {
      const html = (await import("./ui")).SOURCES_UI_HTML;
      return new Response(html, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    if (request.method === "POST" && path === "/sources") {
      return await handleCreate(request);
    }

    if (request.method === "GET" && path === "/sources") {
      return await handleList(url);
    }

    const blobMatch = /^\/sources\/([^/]+)\/blob$/.exec(path);
    if (request.method === "PUT" && blobMatch !== null) {
      const uploadId = decodeURIComponent(blobMatch[1]!);
      return await handleUpload(request, uploadId);
    }

    const idMatch = /^\/sources\/([^/]+)$/.exec(path);
    if (request.method === "GET" && idMatch !== null) {
      const uploadId = decodeURIComponent(idMatch[1]!);
      if (!isUuid(uploadId)) {
        return null;
      }
      return await handleStatus(uploadId);
    }

    return null;
  }
}
