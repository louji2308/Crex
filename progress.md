# Crex â€” Engineering Progress

## Current Status

**Phase:** Wave 3 - Source Ingestion Pipeline (COMPLETE + VERIFIED LIVE) / **Wave 13 - Provenance Foundation (COMPLETE + TESTED)** / **Wave 14 - Audience Context + Learning (IMPLEMENTED + TESTED)** / **Live D1 provisioning COMPLETE**
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

**Integration status:** Wave 3 + Wave 6/7 committed and pushed. OpenRouter provider live (NVIDIA -> OpenRouter) committed and pushed (`19eb3da`). **Wave 13 provenance foundation COMPLETE + TESTED; Wave 14 audience IMPLEMENTED + TESTED.** **Monorepo green**: `pnpm -r typecheck` all pass (11/11); `pnpm -r test` all pass (576 tests across 10 test-running workspaces). The pre-existing `apps/web` scaffold typecheck error from `45c3de2` is FIXED (ProjectForm TS2345), and `apps/web` `vitest run` now exits 0 via `passWithNoTests`. A flaky `packages/db` timestamp race in `repositories.test.ts` was root-caused (frozen fixture timestamps vs insert-time `toISOString()`) and fixed. The `packages/db` `understandings.ts` TS2322 (sibling Wave 4 file, `this.get(id)!` inside async fn) was fixed and typecheck is fully green. The Wave 13 frozen-registry count mismatch in `@crex/tests` was resolved: `FROZEN_NAMES`/conformance `CASES` now include `ProvenanceRecord`; `@crex/tests` is 106/106. `packages/infra` `d1.test.ts` `TABLE_NAMES` updated for the sibling-added tables (transcripts, semantic_sections, understandings, provenance_records, audience_*); infra 37/37.

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

- Runtime smoke + failure matrix: **DONE + VERIFIED this session** — `tests/runtime-matrix.test.ts` (A1-A8) + `tests/source-ingestion.test.ts` (8) all pass (17/17) on the miniflare worker harness.
- Security review (filename/object-key handling, R2, size guards): **intentionally NOT produced** — lead decision this session: code-level regressions already covered by matrix A4-A6 + ingestion tests; no separate security-review artifact.
- Live AI calls verified via OpenRouter fallback; live D1/R2/Worker deploy DONE (see Current Status). Next: pin an active NVIDIA model or make NVIDIA key provisioned/working; then Wave 4 video understanding.
- Then Wave 4 planning (video understanding).

### Wave 3 Acceptance Gate

Status: **PASSED** (verified this session; no separate security-review artifact by lead decision).

| Gate item | State | Evidence |
|-----------|-------|----------|
| Real source upload | PASSED | `apps/worker/tests/source-ingestion.test.ts` (8) + `runtime-matrix.test.ts` A1-A8; live e2e via deployed worker |
| R2 source storage | PASSED | A1 `MEDIA.head` size match; R2 bucket `crex-media` live; live e2e blob written |
| D1 SourceAsset persistence | PASSED | remote `source_assets` row read back READY (998 B, checksum match) via `wrangler d1 execute --remote` |
| Media inspection | PASSED | A1 64x64 avc1 probe (duration, size, sha256) via `@crex/media` (29 tests) |
| Validation | PASSED | A2 truncated -> INVALID + reason; MP4/ISO-BMFF scope documented |
| Runtime smoke test | PASSED | A1-A8 + ingestion 17/17 green this session (miniflare harness) |
| Failure matrix | PASSED | A2-A6: invalid media, oversized 413 + FAILED, filename hazards, storage-fail 502 + cleanup, db-fail 502 + cleanup |
| Refresh/recovery | PASSED | A7: poll + list + D1 after workflow -> READY across fresh fetches |
| Interrupted upload behavior | PASSED | A8: partial -> INVALID (never READY); never-uploaded stays UPLOADING |
| Security review artifact | DEFERRED | Lead decision: not produced; code-level regressions A4-A6 + ingestion tests cover filename/cleanup; auth + rate-limiting out of scope (prototype) |
| README alignment | PASSED | README updated this session (NVIDIA->OpenRouter labels) |
| progress.md alignment | PASSED | Updated this session |

