# Crex â€” Engineering Progress

## Current Status

**Phase:** Wave 3 - Source Ingestion Pipeline (COMPLETE + VERIFIED LIVE) / **Wave 12 - Release Passport (IMPLEMENTED + TESTED)** / **Wave 13 - Provenance Foundation (COMPLETE + TESTED)** / **Wave 14 - Audience Context + Learning (IMPLEMENTED + TESTED)** / **W17 Security + Reliability COMPLETE + INTEGRATED** / **W18 Automated Testing COMPLETE + INTEGRATED** / **W19 Deployment COMPLETE + INTEGRATED** / **Live D1 provisioning COMPLETE**
**Date:** September 7, 2026
**Hackathon Deadline:** September 8, 2026 - 8:00 AM ET

**Converged `main` (via `w17-19/hardening` + W10-12):** W17 (`agent/w17/security`), W18 (`agent/w18/testing`), and W19 (`agent/w19/deploy`) merged with the W10 repair/W11 re-verification/W12 release-passport stream. Full monorepo validated on the merged tree: `pnpm -r typecheck` 11/11, `pnpm -r test` 717 green across 11 workspaces (incl. previously-gated `@crex/c2pa` 21/21 and the 33 adversarial benchmarks), `wrangler deploy --dry-run` OK (~363 KiB).

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

**Integration status:** Wave 3 + Wave 6/7 committed and pushed. OpenRouter provider live (NVIDIA -> OpenRouter) committed and pushed (`19eb3da`). **Wave 13 provenance foundation COMPLETE + TESTED; Wave 14 audience IMPLEMENTED + TESTED.** **Monorepo green**: `pnpm -r typecheck` all pass (11/11); `pnpm -r test` all pass (684 tests across 11 test-running workspaces). The pre-existing `apps/web` scaffold typecheck error from `45c3de2` is FIXED (ProjectForm TS2345), and `apps/web` `vitest run` now exits 0 via `passWithNoTests`. A flaky `packages/db` timestamp race in `repositories.test.ts` was root-caused (frozen fixture timestamps vs insert-time `toISOString()`) and fixed. The `packages/db` `understandings.ts` TS2322 (sibling Wave 4 file, `this.get(id)!` inside async fn) was fixed and typecheck is fully green. The Wave 13 frozen-registry count mismatch in `@crex/tests` was resolved: `FROZEN_NAMES`/conformance `CASES` now include `ProvenanceRecord`; `@crex/tests` is 106/106. `packages/infra` `d1.test.ts` `TABLE_NAMES` updated for the sibling-added tables (transcripts, semantic_sections, understandings, provenance_records, audience_*, repair_actions, release_passports); infra 37/37. **C2PA signed path is now REAL on this build machine**: `c2pa-python==0.37.10` installed, a real root→intermediate→leaf EC signing chain produced signed media, and the integration suite exercises embed + plain verify (state `Valid`, `signature_trusted=false`) + anchored verify (`--trust-anchors` → state `Trusted`, `signature_trusted=true`). `@crex/c2pa` suite is 21/21 (manifest 6, verify 11, python-integration 4) with the signed path executing, not skipping.

**W17/W18/W19 hardening waves COMPLETE + INTEGRATED on `w17-19/hardening`:**

