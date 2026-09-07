import { D1Adapter, R2ObjectStore } from "@crex/infra";
import type { R2BucketBinding } from "@crex/infra";
import { SourceAssetRepository } from "@crex/db/src/repositories/source-assets";
import { TranscriptRepository } from "@crex/db/src/repositories/transcripts";
import { UnderstandingRepository } from "@crex/db/src/repositories/understandings";
import { SemanticSectionRepository } from "@crex/db/src/repositories/semantic-sections";
import { probeMediaFile } from "@crex/media";
import type { MediaProbe } from "@crex/media";
import { createProvider, withFallback, createSttProvider, withSttFallback } from "@crex/ai";
import type { ProviderOptions, SttProvider, SttTranscriptionResult } from "@crex/ai";
import { CrexError } from "@crex/core/src/errors";
import type { SourceAsset, Transcript, Understanding, SemanticSection } from "@crex/schemas";

export interface VideoUnderstandingDeps {
  db: D1Adapter;
  r2: R2ObjectStore;
  now: () => string;
  uuid: () => string;
}

export interface VideoUnderstandingResult {
  understandingId: string;
  transcriptId: string;
  status: "READY" | "FAILED";
  error?: string;
}

export async function runVideoUnderstanding(
  deps: VideoUnderstandingDeps,
  sourceAssetId: string,
  options: ProviderOptions,
): Promise<VideoUnderstandingResult> {
  const { db, r2, now, uuid } = deps;
  const sources = new SourceAssetRepository(db);
  const transcripts = new TranscriptRepository(db);
  const understandings = new UnderstandingRepository(db);

  const source = await sources.get(sourceAssetId);
  if (source === undefined) {
    throw new CrexError("SOURCE_NOT_FOUND", `source not found: ${sourceAssetId}`);
  }
  if (source.status !== "READY") {
    throw new CrexError("INVALID_SOURCE_STATE", `source ${sourceAssetId} has status ${source.status}; expected READY`);
  }

  const understandingId = uuid();
  const transcriptId = uuid();
  const createdAt = now();

  await understandings.insert({
    id: understandingId,
    source_asset_id: sourceAssetId,
    status: "PROCESSING",
    media_metadata_json: JSON.stringify(source.media ?? {}),
    transcript_id: transcriptId,
    created_at: createdAt,
    updated_at: createdAt,
  });

  await transcripts.insert({
    id: transcriptId,
    source_asset_id: sourceAssetId,
    language: "en",
    duration_seconds: source.duration_seconds ?? 0,
    provider: "pending",
    model: "pending",
    fallback_used: false,
    status: "PROCESSING",
    created_at: createdAt,
    updated_at: createdAt,
  });

  try {
    const videoBytes = await readObjectBytes(r2, source.object_key);
    if (videoBytes === null) {
      throw new CrexError("STORAGE_READ_FAILED", `could not read object ${source.object_key} from R2`);
    }

    const probe = probeMediaFile(videoBytes);

    const audioBytes = extractAudioTrack(videoBytes, probe);
    const audioBase64 = uint8ArrayToBase64(audioBytes);

    const sttResult = await transcribeAudio(audioBase64, options);

    const updatedTranscript = await transcripts.get(transcriptId);
    if (updatedTranscript !== undefined) {
      await transcripts.update(transcriptId, {
        language: sttResult.language ?? "en",
        duration_seconds: sttResult.duration ?? source.duration_seconds ?? 0,
        provider: sttResult.provider,
        model: sttResult.model,
        fallback_used: sttResult.fallbackUsed,
        status: "READY",
      });
    }

    const segments = sttResult.segments ?? [];
    const transcriptSegments = segments.map((seg, idx) => ({
      id: uuid(),
      source_asset_id: sourceAssetId,
      segment_index: idx,
      start_time: seg.start,
      end_time: seg.end,
      text: seg.text,
      created_at: now(),
    }));

    const sections = await generateSemanticSections(
      sttResult.text,
      transcriptSegments,
      uuid,
      now,
    );

    const sectionRepo = new SemanticSectionRepository(db);
    for (const section of sections) {
      await sectionRepo.insert({
        id: section.id,
        understanding_id: understandingId,
        type: section.type,
        start_ms: section.start_ms,
        end_ms: section.end_ms,
        title: section.title,
        transcript_segment_ids: section.transcript_segment_ids,
        summary: section.summary,
        confidence: section.confidence,
        created_at: now(),
        updated_at: now(),
      });
    }

    await understandings.updateStatus(understandingId, "READY");

    return {
      understandingId,
      transcriptId,
      status: "READY",
    };
  } catch (error) {
    await understandings.updateStatus(understandingId, "FAILED").catch(() => undefined);
    await transcripts.update(transcriptId, { status: "FAILED" }).catch(() => undefined);

    const message = error instanceof Error ? error.message : String(error);
    return {
      understandingId,
      transcriptId,
      status: "FAILED",
      error: message,
    };
  }
}