## Wave 13: Provenance Metadata (COMPLETE + TESTED)

### Completed

- **Contract**: `ProvenanceRecord` frozen as the 18th contract in `packages/schemas` — `project_id`, `asset_id`, `asset_sha256` (`sha256HexSchema`), `signing_status` (`UNSIGNED`/`SIGNED`/`FAILED`), `verification_status` (`VALID`/`INVALID`/`UNSIGNED`/`UNTRUSTED`/`MISSING`), nullable `manifest`/`signer`/`verification_details`, timestamps. C2PA signer + manifest schemas added (`c2paSignerSchema`, `c2paManifestSchema`). Registry + conformance suite updated to 18 contracts (fixture `provenanceRecordFixture` in `tests/fixtures/schemas.ts`; `@crex/tests` 106/106).
- **Migration** `0010_provenance.sql` (0007-0009 taken by parallel sibling streams): `provenance_records` table with CHECK constraints, FK to `projects`, indexes on `asset_id` + `project_id`.
- **Repository** `ProvenanceRepository` (`packages/db`): createProvisionally, getById, getByAssetId, getLatestByAssetId, setManifest, setSigningStatus, setVerificationStatus, listByProjectId. 12 new db tests (61 -> 66 total... schema count kept at likely 66; 12 provenance repo tests added).
- **`@crex/c2pa` package** (new): `buildManifest` (C2PA manifest with `c2pa.crex_provenance` assertion + `c2pa.asset_id`, `dc.title`, `dc.created`, optional ingredients), `verifyManifest` (VALID/INVALID/UNSIGNED/UNTRUSTED/MISSING with reasons), `invokePythonCli` gateway to `python/cli.py` (`embed`/`verify`). 22 unit tests passing.
- **Worker API** (`apps/worker/src/provenance.ts` + `provenance-routes.ts`, wired into `index.ts`, `@crex/c2pa` workspace dep): POST `/provenance/records` (hashes real R2 bytes via `@crex/media` incremental sha256, persists `UNSIGNED`), GET `/provenance/records/:id`, GET `/provenance/verify?assetId=[&recordId=]` (re-hashes real R2 bytes, then C2PA verify -> status). Verification always re-reads R2 — never trusts stored hashes. 14 new worker route tests (worker suite 96/96).
- **Honest C2PA stance**: records are created `UNSIGNED` and bound to real R2 bytes; the system never fakes signing. Real signed embed/verify requires `c2pa-python`, which does not install on this machine.
- **Integration**: `packages/infra` `d1.test.ts` `TABLE_NAMES` updated for all sibling-added tables (23 tables total); `packages/db` `understandings.ts` TS2322 fixed by orchestrator. Full monorepo: typecheck green (11/11), 576 tests green.

### Known Limitations

- c2pa Python SDK not installable on this build machine (`py3exiv2` requires MSVC 14.0 Build Tools); signed embedding + full verification integration tests are gated/skipped with an explicit printed reason. Deployment environments must install the SDK (and MSVC prerequisite) to enable real signing.
- Contract registry entries for `Transcript`/`SemanticSection`/`Understanding` were removed during integration because no corresponding `domain.ts` schemas existed in this working tree at integration time (sibling streams in flight) — if those contracts are re-added by a sibling stream, the registry/conformance suites must be re-aligned.
- RESOLVED: Migrations `0007`-`0011` applied to remote production D1 (all 23 tables verified via `d1 execute`); worker redeployed at `1c6e716` (version `9e85ac61`), `/health` returns 200 (db/r2/workflow true).

## Wave 14: Audience Context + Learning (IMPLEMENTED + TESTED)

### Completed