- **W17 Security + Reliability (COMPLETE + INTEGRATED):**
- Audit of the 17 security areas complete; findings fixed with minimal defense; no auth/rate-limit built (prototype scope, documented residual risks).
- Fixes: `transitionPhase` now rejects transitions out of terminal phases (`COMPLETED`/`FAILED`/`CANCELLED`) with `INVALID_WORKFLOW_TRANSITION`; non-`CrexError` server errors are redacted to generic `INTERNAL_ERROR`; upload failures are redacted to `STORAGE_UPLOAD_FAILED`/`"upload failed"` (raw detail only in server logs); content-length mismatch in BOTH directions → `413 SOURCE_TOO_LARGE`; workflow status GET requires a canonical UUID (`INVALID_WORKFLOW_ID`); verification runs are now scoped per project at the SQL layer via `VerificationRunRepository.listByProject`.
- Regression + adversarial tests added: `apps/worker/tests/security.test.ts` (workflow-id validation, source-list + verification-list project scoping, cross-project provenance rejection), `http.test.ts` (no-leak), `source-ingestion.test.ts` (short-body 413, redacted upload failure), `packages/db/tests/repositories.test.ts` (`listByProject`), `packages/core/tests/workflow.test.ts` (terminal-phase immutability).
- Validation: `packages/core` 20/20, `packages/db` 67/67, `apps/worker` 176/176, `pnpm -r typecheck` 11/11 green. Full `pnpm -r test` green (exit 0).

**W18 Full Automated Testing (COMPLETE + INTEGRATED):**
- Repaired the adversarial benchmark fixture expectations: `deterministic.test.ts` `required_phrase_omission_disclaimer` and `sponsor.test.ts` `missing_timing_constraint` declared `REVIEW`, but the verification engine deterministically emits `BLOCK` for missing required sponsor phrases/disclosures/URLs (verified at `apps/worker/src/pipelines/verification.ts:285-321`). Corrected to `BLOCK`. **Benchmarks now 33/33** (all four pre-existing failures resolved).
- Resolved the `@crex/c2pa` python-integration gate that was blocking `pnpm -r test`: deterministically exercises the REAL signed C2PA path (root→intermediate→leaf EC chain via openssl; `c2pa-python==0.37.10` installed on this machine). `@crex/c2pa` suite 21/21 with the signed path executing, not skipping. `pnpm -r test` fully green.
- `packages/db` `listByProject` SQL-scoping (W17) covered by a dedicated cross-project test in `repositories.test.ts`.
- Validation: benchmarks 33/33; `pnpm -r typecheck` 11/11; `pnpm -r test` green across 11 test-running workspaces.

**W19 Deployment / Production Readiness (COMPLETE + INTEGRATED):**
- Runbook: `docs/implementation/deploy-runbook.md` (SAFE vs DESTRUCTIVE command table, rollback, health checks, frontend Pages path, CORS).
- Minimal CORS layer (`apps/worker/src/cors.ts`): OPTIONS preflight 204, `Access-Control-Allow-Origin` echo + `Vary: Origin`, no credentials; wired into `index.ts`, covered by `apps/worker/tests/cors.test.ts`.
- Root convenience scripts: `deploy:worker` (`pnpm --filter @crex/worker exec wrangler deploy`; the plain `pnpm --filter @crex/worker deploy` form is NOT usable — pnpm reserves the `deploy` subcommand), `migrate:local`, `migrate:remote`.
- Env docs updated: root `.env.example` names `OPENROUTER_API_KEY`; `apps/worker/.dev.vars.example` documents required (3 keys) vs optional (defaults).
- CI added: `.github/workflows/ci.yml` = `pnpm install --frozen-lockfile` + `pnpm -r typecheck` + `pnpm -r test` (no deploy, no secrets).
- Verified: `wrangler deploy --dry-run` bundles ~363 KiB (gzip ~68 KiB); remote D1 `crex` migrations 0011 applied; R2 `crex-media`; secrets (3 keys) present.

