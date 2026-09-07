# Crex â€” Engineering Progress

## Current Status

**Phase:** Wave 3 - Source Ingestion Pipeline (IMPLEMENTED + TESTED) / **Live D1 provisioning COMPLETE**
**Date:** September 7, 2026
**Hackathon Deadline:** September 8, 2026 - 8:00 AM ET

**Wave 3 committed and pushed on main:**
- `1c9b3e0` - source upload sessions (migration 0004), asset lifecycle transitions (SOURCE_STATE_TRANSITIONS), `@crex/media` inspection package.
- `58666c1` - source upload HTTP API + minimal UI + deterministic workflow ingestion.
- `e1e7152` - Wave 3 finalization: FixedLengthStream restore (413 on content-length mismatch), runtime matrix A1-A8, Worker B security regression, README/progress alignment. 480 tests.
- `45c3de2` - W6/W7 Creator Intent & Sponsor Contract persistence (constraints/sponsor_requirements migrated; 482 tests).

**Live D1 provisioning + deployment COMPLETE:**
- Real production D1 `crex`: `database_id = b01526fc-40b4-4024-8616-b2fb6099d94d` in `apps/worker/wrangler.jsonc` (was placeholder).
- Migrations `0001`-`0006` applied to the remote D1: `npx wrangler d1 migrations apply crex --remote`; 15 app tables + `d1_migrations` verified remotely (APAC/SIN).
- R2 bucket `crex-media` created (account R2 enabled); bound as `MEDIA`.
- Worker deployed: https://crex-worker.loujanb2008.workers.dev (bindings DB / MEDIA / SOURCE_TO_RELEASE / AI vars).
- Live proof through the deployed worker: seed project -> POST /sources 201 -> PUT blob 200 VALID (real R2 + D1 insert) -> poll VALID -> POST /workflows/source-to-release -> source READY ~2s; remote D1 `source_assets` row read back READY (998 B, checksum match).
- Live AI proof: POST /ai/analyze -> NVIDIA EOL -> OpenRouter fallback -> HTTP 201; `AiOutput` persisted to remote D1 `ai_outputs` (provider openrouter, fallback_used 1).

**Integration status:** Wave 3 + Wave 6/7 committed and pushed. OpenRouter provider live (NVIDIA -> OpenRouter) committed and pushed (`19eb3da`). **Monorepo green**: `pnpm -r typecheck` all pass; `pnpm -r test` all pass consistently (verified 4 consecutive full runs). The pre-existing `apps/web` scaffold typecheck error from `45c3de2` is FIXED (ProjectForm TS2345), and `apps/web` `vitest run` now exits 0 via `passWithNoTests`. A flaky `packages/db` timestamp race in `repositories.test.ts` was root-caused (frozen fixture timestamps vs insert-time `toISOString()`) and fixed.

---


## Wave 3: Source Ingestion Pipeline (FINAL REVIEW)

### Completed

- SourceAsset state machine + lifecycle transitions (SOURCE_STATE_TRANSITIONS) in packages/db/src/repositories/source-assets.ts.
- Source upload sessions: migration `0004_source_uploads.sql` (0001-0004 applied to local dev D1, verified) + SourceUploadRepository.
- @crex/media package: incremental SHA-256, MP4 probe, validation, MP4 fixtures (29 tests).
- Upload HTTP API + minimal UI in `apps/worker`:
  - POST /sources (201), PUT /sources/:uploadId/blob (streamed, memory-bounded; 200 VALID/INVALID), GET /sources/:uploadId (poll), GET /sources?projectId= (list), GET /sources/ui.
  - Body streamed to R2 with in-flight SHA-256 + size-cap guard (413 when the cap is exceeded or the byte count mismatches the declared content-length; marks session FAILED).
  - New error codes: INVALID_FILE_NAME, UPLOAD_NOT_FOUND, SOURCE_NOT_FOUND, SOURCE_UPLOAD_STATE, INVALID_SOURCE_STATE, INVALID_SOURCE_ID, SOURCE_CHECKSUM_MISMATCH, SOURCE_TOO_LARGE, STORAGE_UPLOAD_FAILED.
- Workflow integration: SourceToReleaseParams.sourceId? + deterministic ingest-source-asset step that re-verifies R2 object presence, size, and streamed SHA-256 against stored checksum, then VALID -> PROCESSING -> READY (or FAILED + SOURCE_CHECKSUM_MISMATCH).
- Tests: worker suite 65 -> 66 (source-ingestion 8 tests incl. workflow-to-READY round trip). Full monorepo 471 tests green, all typechecks green.
- Committed + pushed: `1c9b3e0` (foundation) and `58666c1` (API + UI + workflow ingestion).