async function readObjectBytes(r2: R2ObjectStore, key: string): Promise<Uint8Array | null> {
  const obj = await r2.get(key);
  if (obj === null || obj.body === null) {
    return null;
  }
  const buffer = await obj.arrayBuffer();
  return new Uint8Array(buffer);
}

function extractAudioTrack(videoBytes: Uint8Array, probe: MediaProbe): Uint8Array {
  if (probe.audio === null) {
    throw new CrexError("NO_AUDIO_TRACK", "video has no audio track to transcribe");
  }

  const boxes = parseMp4Boxes(videoBytes);
  const moov = boxes.find((b) => b.type === "moov");
  if (moov === undefined) {
    throw new CrexError("INVALID_MEDIA", "could not find moov box in MP4");
  }

  const moovChildren = parseMp4Boxes(moov.data);
  const trak = moovChildren.find((child) => {
    if (child.type !== "trak") return false;
    const trakChildren = parseMp4Boxes(child.data);
    const mdia = trakChildren.find((c) => c.type === "mdia");
    if (mdia === undefined) return false;
    const mdiaChildren = parseMp4Boxes(mdia.data);
    const hdlr = mdiaChildren.find((c) => c.type === "hdlr");
    if (hdlr === undefined) return false;
    return hdlr.data.length >= 12 && String.fromCharCode(hdlr.data[8] ?? 0, hdlr.data[9] ?? 0, hdlr.data[10] ?? 0, hdlr.data[11] ?? 0) === "soun";
  });

  if (trak === undefined) {
    throw new CrexError("NO_AUDIO_TRACK", "could not find audio trak in MP4");
  }

  const trakChildren = parseMp4Boxes(trak.data);
  const mdia = trakChildren.find((c) => c.type === "mdia");
  if (mdia === undefined) {
    throw new CrexError("INVALID_MEDIA", "could not find mdia in audio trak");
  }

  const mdiaChildren = parseMp4Boxes(mdia.data);
  const minf = mdiaChildren.find((c) => c.type === "minf");
  if (minf === undefined) {
    throw new CrexError("INVALID_MEDIA", "could not find minf in mdia");
  }

  const minfChildren = parseMp4Boxes(minf.data);
  const stbl = minfChildren.find((c) => c.type === "stbl");
  if (stbl === undefined) {
    throw new CrexError("INVALID_MEDIA", "could not find stbl in minf");
  }

  const stblChildren = parseMp4Boxes(stbl.data);
  const stco = stblChildren.find((c) => c.type === "stco");
  const co64 = stblChildren.find((c) => c.type === "co64");
  const stsz = stblChildren.find((c) => c.type === "stsz");

  if (stsz === undefined) {
    throw new CrexError("INVALID_MEDIA", "could not find stsz in stbl");
  }

  const sampleCount = readUint32BE(stsz.data, 4);
  const sampleSizes: number[] = [];
  const defaultSize = readUint32BE(stsz.data, 8);

  if (defaultSize === 0) {
    for (let i = 0; i < sampleCount; i++) {
      sampleSizes.push(readUint32BE(stsz.data, 12 + i * 4));
    }
  } else {
    for (let i = 0; i < sampleCount; i++) {
      sampleSizes.push(defaultSize);
    }
  }

  let chunkOffsets: number[] = [];
  if (stco !== undefined) {
    const chunkCount = readUint32BE(stco.data, 4);
    for (let i = 0; i < chunkCount; i++) {
      chunkOffsets.push(readUint32BE(stco.data, 8 + i * 4));
    }
  } else if (co64 !== undefined) {
    const chunkCount = readUint32BE(co64.data, 4);
    for (let i = 0; i < chunkCount; i++) {
      chunkOffsets.push(Number(readUint64BE(co64.data, 8 + i * 8)));
    }
  } else {
    throw new CrexError("INVALID_MEDIA", "could not find chunk offset table in stbl");
  }

  let stsc: Array<{ firstChunk: number; samplesPerChunk: number; sampleDescIndex: number }> = [];
  const stscBox = stblChildren.find((c) => c.type === "stsc");
  if (stscBox !== undefined) {
    const entryCount = readUint32BE(stscBox.data, 4);
    for (let i = 0; i < entryCount; i++) {
      stsc.push({
        firstChunk: readUint32BE(stscBox.data, 8 + i * 12),
        samplesPerChunk: readUint32BE(stscBox.data, 12 + i * 12),
        sampleDescIndex: readUint32BE(stscBox.data, 16 + i * 12),
      });
    }
  }

  const audioData: Uint8Array[] = [];
  let sampleIndex = 0;

  for (let chunkIdx = 0; chunkIdx < chunkOffsets.length; chunkIdx++) {
    let samplesInChunk = 1;
    for (let j = stsc.length - 1; j >= 0; j--) {
      const entry = stsc[j];
      if (entry !== undefined && chunkIdx + 1 >= entry.firstChunk) {
        samplesInChunk = entry.samplesPerChunk;
        break;
      }
    }

    let offset = chunkOffsets[chunkIdx] ?? 0;
    for (let s = 0; s < samplesInChunk && sampleIndex < sampleCount; s++) {
      const size = sampleSizes[sampleIndex] ?? 0;
      audioData.push(videoBytes.slice(offset, offset + size));
      offset += size;
      sampleIndex++;
    }
  }

  const totalSize = audioData.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalSize);
  let pos = 0;
  for (const chunk of audioData) {
    result.set(chunk, pos);
    pos += chunk.length;
  }

  return result;
}

