# Crex — The Content Integrity Compiler

> Generate creator content. Trace it to evidence. Detect meaning drift. Repair violations. Publish with confidence.

## Current Status

**Phase:** Wave 3 — Source Ingestion Pipeline (COMPLETE + VERIFIED LIVE) + **Wave 13 Provenance Foundation (COMPLETE + TESTED)** + **Wave 14 Audience Context (IMPLEMENTED + TESTED)** + Live D1 provisioning COMPLETE
**Date:** September 7, 2026

The pnpm monorepo foundation is complete: **18 frozen contract schemas** (`@crex/schemas`), a D1-compatible SQLite data layer (`@crex/db`), core foundation utilities (`@crex/core`), NVIDIA→OpenRouter AI adapter with fallback (`@crex/ai`), D1/R2 infrastructure adapters (`@crex/infra`), a media inspection package (`@crex/media`), a provenance package (`@crex/c2pa`), an audience package (`@crex/audience`), and a real Cloudflare Worker (**`apps/worker`**) with D1/R2/Workflows bindings.

Wave 3 implements the **source ingestion pipeline**: upload → R2 → D1 → media validation → `SourceAsset` → workflow ingestion → `READY`, plus a minimal upload UI. Wave 2's infra/AI groundwork remains in place: `GET /health`, and `POST /ai/analyze` running the `SEMANTIC_UNDERSTANDING` task through NVIDIA→OpenRouter with schema validation and `AiOutput` persistence. Wave 13 adds the **provenance foundation**: a frozen `ProvenanceRecord` contract, provenance D1 table + repository, C2PA manifest build/verify logic, and worker `/provenance/*` routes that bind real R2 asset bytes to SHA-256 hashes. Real signed embedding + verification runs through the official `c2pa-python==0.37.10` SDK with honest trust reporting (see "Honest C2PA trust model" below). **Hardening waves W17 (security+reliability), W18 (full automated testing), W19 (deployment readiness) are complete and integrated** (threat model, verification scoping, adversarial benchmark suite at 33/33, deterministic real-signed c2pa path, deploy runbook, CORS layer, CI workflow). The live D1 database and R2 are provisioned and the Worker is **deployed live**; **658 tests passing** across 11 workspaces (plus the 33 adversarial benchmarks), all typechecks green.

---

## What Is Crex?

Crex is an AI content-production system that converts a creator's source video into publishable content assets while preserving the original meaning, linking every important generated claim to source evidence, enforcing creator and sponsor constraints, and blocking or repairing outputs that drift from the source before publication.

### Core Workflow

```text
SOURCE
  ↓
UNDERSTAND
  ↓
EVIDENCE GRAPH
  ↓
GENERATE
  ↓
VERIFY
  ↓
REPAIR (if needed)
  ↓
RE-VERIFY
  ↓
RELEASE PASSPORT
  ↓
PUBLISH
```

---

## Architecture

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js + TypeScript + Tailwind CSS |
| Deployment | Cloudflare Pages / Workers |
| Database | Cloudflare D1 (SQLite) |
| Object Storage | Cloudflare R2 |
| Background Processing | Cloudflare Workflows |
| AI (Primary) | NVIDIA (OpenAI-compatible API) |
| AI (Fallback) | OpenRouter (OpenAI-compatible API) |
| AI (Legacy/provider) | Mistral |
| Vector Search | Cloudflare Vectorize + LanceDB (local) |
| Media Processing | FFmpeg (planned); Wave 3: in-process MP4 probe (`@crex/media`) |
| Speech Fallback | WhisperX / faster-whisper |
| Provenance | C2PA Python SDK |
| Schemas | Zod (TS) + Pydantic (deferred) |
| Testing | Vitest (Wave 1); Playwright + pytest later |
| CI | GitHub Actions |

---

## Repository Structure