### Known Limitations

- INVALID validation reason is returned in the API response and shown in the UI but NOT persisted on the source row (only status + session error). Documented intentionally.
- Live AI calls verified via OpenRouter fallback (NVIDIA primary model `meta/llama-3.3-70b-instruct` is end-of-life -> real calls fall back to OpenRouter; `AiOutput` persisted to remote D1). Mistral remains a defined provider but its configured model is tier-blocked on the available key.
- Upload routes have no auth or rate limiting yet (prototype scope).
- Media validation is MP4/ISO-BMFF-focused; other containers are rejected as unsupported.

### Remaining

- Runtime smoke + failure matrix on the local worker (Workers A/B).
- Security review (filename/object-key handling, R2, size guards) final pass.
- Live AI calls verified via OpenRouter fallback; live D1/R2/Worker deploy DONE (see Current Status). Next: pin an active NVIDIA model or make NVIDIA key provisioned/working; then Wave 4 video understanding.
- Then Wave 4 planning (video understanding).

## Repository State

```text
Branch: main
Commits: in sync with origin (Wave 1-3 committed & pushed)
Source Code: SUBSTANTIAL (packages/ + apps/worker)
Specification: COMPLETE
Architecture: DEFINED
Implementation Plan: DEFINED
```

---

## What Exists

| Asset | Status | Notes |
|-------|--------|-------|
| AGENTS.md | COMPLETE | 2223-line engineering operating system |
| README.md | UPDATED | Wave 3 state aligned this session |
| Project Spec/ | COMPLETE | 4 specification documents |
| .gitignore | COMPLETE | Living file, updated continuously |
| progress.md | COMPLETE | Operational record |
| docs/engineering-baseline.md | COMPLETE | Created this session |
| docs/implementation/spec-audit.md | COMPLETE | Worker A deliverable |
| docs/implementation/repository-audit.md | COMPLETE | Worker B deliverable |
| docs/implementation/risk-register.md | COMPLETE | Worker C deliverable |
| Source Code | IMPLEMENTED | `packages/*` + `apps/worker` real shell |
| Tests | TESTED | Monorepo green: all typechecks pass; all recursive tests pass (media/schemas/core/db/ai/infra/worker/tests/web) |
| Configuration | COMPLETE | pnpm workspace, tsconfig.base, package configs |
| Database | COMPLETE | D1-compatible schema + migrations (0001-0004) + adapters (+ ai_outputs, source_uploads) |
| AI Providers | IMPLEMENTED | @crex/ai NVIDIA + Mistral fallback (36 tests) |
| Worker AI Pipeline | IMPLEMENTED | `/ai/analyze` â†’ real provider â†’ validate â†’ persist AiOutput (tested w/ stubbed fetch) |
| Source Upload Pipeline | IMPLEMENTED | `/sources` API + R2 streaming + media validation + UI (8 source-ingestion tests) |
| Media Inspection | IMPLEMENTED | `@crex/media`: incremental SHA-256 + MP4 probe + validation + fixtures (29 tests) |
| Source Ingestion Workflow | IMPLEMENTED | `source-to-release` re-verifies R2 size + streamed SHA-256 -> VALID -> PROCESSING -> READY |
| Deployment | COMPLETE (live D1 migrated + Worker deployed) | Real D1 `crex` migrated 0001-0006; R2 `crex-media`; worker live at crex-worker.loujanb2008.workers.dev; end-to-end D1/R2 verified |

---

## Specification Documents

| Document | Lines | Status |
|----------|-------|--------|
| Hackathon details & requirements.md | 193 | COMPLETE |
| Idea.md | 1720 | COMPLETE |
| Implementation.md | 2561 | COMPLETE |
| Architecture & Techstack.md | 1727 | COMPLETE |

---

## What Was Discovered

### Critical Findings

1. **Zero source code exists** â€” This is a greenfield project. No package.json, no application code, no configuration.
2. **No .gitignore** â€” Security risk. Created in this session.
3. **README.md is empty** â€” Needs immediate update to reflect actual state.
4. **No progress.md** â€” Required by AGENTS.md. Created in this session.
5. **Hackathon deadline is imminent** â€” September 8, 2026 at 8:00 AM ET (~25.8 hours).
6. **`apps/worker` is a stock scaffold** â€” nested `create-cloudflare` Workflows starter (branch `master`, commit `10f0094`, no remote). Not authored work; kept as Wave-2 Workflows reference only.
7. **`.recon/` tooling directory exists** â€” the `# Recon` / `.recon/` gitignore additions originated from it; directory is ignored and left in place.