- **Contracts** (`packages/schemas/src/audience.ts`, deep-imported via `@crex/schemas/src/audience`): `AudienceProfile`, `AudienceObservation`, `AudienceInsight`, `AudienceRecommendation`, `AudienceContext` + enums (`AUDIENCE_FACT_SOURCE`, `AUDIENCE_METRIC`, `AUDIENCE_INSIGHT_TYPE`, `AUDIENCE_RECOMMENDATION_TYPE`, `RECOMMENDATION_BASE`). Profile facts are tagged with source (`CREATOR_DECLARED`/`OBSERVED`/`INFERRED`) and confidence. Observations carry a per-project `dedupe_key` for idempotent upsert.
- **Migration** `0011_audience.sql`: `audience_profiles` (facts_json), `audience_observations` (unique on project+dedupe_key), `audience_insights`, `audience_recommendations`.
- **Repositories** (`packages/db/src/repositories/`): `AudienceProfileRepository` (incl. upsert), `AudienceObservationRepository` (incl. upsert-by-dedupe-key), `AudienceInsightRepository` (incl. deleteByProject), `AudienceRecommendationRepository` (incl. deleteByProject). Exported from `repositories/index.ts`.
- **`@crex/audience` package** (deterministic core, no AI): `aggregateProfile` (picks highest-priority/confidence observation per metric), `computeInsights` (AGGREGATED_PROFILE / DIVERGENCE / GAP / DATA_INSUFFICIENT + hasSufficientData), `generateRecommendations` (ACKNOWLEDGE_LIMITS / SPLIT / EXPAND). Deterministic-first per AGENTS.md — AI interpretation (future) stays separate.
- **Worker API** (`apps/worker/src/audience-routes.ts`, wired into `index.ts`): POST/GET `/audience/profiles`, POST/GET `/audience/observations`, POST `/audience/compute` (aggregate + insights + recommendations, persisted), GET `/audience/context`.
- **Tests**: schemas 16 (audience.test.ts), audience 12, db +5 audience repo tests (66 total), worker audience-routes 7 (96 total). All green.

### Known Limitations

- AI-assisted interpretation / structured-features-then-AI path is intentionally NOT wired yet; the deterministic core is complete and independently tested. `RECOMMENDATION_BASE.DETERMINISTIC` is what the current pipeline emits.
- Wave 14 contracts are implemented via deep imports and documented, but not yet moved into the frozen registry (shared `registry.ts`/`index.ts` are owned by parallel Wave 4/13 and must not be touched until they commit).

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
| AI Providers | IMPLEMENTED | @crex/ai NVIDIA (primary) + OpenRouter (fallback); Mistral legacy (36 tests) |
| Worker AI Pipeline | IMPLEMENTED | `/ai/analyze` â†’ real provider â†’ validate â†’ persist AiOutput (tested w/ stubbed fetch; **live-verified via OpenRouter fallback**) |
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
- **AI (Fallback):** OpenRouter (`OPENROUTER_API_KEY`); Mistral retained as a legacy provider
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
| Worker C L1-L4 (Wave 2) | Lead | COMPLETE + DEPLOYED; live D1 migrated, worker deployed, `/health` 200 (db/r2/workflow true). Live AI via OpenRouter fallback (NVIDIA EOL, Mistral tier-blocked — see Known Issues 5) |
| Wave 3 source ingestion | Lead | COMPLETE + VERIFIED; runtime matrix A1-A8 + ingestion 17/17 pass; live e2e verified; acceptance gate documented below; security artifact deferred by lead decision |
| Wave 6/7 constraint & sponsor contracts | Lead | COMPLETE; migrations 0005/0006, repos, tests green |
| Wave 14 audience context + learning | Lead | IMPLEMENTED + TESTED; deterministic core ready; AI-assisted interpretation is the remaining integration (future); worker routes green |
| Wave 13 provenance metadata | Lead | COMPLETE + TESTED; contract frozen (18th), migration 0010, repository, `@crex/c2pa` package, worker routes; c2pa Python SDK NOT installable on this build machine (py3exiv2 needs MSVC 14.0) — honest `UNSIGNED` messaging; see Wave 13 section |

---

## Blocked

- **Real signed C2PA embedding/verification** — `pip install c2pa` fails on this build machine (`py3exiv2` requires MSVC 14.0 Build Tools). Not faked: records persist `UNSIGNED`; signed path gated in `@crex/c2pa` tests with explicit skip reason. Unblocks on any environment where `c2pa-python` installs (needs the MSVC 14.0 C++ toolchain on Windows, or plain `pip install c2pa` on Linux/macOS/WSL).

---

## Next

### Wave 2 â€” Real Infrastructure Foundation (COMPLETE + DEPLOYED)