```text
Crex/
├── apps/
│   └── worker/               # Cloudflare Worker: Workflows + D1 + R2 + HTTP API
├── packages/
│   ├── schemas/              # Frozen contract schemas (18), types, registry
│   ├── db/                   # D1-compatible SQLite: migrations + data-access
│   ├── core/                 # Config/env loader, ApiError, logger, workflow state
│   ├── ai/                   # NVIDIA (primary) + OpenRouter (fallback); Mistral legacy
│   ├── infra/                # D1/R2 adapters over the @crex/db seam
│   ├── media/                # MP4 probe, media validation, incremental SHA-256, fixtures
│   ├── c2pa/                 # C2PA provenance: manifest build/verify + Python CLI gateway
│   ├── audience/             # Deterministic audience aggregation/insights/recommendations
│   └── tests/                # Fixtures, contract conformance, db integration
├── docs/
│   ├── engineering-baseline.md
│   └── implementation/       # Wave 0 audits + decision records
├── Project Spec/             # Authoritative specifications
├── AGENTS.md                 # Engineering operating system
└── progress.md               # Operational progress record
```

## Frozen Contracts

`Project, SourceAsset, TranscriptSegment, Claim, Evidence, GeneratedAsset, GeneratedComponent, VerificationRun, VerificationFinding, WorkflowState, Constraint, SponsorRequirement, RepairAction, ReleasePassport, ProvenanceRecord, ApiResponse, AiOutput, ApiError`.

Deferred (registry-documented, no code yet): `PerformanceObservation`, `LearningRecord` (later wave).

**Wave 14 audience contracts** (implemented via deep imports in `packages/schemas/src/audience.ts`): `AudienceProfile`, `AudienceObservation`, `AudienceInsight`, `AudienceRecommendation`, `AudienceContext`.

---

## Provenance (Wave 13)

Wave 13 lays the provenance foundation: an internal `ProvenanceRecord` contract plus C2PA manifest build/verify tooling, wired into the worker API. Internal provenance records and external C2PA media provenance stay separate concepts (per `Architecture & Techstack.md` §16–17).

### Data model (`Packages/schemas` + `packages/db`)

- Frozen `ProvenanceRecord`: `project_id`, `asset_id`, `asset_sha256` (hex, `sha256HexSchema`), `signing_status` (`UNSIGNED`/`SIGNED`/`FAILED`), `verification_status` (`VALID`/`INVALID`/`UNSIGNED`/`UNTRUSTED`/`MISSING`), nullable `manifest`/`signer`/`verification_details` JSON, timestamps.
- Migration `0010_provenance.sql`: `provenance_records` table (unique asset, FK → `projects`, indexes on `asset_id`/`project_id`, CHECK constraints).
- `ProvenanceRepository` (`packages/db`): provision, fetch by id/asset, latest-by-asset, set manifest/signing/verification status, list by project.

### C2PA tooling (`@crex/c2pa`)

TypeScript, fully unit-tested (21 tests):

- `buildManifest` — constructs a C2PA manifest with a `c2pa.crex_provenance` assertion (asset id + sha256 + linked record), plus `c2pa.asset_id`, `dc.title`, `dc.created`; optional ingredients (content → source mapping).
- `verifyManifest` — deterministic validation of an extracted manifest: `VALID` (hash + record match), `INVALID` (hash mismatch / malformed), `UNSIGNED` (no Crex assertion), `UNTRUSTED` (unknown signer), `MISSING` (no manifest).
- `invokePythonCli` — gateway to `python/cli.py` (`embed`/`verify`) for real signed embedding; `verify` accepts an optional `trustAnchors` path (passed through as `--trust-anchors`).

### Worker API (`apps/worker`)

```text
POST /provenance/records        provision a record; hashes the real R2 asset bytes (sha256), persists UNSIGNED
GET  /provenance/records/:id    fetch a record
GET  /provenance/verify?assetId=[&recordId=]   re-hash R2 bytes → C2PA verify → VALID/INVALID/UNSIGNED/UNTRUSTED/MISSING
```

The verify path always re-reads and re-hashes the actual R2 object — it never trusts stored hashes. Every response is an `ApiResponse` envelope; hashing failures surface as explicit errors (never fake success).

