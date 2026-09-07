# Crex — Engineering Baseline

**Date:** September 6, 2026
**Phase:** Wave 0 — Repository Discovery and Contract Freeze
**Author:** Lead Engineering Agent

---

## 1. Current System

### Repository State

```text
Branch: main
Commits: 3 (first commit + docs + Wave 0)
Source Code: NONE
Configuration: NONE
Tests: NONE
Deployment: NONE
```

### What Exists

| File/Directory | Purpose | Status |
|----------------|---------|--------|
| `AGENTS.md` | Engineering operating system | COMPLETE |
| `README.md` | Project documentation | UPDATED |
| `progress.md` | Operational progress record | CREATED |
| `.gitignore` | Repository hygiene | CREATED |
| `Project Spec/` | Authoritative specifications | COMPLETE |
| `docs/` | Engineering documentation | CREATED |

### What Does NOT Exist

- No `package.json` (Node.js/npm/pnpm)
- No `wrangler.toml` (Cloudflare Workers)
- No `next.config.js` (Next.js)
- No `tsconfig.json` (TypeScript)
- No `tailwind.config.js` (Tailwind CSS)
- No Python `requirements.txt` or `pyproject.toml`
- No database schema or migrations
- No source code whatsoever
- No tests
- No CI/CD configuration
- No environment templates

---

## 2. Specification Alignment

### Idea.md (Product Specification)

| Requirement | Implementation Status | Notes |
|-------------|----------------------|-------|
| Source ingestion | NOT IMPLEMENTED | No upload, no media handling |
| Transcription/segmentation | NOT IMPLEMENTED | No Whisper/AI integration |
| Content understanding | NOT IMPLEMENTED | No AI analysis pipeline |
| Evidence Graph | NOT IMPLEMENTED | No graph data structure |
| Creator Intent Contract | NOT IMPLEMENTED | No constraint system |
| Sponsor Contract | NOT IMPLEMENTED | No sponsor compliance |
| Asset generation | NOT IMPLEMENTED | No content generation |
| Verification engine | NOT IMPLEMENTED | No integrity checking |
| Semantic drift detection | NOT IMPLEMENTED | No semantic comparison |
| Numerical integrity | NOT IMPLEMENTED | No number extraction/comparison |
| Sponsor compliance | NOT IMPLEMENTED | No sponsor checking |
| Creator intent verification | NOT IMPLEMENTED | No intent checking |
| Platform QA | NOT IMPLEMENTED | No platform rules |
| Automatic repair | NOT IMPLEMENTED | No repair engine |
| Re-verification | NOT IMPLEMENTED | No re-verification flow |
| Release Passport | NOT IMPLEMENTED | No passport generation |
| Evidence Explorer | NOT IMPLEMENTED | No provenance UI |
| Content Graph visualization | NOT IMPLEMENTED | No graph UI |

### Architecture & Techstack.md

| Decision | Status | Notes |
|----------|--------|-------|
| Next.js + TypeScript | NOT IMPLEMENTED | No frontend code |
| Cloudflare Workers | NOT IMPLEMENTED | No worker code |
| Cloudflare D1 | NOT IMPLEMENTED | No database schema |
| Cloudflare R2 | NOT IMPLEMENTED | No storage integration |
| Cloudflare Workflows | NOT IMPLEMENTED | No workflow code |
| Cloudflare Vectorize | NOT IMPLEMENTED | No vector search |
| NVIDIA (AI primary) | NOT IMPLEMENTED | SUPERSEDED stack — user-mandated primary (see §6.1) |
| Mistral (AI fallback) | NOT IMPLEMENTED | SUPERSEDED stack — user-mandated fallback (see §6.1) |
| WhisperX (fallback) | NOT IMPLEMENTED | No speech processing |
| FFmpeg | NOT IMPLEMENTED | No media processing |
| C2PA | NOT IMPLEMENTED | No provenance |
| Zod + Pydantic | NOT IMPLEMENTED | No schemas |
| Vitest + Playwright + pytest | NOT IMPLEMENTED | No tests |

### Implementation.md (Execution Plan)

