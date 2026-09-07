# Crex — The Content Integrity Compiler

> Generate creator content. Trace it to evidence. Detect meaning drift. Repair violations. Publish with confidence.

## Current Status

**Phase:** Wave 2 — Real Infrastructure Foundation (IN PROGRESS)
**Date:** September 7, 2026

The pnpm monorepo foundation is complete: 13 frozen contract schemas (`@crex/schemas`), a D1-compatible SQLite data layer (`@crex/db`), core foundation utilities (`@crex/core`), NVIDIA→Mistral AI adapter with fallback (`@crex/ai`), D1/R2 infrastructure adapters (`@crex/infra`), and a real Cloudflare Worker (**`apps/worker`**) with D1/R2/Workflows bindings, an `AiOutput` persistence pipeline, and a `POST /ai/analyze` route — **416 tests passing**, all packages typecheck.

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
| AI (Fallback) | Mistral |
| Vector Search | Cloudflare Vectorize + LanceDB (local) |
| Media Processing | FFmpeg |
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
│   ├── schemas/              # Frozen contract schemas (13), types, registry
│   ├── db/                   # D1-compatible SQLite: migrations + data-access
│   ├── core/                 # Config/env loader, ApiError, logger, workflow state
│   ├── ai/                   # NVIDIA (primary) + Mistral (fallback) adapters
│   ├── infra/                # D1/R2 adapters over the @crex/db seam
│   └── tests/                # Fixtures, contract conformance, db integration
├── docs/
│   ├── engineering-baseline.md
│   └── implementation/       # Wave 0 audits (spec, repository, risk)
├── Project Spec/             # Authoritative specifications
├── AGENTS.md                 # Engineering operating system
└── progress.md               # Operational progress record
```

## Frozen Contracts (Wave 1)

`Project, SourceAsset, TranscriptSegment, Claim, Evidence, GeneratedAsset, GeneratedComponent, VerificationRun, VerificationFinding, WorkflowState, ApiResponse, AiOutput, ApiError`.

Deferred: `Constraint, SponsorRequirement, RepairAction, ReleasePassport` (Wave 2); `PerformanceObservation, LearningRecord` (later).

---

## Development Setup

Requires Node ≥ 24, pnpm ≥ 11.

```bash
pnpm install
```

### Worker — local run & AI provisioning

AI output is generated via `POST /ai/analyze`. It needs at least one AI provider key. Copy `apps/worker/.dev.vars.example` to `apps/worker/.dev.vars` and fill in `NVIDIA_API_KEY` and/or `MISTRAL_API_KEY` (NVIDIA is primary, Mistral is fallback). Provider defaults (base URL, model, timeout, retries) can be overridden through worker vars — see `apps/worker/wrangler.jsonc`.

```bash
pnpm --filter @crex/worker dev       # runs `wrangler dev` (or: cd apps/worker && npx wrangler dev)
```

Before first run (or after a schema change), apply migrations to local D1:

```bash
cd apps/worker
npx wrangler d1 migrations apply crex --local
```

Migrations live in `packages/db/migrations` (`wrangler.jsonc` points `migrations_dir` there). They run **wrangler-side**, not inside the worker (`node:fs` is unavailable in workerd) — see `docs/implementation/decision-workflow-migrations.md`.

### Worker routes

| Method | Path | Behavior |
|--------|------|----------|
| GET | `/health` | Bindings + config status |
| POST | `/workflows/source-to-release` | Create + run a workflow instance (projectId in body) |
| GET | `/workflows/source-to-release/:id` | Instance status/phase |
| POST | `/ai/analyze` | Generate → validate → persist an `AiOutput` for a project (`SEMANTIC_UNDERSTANDING` task wired) |

Without an AI key, `/ai/analyze` returns `503 AI_NOT_CONFIGURED` (honest gating); the configured path is covered end-to-end in tests with a stubbed fetch.

`@crex/db` uses Node's experimental `node:sqlite` behind a `SqlDb` interface so Cloudflare D1 sits behind the same seam (`@crex/infra`).

## Testing

```bash
pnpm -r typecheck   # strict TS across all packages
pnpm -r test        # Vitest across all packages (416 tests)
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