interface Mp4Box {
  type: string;
  data: Uint8Array;
  offset: number;
}

function parseMp4Boxes(data: Uint8Array): Mp4Box[] {
  const boxes: Mp4Box[] = [];
  let offset = 0;

  while (offset < data.length) {
    if (offset + 8 > data.length) break;

    const size = readUint32BE(data, offset);
    const type = String.fromCharCode(data[offset + 4] ?? 0, data[offset + 5] ?? 0, data[offset + 6] ?? 0, data[offset + 7] ?? 0);

    if (size < 8) break;
    if (offset + size > data.length) break;

    const boxData = data.slice(offset + 8, offset + size);
    boxes.push({ type, data: boxData, offset });

    if (type === "mdat") break;
    offset += size;
  }

  return boxes;
}

function readUint32BE(data: Uint8Array, offset: number): number {
  const a = data[offset] ?? 0;
  const b = data[offset + 1] ?? 0;
  const c = data[offset + 2] ?? 0;
  const d = data[offset + 3] ?? 0;
  return ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
}

function readUint64BE(data: Uint8Array, offset: number): bigint {
  const a = BigInt(data[offset] ?? 0);
  const b = BigInt(data[offset + 1] ?? 0);
  const c = BigInt(data[offset + 2] ?? 0);
  const d = BigInt(data[offset + 3] ?? 0);
  const e = BigInt(data[offset + 4] ?? 0);
  const f = BigInt(data[offset + 5] ?? 0);
  const g = BigInt(data[offset + 6] ?? 0);
  const h = BigInt(data[offset + 7] ?? 0);
  return (a << 56n) | (b << 48n) | (c << 40n) | (d << 32n) | (e << 24n) | (f << 16n) | (g << 8n) | h;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  return btoa(binary);
}

async function transcribeAudio(
  audioBase64: string,
  options: ProviderOptions,
): Promise<SttTranscriptionResult> {
  const primaryProvider = createSttProvider(options.sttPrimaryProvider ?? "mistral", {
    mistralApiKey: options.mistralApiKey,
    mistralBaseUrl: options.mistralBaseUrl,
    mistralModel: options.sttMistralModel ?? "voxtral-mini-2505",
    openrouterApiKey: options.openrouterApiKey,
    openrouterBaseUrl: options.openrouterBaseUrl,
    openrouterModel: options.sttOpenrouterModel ?? "openai/whisper-large-v3",
    timeoutMs: options.aiTimeoutMs,
  });

  const fallbackName = options.sttPrimaryProvider === "mistral" ? "openrouter" : "mistral";
  const fallbackProvider = createSttProvider(fallbackName, {
    mistralApiKey: options.mistralApiKey,
    mistralBaseUrl: options.mistralBaseUrl,
    mistralModel: options.sttMistralModel ?? "voxtral-mini-2505",
    openrouterApiKey: options.openrouterApiKey,
    openrouterBaseUrl: options.openrouterBaseUrl,
    openrouterModel: options.sttOpenrouterModel ?? "openai/whisper-large-v3",
    timeoutMs: options.aiTimeoutMs,
  });

  return withSttFallback(primaryProvider, fallbackProvider, audioBase64, {}, {
    maxRetries: options.aiMaxRetries,
    retryBaseDelayMs: options.aiRetryBaseDelayMs,
  });
}

interface SemanticSectionInput {
  id: string;
  type: string;
  start_ms: number;
  end_ms: number;
  title: string;
  transcript_segment_ids: string[];
  summary?: string;
  confidence?: number;
}

async function generateSemanticSections(
  transcriptText: string,
  segments: Array<{ id: string; start_time: number; end_time: number; text: string }>,
  uuid: () => string,
  now: () => string,
): Promise<SemanticSectionInput[]> {
  if (segments.length === 0) {
    return [];
  }

  const sections: SemanticSectionInput[] = [];
  const batchSize = 5;

  for (let i = 0; i < segments.length; i += batchSize) {
    const batch = segments.slice(i, i + batchSize);
    const firstSegment = batch[0];
    const lastSegment = batch[batch.length - 1];
    if (firstSegment === undefined || lastSegment === undefined) continue;

    const startMs = Math.round(firstSegment.start_time * 1000);
    const endMs = Math.round(lastSegment.end_time * 1000);

    const batchText = batch.map((s) => s.text).join(" ");
    const title = batchText.length > 60 ? batchText.slice(0, 57) + "..." : batchText;

    sections.push({
      id: uuid(),
      type: "narrative",
      start_ms: startMs,
      end_ms: endMs,
      title,
      transcript_segment_ids: batch.map((s) => s.id),
      summary: batchText,
      confidence: 1.0,
    });
  }

  return sections;
}
