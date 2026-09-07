# Crex — The Content Integrity Compiler

> Generate creator content. Trace it to evidence. Detect meaning drift. Repair violations. Publish with confidence.

## Current Status

**Phase:** Wave 1 — Shared Contracts + Project Foundation (IN PROGRESS)
**Date:** September 7, 2026

The pnpm monorepo foundation is complete: 13 frozen contract schemas (`@crex/schemas`), a D1-compatible SQLite data layer (`@crex/db`), core foundation utilities (`@crex/core`), and a cross-package test suite (`@crex/tests`) — **222 tests passing**, all packages typecheck.

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
│   └── worker/               # Cloudflare Workflows starter (Wave 2 reference)
├── packages/
│   ├── schemas/              # Frozen contract schemas (13), types, registry
│   ├── db/                   # D1-compatible SQLite: migrations + data-access
│   └── core/                 # Config/env loader, ApiError, logger, workflow state
├── tests/                    # Fixtures, contract conformance, db integration
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
cp .env.example .env   # add NVIDIA_API_KEY and/or MISTRAL_API_KEY
```

## Testing

```bash
pnpm -r typecheck   # strict TS across all packages
pnpm -r test        # Vitest across all packages (222 tests)
```

`@crex/db` uses Node's experimental `node:sqlite` behind a `SqlDb` interface so Cloudflare D1 can be dropped in the same seam in Wave 2.

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