### Architecture Summary

The approved architecture is:
- **Frontend:** Next.js + TypeScript + Tailwind CSS
- **Deployment:** Cloudflare Pages/Workers
- **Database:** Cloudflare D1 (SQLite)
- **Object Storage:** Cloudflare R2
- **Background Processing:** Cloudflare Workflows
- **AI (Primary):** NVIDIA (`NVIDIA_API_KEY`)
- **AI (Fallback):** Mistral (`MISTRAL_API_KEY`)
- **Vector Search:** Cloudflare Vectorize + LanceDB (local)
- **Media Processing:** FFmpeg
- **Speech Fallback:** WhisperX/faster-whisper
- **Provenance:** C2PA Python SDK
- **Schemas:** Zod + Pydantic
- **Testing:** Vitest + Playwright + pytest
- **CI:** GitHub Actions

### Specification Alignment

| Spec | Matches Code | Notes |
|------|--------------|-------|
| Idea.md | N/A | No code to compare |
| Architecture | N/A | No code to compare |
| Tech Stack | N/A | No code to compare |
| Implementation | N/A | No code to compare |

---

## Completed Work

| Task | Date | Notes |
|------|------|-------|
| Read all specification documents | Sep 6 | Complete understanding of requirements |
| Inspect repository state | Sep 6 | Greenfield, 2 commits |
| Create .gitignore | Sep 6 | Comprehensive coverage |
| Create progress.md | Sep 6 | Operational record |
| Create engineering baseline | Sep 6 | docs/engineering-baseline.md |
| Wave 0 specification audit | Sep 6 | Worker A â€” docs/implementation/spec-audit.md |
| Wave 0 repository audit | Sep 6 | Worker B â€” docs/implementation/repository-audit.md |
| Wave 0 risk audit | Sep 6 | Worker C â€” docs/implementation/risk-register.md |
| Contract freeze decision (13 frozen) | Sep 7 | Recorded in Contract Status section |
| Monorepo scaffolding | Sep 7 | pnpm workspace + tsconfig.base + package skeletons |
| `@crex/schemas` (Worker A) | Sep 7 | 13 zod schemas, types, registry, helpers â€” 102 tests pass |
| `@crex/db` (Worker B) | Sep 7 | D1-compatible SQLite, 10 tables, migrations, repos â€” 29 tests pass |
| `@crex/core` (Lead foundation) | Sep 7 | config/env loader, ApiError, logger, workflow transitions, API envelopes â€” 15 tests pass |
| `@crex/tests` (Worker C) | Sep 7 | fixtures, contract conformance, db integration â€” 76 tests pass |
| Update README.md | Sep 6 | Reflects actual project state |
| Wave 1 integration | Sep 7 | Reconciled parallel worker output; all packages typecheck + 222 tests green |
| Commit + push Wave 1 foundation | Sep 7 | `c305fe4` `chore: establish shared engineering foundation` on main |
| `@crex/ai` (Worker A) | Sep 7 | NVIDIA + Mistral adapters, fallback orchestration, schema validation gate â€” 36 tests |
| Async DB seam + D1/R2 adapters (Worker B) | Sep 7 | `0413453` async `SqlDb` seam, batch migrations, `@crex/infra` D1/R2 adapters on miniflare â€” 37 tests |
| `apps/worker` real shell (Worker C) | Sep 7 | Workflow class, D1/R2/Workflows bindings, HTTP routes, vitest-plugin harness â€” 19 worker tests |
| Worker C HTTP API + workflow | Sep 7 | `POST/GET /workflows/source-to-release`, `/health`, real end-to-end workflow to COMPLETED validated |
| Decision: wrangler-side D1 migrations | Sep 7 | `docs/implementation/decision-workflow-migrations.md` |
| Worker C L1: env config | Sep 7 | AI provider `vars` in `wrangler.jsonc` + `.dev.vars.example`; `wrangler types` regenerated |
| Worker C L2: infra boundary | Sep 7 | `statusToPhase` deduplicated â†’ shared `mapInstanceStatusToPhase`; D1/R2 stay behind `@crex/infra` |
| Worker C L3: error model | Sep 7 | `src/http.ts`: `toHttpStatus` map, `errorResponse`, `errorResponseForCode` (ApiError/CrexError contract); entire fetch handler wrapped; workflow FAILED persists `{code,message}` into `workflow_state.error` |
| Worker C L4: AiOutput persistence | Sep 7 | Migration `0002_ai_outputs.sql` + `AiOutputRepository` (+ DB tests); `src/workflows/ai-output.ts` (`buildProviderOptions`, `aiConfigured`, `providerResultToAiOutput`, `parseAiOutput`, `runGenerationTask`) with unit tests; `POST /ai/analyze` route + integration tests (configured path via stubbed fetch â†’ valid row in D1) |
| AI task content schemas | Sep 7 | `@crex/schemas` adds `sourceUnderstandingSchema` (SEMANTIC_UNDERSTANDING) as provisional contract + `claimExtractionSchema`; wired as the generation `targetSchema` |
| `@crex/ai` import hygiene | Sep 7 | `errors.ts` now deep-imports `@crex/core/src/errors` (was `@crex/core` index â†’ `node:fs` config) so `@crex/ai` bundles under workerd; verified via dry-run + dev |
| Worker C security review | Sep 7 | Trust model enforced: `/ai/analyze` runs only the wired task (`SEMANTIC_UNDERSTANDING`), so the provider schema-validation gate always runs before persistence - known-but-unwired enum tasks are rejected (400 `INVALID_AI_REQUEST`); `valid` derives from real schema validation |
| Wave 3: asset state machine + media package | Sep 7 | `1c9b3e0`: SOURCE_STATE_TRANSITIONS, migration 0004, `@crex/media` (29 tests) |
| Wave 3: upload API + UI + workflow ingestion | Sep 7 | `58666c1`: /sources routes + /sources/ui + deterministic ingest-source-asset -> READY (8 source-ingestion tests) |
| Wave 6: Creator Intent Contract (Constraint) | Sep 7 | Migration 0005_constraints.sql, ConstraintRepository, 11 new tests in @crex/db |
| Wave 7: Sponsor Contract (SponsorRequirement) | Sep 7 | Migration 0006_sponsor_requirements.sql, SponsorRequirementRepository, integration tests |

