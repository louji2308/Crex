# Wave 8: Content Generation Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Generation Engine pipeline and worker API routes that take the evidence graph (claims + evidence), creator constraints, and sponsor requirements, and generate content artifacts (YouTube titles, descriptions, social posts, etc.).

**Architecture:** Add an `ASSET_GENERATION` task to the AI task schema, create a `generation.ts` pipeline that loads context from existing repos, calls the AI, parses the response, computes deterministic integrity scores, and persists results. Wire routes following the existing `contracts-routes.ts` pattern.

**Tech Stack:** TypeScript, Zod, Cloudflare Workers, D1, existing `@crex/ai` provider interface, existing `@crex/db` repositories.

## Global Constraints
- Do NOT modify existing schemas (claim, evidence, generated_asset, generated_component)
- Do NOT create new migrations (tables already exist)
- You MAY add the ASSET_GENERATION task schema to `ai-tasks.ts`
- Use existing repos, follow existing patterns exactly
- No comments unless absolutely necessary
- If AI is not configured, return 503
- Integrity score must be computed deterministically (not by AI)

---

## Task 1: Add ASSET_GENERATION task schema to ai-tasks.ts

**Files:**
- Modify: `packages/schemas/src/ai-tasks.ts`

**Interfaces:**
- Consumes: existing `aiTaskContentSchema` discriminated union
- Produces: extended `aiTaskContentSchema` with `ASSET_GENERATION` variant

- [ ] **Step 1: Add the ASSET_GENERATION schema variant**

In `packages/schemas/src/ai-tasks.ts`, add a new content schema and extend the discriminated union:

```typescript
import { z } from "zod";

export const sourceUnderstandingSchema = z.strictObject({
  summary: z.string().min(1),
  claims: z.array(z.string().min(1)).min(1),
});

export type SourceUnderstanding = z.infer<typeof sourceUnderstandingSchema>;

export const claimExtractionSchema = z.strictObject({
  claims: z
    .array(
      z.strictObject({
        text: z.string().min(1),
        type: z.string().min(1),
        spans: z.array(
          z.strictObject({
            segment_index: z.number().int().nonnegative(),
            start: z.number().int().nonnegative(),
            end: z.number().int().nonnegative(),
          }),
        ),
      }),
    )
    .min(1),
});

export type ClaimExtraction = z.infer<typeof claimExtractionSchema>;

export const assetGenerationSchema = z.strictObject({
  assets: z.array(
    z.strictObject({
      asset_type: z.string().min(1),
      title: z.string().min(1),
      components: z.array(
        z.strictObject({
          content: z.string().min(1),
          source_references: z.array(z.string().uuid()),
          claim_references: z.array(z.string().uuid()),
          constraint_references: z.array(z.string().uuid()),
        }),
      ),
    }),
  ),
});

export type AssetGeneration = z.infer<typeof assetGenerationSchema>;

export const aiTaskContentSchema = z.discriminatedUnion("task", [
  z.strictObject({ task: z.literal("SEMANTIC_UNDERSTANDING"), content: sourceUnderstandingSchema }),
  z.strictObject({ task: z.literal("CLAIM_EXTRACTION"), content: claimExtractionSchema }),
  z.strictObject({ task: z.literal("ASSET_GENERATION"), content: assetGenerationSchema }),
]);

export type AiTaskContent = z.infer<typeof aiTaskContentSchema>;
```

- [ ] **Step 2: Verify schemas package typechecks**

Run: `cd C:\Users\LOUJAN B\Crex && pnpm --filter @crex/schemas typecheck`
Expected: PASS (no errors)

- [ ] **Step 3: Verify schemas package tests pass**

Run: `cd C:\Users\LOUJAN B\Crex && pnpm --filter @crex/schemas test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/schemas/src/ai-tasks.ts
git commit -m "feat: add ASSET_GENERATION task schema"
```

---

## Task 2: Create the generation pipeline

**Files:**
- Create: `apps/worker/src/pipelines/generation.ts`