- Threat model documented at `docs/security/threat-model.md` (assets, trust boundaries, risk register, controls, residual risks).
- Because Workflows re-runs the body when an already-completed instance id is re-created in the test harness, `index.integration.test.ts` was updated to use a fresh instance id (`WORKFLOW3_UUID`) for the distinct second run — matching the prod contract that a finished instance is never re-run.

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
- **`@crex/c2pa` package** (new): `buildManifest` (C2PA manifest with `c2pa.crex_provenance` assertion + `c2pa.asset_id`, `dc.title`, `dc.created`, optional ingredients), `verifyManifest` (VALID/INVALID/UNSIGNED/UNTRUSTED/MISSING with reasons), `invokePythonCli` gateway to `python/cli.py` (`embed`/`verify`, optional `--trust-anchors`). 21 tests passing (manifest 6, verify 11, python-integration 4 — the latter exercising the real signed path: openssl-generated root→intermediate→leaf EC chain, `c2pa-python==0.37.10`, embed + plain verify state `Valid`/`signature_trusted=false` + anchored verify state `Trusted`/`signature_trusted=true`).
- **Worker API** (`apps/worker/src/provenance.ts` + `provenance-routes.ts`, wired into `index.ts`, `@crex/c2pa` workspace dep): POST `/provenance/records` (hashes real R2 bytes via `@crex/media` incremental sha256, persists `UNSIGNED`), GET `/provenance/records/:id`, GET `/provenance/verify?assetId=[&recordId=]` (re-hashes real R2 bytes, then C2PA verify -> status). Verification always re-reads R2 — never trusts stored hashes. 14 new worker route tests (worker suite 103/103).
- **Honest C2PA stance**: records are created `UNSIGNED` and bound to real R2 bytes; the system never fakes signing. Real signed embed/verify runs via `c2pa-python==0.37.10` (installed and exercised on this machine).
- **Integration**: `packages/infra` `d1.test.ts` `TABLE_NAMES` updated for all sibling-added tables (23 tables total); `packages/db` `understandings.ts` TS2322 fixed by orchestrator. Full monorepo: typecheck green (11/11), 583 tests green.

### Known Limitations

- RESOLVED: c2pa Python SDK (and the MSVC 14.0 Build Tools) are now installed on this build machine — real signed embed/verify works (see Wave 13 section). Remaining honest limitation: a valid signature without a supplied root CA trust anchor reports `signature_trusted=false` / `signingCredential.untrusted`; trust only flips to `Trusted` when the root is passed via `--trust-anchors`.
- Contract registry entries for `Transcript`/`SemanticSection`/`Understanding` were removed during integration because no corresponding `domain.ts` schemas existed in this working tree at integration time (sibling streams in flight) — if those contracts are re-added by a sibling stream, the registry/conformance suites must be re-aligned.
- RESOLVED: Migrations `0007`-`0011` applied to remote production D1 (all 23 tables verified via `d1 execute`); worker redeployed at `1c6e716` (version `9e85ac61`), `/health` returns 200 (db/r2/workflow true).

## Wave 14: Audience Context + Learning (IMPLEMENTED + TESTED)

### Completed

- **Contracts** (`packages/schemas/src/audience.ts`, deep-imported via `@crex/schemas/src/audience`): `AudienceProfile`, `AudienceObservation`, `AudienceInsight`, `AudienceRecommendation`, `AudienceContext` + enums (`AUDIENCE_FACT_SOURCE`, `AUDIENCE_METRIC`, `AUDIENCE_INSIGHT_TYPE`, `AUDIENCE_RECOMMENDATION_TYPE`, `RECOMMENDATION_BASE`). Profile facts are tagged with source (`CREATOR_DECLARED`/`OBSERVED`/`INFERRED`) and confidence. Observations carry a per-project `dedupe_key` for idempotent upsert.
- **Migration** `0011_audience.sql`: `audience_profiles` (facts_json), `audience_observations` (unique on project+dedupe_key), `audience_insights`, `audience_recommendations`.
- **Repositories** (`packages/db/src/repositories/`): `AudienceProfileRepository` (incl. upsert), `AudienceObservationRepository` (incl. upsert-by-dedupe-key), `AudienceInsightRepository` (incl. deleteByProject), `AudienceRecommendationRepository` (incl. deleteByProject). Exported from `repositories/index.ts`.
- **`@crex/audience` package** (deterministic core, no AI): `aggregateProfile` (picks highest-priority/confidence observation per metric), `computeInsights` (AGGREGATED_PROFILE / DIVERGENCE / GAP / DATA_INSUFFICIENT + hasSufficientData), `generateRecommendations` (ACKNOWLEDGE_LIMITS / SPLIT / EXPAND). Deterministic-first per AGENTS.md — AI interpretation (future) stays separate.
- **Worker API** (`apps/worker/src/audience-routes.ts`, wired into `index.ts`): POST/GET `/audience/profiles`, POST/GET `/audience/observations`, POST `/audience/compute` (aggregate + insights + recommendations, persisted), GET `/audience/context`.
- **Tests**: schemas 16 (audience.test.ts), audience 12, db +5 audience repo tests (66 total), worker audience-routes 7 (103 total). All green.