| Wave | Name | Status |
|------|------|--------|
| W0 | Repository Discovery + Contract Freeze | COMPLETE |
| W1 | Shared Contracts + Project Foundation | NOT STARTED |
| W2 | Real Infrastructure Foundation | NOT STARTED |
| W3 | Source Ingestion Pipeline | NOT STARTED |
| W4 | Video Understanding | NOT STARTED |
| W5 | Evidence Graph | NOT STARTED |
| W6 | Creator Intent Contract | NOT STARTED |
| W7 | Sponsor Contract | NOT STARTED |
| W8 | Content Generation Engine | NOT STARTED |
| W9 | Independent Verification Engine | NOT STARTED |
| W10 | Repair Engine | NOT STARTED |
| W11 | Re-Verification | NOT STARTED |
| W12 | Release Passport | NOT STARTED |
| W13 | Provenance Metadata | NOT STARTED |
| W14 | Audience Context + Learning | NOT STARTED |
| W15 | End-to-End Integration | NOT STARTED |
| W16 | Adversarial Benchmark | NOT STARTED |
| W17 | Security + Reliability | NOT STARTED |
| W18 | Full Automated Testing | NOT STARTED |
| W19 | Deployment | NOT STARTED |
| W20 | Judge-Path Hardening | NOT STARTED |
| W21 | Final Scope Freeze | NOT STARTED |

---

## 3. Implemented Capabilities

**NONE.** This is a greenfield project.

---

## 4. Missing Capabilities

All capabilities are missing. The project has specifications but no implementation.

---

## 5. Broken Capabilities

**NONE.** Nothing is implemented to be broken.

---

## 6. Architecture Status

### Approved Architecture

```text
Frontend: Next.js + TypeScript + Tailwind CSS
Deployment: Cloudflare Pages/Workers
Database: Cloudflare D1 (SQLite)
Storage: Cloudflare R2
Orchestration: Cloudflare Workflows
AI Primary: NVIDIA (OpenAI-compatible, NVIDIA_API_KEY)
AI Fallback: Mistral (OpenAI-compatible, MISTRAL_API_KEY)
Vector Search: Cloudflare Vectorize + LanceDB
Media: FFmpeg
Speech: faster-whisper / WhisperX (primary)
Provenance: C2PA Python SDK
Schemas: Zod + Pydantic
Testing: Vitest + Playwright + pytest
CI: GitHub Actions
```

### AI Provider Directive (User-Authorized Change, Sep 6)

Supersedes the Gemini/Ollama stack from the original specification documents.

```text
AI Primary:   NVIDIA (OpenAI-compatible — NVIDIA_API_KEY)
AI Fallback:  Mistral (OpenAI-compatible — MISTRAL_API_KEY)
Excluded:     Gemini (any), Ollama (any local model)
```

Consequences:
1. **No Gemini, no Ollama** anywhere in the stack.
2. **Vision**: NVIDIA NIM and Mistral accept images, not video, so video understanding = FFmpeg frame extraction + vision-model calls per frame/segment.
3. **Transcription**: faster-whisper / WhisperX becomes the PRIMARY transcriber (was "fallback" in the original spec).
4. **Fallback chain**: NVIDIA → Mistral → explicit failure report. Real fallbacks only (never fake results).

Deferred questions (do not block Wave 1):
- NVIDIA vision model name → resolve at AI smoke-test moment.
- Real API keys → none available yet; user will supply later.
- Cloudflare service list → Workflows confirmed enabled; full binding list TBD before Wave 2.

### Architecture Conflicts

**NONE.** No code exists to conflict with the architecture.

### Architecture Risks

1. **Cloudflare Workers CPU limit** — 10ms CPU per invocation may be too restrictive for complex operations. Mitigation: Use Workflows for long-running tasks.
2. **D1 single-threaded** — Sequential query processing may be slow under load. Mitigation: Acceptable for hackathon demo.
3. **NVIDIA/Mistral API quotas** — May run out during demo. Mitigation: real fallback chain NVIDIA → Mistral → explicit failure report (never fake results).
4. **R2 10GB storage limit** — May be tight for video storage. Mitigation: Use for demo assets only.

---

## 7. Shared Contracts

### Required Contracts (None Exist Yet)