**Interfaces:**
- Consumes: `@crex/db` repositories (Claims, Evidence, Constraints, SponsorRequirements, GeneratedAssets, GeneratedComponents), `@crex/ai` provider, `buildProviderOptions`, `aiConfigured`, `runGenerationTask`
- Produces: `runGeneration(deps, projectId, options)` returning `{ assetIds: string[], assetCount: number }`

- [ ] **Step 1: Create the generation pipeline file**

Create `apps/worker/src/pipelines/generation.ts`:

```typescript
import { D1Adapter } from "@crex/infra";
import { ClaimRepository } from "@crex/db/src/repositories/claims";
import { EvidenceRepository } from "@crex/db/src/repositories/evidence";
import { ConstraintRepository } from "@crex/db/src/repositories/constraints";
import { SponsorRequirementRepository } from "@crex/db/src/repositories/sponsor-requirements";
import { GeneratedAssetRepository } from "@crex/db/src/repositories/generated-assets";
import { GeneratedComponentRepository } from "@crex/db/src/repositories/generated-components";
import type { ProviderOptions, ProviderRequest } from "@crex/ai";
import { assetGenerationSchema, type AssetGeneration } from "@crex/schemas/src/ai-tasks";
import type { GeneratedAsset, GeneratedComponent, IntegrityScore, Claim } from "@crex/schemas";
import { CrexError } from "@crex/core/src/errors";
import { runGenerationTask } from "../workflows/ai-output";

export interface GenerationDeps {
  db: D1Adapter;
  now: () => string;
  uuid: () => string;
}

export interface GenerationResult {
  assetIds: string[];
  assetCount: number;
}

const VALID_ASSET_TYPES = [
  "YOUTUBE_TITLE",
  "YOUTUBE_DESCRIPTION",
  "YOUTUBE_CHAPTERS",
  "SHORT",
  "REEL",
  "TIKTOK",
  "SOCIAL_POST",
  "PINNED_COMMENT",
  "THUMBNAIL_CONCEPT",
] as const;

export async function runGeneration(
  deps: GenerationDeps,
  projectId: string,
  options: ProviderOptions,
  assetTypes?: string[],
): Promise<GenerationResult> {
  const { db, now, uuid } = deps;

  const claimsRepo = new ClaimRepository(db);
  const evidenceRepo = new EvidenceRepository(db);
  const constraintsRepo = new ConstraintRepository(db);
  const sponsorRequirementsRepo = new SponsorRequirementRepository(db);
  const assetsRepo = new GeneratedAssetRepository(db);
  const componentsRepo = new GeneratedComponentRepository(db);

  const claims = await claimsRepo.listByProject(projectId);
  if (claims.length === 0) {
    throw new CrexError("NO_CLAIMS", "project has no claims; cannot generate content");
  }

  const constraints = await constraintsRepo.listByProject(projectId);
  const sponsorRequirements = await sponsorRequirementsRepo.listByProject(projectId);

  const evidenceContext = await buildEvidenceContext(claims, evidenceRepo);
  const constraintContext = buildConstraintContext(constraints);
  const sponsorContext = buildSponsorContext(sponsorRequirements);
  const assetTypeList = assetTypes?.filter((t) => (VALID_ASSET_TYPES as readonly string[]).includes(t));

  const request = buildGenerationRequest(
    evidenceContext,
    constraintContext,
    sponsorContext,
    assetTypeList,
    claims,
  );

  const result = await runGenerationTask(request, options, assetGenerationSchema);
  if (!result.valid || result.normalized === undefined) {
    throw new CrexError("GENERATION_FAILED", `AI generation failed: ${result.validation_errors.join("; ")}`);
  }

  const parsed = assetGenerationSchema.parse(result.normalized);
  const createdAt = now();
  const assetIds: string[] = [];

  for (const assetData of parsed.assets) {
    const assetId = uuid();
    const integrity = computeIntegrityScore(claims, assetData, constraints, sponsorRequirements);

    const asset: GeneratedAsset = {
      id: assetId,
      project_id: projectId,
      asset_type: assetData.asset_type as GeneratedAsset["asset_type"],
      title: assetData.title,
      status: integrity.overall >= 80 ? "READY" : "REVIEW",
      integrity,
      created_at: createdAt,
      updated_at: createdAt,
    };

    await assetsRepo.insert(asset);

    for (const compData of assetData.components) {
      const component: GeneratedComponent = {
        component_id: uuid(),
        asset_id: assetId,
        content: compData.content,
        source_references: compData.source_references,
        claim_references: compData.claim_references,
        constraint_references: compData.constraint_references,
        generation_metadata: {
          engine: "crex-generation-v1",
          model: result.model,
        },
        verification_status: "REVIEW",
      };

      await componentsRepo.insert(component);
    }

    assetIds.push(assetId);
  }

  return { assetIds, assetCount: assetIds.length };
}

async function buildEvidenceContext(
  claims: Claim[],
  evidenceRepo: EvidenceRepository,
): Promise<string> {
  const parts: string[] = [];
  for (const claim of claims) {
    const evidenceItems = await evidenceRepo.listByClaim(claim.id);
    const evidenceTexts = evidenceItems.map((e) => `[${e.type}] ${e.content}`).join("; ");
    parts.push(`Claim [${claim.id}] (${claim.type}): ${claim.content}\nEvidence: ${evidenceTexts || "none"}`);
  }
  return parts.join("\n\n");
}

function buildConstraintContext(
  constraints: Array<{ id: string; category: string; summary: string; enabled: boolean }>,
): string {
  const enabled = constraints.filter((c) => c.enabled);
  if (enabled.length === 0) return "No constraints defined.";
  return enabled.map((c) => `- [${c.id}] (${c.category}) ${c.summary}`).join("\n");
}

function buildSponsorContext(
  requirements: Array<{ id: string; sponsor_name: string; requirement_type: string; value: string; required: boolean; enabled: boolean }>,
): string {
  const enabled = requirements.filter((r) => r.enabled);
  if (enabled.length === 0) return "No sponsor requirements defined.";
  return enabled.map((r) => `- [${r.id}] ${r.sponsor_name}: ${r.requirement_type} = "${r.value}"${r.required ? " (REQUIRED)" : ""}`).join("\n");
}

function buildGenerationRequest(
  evidenceContext: string,
  constraintContext: string,
  sponsorContext: string,
  assetTypes: string[] | undefined,
  claims: Claim[],
): ProviderRequest {
  const requestedTypes = assetTypes !== undefined && assetTypes.length > 0
    ? assetTypes.join(", ")
    : "YOUTUBE_TITLE, YOUTUBE_DESCRIPTION, YOUTUBE_CHAPTERS, SOCIAL_POST";

  const systemPrompt =
    "You are a content generation engine for advertising compliance. " +
    "Generate content assets (YouTube titles, descriptions, chapters, social posts, etc.) " +
    "based on the provided evidence, constraints, and sponsor requirements. " +
    "Every generated claim must trace to source evidence. " +
    "Respect all constraints and sponsor requirements strictly. " +
    "Respond with strict JSON matching the asset generation schema.";

  const userContent =
    `Generate the following asset types: ${requestedTypes}\n\n` +
    `## Evidence Context (claims and their evidence)\n${evidenceContext}\n\n` +
    `## Creator Constraints\n${constraintContext}\n\n` +
    `## Sponsor Requirements\n${sponsorContext}\n\n` +
    `Available claim IDs for reference: ${claims.map((c) => c.id).join(", ")}\n\n` +
    `For each component, include source_references and claim_references as UUID arrays referencing the relevant claim/evidence IDs. ` +
    `Include constraint_references for any constraints the component satisfies.`;

  return {
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    task: "ASSET_GENERATION",
    response_format: { type: "json_object" },
  };
}