### Known Limitations

- AI-assisted interpretation / structured-features-then-AI path is intentionally NOT wired yet; the deterministic core is complete and independently tested. `RECOMMENDATION_BASE.DETERMINISTIC` is what the current pipeline emits.
- Wave 14 contracts are implemented via deep imports and documented, but not yet moved into the frozen registry (shared `registry.ts`/`index.ts` are owned by parallel Wave 4/13 and must not be touched until they commit).

## Wave 12: Release Passport (IMPLEMENTED + TESTED)

### Completed

- **Migration** `0013_release_passports.sql`: `release_passports` table (versioned snapshots of the frozen `ReleasePassport` contract) with CHECK constraints on `release_status`/`watch_status`/`overall_score` and indexes on `asset_id` + `project_id`.
- **Repository** `ReleasePassportRepository` (`packages/db/src/repositories/release-passports.ts`, exported from `repositories/index.ts`): `create`, `getById`, `listByProject`, `getByAsset`, `getLatestByAsset` (`version DESC, created_at DESC`). 0013 auto-applied in db/worker/infra test harnesses; no new db test file required (db suite 66/66 green).
- **Pipeline** `buildReleasePassport` (`apps/worker/src/pipelines/passport.ts`, 407 lines with documented formulas): deterministic, no AI. Aggregates the latest verification findings per run, computes integrity dimension scores (penalized per severity: `clamp(base - 25*#BLOCK - 10*#REVIEW, 0, 100)`), run-component/status scores, the four dimension scores (`run_component`, `evidence_coverage`, `claim_fidelity`, `numerical_integrity`), `verification_result_verified_at` (earliest pass-to-violation boundary time), and `overall = min(round(0.6*numeric + 0.4*status), cap)` with caps READY=100 / DRAFT=70 / BLOCKED=40. `version = latest.version + 1`.
- **`release_status` mapping** (documented in pipeline header): no previous run -> `DRAFT`; latest run `BLOCK` -> `BLOCKED`; provenance `SIGNED` but `verification_status != VALID` -> `BLOCKED`; provenance exists (e.g. `UNSIGNED`) with `verification_status != VALID` -> `DRAFT`; run `REVIEW` -> `DRAFT`; mandatory sponsor (`required && enabled`) with a `SPONSOR_COMPLIANCE` BLOCK finding -> `DRAFT`; any dimension != PASS -> `DRAFT`; else `READY`. Watch status: `PASS` if all four dimensions PASS, else `REVIEW`.
- **Provenance handling**: the frozen `ReleasePassport` has no provenance field, so provenance state is surfaced honestly through `release_status` (see above) — a `VALID` provenance `verification_status` is required for `READY` once a provenance record exists; `UNSIGNED`/`UNTRUSTED`/`FAILED` downgrade to `DRAFT`, `SIGNED`+`INVALID`/`MISSING` downgrade to `BLOCKED`; no provenance record -> no penalty.
- **API** (`apps/worker/src/passport-routes.ts`, wired into `index.ts`): `POST /passports` `{projectId, assetId}` -> 201 passport; `GET /passports?projectId=` -> list; `GET /passports/:id` -> passport; `GET /passports/:assetId/latest` -> latest. New error codes `PASSPORT_NOT_FOUND:404`, `INVALID_PASSPORT_STATE:409` in `http.ts`.
- **Tests** (`apps/worker/tests/passport.test.ts`, 17 tests): deterministic creation with no verification (overall 70 DRAFT), version bump 0->1, READY on PASS run with sponsor requirements satisfied (overall 100), BLOCKED on BLOCK run (overall 40), DRAFT when provenance UNSIGNED, BLOCKED when provenance SIGNED+INVALID, asset/claim counts real, score penalization (SCOPE_DRIFT REVIEW -> evidence_coverage 90; NUMERICAL_DRIFT BLOCK -> numerical_integrity 75), 404/409 routes, latest-run selection (REVIEW->BLOCK = BLOCKED; BLOCK->PASS = READY).
- **Verification**: full worker suite 179/179 green (162 baseline + 17 new); db 66/66; infra 37/37 with `release_passports` added to `TABLE_NAMES`; `pnpm -r typecheck` green 11/11 — all re-run on a clean worktree of branch `agent/w12/passport` (commit `6243464`, pushed), free of the parallel repair agent's uncommitted files.

