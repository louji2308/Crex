# Crex — The Content Integrity Compiler

<div align="center">

![Status](https://img.shields.io/badge/status-production--ready-green)
![Tests](https://img.shields.io/badge/tests-717%20passing-brightgreen)
![TypeScript](https://img.shields.io/badge/types-strict-blue)
![License](https://img.shields.io/badge/license-TBD-gray)

> **Generate creator content. Trace it to evidence. Detect meaning drift. Repair violations. Publish with confidence.**

[What Is Crex?](#-what-is-crex) • [Architecture](#-architecture) • [Core Workflow](#-core-workflow) • [Quick Start](#-quick-start) • [API Reference](#-api-reference) • [Documentation](#-documentation)

</div>

---

## 🎯 What Is Crex?

**Crex** is an AI-powered content production system that transforms creator source videos into publishable content assets while ensuring **integrity**, **traceability**, and **accuracy**.

### The Problem We Solve

Content creators face three critical challenges:
1. **Meaning Drift** — AI-generated content can stray from the original source meaning
2. **Missing Evidence** — Claims lack traceable connections to source material
3. **Compliance Risk** — Sponsor requirements and creator constraints may be violated

### The Crex Solution

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         CREX INTEGRITY PIPELINE                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   📹 SOURCE → 🧠 UNDERSTAND → 🔗 EVIDENCE → ✨ GENERATE → ✅ VERIFY    │
│                                                                         │
│                     ↓                          ↑                        │
│                🔧 REPAIR ←─── ⚠️ DRIFT DETECTED                        │
│                     ↓                                                  │
│                📜 RELEASE PASSPORT → 🚀 PUBLISH                        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

Every output is:
- ✅ **Traceable** — Linked to source evidence
- ✅ **Verified** — Checked for meaning drift
- ✅ **Repairable** — Auto-fixed if violations detected
- ✅ **Certified** — Release Passport confirms integrity

---

## 🏗 Architecture

### System Overview

<!-- 
📸 ARCHITECTURE DIAGRAM PLACEHOLDER
Paste your architecture diagram image here:
![Architecture Diagram](./docs/images/architecture-overview.png)
-->

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT LAYER                                     │
│                    (Next.js Frontend + Upload UI)                            │
└──────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                           CLOUDFLARE WORKER                                   │
│                         (apps/worker)                                         │
│  ┌─────────────┬─────────────┬─────────────┬─────────────┬─────────────┐    │
│  │   Sources   │    Workflows│      AI     │  Provenance │   Audience  │    │
│  │   API       │    API      │    API      │    API      │    API      │    │
│  └─────────────┴─────────────┴─────────────┴─────────────┴─────────────┘    │
│  ┌─────────────┬─────────────┬─────────────┬─────────────┬─────────────┐    │
│  │   Repair    │   Passport  │   Health    │   Config    │   Security  │    │
│  │   API       │   API       │   Endpoint  │   Vars      │   Layer     │    │
│  └─────────────┴─────────────┴─────────────┴─────────────┴─────────────┘    │
└──────────────────────────────────────────────────────────────────────────────┘
                                      │
              ┌───────────────────────┼───────────────────────┐
              ▼                       ▼                       ▼
┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
│   Cloudflare D1     │  │   Cloudflare R2     │  │   Cloudflare        │
│   (SQLite DB)       │  │   (Object Storage)  │  │   Workflows         │
│                     │  │                     │  │   (Background Jobs) │
│  • Projects         │  │  • Source Videos    │  │                     │
│  • Source Assets    │  │  • Generated Media  │  │  • Source→Release   │
│  • Claims/Evidence  │  │  • Provenance Data  │  │  • Verification     │
│  • Verification     │  │                     │  │  • Repair           │
│  • Passports        │  │                     │  │                     │
└─────────────────────┘  └─────────────────────┘  └─────────────────────┘
              │
              ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                           AI PROVIDERS                                        │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐          │
│  │   NVIDIA (Primary)│ → │   OpenRouter    │ → │   Mistral       │          │
│  │   Llama 3.3 70B │    │   (Fallback)    │    │   (Legacy)      │          │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘          │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | Next.js + TypeScript + Tailwind | Creator UI & dashboards |
| **Deployment** | Cloudflare Pages / Workers | Edge deployment |
| **Database** | Cloudflare D1 (SQLite) | Persistent data storage |
| **Storage** | Cloudflare R2 | Media & asset storage |
| **Processing** | Cloudflare Workflows | Background job orchestration |
| **AI (Primary)** | NVIDIA API | Semantic understanding |
| **AI (Fallback)** | OpenRouter | Redundant AI processing |
| **Vector Search** | Cloudflare Vectorize + LanceDB | Evidence retrieval |
| **Media** | FFmpeg (planned) / In-process MP4 probe | Media validation |
| **Provenance** | C2PA Python SDK | Content authenticity |
| **Schemas** | Zod (TypeScript) | Contract validation |
| **Testing** | Vitest + Playwright + pytest | Full test coverage |
| **CI/CD** | GitHub Actions | Automated pipelines |

### Package Structure

<!-- 
📸 PACKAGE STRUCTURE DIAGRAM PLACEHOLDER
Paste your monorepo structure visualization here:
![Package Structure](./docs/images/package-structure.png)
-->

```
Crex/
├── apps/
│   └── worker/                 # Cloudflare Worker (HTTP API + Workflows)
├── packages/
│   ├── schemas/                # 18 Frozen contract schemas + types
│   ├── db/                     # D1 SQLite migrations + repositories
│   ├── core/                   # Config, logging, error handling
│   ├── ai/                     # NVIDIA → OpenRouter adapter
│   ├── infra/                  # D1/R2 infrastructure adapters
│   ├── media/                  # MP4 probe, media validation
│   ├── c2pa/                   # C2PA provenance (build/verify)
│   ├── audience/               # Audience context & insights
│   └── tests/                  # Fixtures + integration tests
├── docs/                       # Engineering documentation
├── Project Spec/               # Product specifications
├── AGENTS.md                   # Engineering operating system
└── progress.md                 # Development progress log
```

---

## 🔄 Core Workflow

### End-to-End Pipeline

<!-- 
📸 WORKFLOW DIAGRAM PLACEHOLDER
Paste your workflow visualization here:
![Workflow Diagram](./docs/images/workflow-pipeline.png)
-->

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CREX PRODUCTION PIPELINE                             │
└─────────────────────────────────────────────────────────────────────────────┘

  STEP 1: SOURCE INGESTION
  ┌────────────────────────────────────────────────────────────────────┐
  │  📹 Upload Source Video                                           │
  │     → R2 Storage (with SHA-256 hash)                              │
  │     → Media Validation (MP4/ISO-BMFF probe)                       │
  │     → D1 Record (SourceAsset: UPLOADING → VALID → READY)          │
  └────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
  STEP 2: SEMANTIC UNDERSTANDING
  ┌────────────────────────────────────────────────────────────────────┐
  │  🧠 AI Analysis (NVIDIA → OpenRouter)                             │
  │     → Transcript Generation                                       │
  │     → Claim Extraction                                            │
  │     → Evidence Graph Construction                                 │
  │     → Constraint Identification                                   │
  └────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
  STEP 3: CONTENT GENERATION
  ┌────────────────────────────────────────────────────────────────────┐
  │  ✨ Generate Output Assets                                        │
  │     → Titles, Descriptions, Chapters                              │
  │     → Social Media Snippets                                       │
  │     → Marketing Copy                                              │
  │     → Each component linked to source evidence                    │
  └────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
  STEP 4: VERIFICATION
  ┌────────────────────────────────────────────────────────────────────┐
  │  ✅ Multi-Dimensional Verification                                │
  │     • Run Component Score (generation quality)                    │
  │     • Evidence Coverage (claim-source linkage)                    │
  │     • Claim Fidelity (meaning preservation)                       │
  │     • Numerical Integrity (data accuracy)                         │
  │                                                                   │
  │     FINDINGS: PASS ✓  |  REVIEW ⚠  |  BLOCK ✗                     │
  └────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
              All PASS ✓                      BLOCK/REVIEW ⚠
                    │                               │
                    ▼                               ▼
  STEP 5A: RELEASE READY                 STEP 5B: REPAIR CYCLE
  ┌──────────────────────────────┐      ┌──────────────────────────────┐
  │  📜 Generate Release Passport│      │  🔧 Generate Repair Actions  │
  │     • release_status: READY  │      │     → Fix fidelity issues    │
  │     • watch_status: PASS     │      │     → Add missing evidence   │
  │     • overall_score: 0-100   │      │     → Correct numerics       │
  │     • Dimension scores       │      │                              │
  │     • Version tracking       │      │  Apply Repairs → Re-verify   │
  └──────────────────────────────┘      └──────────────────────────────┘
                    │                               │
                    └───────────────┬───────────────┘
                                    │
                                    ▼
  STEP 6: PUBLICATION
  ┌────────────────────────────────────────────────────────────────────┐
  │  🚀 Publish with Confidence                                       │
  │     • C2PA Provenance (optional signing)                          │
  │     • Audience Context Integration                                │
  │     • Export to platforms                                         │
  └────────────────────────────────────────────────────────────────────┘
```

### State Machine

```
SourceAsset Lifecycle:
UPLOADING → UPLOADED → VALIDATING → [VALID | INVALID] → PROCESSING → READY

Verification Finding States:
[PASS | REVIEW | BLOCK] per dimension

Release Passport Status:
DRAFT → [READY | BLOCKED | DRAFT] (versioned snapshots)

Provenance Status:
UNSIGNED → SIGNED → [VALID | INVALID | UNTRUSTED]
```

---

## 📦 Key Features & Capabilities

### ✅ Frozen Contract System

Crex uses **18 frozen schema contracts** to ensure consistency across all components:

| Contract | Purpose |
|----------|---------|
| `Project` | Creator project metadata |
| `SourceAsset` | Uploaded source video/audio |
| `TranscriptSegment` | Time-coded transcript chunks |
| `Claim` | Extracted factual assertions |
| `Evidence` | Source-backed proof links |
| `GeneratedAsset` | AI-produced content outputs |
| `GeneratedComponent` | Titles, descriptions, chapters |
| `VerificationRun` | Integrity check execution |
| `VerificationFinding` | Pass/Review/Block results |
| `WorkflowState` | Background job tracking |
| `Constraint` | Creator rules & requirements |
| `SponsorRequirement` | Brand compliance rules |
| `RepairAction` | Auto-fix proposals |
| `ReleasePassport` | Versioned integrity certificate |
| `ProvenanceRecord` | C2PA authenticity tracking |
| `ApiResponse` | Standardized API envelope |
| `AiOutput` | AI analysis results |
| `ApiError` | Error response format |

**Audience Context Contracts** (Wave 14): `AudienceProfile`, `AudienceObservation`, `AudienceInsight`, `AudienceRecommendation`, `AudienceContext`

---

## 🔐 Provenance & Authenticity (Wave 13)

<!-- 
📸 PROVENANCE DIAGRAM PLACEHOLDER
Paste your C2PA provenance flow diagram here:
![Provenance Flow](./docs/images/provenance-flow.png)
-->

Wave 13 implements a complete **C2PA provenance foundation** with honest trust reporting:

### How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                    PROVENANCE PIPELINE                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. UPLOAD ASSET → Compute SHA-256 hash                        │
│         ↓                                                       │
│  2. BUILD MANIFEST → Add c2pa.crex_provenance assertion        │
│         ↓                                                       │
│  3. SIGN (Optional) → Use C2PA Python SDK with EC keys         │
│         ↓                                                       │
│  4. STORE → R2 object + D1 provenance record                   │
│         ↓                                                       │
│  5. VERIFY → Re-hash R2 bytes + validate signature             │
│         ↓                                                       │
│  6. REPORT → VALID | INVALID | UNSIGNED | UNTRUSTED | MISSING  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Honest Trust Model

- ✅ **Unsigned assets** → Reported as `UNSIGNED` (never faked)
- ✅ **Untrusted signatures** → Reported as `UNTRUSTED` (unknown CA)
- ✅ **Trusted signatures** → Requires `--trust-anchors <root.pem>`
- ✅ **Hash mismatches** → Immediately flagged as `INVALID`

### API Endpoints

```bash
POST /provenance/records          # Create provenance record (hashes real R2 bytes)
GET  /provenance/records/:id      # Fetch record by ID
GET  /provenance/verify?assetId=  # Re-verify against R2 bytes
```

---

## 🎯 Release Passport (Wave 12)

<!-- 
📸 PASSPORT EXAMPLE PLACEHOLDER
Paste a sample Release Passport visualization here:
![Release Passport](./docs/images/passport-example.png)
-->

The **Release Passport** is a versioned, deterministic snapshot that certifies an asset's readiness for publication:

### Scoring Dimensions

| Dimension | Weight | Description |
|-----------|--------|-------------|
| `run_component` | 40% | Generation quality score |
| `evidence_coverage` | 20% | Claim-to-source linkage |
| `claim_fidelity` | 20% | Meaning preservation |
| `numerical_integrity` | 20% | Data accuracy |

### Status Logic

```
┌──────────────────────────────────────────────────────────────┐
│              RELEASE STATUS DECISION TREE                    │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  No verification run?           → DRAFT                      │
│  Latest run BLOCK?              → BLOCKED                    │
│  Provenance SIGNED but invalid? → BLOCKED                    │
│  Provenance exists but not VALID? → DRAFT                    │
│  Recent run REVIEW?             → DRAFT                      │
│  Mandatory sponsor BLOCK?       → DRAFT                      │
│  Any dimension != PASS?         → DRAFT                      │
│  All checks PASS + VALID prov.? → READY                      │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### API Endpoints

```bash
POST /passports                    # Create passport (version bump per asset)
GET  /passports?projectId=         # List project passports
GET  /passports/:id                # Fetch by ID
GET  /passports/:assetId/latest    # Get latest for asset
```

---

## 🔧 Repair & Re-verification (Waves 10-11)

When verification detects issues, Crex automatically proposes repairs:

```
VERIFICATION FAILS
       ↓
GENERATE REPAIR ACTIONS
  • Fix fidelity drift
  • Add missing evidence
  • Correct numerical errors
       ↓
APPLY REPAIRS (POST /repair/:actionId/apply)
       ↓
RE-RUN VERIFIER (POST /reverify)
       ↓
NEW PASSPORT GENERATED
```

### API Endpoints

```bash
POST /repair                       # Generate repair actions
POST /repair/:actionId/apply       # Apply a specific repair
POST /reverify                     # Apply all + re-verify
GET  /repair/actions?assetId=      # List actions for asset
```

---

## 👥 Audience Context (Wave 14)

Build deterministic audience profiles from observations:

```
OBSERVATIONS (tagged: CREATOR_DECLARED / OBSERVED / INFERRED)
       ↓
AGGREGATE (highest priority/confidence per metric)
       ↓
INSIGHTS (AGGREGATED_PROFILE / DIVERGENCE / GAP / DATA_INSUFFICIENT)
       ↓
RECOMMENDATIONS (ACKNOWLEDGE_LIMITS / SPLIT / EXPAND)
```

### API Endpoints

```bash
POST /audience/profiles            # Create audience profile
GET  /audience/profiles?projectId= # List profiles
POST /audience/observations        # Record observation (idempotent)
POST /audience/compute             # Aggregate → insights → recommendations
GET  /audience/context?projectId=  # Full assembled context
```

---

## 📊 Current Status & Deployment

### ✅ Production-Ready Components

| Component | Status | Tests | Live |
|-----------|--------|-------|------|
| **pnpm Monorepo** | ✅ Complete | 11/11 typecheck | Yes |
| **Frozen Schemas** | ✅ 18 contracts | Green | Yes |
| **D1 Database** | ✅ Migrations 0001-0013 | Applied | Yes |
| **R2 Storage** | ✅ Bucket provisioned | Working | Yes |
| **Cloudflare Worker** | ✅ Deployed | 179/179 tests | Yes |
| **Source Ingestion (Wave 3)** | ✅ Complete | Verified | Yes |
| **AI Analysis (Wave 2)** | ✅ NVIDIA→OpenRouter | Tested | Yes |
| **Provenance (Wave 13)** | ✅ C2PA SDK integrated | 21 tests | Yes |
| **Audience Context (Wave 14)** | ✅ Deterministic engine | 12 tests | Yes |
| **Repair Engine (Waves 10-11)** | ✅ Auto-repair + re-verify | 9 tests | Yes |
| **Release Passport (Wave 12)** | ✅ Versioned snapshots | 17 tests | Yes |
| **Hardening (W17-W19)** | ✅ Security + CI + Runbook | 33 adversarial | Yes |

### 🌐 Live Endpoints

- **Worker:** `https://crex-worker.loujanb2008.workers.dev`
- **Health Check:** `GET /health` → Returns binding status (DB/R2/Workflow)
- **D1 Database ID:** `b01526fc-40b4-4024-8616-b2fb6099d94d`
- **R2 Bucket:** `crex-media`

### 🧪 Test Coverage

```
Total Tests: 717 passing

By Package:
├── @crex/schemas       154 tests
├── @crex/tests         106 tests
├── @crex/db             67 tests
├── @crex/infra          37 tests
├── @crex/ai             36 tests
├── @crex/media          29 tests
├── @crex/c2pa           21 tests
├── @crex/core           20 tests
├── @crex/audience       12 tests
├── apps/worker         202 tests
└── benchmarks           33 adversarial tests
```

---

## 🚀 Quick Start

### Prerequisites

- Node.js ≥ 24
- pnpm ≥ 11
- Cloudflare account (for D1/R2/Workers)

### Installation

```bash
# Clone and install
git clone https://github.com/louji2308/Crex.git
cd Crex
pnpm install

# Type check all packages
pnpm -r typecheck

# Run all tests
pnpm -r test
```

### Local Development

```bash
# Configure AI provider keys (copy example and fill in)
cp apps/worker/.dev.vars.example apps/worker/.dev.vars
# Edit apps/worker/.dev.vars with your NVIDIA_API_KEY and/or OPENROUTER_API_KEY

# Apply migrations to local D1
cd apps/worker
npx wrangler d1 migrations apply crex --local

# Start development server
pnpm --filter @crex/worker dev
# Or: cd apps/worker && npx wrangler dev
```

### Deploy to Cloudflare

```bash
cd apps/worker

# Apply migrations to production D1
npx wrangler d1 migrations apply crex --remote

# Deploy worker
npx wrangler deploy
```

> ⚠️ **Note:** `pnpm --filter @crex/worker deploy` doesn't work because pnpm treats `deploy` as reserved. Use `npx wrangler deploy` from `apps/worker` instead.

---

## 🔌 API Reference

<!-- 
📸 API TESTING PLACEHOLDER
Paste screenshots of API responses here:
![API Examples](./docs/images/api-examples.png)
-->

### Core Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Check bindings (DB/R2/Workflow) + config status |
| `POST` | `/sources` | Create upload session (returns 201) |
| `PUT` | `/sources/:uploadId/blob` | Stream file to R2 (validates media) |
| `GET` | `/sources/:uploadId` | Poll upload status |
| `GET` | `/sources?projectId=` | List sources for project |
| `GET` | `/sources/ui` | Minimal upload UI |
| `POST` | `/workflows/source-to-release` | Start ingestion workflow |
| `GET` | `/workflows/source-to-release/:id` | Check workflow status |
| `POST` | `/ai/analyze` | Run semantic understanding (NVIDIA→OpenRouter) |

### Provenance Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/provenance/records` | Create provenance record (hashes R2 bytes) |
| `GET` | `/provenance/records/:id` | Fetch record by ID |
| `GET` | `/provenance/verify?assetId=` | Re-verify against R2 bytes |

### Release Passport Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/passports` | Create passport (version bump) |
| `GET` | `/passports?projectId=` | List project passports |
| `GET` | `/passports/:id` | Fetch by ID |
| `GET` | `/passports/:assetId/latest` | Get latest for asset |

### Repair & Re-verification Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/repair` | Generate repair actions |
| `POST` | `/repair/:actionId/apply` | Apply specific repair |
| `POST` | `/reverify` | Apply all repairs + re-verify |
| `GET` | `/repair/actions?assetId=` | List actions for asset |

### Audience Context Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/audience/profiles` | Create audience profile |
| `GET` | `/audience/profiles?projectId=` | List profiles |
| `POST` | `/audience/observations` | Record observation (idempotent) |
| `POST` | `/audience/compute` | Aggregate → insights → recommendations |
| `GET` | `/audience/context?projectId=` | Get full assembled context |

---

## 📁 Project Structure

<!-- 
📸 PROJECT VISUALIZATION PLACEHOLDER
Paste IDE screenshot or folder tree visualization:
![Project Structure](./docs/images/project-tree.png)
-->

```
Crex/
├── apps/
│   └── worker/                 # Cloudflare Worker (HTTP API + Workflows)
│       ├── src/
│       │   ├── pipelines/      # buildReleasePassport, etc.
│       │   ├── workflows/      # SourceToReleaseWorkflow
│       │   ├── routes/         # API route handlers
│       │   └── index.ts        # Worker entry point
│       ├── tests/              # 202 tests (hardening + features)
│       └── wrangler.jsonc      # Worker config + bindings
│
├── packages/
│   ├── schemas/                # 18 frozen Zod contracts
│   │   └── src/
│   │       ├── projects.ts
│   │       ├── source-assets.ts
│   │       ├── claims.ts
│   │       ├── verification.ts
│   │       ├── passports.ts
│   │       ├── provenance.ts
│   │       └── audience.ts
│   │
│   ├── db/                     # SQLite migrations + repositories
│   │   ├── migrations/         # 0001-0013 SQL files
│   │   └── src/repositories/   # Data access layer
│   │
│   ├── core/                   # Config, logging, errors
│   ├── ai/                     # NVIDIA → OpenRouter adapter
│   ├── infra/                  # D1/R2 adapters
│   ├── media/                  # MP4 probe, validation
│   ├── c2pa/                   # C2PA manifest build/verify
│   ├── audience/               # Deterministic aggregation
│   └── tests/                  # Fixtures + integration tests
│
├── docs/                       # Engineering documentation
├── Project Spec/               # Product specifications
├── AGENTS.md                   # Engineering operating system
└── progress.md                 # Development log
```

---

## 📚 Documentation

| Document | Location | Purpose |
|----------|----------|---------|
| 📘 Engineering OS | `AGENTS.md` | How we build Crex |
| 📋 Hackathon Requirements | `Project Spec/Hackathon details & requirements.md` | Competition specs |
| 💡 Product Spec | `Project Spec/Idea.md` | What Crex does |
| 🗺 Implementation Plan | `Project Spec/Implementation.md` | Build roadmap |
| 🏗 Architecture | `Project Spec/Architecture & Techstack.md` | System design |
| 📈 Progress Log | `progress.md` | Wave-by-wave status |
| 🔧 Engineering Baseline | `docs/engineering-baseline.md` | Technical foundation |
| 🚀 Deploy Runbook | `docs/implementation/deploy-runbook.md` | Deployment guide |

---

## 🛡 Security & Hardening (Waves 17-19)

Crex implements production-grade security measures:

- ✅ **Threat Model** — Documented attack vectors + mitigations
- ✅ **Verification Scoping** — Isolated verification contexts
- ✅ **Adversarial Benchmarks** — 33/33 tests passed
- ✅ **Deterministic C2PA** — Real-signed path (no faking)
- ✅ **CORS Layer** — Proper cross-origin controls
- ✅ **CI Workflow** — GitHub Actions automation
- ✅ **Deploy Runbook** — SAFE vs DESTRUCTIVE command tables

---

## 🎬 Example Usage Flow

<!-- 
📸 UPLOAD FLOW PLACEHOLDER
Paste screenshot of upload UI or workflow status:
![Upload Flow](./docs/images/upload-flow.png)
-->

```bash
# 1. Create upload session
curl -X POST http://localhost:8787/sources \
  -H "Content-Type: application/json" \
  -d '{"projectId": "uuid-here", "name": "my-video.mp4"}'

# Response: { "uploadId": "...", "status": "UPLOADING" }

# 2. Upload video file
curl -X PUT http://localhost:8787/sources/:uploadId/blob \
  --data-binary @my-video.mp4

# Response: { "status": "VALID", "checksum": "sha256:..." }

# 3. Start ingestion workflow
curl -X POST http://localhost:8787/workflows/source-to-release \
  -H "Content-Type: application/json" \
  -d '{"projectId": "uuid-here", "sourceId": "source-uuid"}'

# Response: { "workflowId": "...", "status": "RUNNING" }

# 4. Poll workflow status
curl http://localhost:8787/workflows/source-to-release/:workflowId

# Response: { "status": "COMPLETED", "phase": "record-completion" }

# 5. Generate Release Passport
curl -X POST http://localhost:8787/passports \
  -H "Content-Type: application/json" \
  -d '{"projectId": "uuid-here", "assetId": "asset-uuid"}'

# Response: { "passport": { "release_status": "READY", "overall_score": 95 } }
```

---

## 🤝 Contributing

Crex is built for the **AI Content Engine Hackathon (September 2026)**.

### Development Guidelines

1. **Frozen Contracts First** — All schema changes require registry updates
2. **Deterministic Before AI** — Use AI only when deterministic approaches fail
3. **Honest Reporting** — Never fake success states (provenance, verification, etc.)
4. **Test Coverage** — All new features require tests
5. **Type Safety** — Strict TypeScript across all packages

---

## 📄 License

Not yet determined.

---

## 🙏 Acknowledgments

Built for the **AI Content Engine Hackathon** (September 2026).

Special thanks to:
- Cloudflare Workers team for edge compute infrastructure
- C2PA community for content provenance standards
- NVIDIA and OpenRouter for AI inference providers

---

<div align="center">

**Made with ❤️ for creators who demand integrity**

[Back to Top](#-the-content-integrity-compiler)

</div>