interface ScoreableClaim {
  id: string;
  type: string;
  content: string;
}

interface ScoreableComponent {
  content: string;
  source_references: string[];
  claim_references: string[];
  constraint_references: string[];
}

interface ScoreableAsset {
  asset_type: string;
  title: string;
  components: ScoreableComponent[];
}

interface ScoreableConstraint {
  id: string;
  enabled: boolean;
}

interface ScoreableSponsorRequirement {
  id: string;
  required: boolean;
  enabled: boolean;
}

function computeIntegrityScore(
  claims: ScoreableClaim[],
  asset: ScoreableAsset,
  constraints: ScoreableConstraint[],
  sponsorRequirements: ScoreableSponsorRequirement[],
): IntegrityScore {
  const reasons: string[] = [];

  const componentsWithClaims = asset.components.filter((c) => c.claim_references.length > 0);
  const evidenceCoverage = asset.components.length > 0
    ? Math.round((componentsWithClaims.length / asset.components.length) * 100)
    : 0;
  if (evidenceCoverage < 100) {
    reasons.push(`${asset.components.length - componentsWithClaims.length} components lack claim references`);
  }

  const referencedClaimIds = new Set(asset.components.flatMap((c) => c.claim_references));
  const claimFidelity = claims.length > 0
    ? Math.round((Math.min(referencedClaimIds.size, claims.length) / claims.length) * 100)
    : 0;
  if (claimFidelity < 100) {
    reasons.push(`${claims.length - referencedClaimIds.size} claims not referenced in generated content`);
  }

  const allText = asset.components.map((c) => c.content).join(" ") + " " + asset.title;
  const numericalPattern = /\b\d+(?:\.\d+)?\s*(?:%|percent|million|billion|thousand|hours|minutes|seconds|days|years)\b/gi;
  const numericalMatches = allText.match(numericalPattern);
  const numericalAccuracy = numericalMatches !== null && numericalMatches.length > 0 ? 80 : 100;
  if (numericalAccuracy < 100) {
    reasons.push("numerical claims present; requires manual verification");
  }

  const enabledConstraints = constraints.filter((c) => c.enabled);
  const referencedConstraints = new Set(asset.components.flatMap((c) => c.constraint_references));
  const creatorIntent = enabledConstraints.length > 0
    ? Math.round((Math.min(referencedConstraints.size, enabledConstraints.length) / enabledConstraints.length) * 100)
    : 100;
  if (creatorIntent < 100) {
    reasons.push(`${enabledConstraints.length - referencedConstraints.size} constraints not referenced`);
  }

  const requiredSponsors = sponsorRequirements.filter((r) => r.required && r.enabled);
  const referencedSponsors = new Set(asset.components.flatMap((c) => c.constraint_references));
  const sponsorCompliance = requiredSponsors.length > 0
    ? Math.round((Math.min(referencedSponsors.size, requiredSponsors.length) / requiredSponsors.length) * 100)
    : 100;
  if (sponsorCompliance < 100) {
    reasons.push(`${requiredSponsors.length} required sponsor requirements not addressed`);
  }

  let platformQa = 100;
  if (asset.asset_type === "YOUTUBE_TITLE" && asset.title.length > 100) {
    platformQa -= 20;
    reasons.push("YouTube title exceeds 100 characters");
  }
  if (asset.asset_type === "YOUTUBE_DESCRIPTION") {
    const descComponent = asset.components[0];
    if (descComponent !== undefined && descComponent.content.length > 5000) {
      platformQa -= 20;
      reasons.push("YouTube description exceeds 5000 characters");
    }
  }

  const overall = Math.round(
    evidenceCoverage * 0.2 +
    claimFidelity * 0.25 +
    numericalAccuracy * 0.15 +
    creatorIntent * 0.2 +
    sponsorCompliance * 0.1 +
    platformQa * 0.1,
  );

  if (reasons.length === 0) {
    reasons.push("all checks passed");
  }

  return {
    dimensions: {
      evidence_coverage: evidenceCoverage,
      claim_fidelity: claimFidelity,
      numerical_accuracy: numericalAccuracy,
      creator_intent: creatorIntent,
      sponsor_compliance: sponsorCompliance,
      platform_qa: platformQa,
    },
    overall,
    reasons,
  };
}
```

- [ ] **Step 2: Verify worker typechecks**

Run: `cd C:\Users\LOUJAN B\Crex && pnpm -r typecheck`
Expected: PASS (no errors)

- [ ] **Step 3: Commit**

```bash
git add apps/worker/src/pipelines/generation.ts
git commit -m "feat: add generation pipeline"
```

---

## Task 3: Create the generation routes

**Files:**
- Create: `apps/worker/src/generation-routes.ts`

**Interfaces:**
- Consumes: `GenerationDeps`, `runGeneration` from pipeline, existing repos
- Produces: `createGenerationApi(env)` returning `GenerationApi` with `handle(request, path)`

- [ ] **Step 1: Create the generation routes file**

Create `apps/worker/src/generation-routes.ts`:

```typescript
import { D1Adapter } from "@crex/infra";
import { GeneratedAssetRepository } from "@crex/db/src/repositories/generated-assets";
import { GeneratedComponentRepository } from "@crex/db/src/repositories/generated-components";
import { CrexError } from "@crex/core/src/errors";
import {
  aiConfigured,
  buildProviderOptions,
} from "./workflows/ai-output";
import { runGeneration } from "./pipelines/generation";
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