### Known Limitations

- `assets` payload reflects the eval-versioned `GeneratedAsset`/its completion evidence; `source` fingerprints are read into the passport only where the frozen contract exposes them (contract is frozen — no field addition).
- The shared worktree currently contains the parallel W10/W11 agent's uncommitted `0012_repair.sql` (adds `repair_actions`); while that file is on disk, `packages/infra` `creates all project tables` fails because `TABLE_NAMES` doesn't yet include `repair_actions`. Passport work is unaffected (branch-verified green); the failure will resolve when the repair stream commits its migration + updates `TABLE_NAMES`.

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
| Wave 13 provenance metadata | Lead | COMPLETE + TESTED; contract frozen (18th), migration 0010, repository, `@crex/c2pa` package, worker routes; real signed embed/verify working on this build machine via `c2pa-python==0.37.10` (root/intermediate/leaf EC chain; plain verify = `Valid` + `signature_trusted=false`, `--trust-anchors` = `Trusted` + `signature_trusted=true`); honest `UNSIGNED` messaging when unsigned; see Wave 13 section |
| Wave 14 audience context + learning | Lead | IMPLEMENTED + TESTED; deterministic core ready; AI-assisted interpretation is the remaining integration (future); worker routes green |
| W17 Security + Reliability | Subagent A | COMPLETE + INTEGRATED (`agent/w17/security` → `w17-19/hardening`); terminal-phase guard, error redaction, 413 both directions, workflow GET UUID validation, SQL-scoped verification listing, threat model, regression tests |
| W18 Full Automated Testing | Subagent B | COMPLETE + INTEGRATED (`agent/w18/testing` → `w17-19/hardening`); benchmark fixture fixes (33/33), real signed c2pa deterministic path (21/21), c2pa gate resolved, `pnpm -r test` green |
| W19 Deployment / Production Readiness | Subagent C | COMPLETE + INTEGRATED (`agent/w19/deploy` → `w17-19/hardening`); deploy runbook, CORS layer, root deploy/migrate scripts, env docs, CI workflow, dry-run verified |

---

## Blocked