### Honest C2PA trust model

Real signed embedding (`c2pa-python==0.37.10`) is installed and working on this build machine. Empirically verified with a real EC signing chain (root → intermediate → leaf) generated by `openssl`:

- A signed PNG verifies with state `Valid`, `signature_valid=true`, `signature_trusted=false`, reporting `signingCredential.untrusted` — an unanchored signature is never presented as trusted.
- Supplying the root CA via `--trust-anchors <root.pem>` makes the same asset verify with state `Trusted`, `signature_valid=true`, `signature_trusted=true`.
- Embedding without a signer exits non-zero with an explicit error; the CLI never fabricates a manifest, signature, or verification result.

The TS manifest build/verify logic is unit-tested, and the integration suite exercises the real signed path (embed + plain verify + anchored verify) rather than skipping it.

---

## Audience Context + Learning (Wave 14)

Builds a reusable audience-context and learning subsystem on top of the project brief.

```text
POST /audience/profiles         create a named audience profile (facts tagged CREATOR_DECLARED/OBSERVED/INFERRED)
GET  /audience/profiles?projectId=
GET  /audience/profiles/:id
POST /audience/observations     record an observation (idempotent via project+dedupeKey)
GET  /audience/observations?projectId=
POST /audience/compute          deterministic aggregate → insights → recommendations, persisted
GET  /audience/context?projectId=   assembled primary/complementary profiles + insights + recommendations
```

- **Deterministic core** lives in `@crex/audience` (no AI): `aggregateProfile` picks the highest-priority/confidence observation per metric; `computeInsights` emits `AGGREGATED_PROFILE` / `DIVERGENCE` / `GAP` / `DATA_INSUFFICIENT`; `generateRecommendations` emits `ACKNOWLEDGE_LIMITS` / `SPLIT` / `EXPAND`. AI interpretation is intentionally kept separate (deterministic-first rule).
- **Storage:** migration `0011_audience.sql` + four repositories in `packages/db`.
- `POST /audience/compute` recomputes and persists a fresh profile, insights, and recommendations for a project (deterministic and repeatable).

---

## Source Ingestion (Wave 3)

The implemented ingestion flow:

```text
POST /sources                        create upload session (201, status UPLOADING)
  ↓
PUT /sources/:uploadId/blob          stream body to R2 + in-flight SHA-256 + size cap
                                     → @crex/media validates → VALID / INVALID (200)
  ↓
GET /sources/:uploadId               poll upload/source status
GET /sources?projectId=<uuid>        list a project's sources
GET /sources/ui                      minimal upload UI
  ↓
POST /workflows/source-to-release    {projectId, sourceId} → SourceToReleaseWorkflow
                                     → ingest-source-asset → SourceAsset READY
```

- **Upload:** `POST /sources` returns a session; the file streams to R2 with an in-flight SHA-256 and a hard size cap (`SOURCE_MAX_SIZE_BYTES`, 100 MiB default) — oversize, or a body whose byte count does not match the declared `content-length`, returns `413` and marks the session `FAILED`.
- **Validation:** `@crex/media` probes MP4/ISO-BMFF boxes without FFmpeg (container via `ftyp`, duration via `mdhd`/`mvhd`, video codec + width/height via `trak`/`stsd`, audio codec). `validateMediaFile` rejects empty/oversized/unsupported/stream-less files with an `INVALID` status and a reason.
- **State:** a `SourceAsset` row persists `status`, `media`, `size_bytes`, and `checksum` (`sha256:`). Lifecycle `UPLOADING → UPLOADED → VALIDATING → VALID/INVALID → PROCESSING → READY` is enforced by `SOURCE_STATE_TRANSITIONS` in `packages/db/src/repositories/source-assets.ts`.
- **Storage:** objects are stored at `sources/{projectId}/{uploadId}-{safeName}`; filenames are validated (no path separators, `..`, NUL, or control bytes).
- **Workflow:** `POST /workflows/source-to-release` (body `{projectId, id?, sourceId?}`) runs `SourceToReleaseWorkflow`: `bootstrap → running → verify-infrastructure → ingest-source-asset → record-completion` (`COMPLETED`). The ingest step re-verifies the R2 object's size and streams it re-hashing SHA-256 against the stored checksum, then `VALID → PROCESSING → READY`; a size/hash mismatch marks the source `FAILED` and aborts with `SOURCE_CHECKSUM_MISMATCH` (409). Without `sourceId` the step is `SKIPPED`.
- **AI status:** `POST /ai/analyze` runs only the wired `SEMANTIC_UNDERSTANDING` task through `@crex/ai` (NVIDIA primary → OpenRouter fallback). A real NVIDIA `NVIDIA_API_KEY` and OpenRouter `OPENROUTER_API_KEY` are provisioned; the live route is verified end-to-end via OpenRouter fallback and persists an `AiOutput` to remote D1. Without any provider key it returns `503 AI_NOT_CONFIGURED` (honest gating).