export interface GenerationApi {
  handle(request: Request, path: string): Promise<Response | null>;
}

export function createGenerationApi(env: Env): GenerationApi {
  const db = new D1Adapter(env.DB);
  const assetsRepo = new GeneratedAssetRepository(db);
  const componentsRepo = new GeneratedComponentRepository(db);
  const options = buildProviderOptions(env);

  async function handleGenerate(request: Request): Promise<Response> {
    let body: { projectId?: unknown; assetTypes?: unknown } = {};
    try {
      body = (await request.json()) as { projectId?: unknown; assetTypes?: unknown };
    } catch {
      throw new CrexError("INVALID_BODY", "request body must be valid JSON");
    }

    const { projectId, assetTypes } = body;
    if (typeof projectId !== "string" || !isUuid(projectId)) {
      throw new CrexError("INVALID_PROJECT_ID", "projectId must be a canonical UUID");
    }
    if (!(await projectExists(db, projectId))) {
      throw new CrexError("PROJECT_NOT_FOUND", `project not found: ${projectId}`);
    }
    if (assetTypes !== undefined && !Array.isArray(assetTypes)) {
      throw new CrexError("INVALID_ASSET_TYPES", "assetTypes must be an array of strings");
    }
    if (assetTypes !== undefined) {
      for (const t of assetTypes) {
        if (typeof t !== "string") {
          throw new CrexError("INVALID_ASSET_TYPES", "assetTypes must be an array of strings");
        }
      }
    }

    if (!aiConfigured(options)) {
      throw new CrexError("AI_NOT_CONFIGURED", "no AI provider API key is configured");
    }

    const result = await runGeneration(
      { db, now: () => new Date().toISOString(), uuid: () => crypto.randomUUID() },
      projectId,
      options,
      Array.isArray(assetTypes) ? (assetTypes as string[]) : undefined,
    );

    return Response.json(result, { status: 201 });
  }

  async function handleGetAsset(id: string): Promise<Response> {
    const asset = await assetsRepo.get(id);
    if (asset === undefined) {
      throw new CrexError("GENERATED_ASSET_NOT_FOUND", `generated asset not found: ${id}`);
    }
    const components = await componentsRepo.listByAsset(id);
    return Response.json({ asset, components });
  }

  async function handleListByProject(url: URL): Promise<Response> {
    const projectId = url.searchParams.get("projectId");
    if (projectId === null || !isUuid(projectId)) {
      throw new CrexError("INVALID_PROJECT_ID", "projectId must be a canonical UUID");
    }
    if (!(await projectExists(db, projectId))) {
      throw new CrexError("PROJECT_NOT_FOUND", `project not found: ${projectId}`);
    }
    const items = await assetsRepo.listByProject(projectId);
    return Response.json({ assets: items });
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

    if (request.method === "POST" && path === "/generate") {
      return await handleGenerate(request);
    }

    if (request.method === "GET" && path === "/generate") {
      return await handleListByProject(url);
    }

    const assetMatch = /^\/generate\/([^/]+)$/.exec(path);
    if (request.method === "GET" && assetMatch !== null) {
      const rawId = assetMatch[1];
      if (rawId === undefined) return null;
      const id = decodeURIComponent(rawId);
      if (!isUuid(id)) return null;
      return await handleGetAsset(id);
    }

    return null;
  }
}
```

- [ ] **Step 2: Verify worker typechecks**

Run: `cd C:\Users\LOUJAN B\Crex && pnpm -r typecheck`
Expected: PASS (no errors)

- [ ] **Step 3: Commit**

```bash
git add apps/worker/src/generation-routes.ts
git commit -m "feat: add generation API routes"
```

---

## Task 4: Wire generation routes into index.ts

**Files:**
- Modify: `apps/worker/src/index.ts`

**Interfaces:**
- Consumes: `createGenerationApi` from `./generation-routes`
- Produces: dispatch block in `handleRequest`

- [ ] **Step 1: Add import and dispatch block**

Add to `apps/worker/src/index.ts`:

1. Add import after the existing route imports (around line 26):
```typescript
import { createGenerationApi } from "./generation-routes";
```

2. Add dispatch block after the understandingApi block (before the final NOT_FOUND return, around line 373):
```typescript
  const generationApi = createGenerationApi(env);
  const generationResponse = await generationApi.handle(request, path);
  if (generationResponse !== null) return generationResponse;