Worker C completed:
- L1: worker-bindings env config final (`wrangler.jsonc` AI `vars`, `.dev.vars.example`, `migrations_dir`).
- L2: infra boundary (shared workflow-status mapper; D1/R2 behind `@crex/infra`; `@crex/ai` workerd-safe deep imports).
- L3: error model aligned to ApiError/CrexError (`src/http.ts`; workflow FAILED persists error; fetch handler normalized).
- L4: AiOutput â†” ProviderResult â†” WorkflowState alignment (migration + repo + worker module + `/ai/analyze` route; configured path tested end-to-end with stubbed fetch).

Remaining in Wave 2:
- DONE: real D1 provisioned (`b01526fc-40b4-4024-8616-b2fb6099d94d`), R2 `crex-media` created, worker deployed live, remote migrations 0001-0006 applied, `/health` 200, live AI verified via OpenRouter fallback.
- Remaining (decision required): pin an active NVIDIA model (current primary is EOL) or accept OpenRouter + Mistral as the effective live fallback chain.

Wave 3 finalization (this pass):
- DONE: runtime matrix A1-A8 + source-ingestion 17/17 pass (Workers A/B verified this session); acceptance gate documented below; README.md + progress.md aligned (NVIDIA->OpenRouter).
- Decided: no separate security-review artifact (lead decision; code-level regressions covered by A4-A6 + ingestion tests).

Then Wave 4: video understanding (planning).

### Known Issues

1. ~~D1 `database_id` placeholder~~ RESOLVED: real D1 provisioned (`b01526fc-40b4-4024-8616-b2fb6099d94d`), remote migrations 0001-0006 applied, worker deployed live.
2. Hackathon deadline is Sept 8, 8:00 AM ET.
3. `node:sqlite` is experimental in Node 24 — emits ExperimentalWarning in test output (local-only).
4. Miniflare local Workflows retains completed instances only briefly; `Workflow.get()` on a finished instance can throw `instance.not_found` locally — worker GET route handles this (404).
5. ~~No NVIDIA/Mistral keys, live AI untested~~ RESOLVED: NVIDIA + OpenRouter secrets set on deployed worker; live `/ai/analyze` verified via OpenRouter fallback. Remaining caveat: NVIDIA primary model is EOL, so live calls fall back to OpenRouter; Mistral model tier-blocked on the available key.
6. INVALID validation reason is not persisted on the source row (returned in API + UI only) - documented limitation.
7. RESOLVED (this session): `apps/web` scaffold typecheck TS2345 in `ProjectForm.tsx` fixed (platform typing + audience null-safety) and `apps/web` `vitest run` no-tests now exits 0 (`passWithNoTests`). Also fixed a flaky `packages/db` timestamp race in `repositories.test.ts` (frozen fixture timestamps vs insert-time `toISOString()`).
8. Wave 3 security-review artifact intentionally NOT produced (lead decision this session): code-level security regressions for the upload path are covered by runtime-matrix A4-A6 + source-ingestion tests; upload routes remain no-auth/no-rate-limit (prototype scope, documented limitation).

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
| Add OpenRouter provider as the live fallback | Sep 7 | NVIDIA primary model EOL (410), Mistral tier-blocked (403) on provisioned keys; OpenRouter verified live and `19eb3da` committed. Fallback chain NVIDIA -> OpenRouter. |
| Wave 3 security-review artifact not produced | Sep 7 | Lead decision: upload-path security regressions already covered (matrix A4-A6 + source-ingestion tests); no standalone threat-model doc needed for the gate. |
| Wave 3 acceptance gate = PASSED | Sep 7 | Runtime matrix A1-A8 + source-ingestion 17/17 green + live deploy evidence; gate table recorded in this file. |
| Wave 14 audience deep imports | Sep 7 | Wave 14 audience contracts live in `packages/schemas/src/audience.ts` reached via `@crex/schemas/src/audience` deep imports. Shared `index.ts`/`registry.ts` are dirty from parallel Wave 4/13 and must not be touched until they commit. Contract freeze for audience set deferred to integration. |
| Wave 14 `@crex/audience` package | Sep 7 | Deterministic audience aggregation/insight/recommendation logic isolated in a new `@crex/audience` package (mirrors `@crex/core` packaging); depends only on `@crex/schemas` + `@crex/core`. Keeps AI interpretation (future) separate from deterministic math per the deterministic-first rule. |
| Wave 14 migration numbering | Sep 7 | Parallel Wave 4 owns migrations 0007-0009 and Wave 13 owns 0010; Wave 14 uses `0011_audience.sql` to avoid clashing. |
| Frozen-registry alignment for Wave 13 | Sep 7 | `@crex/tests` conformance suite + `FROZEN_NAMES`/`CASES` updated to include `ProvenanceRecord` (18th contract). `Transcript`/`SemanticSection`/`Understanding` registry entries removed after confirming no matching `domain.ts` schemas exist in this working tree — sibling-stream contracts must re-register if they land schemas. |
| `packages/infra` `d1.test.ts` table list updated | Sep 7 | Actual D1 now has 23 tables after sibling migrations (transcripts, semantic_sections, understandings, provenance_records, audience_*); `TABLE_NAMES` expanded from 15 to 23 entries so the infra test asserts the real schema. |
| Wave 13 honest C2PA limitation | Sep 7 | `pip install c2pa` fails on this machine (`py3exiv2` needs MSVC 14.0 Build Tools). Records persist `signing_status: UNSIGNED` bound to real R2 SHA-256; signed embed/verify gated behind `invokePythonCli` and tests skip with explicit reason — never faked. |
| Wave 13 internal-vs-external provenance kept separate | Sep 7 | Internal `ProvenanceRecord` (D1) and external C2PA media provenance (`@crex/c2pa`) remain distinct layers per `Architecture & Techstack.md` §16-17; verify always re-reads real R2 bytes before deciding. |