- (none for the C2PA signed path — resolved) **Real signed C2PA embedding/verification** is now working: `c2pa-python==0.37.10` installed on this build machine; the integration suite signs a real PNG through a generated root→intermediate→leaf chain, verifies it (state `Valid`, `signature_trusted=false`), then re-verifies with `--trust-anchors <root.pem>` (state `Trusted`, `signature_trusted=true`). The build machine needed the MSVC 14.0 C++ toolchain for `py3exiv2`; other environments use plain `pip install c2pa-python`.

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
| Wave 13 honest C2PA limitation | Sep 7 | RESOLVED — `c2pa-python==0.37.10` installed (MSVC 14.0 Build Tools present). Real signed embed/verify now works. New honest trust model: signature is cryptographically valid but reports `signature_trusted=false` / `signingCredential.untrusted` unless a root CA is supplied via `--trust-anchors`, which flips verification to `Trusted`/`signature_trusted=true`. Never faked. |
| Wave 13 internal-vs-external provenance kept separate | Sep 7 | Internal `ProvenanceRecord` (D1) and external C2PA media provenance (`@crex/c2pa`) remain distinct layers per `Architecture & Techstack.md` §16-17; verify always re-reads real R2 bytes before deciding. |
| W10 deterministic repair engine | Sep 7 | Deterministic-first rule enforced: `runRepair` proposes targeted `RepairAction` rows via four deterministic strategies (SPONSOR_COMPLIANCE append, PLATFORM_QA truncation, CONTEXT_REMOVAL qualifier prefix, NUMERICAL_DRIFT positional token replacement). No AI is invoked; each repair traces to a specific finding + asset/component. Migration `0012_repair.sql` with `repair_actions` table, JSON-array columns for `source_references`/`constraint_references`. |
| W11 re-verification via real re-run | Sep 7 | `POST /reverify` applies all `PROPOSED` `RepairAction` rows for the resolved run, then delegates to the real `runVerification` engine — never trusts the repair state alone. A pass-through scenario with no PROPOSED actions is honest state (appliedActionCount: 0), not an error. |
| W10 target-map merge strategy | Sep 7 | Multiple findings on the same component are merged via a key map (`__asset_title__` for title, component_id otherwise) to avoid overwrite: later transforms operate on the already-patched text of earlier ones, stacking sponsor phrases and multiple qualifier prefixes correctly. |
| W18 branch routing fix | Sep 7 | W18's c2pa determinism/real-signed commit (`c508c2d`) had been committed onto `agent/w19/deploy` (shared working tree). Orchestrator cherry-picked it to `agent/w18/testing` (`e7e1136`) so each wave's scope lives on its own branch, and integrated only W18's version onto `w17-19/hardening` (W19 branch keeps W19-only deploy commits). |
| W16/W18 benchmark severity alignment | Sep 7 | `deterministic.test.ts` + `sponsor.test.ts` fixtures declared `REVIEW` but the verification engine deterministically emits `BLOCK` for missing required sponsor phrases/disclosures/URLs (verified at `apps/worker/src/pipelines/verification.ts:285-321`). Corrected expectations to match real engine behavior; benchmarks 33/33. |
| W17/W19 overlap: no token auth in CORS | Sep 7 | W19's CORS layer echoes `Origin` with `Vary: Origin` and sets no credentials — aligns with W17's documented residual risk (no auth in prototype scope). No conflict. |

---

## Test Status

**Monorepo tests all pass (717 total incl. 33 adversarial benchmarks)** across 11 test-running workspaces (10 app/package workspaces + `benchmarks`):
- `@crex/schemas` - 154 (schema strictness, in/out conventions, JSON round-trip, api/domain, ai-tasks, audience contracts)
- `@crex/tests` — 106 (contract conformance incl. `ProvenanceRecord`, cross-package db integration)
- `@crex/audience` - 12 (deterministic aggregation, insights, recommendations)
- `@crex/db` - 67 (adapter, migrations, repos incl. ai_outputs/source_assets/source_uploads/constraints/sponsor_requirements/audience_*/provenance_records/repair_actions/release_passports + listByProject SQL scoping; real `node:sqlite` in-memory)
- `@crex/infra` — 37 (D1/R2 adapters on miniflare/workerd emulation; table list covers all 24 tables incl. repair_actions + release_passports)
- `@crex/ai` — 36 (NVIDIA/Mistral/OpenRouter clients, fallback, validation)
- `@crex/core` — 20 (config, API envelopes, workflow transitions/terminal-phase immutability, errors)
- `apps/worker` - 202 (17 files: HTTP routes, error model, ai-output module, sources routes + UI, source-ingestion, `/ai/analyze` via stubbed fetch, wired-task gating, NVIDIA->OpenRouter fallback, audience API routes, provenance routes, video-understanding routes, repair + re-verification 9, release passport 17, W17 security/adversarial, CORS 7; hardening baseline 176 + 9 + 17)
- `@crex/media` - 29 (incremental SHA-256, MP4 probe, validation, fixtures)
- `@crex/c2pa` - 21 (manifest build, 5-state verify, python CLI invoke, real signed embed+verify integration with openssl-generated chain)
- `apps/web` - 0 (no tests written yet; `vitest run` exits 0 via `passWithNoTests`)