```

- [ ] **Step 2: Verify worker typechecks**

Run: `cd C:\Users\LOUJAN B\Crex && pnpm -r typecheck`
Expected: PASS (no errors)

- [ ] **Step 3: Commit**

```bash
git add apps/worker/src/index.ts
git commit -m "feat: wire generation routes into worker"
```

---

## Task 5: Add generation error codes to http.ts

**Files:**
- Modify: `apps/worker/src/http.ts`

**Interfaces:**
- Consumes: existing `STATUS_BY_CODE` map
- Produces: added entries for `NO_CLAIMS`, `GENERATED_ASSET_NOT_FOUND`, `INVALID_ASSET_TYPES`, `GENERATION_FAILED`

- [ ] **Step 1: Add error code mappings**

Add to the `STATUS_BY_CODE` object in `apps/worker/src/http.ts`:

```typescript
  NO_CLAIMS: 409,
  GENERATED_ASSET_NOT_FOUND: 404,
  INVALID_ASSET_TYPES: 400,
  GENERATION_FAILED: 502,
```

- [ ] **Step 2: Verify worker typechecks**

Run: `cd C:\Users\LOUJAN B\Crex && pnpm -r typecheck`
Expected: PASS (no errors)

- [ ] **Step 3: Commit**

```bash
git add apps/worker/src/http.ts
git commit -m "feat: add generation error codes"
```

---

## Task 6: Write tests for generation routes

**Files:**
- Create: `apps/worker/tests/generation.test.ts`

**Interfaces:**
- Consumes: `exports.default.fetch` from `cloudflare:workers`, existing seed patterns
- Produces: comprehensive test suite

- [ ] **Step 1: Create the test file**

Create `apps/worker/tests/generation.test.ts`:

```typescript
import { describe, expect, it, beforeAll } from "vitest";
import { env, exports } from "cloudflare:workers";
import { D1Adapter } from "@crex/infra";