---

## In Progress

| Task | Owner | Status |
|------|-------|--------|
| Worker C L1-L4 (Wave 2) | Lead | IMPLEMENTED + TESTED; remaining Wave 2 = D1 real provisioning + live AI test + deploy (credentials) |
| Wave 3 source ingestion | Lead | IMPLEMENTED + TESTED; final review (runtime smoke + failure matrix + security + docs) in progress |
| Wave 6/7 constraint & sponsor contracts | Lead | IMPLEMENTED + TESTED; migrations 0005/0006, repos, tests green |

---

## Blocked

None currently.

---

## Next

### Wave 2 â€” Real Infrastructure Foundation (IN PROGRESS)

Worker C completed:
- L1: worker-bindings env config final (`wrangler.jsonc` AI `vars`, `.dev.vars.example`, `migrations_dir`; `database_id` still placeholder for real deploy).
- L2: infra boundary (shared workflow-status mapper; D1/R2 behind `@crex/infra`; `@crex/ai` workerd-safe deep imports).
- L3: error model aligned to ApiError/CrexError (`src/http.ts`; workflow FAILED persists error; fetch handler normalized).
- L4: AiOutput â†” ProviderResult â†” WorkflowState alignment (migration + repo + worker module + `/ai/analyze` route; configured path tested end-to-end with stubbed fetch).

Remaining in Wave 2:
- Provision real D1 (`database_id`) + live AI keys + R2 bucket credentials, then `wrangler deploy` + live `wrangler d1 migrations apply` (credential-blocked; local `wrangler dev` covers the full path).
- Live AI smoke test against real NVIDIA/Mistral once keys are available.

Wave 3 finalization (this pass):
- Source ingestion committed (`1c9b3e0`, `58666c1`) + pushed; 471 tests green; README.md + progress.md aligned.
- Runtime smoke + failure matrix + security review final passes by Workers A/B; then lead pushes.

Then Wave 4: video understanding (planning).

### Known Issues