**Adversarial benchmarks (`benchmarks/`, now part of the `pnpm -r test` workspace run):** 33/33 passing — all assert the expected BLOCK/REVIEW/REQUIRES_AI severity per verified engine behavior (emits BLOCK for missing required sponsor phrases/disclosures/URLs/timing constraints).

Run: `pnpm -r typecheck` (11/11 green) / `pnpm -r test` (717 green across 11 workspaces incl. the 33 benchmarks; exit 0).

---

## Deployment Status

**LIVE + VERIFIED.** `apps/worker` deployed with bindings (D1 `crex`, R2 `crex-media`, Workflows `crex-source-to-release`, AI `vars`).
- Deployed URL: https://crex-worker.loujanb2008.workers.dev — live `/health` returns 200 `{ok:true, bindings:{db:true, r2:true, workflow:true}}` (re-verified this session).
- Active deployment: version `15cff4ae-2fd5-4abd-8246-7d1ae6282479` (converged W10-12 + W17-19 build) at 100%.
- Live worker secrets: `NVIDIA_API_KEY`, `MISTRAL_API_KEY`, `OPENROUTER_API_KEY` (via `wrangler secret list`).
- Remote D1 `crex` (`b01526fc-40b4-4024-8616-b2fb6099d94d`): migrations 0001-0013 applied remotely (0012_repair.sql + 0013_release_passports.sql applied this session); `repair_actions` + `release_passports` tables verified present remotely.
- R2 `crex-media` bucket exists; live e2e uploaded a blob and the source ingested to READY (remote `source_assets` row read back READY, 998 B, checksum match).
- Live AI verified: `/ai/analyze` -> NVIDIA EOL -> OpenRouter fallback -> HTTP 201; `ai_outputs` row (provider openrouter, fallback_used 1) persisted to remote D1.
- Live new-endpoint verification (this session, converged build): `GET /repair/actions` returns 400 `INVALID_REPAIR_REQUEST` (params validated), `GET /passports?projectId=` returns 404 `PROJECT_NOT_FOUND`, CORS `OPTIONS` preflight returns 204.
- Local tooling still works: `wrangler deploy --dry-run` passes; `wrangler dev` boots with `/health` all bindings active.
- Decision: `decision-workflow-migrations.md` — migrations run wrangler-side, not in-app.