### Current limitations

- The `INVALID` validation reason is returned in the API/UI but not persisted on the source row.
- Worker routes have no auth or rate limiting yet (prototype scope).
- Media validation is MP4/ISO-BMFF-focused; other containers are rejected as unsupported.
- Live AI fallback is OpenRouter (verified); the configured NVIDIA model (`meta/llama-3.3-70b-instruct`) is end-of-life so live calls fall back to OpenRouter. Without any provider key the AI route returns `503 AI_NOT_CONFIGURED` (honest gating).

### Live deployment

- **D1:** production database `crex` (`database_id b01526fc-40b4-4024-8616-b2fb6099d94d`) in `apps/worker/wrangler.jsonc`; migrations `0001`–`0011` all applied remotely (`npx wrangler d1 migrations list crex --remote` reports no pending migrations).
- **R2:** bucket `crex-media` created, bound as `MEDIA`.
- **Worker:** deployed to <code>https://crex-worker.loujanb2008.workers.dev</code> (bindings `DB`, `MEDIA`, `SOURCE_TO_RELEASE`, AI `vars`).
- **Verified:** a live upload → `POST /sources` 201 → `PUT /sources/:id/blob` 200 `VALID` (real R2 write + D1 insert) → poll `VALID` → `POST /workflows/source-to-release` → source `READY`; the remote `source_assets` row was read back as `READY` (998 B, checksum match) directly from D1. Re-confirmed live this session: `/health` 200 with db/r2/workflow true, active deployment `1afc0f7f` at 100%.
- **Runbook:** see `docs/implementation/deploy-runbook.md` for the full deployment/migration/rollback runbook, the SAFE vs DESTRUCTIVE command table, and CORS/Pages guidance.

## Development Setup

Requires Node ≥ 24, pnpm ≥ 11.

```bash
pnpm install
```

### Worker — local run & AI provisioning

AI output is generated via `POST /ai/analyze`. It needs at least one AI provider key. Copy `apps/worker/.dev.vars.example` to `apps/worker/.dev.vars` and fill in `NVIDIA_API_KEY`, `OPENROUTER_API_KEY`, and/or `MISTRAL_API_KEY` (NVIDIA is primary, OpenRouter is the active fallback). Provider defaults (base URL, model, timeout, retries) can be overridden through worker vars — see `apps/worker/wrangler.jsonc`.

```bash
pnpm --filter @crex/worker dev       # runs `wrangler dev` (or: cd apps/worker && npx wrangler dev)
```

Before first run (or after a schema change), apply migrations to local D1:

```bash
cd apps/worker
npx wrangler d1 migrations apply crex --local
```

To apply migrations to the live (remote) D1 database and deploy the Worker:

```bash
cd apps/worker
npx wrangler d1 migrations apply crex --remote
npx wrangler deploy        # or: cd apps/worker && npm run deploy
```