| Contract | Consumers | Priority |
|----------|-----------|----------|
| Project | Frontend, API, Database | CRITICAL |
| SourceAsset | Frontend, API, Storage, Database | CRITICAL |
| TranscriptSegment | Frontend, API, Database | CRITICAL |
| Claim | Frontend, API, Database, AI | CRITICAL |
| Evidence | Frontend, API, Database | CRITICAL |
| Constraint | Frontend, API, Database | HIGH |
| SponsorRequirement | Frontend, API, Database | HIGH |
| GeneratedAsset | Frontend, API, Database | CRITICAL |
| GeneratedComponent | Frontend, API, Database | CRITICAL |
| VerificationRun | Frontend, API, Database | CRITICAL |
| VerificationFinding | Frontend, API, Database | CRITICAL |
| RepairAction | Frontend, API, Database | HIGH |
| ReleasePassport | Frontend, API, Database | HIGH |
| WorkflowState | API, Database | CRITICAL |
| APIResponse | Frontend, API | CRITICAL |
| AIOutput | AI, API, Database | CRITICAL |

### Contract Freeze Points (From Implementation.md)

```text
Before Wave 2: infrastructure/config contracts
Before Wave 3: source asset contracts
Before Wave 4: AI/source understanding contracts
Before Wave 5: claim/evidence contracts
Before Wave 8: generation contracts
Before Wave 9: verification contracts
Before Wave 10: finding/repair contracts
Before Wave 12: passport contracts
```

---

## 8. Dependency Graph

```text
Specifications (COMPLETE)
    ↓
Shared Contracts (Wave 1)
    ↓
Infrastructure Foundation (Wave 2)
    ↓
Source Ingestion (Wave 3)
    ↓
Video Understanding (Wave 4)
    ↓
Evidence Graph (Wave 5)
    ↓
Creator Intent (Wave 6)
    ↓
Sponsor Contract (Wave 7)
    ↓
Content Generation (Wave 8)
    ↓
Verification Engine (Wave 9)
    ↓
Repair Engine (Wave 10)
    ↓
Re-Verification (Wave 11)
    ↓
Release Passport (Wave 12)
    ↓
Provenance (Wave 13)
    ↓
Audience + Learning (Wave 14)
    ↓
End-to-End Integration (Wave 15)
    ↓
Adversarial Benchmark (Wave 16)
    ↓
Security + Reliability (Wave 17)
    ↓
Full Automated Testing (Wave 18)
    ↓
Deployment (Wave 19)
    ↓
Judge-Path Hardening (Wave 20)
    ↓
Final Scope Freeze (Wave 21)
```

---

## 9. Major Risks

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| Hackathon deadline too tight | CRITICAL | HIGH | Focus on Tier 1 only |
| No existing codebase | HIGH | CERTAIN | Start from zero, parallelize |
| AI service rate limits | HIGH | MEDIUM | Use free tiers carefully |
| Cloudflare deployment complexity | MEDIUM | MEDIUM | Test early |
| No test video for demo | MEDIUM | HIGH | Prepare fixture early |
| D1 limitations | LOW | LOW | Acceptable for demo |
| R2 storage limits | LOW | LOW | Use for demo assets only |

---

## 10. Testing Status

**No tests exist.** Testing infrastructure must be created in Wave 1.

Planned test categories:
- Unit tests (Vitest, pytest)
- Integration tests
- Browser tests (Playwright)
- Adversarial verification tests
- End-to-end workflow tests

---

## 11. Deployment Status

**No deployment configuration exists.** Must be created in Wave 2.

Target deployment:
- Frontend: Cloudflare Pages
- API: Cloudflare Workers
- Database: Cloudflare D1
- Storage: Cloudflare R2
- Workflows: Cloudflare Workflows

---

## 12. Next Wave

### Wave 0 — Repository Discovery + Contract Freeze (IN PROGRESS)

**Objective:** Understand the project before implementation and freeze shared contracts.

| Worker | Task | Deliverable | Status |
|--------|------|-------------|--------|
| Lead | Synthesize audits, create baseline | This document | COMPLETE |
| Worker A | Specification consistency audit | `docs/implementation/spec-audit.md` | PENDING |
| Worker B | Repository/codebase audit | `docs/implementation/repository-audit.md` | PENDING |
| Worker C | Risk/infrastructure audit | `docs/implementation/risk-register.md` | PENDING |

### Wave 1 — Shared Contracts + Project Foundation (NEXT)

**Objective:** Create the stable interfaces all later workers depend on.