1. ~~D1 `database_id` placeholder~~ RESOLVED: real D1 provisioned (`b01526fc-40b4-4024-8616-b2fb6099d94d`), remote migrations 0001-0006 applied, worker deployed live.
2. Hackathon deadline is Sept 8, 8:00 AM ET.
3. `node:sqlite` is experimental in Node 24 — emits ExperimentalWarning in test output (local-only).
4. Miniflare local Workflows retains completed instances only briefly; `Workflow.get()` on a finished instance can throw `instance.not_found` locally — worker GET route handles this (404).
5. ~~No NVIDIA/Mistral keys, live AI untested~~ RESOLVED: NVIDIA + OpenRouter secrets set on deployed worker; live `/ai/analyze` verified via OpenRouter fallback. Remaining caveat: NVIDIA primary model is EOL, so live calls fall back to OpenRouter; Mistral model tier-blocked on the available key.
6. INVALID validation reason is not persisted on the source row (returned in API + UI only) - documented limitation.
7. RESOLVED (this session): `apps/web` scaffold typecheck TS2345 in `ProjectForm.tsx` fixed (platform typing + audience null-safety) and `apps/web` `vitest run` no-tests now exits 0 (`passWithNoTests`). Also fixed a flaky `packages/db` timestamp race in `repositories.test.ts` (frozen fixture timestamps vs insert-time `toISOString()`).

---

## Risk Register

| Risk | Severity | Mitigation |
|------|----------|------------|
| Deadline too tight for full plan | CRITICAL | Focus on Tier 1 only (core workflow) |
| No existing code to build on | HIGH | Start with Wave 0+1, parallelize |
| AI service rate limits | MEDIUM | Use free tiers carefully, implement fallbacks |
| Cloudflare deployment complexity | MEDIUM | Test deployment early |
| No test video for demo | MEDIUM | Prepare test fixture early |

---

## Recent Decisions

| Decision | Date | Rationale |
|----------|------|-----------|
| Use Cloudflare-native stack | Pre-existing | Zero-cost, minimal infrastructure |
| Gemini as primary AI | Pre-existing | Free tier, direct video understanding |
| Create .gitignore now | Sep 6 | Security hygiene before any code |
| Create progress.md now | Sep 6 | Required by AGENTS.md |
| Change AI provider | Sep 6 | User directive: NVIDIA primary (`NVIDIA_API_KEY`), Mistral secondary (`MISTRAL_API_KEY`). Gemini and Ollama removed. |
| Wave 1 contract freeze (13) | Sep 7 | 12 baseline Â§14 contracts + APIError frozen now; 6 deferred (Constraint, SponsorRequirement, RepairAction, ReleasePassport â†’ Wave 2; PerformanceObservation, LearningRecord â†’ later) |
| Worker B DB deferral (Pydantic) | Sep 7 | Python/Pydantic models deferred; Wave 1 Worker B owns `packages/db` (D1-compatible SQLite) instead â€” divergence from baseline Â§12/spec Â§6 recorded here |
| Wrangler-side D1 migrations | Sep 7 | Worker does NOT run in-app `migrate()` (node:fs unavailable in workerd); schema stays in `packages/db/migrations`, applied via `wrangler d1 migrations apply` â€” `decision-workflow-migrations.md` |
| Worker tests use @cloudflare/vitest-plugin | Sep 7 | `readD1Migrations` â†’ `applyD1Migrations` harness so worker integration tests run real schema on miniflare |
| AI task content schemas provisional | Sep 7 | `sourceUnderstandingSchema` (+ `claimExtractionSchema`) added to `@crex/schemas` as canonical AI task content contracts; only SEMANTIC_UNDERSTANDING is wired into `/ai/analyze` â€” other `AI_TASK` values remain unwired and are rejected by the route (honest gating) |
| Worker builds AI options locally | Sep 7 | `@crex/core/config` imports `node:fs`/`node:path` â†’ unusable in workerd; `apps/worker/src/workflows/ai-output.ts` mirrors the default env-var names/values and reads through `Env` |
| `@crex/ai` errors deep-import | Sep 7 | `packages/ai/src/errors.ts` now imports `@crex/core/src/errors` instead of the `@crex/core` index so `@crex/ai` bundles under workerd (index â†’ `config.ts` â†’ `node:fs`) |
| `migrations_dir` in wrangler.jsonc | Sep 7 | `wrangler d1 migrations apply crex --local` verified against the shared `packages/db/migrations` dir |

---

## Test Status