> Note: `pnpm --filter @crex/worker deploy` is not usable because pnpm treats `deploy` as a reserved subcommand; use `npx wrangler deploy` from `apps/worker` instead.

Migrations live in `packages/db/migrations` (`wrangler.jsonc` points `migrations_dir` there). They run **wrangler-side**, not inside the worker (`node:fs` is unavailable in workerd) — see `docs/implementation/decision-workflow-migrations.md`.

Worker `vars` (defaults in `apps/worker/wrangler.jsonc`) cover AI provider config (`NVIDIA_BASE_URL`, `NVIDIA_MODEL`, `MISTRAL_BASE_URL`, `MISTRAL_MODEL`, `OPENROUTER_BASE_URL`, `OPENROUTER_MODEL`, `AI_TIMEOUT_MS`, `AI_MAX_RETRIES`, `AI_RETRY_BASE_DELAY_MS`) and the upload size cap `SOURCE_MAX_SIZE_BYTES` (100 MiB).

### Worker routes

| Method | Path | Behavior |
|--------|------|----------|
| GET | `/health` | Bindings + config status |
| POST | `/workflows/source-to-release` | Create + run a workflow instance (`{projectId, id?, sourceId?}`) |
| GET | `/workflows/source-to-release/:id` | Instance status/phase |
| POST | `/ai/analyze` | Generate → validate → persist an `AiOutput` (`SEMANTIC_UNDERSTANDING` only; `503` without API keys) |
| POST | `/sources` | Create an upload session (201) |
| PUT | `/sources/:uploadId/blob` | Stream blob to R2 (size-capped, media-validated; 200 `VALID`/`INVALID`) |
| GET | `/sources/:uploadId` | Poll upload/source status |
| GET | `/sources?projectId=` | List sources for a project |
| GET | `/sources/ui` | Minimal upload UI (XHR progress + 800 ms polling) |
| POST | `/provenance/records` | Provision a provenance record from real R2 bytes (sha256, `UNSIGNED`) |
| GET | `/provenance/records/:id` | Fetch a provenance record |
| GET | `/provenance/verify` | Re-hash R2 asset bytes + C2PA verify → `VALID`/`INVALID`/`UNSIGNED`/`UNTRUSTED`/`MISSING` |
| POST | `/audience/profiles` | Create a named audience profile |
| GET | `/audience/profiles?projectId=` | List profiles |
| POST | `/audience/observations` | Record an observation (idempotent) |
| GET | `/audience/observations?projectId=` | List observations |
| POST | `/audience/compute` | Deterministic aggregate → insights → recommendations |
| GET | `/audience/context?projectId=` | Assembled audience context |

Without an AI key, `/ai/analyze` returns `503 AI_NOT_CONFIGURED` (honest gating); the configured path is covered end-to-end in tests with a stubbed fetch.

`@crex/db` uses Node's experimental `node:sqlite` behind a `SqlDb` interface so Cloudflare D1 sits behind the same seam (`@crex/infra`).

## Testing

```bash
pnpm -r typecheck   # strict TS across all packages (11/11 green)
pnpm -r test        # Vitest across all workspaces (583 tests)
```

Coverage by workspace: `@crex/schemas` 154, `@crex/tests` 106, `@crex/db` 66, `@crex/infra` 37, `@crex/ai` 36, `@crex/media` 29, `@crex/c2pa` 21, `@crex/core` 18, `@crex/audience` 12, `apps/worker` 103.

---

## Documentation

| Document | Location |
|----------|----------|
| Engineering Operating System | `AGENTS.md` |
| Hackathon Requirements | `Project Spec/Hackathon details & requirements.md` |
| Product Specification | `Project Spec/Idea.md` |
| Implementation Plan | `Project Spec/Implementation.md` |
| Architecture & Tech Stack | `Project Spec/Architecture & Techstack.md` |
| Engineering Progress | `progress.md` |
| Engineering Baseline | `docs/engineering-baseline.md` |

---

## License

Not yet determined.

---

## Acknowledgments

Built for the AI Content Engine Hackathon (September 2026).
