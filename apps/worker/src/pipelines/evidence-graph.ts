import { D1Adapter } from "@crex/infra";
import { UnderstandingRepository } from "@crex/db/src/repositories/understandings";
import { TranscriptRepository } from "@crex/db/src/repositories/transcripts";
import { TranscriptSegmentRepository } from "@crex/db/src/repositories/transcript-segments";
import { SemanticSectionRepository } from "@crex/db/src/repositories/semantic-sections";
import { ClaimRepository } from "@crex/db/src/repositories/claims";
import { EvidenceRepository } from "@crex/db/src/repositories/evidence";
import { CrexError } from "@crex/core/src/errors";
import type { ProviderOptions, ProviderRequest } from "@crex/ai";
import { claimExtractionSchema } from "@crex/schemas/src/ai-tasks";
import type { ClaimExtraction } from "@crex/schemas/src/ai-tasks";
import {
  aiConfigured,
  runGenerationTask,
} from "../workflows/ai-output";

export interface EvidenceGraphDeps {
  db: D1Adapter;
  now: () => string;
  uuid: () => string;
}

export interface EvidenceGraphResult {
  claimCount: number;
  evidenceCount: number;
  claimIds: string[];
}

export async function runEvidenceGraph(
  deps: EvidenceGraphDeps,
  understandingId: string,
  projectId: string,
  options: ProviderOptions,
): Promise<EvidenceGraphResult> {
  const { db, now, uuid } = deps;

  if (!aiConfigured(options)) {
    throw new CrexError("AI_NOT_CONFIGURED", "no AI provider API key is configured");
  }

  const understandings = new UnderstandingRepository(db);
  const transcripts = new TranscriptRepository(db);
  const segments = new TranscriptSegmentRepository(db);
  const claimRepo = new ClaimRepository(db);
  const evidenceRepo = new EvidenceRepository(db);

  const understanding = await understandings.get(understandingId);
  if (understanding === undefined) {
    throw new CrexError("UNDERSTANDING_NOT_FOUND", `understanding not found: ${understandingId}`);
  }
  if (understanding.status !== "READY") {
    throw new CrexError(
      "INVALID_UNDERSTANDING_STATE",
      `understanding ${understandingId} has status ${understanding.status}; expected READY`,
    );
  }

  const transcriptId = understanding.transcript_id;
  if (transcriptId === undefined || transcriptId === null) {
    throw new CrexError("TRANSCRIPT_NOT_FOUND", `understanding ${understandingId} has no transcript`);
  }

  const transcript = await transcripts.get(transcriptId);
  if (transcript === undefined) {
    throw new CrexError("TRANSCRIPT_NOT_FOUND", `transcript not found: ${transcriptId}`);
  }

  const transcriptSegments = await segments.listBySourceAsset(understanding.source_asset_id);
  if (transcriptSegments.length === 0) {
    return { claimCount: 0, evidenceCount: 0, claimIds: [] };
  }

  const segmentById = new Map(transcriptSegments.map((s) => [s.id, s]));
  const segmentByIndex = new Map(transcriptSegments.map((s) => [s.segment_index, s]));

  const transcriptText = transcriptSegments
    .map((s) => `[${s.segment_index}] (${s.start_time}s-${s.end_time}s) ${s.text}`)
    .join("\n");

  const request: ProviderRequest = {
    messages: [
      {
        role: "system",
        content:
          "You are an expert content analyst. Extract factual claims, opinions, recommendations, " +
          "and numerical assertions from this transcript. For each claim, provide the text, type " +
          "(CLAIM/OPINION/RECOMMENDATION/NUMERICAL), and span references indicating which segments " +
          "contain the claim.",
      },
      { role: "user", content: transcriptText },
    ],
    task: "CLAIM_EXTRACTION",
    response_format: { type: "json_object" },
  };

  const result = await runGenerationTask(request, options, claimExtractionSchema);
  const raw = claimExtractionSchema.parse(result.normalized);

  const claimIds: string[] = [];
  let evidenceCount = 0;

  for (const extracted of raw.claims) {
    const claimId = uuid();
    const createdAt = now();

    const firstSpan = extracted.spans[0];
    const segmentId =
      firstSpan !== undefined
        ? (segmentByIndex.get(firstSpan.segment_index)?.id ?? transcriptSegments[0]!.id)
        : transcriptSegments[0]!.id;

    const claimType = ["CLAIM", "OPINION", "RECOMMENDATION", "NUMERICAL"].includes(extracted.type)
      ? (extracted.type as "CLAIM" | "OPINION" | "RECOMMENDATION" | "NUMERICAL")
      : "CLAIM";

    await claimRepo.insert({
      id: claimId,
      project_id: projectId,
      segment_id: segmentId,
      type: claimType,
      content: extracted.text,
      qualifiers: [],
      created_at: createdAt,
    });

    claimIds.push(claimId);

    for (const span of extracted.spans) {
      const seg = segmentByIndex.get(span.segment_index);
      if (seg === undefined) continue;

      const evidenceId = uuid();
      const sourceRange =
        span.start <= span.end
          ? { start: span.start, end: span.end }
          : undefined;

      await evidenceRepo.insert({
        id: evidenceId,
        claim_id: claimId,
        type: "TRANSCRIPT",
        content: seg.text,
        source_range: sourceRange,
        created_at: createdAt,
      });
      evidenceCount++;
    }

    if (extracted.spans.length === 0) {
      const evidenceId = uuid();
      await evidenceRepo.insert({
        id: evidenceId,
        claim_id: claimId,
        type: "TRANSCRIPT",
        content: extracted.text,
        created_at: createdAt,
      });
      evidenceCount++;
    }
  }

  return { claimCount: claimIds.length, evidenceCount, claimIds };
}