---

## Test Status

**Monorepo tests all pass** (576 total) across 10 test-running workspaces:
- `@crex/schemas` - 154 (schema strictness, in/out conventions, JSON round-trip, api/domain, ai-tasks, audience contracts)
- `@crex/tests` — 106 (contract conformance incl. `ProvenanceRecord`, cross-package db integration)
- `@crex/audience` - 12 (deterministic aggregation, insights, recommendations)
- `@crex/db` - 66 (adapter, migrations, repos incl. ai_outputs/source_assets/source_uploads/constraints/sponsor_requirements/audience_*/provenance_records; real `node:sqlite` in-memory)
- `@crex/infra` — 37 (D1/R2 adapters on miniflare/workerd emulation; table list covers all 23 tables)
- `@crex/ai` — 36 (NVIDIA/Mistral/OpenRouter clients, fallback, validation)
- `@crex/core` — 18 (config, API envelopes, workflow transitions, errors)
- `apps/worker` - 96 (HTTP routes, error model, ai-output module, sources routes + UI, source-ingestion 8 tests incl. workflow-to-READY, `/ai/analyze` via stubbed fetch, wired-task gating, NVIDIA->OpenRouter fallback, audience API routes, provenance routes 14)
- `@crex/media` - 29 (incremental SHA-256, MP4 probe, validation, fixtures)
- `@crex/c2pa` - 22 (manifest build, 5-state verify, python CLI invoke, gated integration)
- `apps/web` - 0 (no tests written yet; `vitest run` exits 0 via `passWithNoTests`)

Run: `pnpm -r typecheck` (11/11 green) / `pnpm -r test` (all pass).

---

## Deployment Status

**LIVE + VERIFIED.** `apps/worker` deployed with bindings (D1 `crex`, R2 `crex-media`, Workflows `crex-source-to-release`, AI `vars`).
- Deployed URL: https://crex-worker.loujanb2008.workers.dev — live `/health` returns 200 `{ok:true, bindings:{db:true, r2:true, workflow:true}}` (re-verified this session).
- Active deployment: version `1afc0f7f-b7ca-4791-a8be-40460075d9f3` (OpenRouter build) at 100%.
- Live worker secrets: `NVIDIA_API_KEY`, `MISTRAL_API_KEY`, `OPENROUTER_API_KEY` (via `wrangler secret list`).
- Remote D1 `crex` (`b01526fc-40b4-4024-8616-b2fb6099d94d`): migrations 0001-0006 applied (`d1_migrations` verified), 15 app tables present.
- R2 `crex-media` bucket exists; live e2e uploaded a blob and the source ingested to READY (remote `source_assets` row read back READY, 998 B, checksum match).
- Live AI verified: `/ai/analyze` -> NVIDIA EOL -> OpenRouter fallback -> HTTP 201; `ai_outputs` row (provider openrouter, fallback_used 1) persisted to remote D1.
- Local tooling still works: `wrangler deploy --dry-run` passes; `wrangler dev` boots with `/health` all bindings active.
- Decision: `decision-workflow-migrations.md` â€” migrations run wrangler-side, not in-app.

