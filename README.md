# Crex — The Content Integrity Compiler

> Generate creator content. Trace it to evidence. Detect meaning drift. Repair violations. Publish with confidence.

## Current Status

**Phase:** Wave 3 — Source Ingestion Pipeline (COMPLETE + VERIFIED LIVE) + **Live D1 provisioning COMPLETE**
**Date:** September 7, 2026

The pnpm monorepo foundation is complete: **17 frozen contract schemas** (`@crex/schemas`), a D1-compatible SQLite data layer (`@crex/db`), core foundation utilities (`@crex/core`), NVIDIA→OpenRouter AI adapter with fallback (`@crex/ai`), D1/R2 infrastructure adapters (`@crex/infra`), a media inspection package (`@crex/media`), and a real Cloudflare Worker (**`apps/worker`**) with D1/R2/Workflows bindings.

Wave 3 implements the **source ingestion pipeline**: upload → R2 → D1 → media validation → `SourceAsset` → workflow ingestion → `READY`, plus a minimal upload UI. Wave 2's infra/AI groundwork remains in place: `GET /health`, and `POST /ai/analyze` running the `SEMANTIC_UNDERSTANDING` task through NVIDIA→OpenRouter with schema validation and `AiOutput` persistence. The live D1 database and R2 are provisioned and the Worker is **deployed live**; **482 tests passing** across 8 packages, worker typecheck green.

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
│   ├── schemas/              # Frozen contract schemas (17), types, registry
│   ├── db/                   # D1-compatible SQLite: migrations + data-access
│   ├── core/                 # Config/env loader, ApiError, logger, workflow state
│   ├── ai/                   # NVIDIA (primary) + OpenRouter (fallback); Mistral legacy
│   ├── infra/                # D1/R2 adapters over the @crex/db seam
│   ├── media/                # MP4 probe, media validation, incremental SHA-256, fixtures
│   └── tests/                # Fixtures, contract conformance, db integration
├── docs/
│   ├── engineering-baseline.md
│   └── implementation/       # Wave 0 audits + decision records
├── Project Spec/             # Authoritative specifications
├── AGENTS.md                 # Engineering operating system
└── progress.md               # Operational progress record
```

## Frozen Contracts

`Project, SourceAsset, TranscriptSegment, Claim, Evidence, GeneratedAsset, GeneratedComponent, VerificationRun, VerificationFinding, WorkflowState, Constraint, SponsorRequirement, RepairAction, ReleasePassport, ApiResponse, AiOutput, ApiError`.

Deferred (registry-documented, no code yet): `PerformanceObservation`, `LearningRecord` (later wave).

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

- **D1:** production database `crex` (`database_id b01526fc-40b4-4024-8616-b2fb6099d94d`) in `apps/worker/wrangler.jsonc`; migrations `0001`–`0006` applied remotely via `npx wrangler d1 migrations apply crex --remote`; 15 app tables + `d1_migrations` verified.
- **R2:** bucket `crex-media` created, bound as `MEDIA`.
- **Worker:** deployed to <code>https://crex-worker.loujanb2008.workers.dev</code> (bindings `DB`, `MEDIA`, `SOURCE_TO_RELEASE`, AI `vars`).
- **Verified:** a live upload → `POST /sources` 201 → `PUT /sources/:id/blob` 200 `VALID` (real R2 write + D1 insert) → poll `VALID` → `POST /workflows/source-to-release` → source `READY`; the remote `source_assets` row was read back as `READY` (998 B, checksum match) directly from D1. Re-confirmed live this session: `/health` 200 with db/r2/workflow true, active deployment `1afc0f7f` at 100%.

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

Without an AI key, `/ai/analyze` returns `503 AI_NOT_CONFIGURED` (honest gating); the configured path is covered end-to-end in tests with a stubbed fetch.

`@crex/db` uses Node's experimental `node:sqlite` behind a `SqlDb` interface so Cloudflare D1 sits behind the same seam (`@crex/infra`).

## Testing

```bash
pnpm -r typecheck   # strict TS across all packages (8/8 green)
pnpm -r test        # Vitest across all packages (482 tests)
```

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