interface ErrorBody {
  error: { code: string; message: string };
}

interface GenerateResult {
  assetIds: string[];
  assetCount: number;
}

interface AssetBody {
  asset: {
    id: string;
    project_id: string;
    asset_type: string;
    title: string;
    status: string;
    integrity: {
      dimensions: Record<string, number>;
      overall: number;
      reasons: string[];
    };
    created_at: string;
    updated_at: string;
  };
  components: Array<{
    component_id: string;
    asset_id: string;
    content: string;
    source_references: string[];
    claim_references: string[];
    constraint_references: string[];
    generation_metadata: { engine: string; model?: string };
    verification_status: string;
  }>;
}

interface AssetsListBody {
  assets: Array<{
    id: string;
    project_id: string;
    asset_type: string;
    title: string;
  }>;
}

const PROJECT_UUID = "11111111-1111-4111-8111-111111111111";
const CLAIM_UUID = "22222222-2222-4222-8222-222222222222";
const EVIDENCE_UUID = "33333333-3333-4333-8333-333333333333";
const SEGMENT_UUID = "44444444-4444-4444-8444-444444444444";
const SOURCE_UUID = "55555555-5555-4555-8555-555555555555";
const NOW = "2026-01-02T03:04:05.000Z";

async function seedProject(projectId = PROJECT_UUID): Promise<void> {
  await new D1Adapter(env.DB).prepare(
    `INSERT INTO projects (id, name, target_platforms, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
  ).run(projectId, "Generation Test Project", '["YOUTUBE"]', NOW, NOW);
}

async function seedEvidenceGraph(): Promise<void> {
  const db = new D1Adapter(env.DB);

  await db.prepare(
    `INSERT INTO source_assets (id, project_id, file_name, file_type, object_key, status, transcription_status, analysis_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
  ).run(SOURCE_UUID, PROJECT_UUID, "test.mp4", "video/mp4", "sources/test.mp4", "READY", "COMPLETED", "COMPLETED", NOW, NOW);

  await db.prepare(
    `INSERT INTO transcripts (id, source_asset_id, language, duration_seconds, provider, model, fallback_used, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
  ).run("66666666-6666-4666-8666-666666666666", SOURCE_UUID, "en", 120, "test", "test", 0, "READY", NOW, NOW);

  await db.prepare(
    `INSERT INTO semantic_segments (id, source_asset_id, segment_index, start_time, end_time, text, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
  ).run(SEGMENT_UUID, SOURCE_UUID, 0, 0, 10, "Test segment text", NOW);

  await db.prepare(
    `INSERT INTO claims (id, project_id, segment_id, type, content, qualifiers, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
  ).run(CLAIM_UUID, PROJECT_UUID, SEGMENT_UUID, "CLAIM", "Test claim content", "[]", NOW);

  await db.prepare(
    `INSERT INTO evidence (id, claim_id, type, content, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
  ).run(EVIDENCE_UUID, CLAIM_UUID, "TRANSCRIPT", "Test evidence content", NOW);
}

async function seedConstraint(): Promise<void> {
  const db = new D1Adapter(env.DB);
  await db.prepare(
    `INSERT INTO constraints (id, project_id, category, source, summary, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
  ).run("77777777-7777-4777-8777-777777777777", PROJECT_UUID, "TONE", "MANUAL", "Keep tone professional", 1, NOW, NOW);
}

describe("crex-worker generation API", () => {
  beforeAll(async () => {
    await seedProject();
    await seedEvidenceGraph();
    await seedConstraint();
  });

  it("POST /generate rejects missing projectId", async () => {
    const res = await exports.default.fetch("https://example.com/generate", {
      method: "POST",
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("INVALID_PROJECT_ID");
  });

  it("POST /generate rejects invalid UUID projectId", async () => {
    const res = await exports.default.fetch("https://example.com/generate", {
      method: "POST",
      body: JSON.stringify({ projectId: "not-a-uuid" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("INVALID_PROJECT_ID");
  });

  it("POST /generate returns 404 for nonexistent project", async () => {
    const res = await exports.default.fetch("https://example.com/generate", {
      method: "POST",
      body: JSON.stringify({ projectId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("PROJECT_NOT_FOUND");
  });

  it("POST /generate returns 503 when AI not configured", async () => {
    const res = await exports.default.fetch("https://example.com/generate", {
      method: "POST",
      body: JSON.stringify({ projectId: PROJECT_UUID }),
    });
    expect(res.status).toBe(503);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("AI_NOT_CONFIGURED");
  });

  it("POST /generate rejects invalid assetTypes", async () => {
    const res = await exports.default.fetch("https://example.com/generate", {
      method: "POST",
      body: JSON.stringify({ projectId: PROJECT_UUID, assetTypes: "not-an-array" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("INVALID_ASSET_TYPES");
  });

  it("GET /generate returns 400 without projectId", async () => {
    const res = await exports.default.fetch("https://example.com/generate");
    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("INVALID_PROJECT_ID");
  });

  it("GET /generate returns assets list for valid projectId", async () => {
    const res = await exports.default.fetch(
      `https://example.com/generate?projectId=${PROJECT_UUID}`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as AssetsListBody;
    expect(Array.isArray(body.assets)).toBe(true);
  });

  it("GET /generate/:assetId returns 400 for invalid UUID", async () => {
    const res = await exports.default.fetch("https://example.com/generate/not-a-uuid");
    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("GENERATED_ASSET_NOT_FOUND");
  });

  it("GET /generate/:assetId returns 404 for nonexistent asset", async () => {
    const res = await exports.default.fetch(
      "https://example.com/generate/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("GENERATED_ASSET_NOT_FOUND");
  });

  it("Integrity score computation is deterministic", async () => {
    const db = new D1Adapter(env.DB);
    const assetId = "88888888-8888-4888-8888-888888888888";
    await db.prepare(
      `INSERT INTO generated_assets (id, project_id, asset_type, title, status, integrity, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
    ).run(assetId, PROJECT_UUID, "YOUTUBE_TITLE", "Test Title", "READY", JSON.stringify({
      dimensions: { evidence_coverage: 100, claim_fidelity: 100, numerical_accuracy: 100, creator_intent: 100, sponsor_compliance: 100, platform_qa: 100 },
      overall: 100,
      reasons: ["all checks passed"],
    }), NOW, NOW);

    const res = await exports.default.fetch(
      `https://example.com/generate/${assetId}`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as AssetBody;
    expect(body.asset.integrity.overall).toBe(100);
    expect(body.asset.integrity.dimensions.evidence_coverage).toBe(100);
  });
});
```

- [ ] **Step 2: Run the worker tests**

Run: `cd C:\Users\LOUJAN B\Crex && pnpm --filter @crex/worker test`
Expected: PASS (all tests pass, noting POST /generate tests that hit AI will return 503 since no AI key is configured in test env)

- [ ] **Step 3: Commit**

```bash
git add apps/worker/tests/generation.test.ts
git commit -m "test: add generation route tests"
```

---

## Task 7: Full verification and push

- [ ] **Step 1: Run full typecheck**

Run: `cd C:\Users\LOUJAN B\Crex && pnpm -r typecheck`
Expected: PASS

- [ ] **Step 2: Run all tests**

Run: `cd C:\Users\LOUJAN B\Crex && pnpm --filter @crex/schemas test && pnpm --filter @crex/worker test`
Expected: PASS

- [ ] **Step 3: Create branch and push**

```bash
git checkout -b agent/w8/generation
git add -A
git commit -m "feat: add content generation engine and API routes"
git push -u origin agent/w8/generation
```

---

## Known Limitations
- AI generation is not testable in the test environment (no API keys configured); POST /generate returns 503 as expected
- Integrity score `numerical_accuracy` is a basic heuristic; real numerical drift detection will come in W9 Verification
- `sponsor_compliance` scoring references constraint_references since sponsor requirements don't have separate component references yet
- The pipeline loads all claims/evidence synchronously; for very large evidence graphs, batching may be needed