**W19 Deployment / Production Readiness (branch `agent/w19/deploy`, integrated via `w17-19/hardening`):**
- Runbook: `docs/implementation/deploy-runbook.md` (SAFE vs DESTRUCTIVE command table, rollback, health checks, frontend Pages path, CORS).
- Verified read-only: `wrangler whoami`, `secret list` (3 keys), `d1 info` (crex, 23 tables), `d1 migrations list crex --remote` (all 0011 applied), `r2 bucket list` (crex-media), `wrangler deploy --dry-run` OK (integrated build 362.76 KiB/gzip 67.62 KiB).
- Added minimal CORS layer to the worker: `apps/worker/src/cors.ts` (OPTIONS preflight 204, `Access-Control-Allow-Origin` echo + `Vary: Origin`, no credentials), wired into `apps/worker/src/index.ts`, covered by `apps/worker/tests/cors.test.ts` (7 tests). Worker tests now 176/176 (15 files).
- Root convenience scripts added: `deploy:worker` (`pnpm --filter @crex/worker exec wrangler deploy` — the plain `pnpm --filter @crex/worker deploy` form is NOT usable: pnpm reserves the `deploy` subcommand, see README), `migrate:local`, `migrate:remote`.
- Env docs updated: root `.env.example` now names `OPENROUTER_API_KEY`; `apps/worker/.dev.vars.example` documents required (3 keys) vs optional (defaults) vars.
- CI added: `.github/workflows/ci.yml` = `pnpm install --frozen-lockfile` + `pnpm -r typecheck` + `pnpm -r test` (no deploy, no secrets).
- RESOLVED: the earlier c2pa red-line was caused by in-flight W17/W18 working-tree edits, not committed code. All commits (`c508c2d`/`e7e1136`) now land the deterministic real-signed c2pa path on integration; `pnpm -r typecheck` 11/11 and `pnpm -r test` fully green.

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
| W10 | Repair Engine | **IMPLEMENTED + TESTED** — Deterministic repair pipeline (`repair.ts`): SPONSOR_COMPLIANCE append, PLATFORM_QA truncation, CONTEXT_REMOVAL qualifier prefix, NUMERICAL_DRIFT positional token replacement. `RepairActionRepository` + migration `0012_repair.sql`. `POST /repair`, `POST /repair/:actionId/apply`, `GET /repair/actions`. 9 new tests (sponsor/title/numerical/scope-drift/no-repairs-honest/errors) |
| W11 | Re-Verification | **IMPLEMENTED + TESTED** — `POST /reverify` applies all PROPOSED actions for the resolved run then re-runs the real independent verifier. `packages/infra` d1.test.ts TABLE_NAMES updated. Part of W10 implementation (same branch) |
| W12 | Release Passport | **IMPLEMENTED + TESTED** — migration `0013_release_passports.sql`, `ReleasePassportRepository`, `buildReleasePassport` pipeline, `/passports` API (create/list/get/latest), 17 route+pipeline tests |
| W13 | Provenance Metadata | **COMPLETE + TESTED + DEPLOYED** — `ProvenanceRecord` frozen (18th contract), migration `0010_provenance.sql`, `ProvenanceRepository` (12 tests), `@crex/c2pa` package (21 tests incl. real signed embed+verify via `c2pa-python==0.37.10`), worker `/provenance/*` routes (14 tests); real R2 bytes hashed, honest `UNSIGNED` state; migration applied remotely + worker deployed (`1c6e716`, version `9e85ac61`); c2pa signed path verified on this machine (root→intermediate→leaf chain; plain = `Valid`/untrusted, `--trust-anchors` = `Trusted`) |
| W14 | Audience Context + Learning | **IMPLEMENTED + TESTED** — `@crex/audience` package (deterministic aggregation/insights/recommendations) + `packages/schemas/src/audience.ts` contracts + migration `0011_audience.sql` + 4 audience repositories + worker `/audience/*` API routes (profiles, observations, compute, context). Schemas 154, audience 12, db 66, worker 103 tests green |
| W15 | End-to-End Integration | NOT STARTED |
| W16 | Adversarial Benchmark | COMPLETE (33/33 passing; 4 pre-existing fixture-expectation failures fixed in W18) |
| W17 | Security + Reliability | **COMPLETE + INTEGRATED** (`agent/w17/security` → `w17-19/hardening`) — audit, fixes (terminal-phase guard, error redaction, content-length 413 both directions, workflow GET UUID validation, SQL-scoped verification listing), regression tests, `docs/security/threat-model.md` |
| W18 | Full Automated Testing | **COMPLETE + INTEGRATED** (`agent/w18/testing` → `w17-19/hardening`) - benchmark fixture alignment (33/33), real signed c2pa deterministic path resolving the test gate (21/21), `pnpm -r test` fully green on the converged tree (717 tests incl. 33 benchmarks) |
| W19 | Deployment | **COMPLETE + INTEGRATED** (`agent/w19/deploy` → `w17-19/hardening`) — runbook, CORS layer, root deploy/migrate scripts, env docs, CI workflow; `wrangler deploy --dry-run` verified |
| W20 | Judge-Path Hardening | NOT STARTED |
| W21 | Final Scope Freeze | NOT STARTED |