| Worker | Task | Deliverable |
|--------|------|-------------|
| Lead | Shared schemas, config, error model | `packages/schemas/` |
| Worker A | Zod schemas, TypeScript types | `packages/schemas/src/` |
| Worker B | Pydantic models | `processing/schemas/` |
| Worker C | Test foundation (Vitest, pytest) | `tests/` |

**Entry Criteria:**
- Wave 0 audits complete
- Architecture confirmed
- Shared contracts identified

**Acceptance Criteria:**
- All contracts compile
- Tests run
- No duplicate schema definitions
- Downstream workers can build against frozen contracts

---

## 13. Implementation Priority (Hackathon Scope)

Given the ~47-hour deadline, focus on **Tier 1** only:

### Tier 1 — Must Exist

```text
✅ Real ingestion
✅ Real source understanding
✅ Evidence graph
✅ Real generation
✅ Real verification
✅ Real repair
✅ Re-verification
✅ Release Passport
✅ End-to-end workflow
```

### Tier 2 — Strongly Preferred (If Time Permits)

```text
Sponsor contract
Creator intent
C2PA/provenance
Adversarial benchmark
Fallback pipeline
```

### Tier 3 — Optional (Skip for Hackathon)

```text
Audience intelligence
Performance learning
Advanced analytics
Additional platforms
Extra export formats
```

---

## 14. Shared-Contract Plan

### Contracts to Freeze Before Wave 1

| Contract | Schema Location | Consumers |
|----------|-----------------|-----------|
| Project | `packages/schemas/` | Frontend, API, DB |
| SourceAsset | `packages/schemas/` | Frontend, API, Storage, DB |
| TranscriptSegment | `packages/schemas/` | Frontend, API, DB |
| Claim | `packages/schemas/` | Frontend, API, DB, AI |
| Evidence | `packages/schemas/` | Frontend, API, DB |
| GeneratedAsset | `packages/schemas/` | Frontend, API, DB |
| GeneratedComponent | `packages/schemas/` | Frontend, API, DB |
| VerificationRun | `packages/schemas/` | Frontend, API, DB |
| VerificationFinding | `packages/schemas/` | Frontend, API, DB |
| WorkflowState | `packages/schemas/` | API, DB |
| APIResponse | `packages/schemas/` | Frontend, API |
| AIOutput | `packages/schemas/` | AI, API, DB |

### Contracts to Freeze Before Wave 2

| Contract | Schema Location | Consumers |
|----------|-----------------|-----------|
| Constraint | `packages/schemas/` | Frontend, API, DB |
| SponsorRequirement | `packages/schemas/` | Frontend, API, DB |
| RepairAction | `packages/schemas/` | Frontend, API, DB |
| ReleasePassport | `packages/schemas/` | Frontend, API, DB |

---

## 15. Immediate Next Wave Definition

### Wave 0 Completion

**Lead Task:**
- Synthesize Worker A, B, C reports
- Update this baseline document
- Confirm architecture
- Identify shared contracts
- Prepare Wave 1 plan

**Worker A Task:**
- Read all Project Spec documents
- Cross-check Idea vs Architecture vs Tech Stack vs Implementation
- Identify contradictions
- Identify missing requirements
- Identify architecture assumptions
- Identify dependency relationships
- Produce `docs/implementation/spec-audit.md`

**Worker B Task:**
- Inspect repository structure
- Inspect existing application code (none)
- Inspect package manifests (none)
- Inspect configuration (none)
- Inspect .gitignore
- Inspect tests (none)
- Inspect deployment config (none)
- Inspect recent commits
- Produce `docs/implementation/repository-audit.md`

**Worker C Task:**
- Identify external-service dependencies
- Identify API/rate-limit concerns
- Inspect storage/database/workflow assumptions
- Identify fallback requirements
- Identify likely failure modes
- Identify security concerns
- Identify likely deployment problems
- Inspect current testability
- Produce `docs/implementation/risk-register.md`

**Dependencies:**
- None (all workers can run in parallel)

**Expected Outputs:**
- `docs/implementation/spec-audit.md`
- `docs/implementation/repository-audit.md`
- `docs/implementation/risk-register.md`
- Updated `docs/engineering-baseline.md`
- Updated `progress.md`

**Acceptance Criteria:**
- All three audit documents exist
- Contradictions identified
- Risks documented
- Shared contracts identified
- Wave 1 entry criteria defined