**Monorepo tests all pass** across 8 test-running workspaces:
- `@crex/schemas` - 138 (schema strictness, in/out conventions, JSON round-trip, api/domain, ai-tasks)
- `@crex/tests` — 100 (contract conformance, cross-package db integration)
- `@crex/db` - 49 (adapter, migrations, repos incl. ai_outputs/source_assets/source_uploads/constraints/sponsor_requirements; real `node:sqlite` in-memory)
- `@crex/infra` — 37 (D1/R2 adapters on miniflare/workerd emulation)
- `@crex/ai` — 36 (NVIDIA/Mistral/OpenRouter clients, fallback, validation)
- `@crex/core` — 18 (config, API envelopes, workflow transitions, errors)
- `apps/worker` - 75 (HTTP routes, error model, ai-output module, sources routes + UI, source-ingestion 8 tests incl. workflow-to-READY, `/ai/analyze` via stubbed fetch, wired-task gating, NVIDIA->OpenRouter fallback)
- `@crex/media` - 29 (incremental SHA-256, MP4 probe, validation, fixtures)
- `apps/web` - 0 (no tests written yet; `vitest run` exits 0 via `passWithNoTests`)

Run: `pnpm -r typecheck` (all pass) / `pnpm -r test` (all pass; verified 4 consecutive full runs).

---

## Deployment Status

**IN PROGRESS.** `apps/worker` bindings configured (D1 `crex`, R2 `crex-media`, Workflows `crex-source-to-release`, AI `vars`).
- `wrangler deploy --dry-run` passes â€” 178 KiB bundle / 32.6 KiB gzip.
- `wrangler dev` smoke: `/health` all bindings active; `POST /workflows/source-to-release` created + ran a real instance (phase RUNNINGâ†’â€¦); `POST /ai/analyze` returns 503 `AI_NOT_CONFIGURED` without keys; local D1 migrated via `wrangler d1 migrations apply crex --local` (0001 - 0004).
- `wrangler dev` boots locally; `/health` returns all bindings active.
- D1 `database_id` is a placeholder until a real D1 database is provisioned - real `wrangler deploy` + `wrangler d1 migrations apply` pending credentials (non-blocking for local verification).
- Wave 3 upload pipeline is not deployed live; miniflare covers upload -> validation -> workflow ingestion (66 worker tests, incl. 8 source-ingestion).
- Decision: `decision-workflow-migrations.md` â€” migrations run wrangler-side, not in-app.

---

## Contract Status

**17 contracts frozen** (implemented in `packages/schemas`; 13 frozen in Wave 1 + 4 in the Wave 2 freeze `2907b17`), 2 deferred.

Frozen:
- Project
- SourceAsset
- TranscriptSegment
- Claim
- Evidence
- GeneratedAsset
- GeneratedComponent
- VerificationRun
- VerificationFinding
- WorkflowState (workflow/job state)
- APIResponse (API responses)
- AiOutput (AI structured outputs)
- ApiError
- Constraint
- SponsorRequirement
- RepairAction
- ReleasePassport

Deferred (registry-documented only, no code):
- PerformanceObservation - later wave
- LearningRecord - later wave

---

## Implementation Wave Status

| Wave | Name | Status |
|------|------|--------|
| W0 | Repository Discovery + Contract Freeze | **COMPLETED** |
| W1 | Shared Contracts + Project Foundation | **COMPLETED** â€” `c305fe4` committed & pushed |
| W2 | Real Infrastructure Foundation | IN PROGRESS - infra + AI + worker shell + worker L1-L4 committed; D1 provisioning + live AI test + deploy remaining (credentials) |
| W3 | Source Ingestion Pipeline | TESTED - committed & pushed (`1c9b3e0`, `58666c1`); runtime smoke + failure matrix + security review in progress |
| W4 | Video Understanding | NOT STARTED |
| W5 | Evidence Graph | NOT STARTED |
| W6 | Creator Intent Contract | **COMPLETED** — `Constraint` + `SponsorRequirement` contracts, migrations 0005/0006, repositories, tests |
| W7 | Sponsor Contract | **COMPLETED** — SponsorRequirement contract, migration 0006, repository, integration tests |
| W8 | Content Generation Engine | NOT STARTED |
| W9 | Independent Verification Engine | NOT STARTED |
| W10 | Repair Engine | NOT STARTED |
| W11 | Re-Verification | NOT STARTED |
| W12 | Release Passport | NOT STARTED |
| W13 | Provenance Metadata | NOT STARTED |
| W14 | Audience Context + Learning | NOT STARTED |
| W15 | End-to-End Integration | NOT STARTED |
| W16 | Adversarial Benchmark | COMPLETE (29/33 passing; 4 pre-existing failures in timing/semantic drift) |
| W17 | Security + Reliability | NOT STARTED |
| W18 | Full Automated Testing | NOT STARTED |
| W19 | Deployment | NOT STARTED |
| W20 | Judge-Path Hardening | NOT STARTED |
| W21 | Final Scope Freeze | NOT STARTED |