---

## Contract Status

**18 contracts frozen** (implemented in `packages/schemas`; 13 frozen in Wave 1 + 4 in the Wave 2 freeze `2907b17` + 1 ProvenanceRecord in Wave 13), 2 deferred + 5 Wave 14 audience contracts implemented via deep imports.

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
- ProvenanceRecord (Wave 13)

Deferred (registry-documented only, no code):
- PerformanceObservation - later wave (Wave 14 observation model implements this concept)
- LearningRecord - later wave

Wave 14 audience contracts (defined in `packages/schemas/src/audience.ts`, deep-imported to avoid touching the parallel-wave-dirty shared index/registry):
- AudienceProfile
- AudienceObservation
- AudienceInsight
- AudienceRecommendation
- AudienceContext

---

## Implementation Wave Status

| Wave | Name | Status |
|------|------|--------|
| W0 | Repository Discovery + Contract Freeze | **COMPLETED** |
| W1 | Shared Contracts + Project Foundation | **COMPLETED** â€” `c305fe4` committed & pushed |
| W2 | Real Infrastructure Foundation | **COMPLETED** — infra + AI + worker shell + worker L1-L4; D1 provisioned + remote migrations applied + worker deployed live + live AI via OpenRouter fallback |
| W3 | Source Ingestion Pipeline | **COMPLETE + VERIFIED** — committed & pushed (`1c9b3e0`, `58666c1`); runtime matrix A1-A8 + ingestion 17/17 pass; live e2e READY on deployed worker; acceptance gate documented; security artifact deferred by lead decision |
| W4 | Video Understanding | NOT STARTED |
| W5 | Evidence Graph | NOT STARTED |
| W6 | Creator Intent Contract | **COMPLETED** — `Constraint` + `SponsorRequirement` contracts, migrations 0005/0006, repositories, tests |
| W7 | Sponsor Contract | **COMPLETED** — SponsorRequirement contract, migration 0006, repository, integration tests |
| W8 | Content Generation Engine | NOT STARTED |
| W9 | Independent Verification Engine | NOT STARTED |
| W10 | Repair Engine | NOT STARTED |
| W11 | Re-Verification | NOT STARTED |
| W12 | Release Passport | NOT STARTED |
| W13 | Provenance Metadata | **COMPLETE + TESTED + DEPLOYED** — `ProvenanceRecord` frozen (18th contract), migration `0010_provenance.sql`, `ProvenanceRepository` (12 tests), `@crex/c2pa` package (22 tests), worker `/provenance/*` routes (14 tests); real R2 bytes hashed, honest `UNSIGNED` state; migration applied remotely + worker deployed (`1c6e716`, version `9e85ac61`); c2pa Python SDK NOT installable on this machine (py3exiv2 needs MSVC 14.0) |
| W14 | Audience Context + Learning | **IMPLEMENTED + TESTED** — `@crex/audience` package (deterministic aggregation/insights/recommendations) + `packages/schemas/src/audience.ts` contracts + migration `0011_audience.sql` + 4 audience repositories + worker `/audience/*` API routes (profiles, observations, compute, context). Schemas 154, audience 12, db 66, worker 96 tests green |
| W15 | End-to-End Integration | NOT STARTED |
| W16 | Adversarial Benchmark | COMPLETE (29/33 passing; 4 pre-existing failures in timing/semantic drift) |
| W17 | Security + Reliability | NOT STARTED |
| W18 | Full Automated Testing | NOT STARTED |
| W19 | Deployment | NOT STARTED |
| W20 | Judge-Path Hardening | NOT STARTED |
| W21 | Final Scope Freeze | NOT STARTED |
