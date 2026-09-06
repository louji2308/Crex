I researched the stack specifically around **our Crex architecture**, with a hard constraint of **minimal custom infrastructure, minimal paid services, and a realistic $0 hackathon deployment**.

The result is different from the generic “Next.js + FastAPI + Supabase + PostgreSQL + OpenAI” stack I would have initially suggested.

# Crex — Recommended Zero-Cost Stack

## The final stack

| Layer                    | Recommended technology                                                 | Why                                                                      |
| ------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Web app                  | **Next.js + TypeScript**                                               | Mature UI ecosystem; fast to build                                       |
| Deployment               | **Cloudflare Pages / Workers**                                         | Free deployment and generous request limits                              |
| API                      | **Cloudflare Workers**                                                 | Removes need for a separate backend server                               |
| Database                 | **Cloudflare D1 (SQLite)**                                             | Zero-cost, simple relational DB, no PostgreSQL server management         |
| Object storage           | **Cloudflare R2**                                                      | Designed for large files/video, free egress, 10 GB free storage          |
| Background orchestration | **Cloudflare Workflows**                                               | Native durable workflow execution                                        |
| AI video understanding   | **Gemini 3.7 Flash**                                                   | Direct video understanding + timestamps + structured output + free tier  |
| Embeddings/search        | **Cloudflare Vectorize**                                               | Native integration, free allocation                                      |
| Local fallback AI        | **Ollama**                                                             | Completely local and supports structured JSON                            |
| Transcription fallback   | **WhisperX / faster-whisper**                                          | Open-source, timestamp-aware transcription                               |
| Video processing         | **FFmpeg**                                                             | Industry-standard, free/open source                                      |
| Validation engine        | **Python/TypeScript custom rules**                                     | Deterministic; no API cost                                               |
| Provenance metadata      | **C2PA Python SDK**                                                    | Existing implementation rather than building provenance format ourselves |
| Auth                     | **Cloudflare Access / lightweight email-link auth** depending on scope | Avoid unnecessary auth engineering                                       |
| Testing                  | **Vitest + Playwright + Python pytest**                                | Strong and free                                                          |
| CI                       | **GitHub Actions**                                                     | Free for public repositories                                             |
| Schemas                  | **Zod + Pydantic**                                                     | Strong contracts between frontend/backend/AI                             |

The important insight is that **we should not build a conventional server architecture at all**.

We should make Cloudflare the infrastructure layer and reserve heavier processing for AI services/local processing.

---

# 1. The biggest architectural change

I would **drop the original idea of**

```text
Next.js
   ↓
FastAPI
   ↓
PostgreSQL
   ↓
Redis
   ↓
Celery
```

for the hackathon.

That architecture is perfectly reasonable for a startup.

It is **unnecessarily expensive and operationally complicated for this build**.

Instead:

```text
                   Crex
                         │
                 Cloudflare Pages
                         │
                 Next.js frontend
                         │
                   Cloudflare Worker
                  /        |        \
                 /         |         \
               D1         R2       Vectorize
               │           │           │
             data        media      semantic search
                           │
                           ▼
                      AI pipeline
                     /          \
             Gemini API        Local/Ollama
```

And long-running work goes through **Cloudflare Workflows**.

This dramatically reduces infrastructure.

---

# 2. Why Cloudflare is unusually good for this project

Cloudflare's current free offerings line up surprisingly well with Crex.

Workers Free currently allows **100,000 requests/day**, with 128 MB memory and 10 ms CPU per invocation. ([Cloudflare Docs][1])

Pages gives free builds and supports up to 20,000 files per site, making it a convenient deployment surface for the Next.js frontend. ([Cloudflare Docs][2])

More importantly, several parts of Crex can remain inside the same Cloudflare ecosystem:

```text
Workers
D1
R2
Vectorize
Workflows
Workers AI
```

That means:

* fewer providers
* fewer credentials
* fewer SDKs
* fewer deployment systems
* fewer networking problems
* fewer environments to debug

That is exactly what we want during a hackathon.

---

# 3. Database — D1 instead of Supabase

I would **not use Supabase as the primary database** for this project.

Supabase Free is genuinely good: 500 MB database, 1 GB storage, 50,000 MAU and 500,000 Edge Function invocations are currently included. ([Supabase][3])

But Crex doesn't actually need a PostgreSQL server.

Our schema is fundamentally:

```text
projects
sources
segments
claims
evidence
constraints
assets
verification_runs
findings
repairs
passports
```

That's perfectly suitable for SQLite.

Cloudflare D1 currently gives the Workers Free plan:

* 5 GB total account storage
* 5 million row reads/day
* 100,000 row writes/day
* 500 MB maximum database size per database. ([Cloudflare Docs][4])

The critical thing is that **D1 is scale-to-zero**—we aren't paying for an always-running database server. ([Cloudflare Docs][5])

### The downside

D1 is single-threaded per database and each individual database processes queries sequentially. ([Cloudflare Docs][4])

For a hackathon Crex instance, that is completely acceptable.

### So:

**Use D1.**

Not because it's fashionable.

Because it removes infrastructure we don't need.

---

# 4. Store videos in R2, not the database

This is one decision I consider non-negotiable.

Never put video blobs in D1.

Use:

```text
R2
├── source/
├── derived/
├── thumbnails/
├── clips/
└── exports/
```

Cloudflare R2 currently provides:

* **10 GB/month free storage**
* 1 million Class A operations
* 10 million Class B operations
* **free internet egress**. ([Cloudflare Docs][6])

That is excellent for our demo.

Even better, R2 explicitly supports multipart uploads for large files such as video, with resumability and objects up to 5 TiB. ([Cloudflare Docs][7])

And presigned URLs let the browser upload directly to R2 without passing the entire video through our Worker. ([Cloudflare Docs][8])

So:

```text
Browser
   │
   │ presigned upload
   ▼
R2
```

rather than:

```text
Browser
   ↓
Worker
   ↓
R2
```

That saves bandwidth, CPU and complexity.

---

# 5. AI video understanding — Gemini is the biggest simplification

This is the most important discovery from the research.

We originally thought we'd need:

```text
video
 ↓
FFmpeg audio extraction
 ↓
Whisper
 ↓
alignment
 ↓
frame extraction
 ↓
vision model
 ↓
merge everything
```

We don't necessarily need to build all of that.

Current Gemini video understanding supports direct video input, timestamps and extraction from both audio and visual streams. The File API supports free uploads up to 2 GB, and Gemini can process long-form video. ([Google AI for Developers][9])

More importantly, current Gemini Flash models support **agentic video understanding**, where the model can dynamically navigate the video instead of blindly processing every frame. Google says this can use up to 88% fewer tokens on long-form content while improving quality in their testing. ([Google AI for Developers][10])

That's huge for Crex.

Instead of implementing our own complete multimodal indexing engine immediately:

```text
Video
  ↓
Gemini
  ↓
Structured content model
```

Gemini can produce:

```json
{
  "segments": [],
  "claims": [],
  "numbers": [],
  "qualifiers": [],
  "entities": [],
  "sponsor_mentions": [],
  "important_events": []
}
```

Gemini also supports structured outputs using JSON Schema. ([Google AI for Developers][11])

That eliminates a large amount of custom parsing code.

---

# 6. Gemini pricing is exceptionally useful here

Google's current Gemini Developer API pricing shows free input/output tokens on the Free tier for certain models. Gemini 3.7 Flash is currently listed with free-tier input/output pricing. ([Google AI for Developers][12])

That means we can build the hackathon demo around:

```text
Gemini 3.7 Flash
```

rather than immediately paying for an inference provider.

And Gemini also has implicit context caching for newer models, which can reduce repeated-input costs when the same context is reused. ([Google AI for Developers][13])

---

# 7. We should not transcribe the video ourselves first

This is a major simplification.

### Old architecture

```text
FFmpeg
 ↓
Whisper
 ↓
WhisperX
 ↓
alignment
 ↓
speaker identification
 ↓
semantic analysis
```

### New architecture

```text
Video
 ↓
Gemini video understanding
 ↓
structured timestamped content model
```

For the hackathon, this is vastly better.

We still retain a fallback path:

```text
Gemini unavailable / user provides transcript
            ↓
      faster-whisper
            ↓
         WhisperX
```

WhisperX provides word-level timestamps, VAD and speaker diarization on top of faster-whisper/other components. ([GitHub][14])

So we're not dependent on it for the primary path.

---

# 8. Why WhisperX should be a fallback rather than the core

WhisperX is excellent technically.

Its repository explicitly provides:

* word-level timestamps
* VAD
* speaker diarization
* faster-whisper backend
* alignment. ([GitHub][14])

But deploying and operating its model dependencies introduces:

* PyTorch
* model downloads
* CUDA/CPU constraints
* longer processing
* environment problems

That is exactly the kind of complexity we're trying to remove.

So:

### Primary

**Gemini video understanding**

### Fallback

**WhisperX**

### Optional local mode

**faster-whisper**

This provides both simplicity and resilience.

---

# 9. LLM architecture

I would use **three levels**, not one model.

## Level 1 — deterministic

No LLM:

```text
number comparison
timestamp validity
required phrase checks
title length
duration
file properties
sponsor code presence
platform constraints
```

## Level 2 — cheap/local intelligence

```text
Ollama
```

Use for:

* simple extraction
* local experimentation
* development
* fallback
* tests

Ollama supports structured outputs with JSON schemas. ([Ollama][15])

## Level 3 — primary cloud reasoning

```text
Gemini 3.7 Flash
```

Use for:

* video understanding
* semantic extraction
* generation
* semantic comparison
* repair suggestions

This is a much better architecture than “send everything to the most expensive model.”

---

# 10. Should we use OpenRouter?

I would **not make OpenRouter the core provider**.

OpenRouter currently offers free models, but its free tier is restricted to around **50 requests/day**, making it unreliable as the backbone of a serious hackathon demo. ([OpenRouter][16])

It is useful as:

```text
optional emergency fallback
```

not:

```text
primary architecture
```

---

# 11. Should we use Groq?

Groq is actually interesting for a fallback path.

Its current free-plan limits include hosted Llama-family models and Whisper models with explicit request/token quotas. ([GroqCloud][17])

That makes it useful for:

```text
fast text verification
fast transcript fallback
```

But again:

**don't build the core around it.**

Gemini gives us direct video understanding, which is much more valuable to Crex.

---

# 12. Vector search — don't build our own

Our Evidence Graph eventually needs retrieval.

We could build:

```text
Postgres + pgvector
```

but that introduces another reason to use Supabase/Postgres.

Instead I would use:

# Cloudflare Vectorize

The current Workers Free allocation includes:

* **5 million stored vector dimensions**
* **30 million queried vector dimensions/month**. ([Cloudflare Docs][18])

For Crex this is more than sufficient for the hackathon.

For example, with 768-dimensional embeddings, 5 million dimensions corresponds to roughly 6,500 vectors.

That's already plenty for our initial dataset.

---

# 13. But we might not even need Vectorize initially

There is an even simpler optimization.

A typical video might produce:

```text
200–1000 transcript/evidence chunks
```

We don't necessarily need semantic search for every operation.

The pipeline can first narrow candidates using:

```text
entity
keyword
time range
claim type
numeric overlap
```

and only then invoke vector similarity.

So the path becomes:

```text
cheap filtering
     ↓
candidate evidence
     ↓
semantic similarity
     ↓
LLM verification
```

That drastically reduces both inference and vector usage.

---

# 14. LanceDB is the best local alternative

For local development, I particularly like **LanceDB**.

It is an embedded vector database, meaning it runs in-process much like SQLite and supports Python and TypeScript. ([LanceDB][19])

That gives us:

### Development

```text
LanceDB
```

### Deployed demo

```text
Vectorize
```

Potentially we don't even need the split if Vectorize integration is straightforward from the beginning.

But the local option is extremely useful when developing offline.

---

# 15. Why I don't recommend Qdrant/Chroma for this build

They're good technologies.

They're just not the best fit.

They add:

* another service
* another deployment
* another set of environment variables
* another operational surface

LanceDB has the better **zero-infrastructure developer experience**.

Vectorize has the better **Cloudflare deployment experience**.

So those are the two I would shortlist.

---

# 16. The provenance layer — don't invent it

This is another place where I strongly don't want us reinventing standards.

Use:

# **C2PA**

There is an official/open implementation through `c2pa-python` that can:

* read manifests
* validate manifests
* create/sign manifests
* attach metadata
* add assertions
* add ingredients. ([GitHub][20])

That means our exported media can eventually contain machine-readable provenance.

We don't need to invent:

```text
Crex-manifest-v1
```

from scratch.

Instead:

```text
C2PA
 +
Crex internal evidence graph
```

That is significantly stronger.

---

# 17. Important distinction: C2PA is not our Evidence Graph

Don't merge these concepts.

## Crex Evidence Graph

Answers:

> Why does this generated statement exist?

```text
generated claim
 ↓
source claim
 ↓
source evidence
 ↓
timestamp
```

## C2PA

Answers:

> What happened to this digital asset and what provenance information is attached to it?

The two systems complement each other.

---

# 18. Background processing — use Workflows

Video analysis can't fit into a tiny synchronous HTTP request.

So we shouldn't do:

```text
POST /analyze
    ↓
wait 2 minutes
```

Instead:

```text
POST /projects/:id/process
        ↓
create workflow
        ↓
return job ID
```

Then:

```text
WORKFLOW

Step 1
Validate source

Step 2
Process AI analysis

Step 3
Persist source graph

Step 4
Generate assets

Step 5
Verify claims

Step 6
Run deterministic checks

Step 7
Repair

Step 8
Reverify

Step 9
Generate passport
```

Cloudflare Workflows are designed for durable multi-step workflows, and the current Free plan includes substantial request/step/storage allocations. ([Cloudflare Docs][21])

This is exactly our workload.

---

# 19. Why not Celery + Redis?

Because then we would need:

```text
Redis
Celery worker
Python runtime
worker deployment
queue monitoring
restart semantics
```

Workflows give us the orchestration primitive without building that infrastructure ourselves.

That is a major complexity reduction.

---

# 20. Queues are optional

Cloudflare Queues currently provides 10,000 operations/day on the Workers Free plan. ([Cloudflare Docs][22])

But I would **not introduce Queues initially**.

Use:

```text
Workflows
```

for project pipelines.

Introduce Queues only if we later need high-volume independent asynchronous jobs.

Again:

**don't build infrastructure before the product needs it.**

---

# 21. Video generation/editing

This is the one area where I would avoid fancy AI services entirely.

Use:

# FFmpeg

For the hackathon:

* clipping
* cropping
* extracting audio
* generating thumbnails
* caption burn-in
* packaging

FFmpeg is free, mature and deterministic.

We don't need an AI video editing API just to demonstrate Crex.

---

# 22. Where FFmpeg actually runs

This is an important architectural caveat.

Cloudflare Workers is **not** the place to run a 10-minute FFmpeg job.

Instead, use one of:

### Option A — judge/developer machine

The local Crex worker runs FFmpeg.

### Option B — dedicated processing container

A small Python process runs:

```text
FFmpeg
WhisperX
local utilities
```

### Option C — Hugging Face Space

Hugging Face ZeroGPU can provide free shared GPU execution. Current free personal accounts can host up to two ZeroGPU Spaces and receive 5 minutes/day GPU quota. ([Hugging Face][23])

But 5 minutes/day is too constraining to make it our core media-processing infrastructure.

Therefore:

**ZeroGPU = optional experimentation / fallback, not core.**

---

# 23. The hackathon deployment should therefore have two modes

## Cloud demo mode

```text
Browser
  ↓
Cloudflare
  ↓
R2
  ↓
Gemini
  ↓
D1 / Vectorize
```

This handles the judge's main flow.

## Local power mode

```text
Browser
  ↓
local processing agent
  ├── FFmpeg
  ├── faster-whisper
  ├── WhisperX
  └── Ollama
```

This lets us demonstrate:

> “The same system can run locally without proprietary AI infrastructure.”

That is a strong engineering story.

---

# 24. The actual hybrid architecture

This is what I would implement:

```text
                         ┌─────────────────────┐
                         │     Next.js UI      │
                         │  Cloudflare Pages   │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │ Cloudflare Worker   │
                         │     API / Auth      │
                         └─────┬──────┬─────┬──┘
                               │      │     │
                    ┌──────────┘      │     └───────────┐
                    ▼                 ▼                 ▼
                   D1                 R2             Vectorize
              metadata/graph      media/files       embeddings
                    │                 │
                    └────────┬────────┘
                             ▼
                    ┌──────────────────┐
                    │ Cloudflare       │
                    │ Workflow         │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │ AI Orchestrator  │
                    └──────┬─────┬─────┘
                           │     │
                    ┌──────▼─┐ ┌─▼─────────┐
                    │ Gemini │ │ local AI  │
                    │ Flash  │ │ Ollama     │
                    └────────┘ └────────────┘
                           │
                           ▼
                  ┌────────────────────┐
                  │ Integrity Engine   │
                  │ deterministic + AI │
                  └─────────┬──────────┘
                            │
                            ▼
                    Release Passport
```

---

# 25. Schema layer

Use:

# Zod + Pydantic

Frontend/API contracts:

```text
TypeScript
   ↓
Zod
```

Processing/AI contracts:

```text
Python
   ↓
Pydantic
```

The central JSON contracts should be versioned.

For example:

```text
ClaimSchema v1
EvidenceSchema v1
GeneratedAssetSchema v1
VerificationFindingSchema v1
ReleasePassportSchema v1
```

This prevents the AI response format from leaking randomness into the rest of the application.

---

# 26. AI schema architecture

The model should never return:

```text
"Here are some claims..."
```

It should return:

```json
{
  "claims": [
    {
      "id": "claim_001",
      "text": "...",
      "type": "factual",
      "confidence": 0.96,
      "evidence": [
        {
          "start": 523,
          "end": 557
        }
      ]
    }
  ]
}
```

Gemini's structured output support makes this feasible without custom parser gymnastics. ([Google AI for Developers][11])

---

# 27. The verification engine should not be AI-only

The stack should intentionally look like:

```text
                 GENERATED ASSET
                       │
           ┌───────────┼────────────┐
           ▼           ▼            ▼
       RULE ENGINE  RETRIEVAL   SEMANTIC AI
           │           │            │
           └───────────┼────────────┘
                       ▼
                 FINDING MERGER
                       │
                       ▼
                 FINAL DECISION
```

For example:

### Numeric mismatch

Python catches it.

### Missing sponsor code

Python catches it.

### Unsupported semantic claim

retrieval + Gemini catches it.

### Ambiguous nuance loss

semantic verifier catches it.

This is significantly more robust.

---

# 28. Embeddings

I would use an open embedding model locally.

A sensible starting candidate is:

```text
BAAI/bge-small-en-v1.5
```

or a similarly small sentence-transformer model.

Generate embeddings locally.

Then push the vectors to Vectorize.

That keeps embedding inference cost at:

**$0**

and avoids consuming expensive API tokens.

For development:

```text
SentenceTransformers
+
LanceDB
```

For hosted demo:

```text
SentenceTransformers/local embedding
+
Vectorize
```

---

# 29. What should actually be sent to Gemini?

Not everything.

This is critical.

### Send Gemini:

* source video
* difficult semantic questions
* claim interpretation
* repair generation
* nuanced comparison

### Don't send Gemini:

* word count
* numerical difference
* file size
* duration
* sponsor string matching
* timestamp syntax
* aspect ratio
* simple substring rules

That reduces cost and improves determinism.

---

# 30. YouTube integration

For the hackathon, I would make this **optional**, not the only input path.

Primary:

```text
Upload video
```

Secondary:

```text
YouTube URL
```

The current YouTube Data API gives projects a default **10,000 quota units/day**, while `search.list` and `videos.insert` have their own quota costs. ([Google for Developers][24])

And Gemini's current YouTube URL video-input feature is available at no charge in preview, although Google warns that pricing/rate limits can change. ([Google AI for Developers][9])

Therefore the easiest path is:

```text
YouTube URL
  ↓
Gemini video input
```

for analysis.

No need to build a massive YouTube ingestion system.

---

# 31. Authentication

For the hackathon MVP, authentication should be extremely lightweight.

Do not build a complete identity platform.

We can use:

```text
Cloudflare Access
```

or implement a minimal:

```text
email magic link
```

depending on deployment constraints.

But for the actual judging demo, even a single protected demo workspace is sufficient.

Our engineering effort should go into:

**evidence/provenance**, not account management.

---

# 32. Testing stack

I would use three complementary layers.

## TypeScript

```text
Vitest
```

for:

* rules
* schemas
* utility functions

## Browser

```text
Playwright
```

for:

* upload
* processing
* evidence explorer
* verification
* repair
* passport

## Python

```text
pytest
```

for:

* extraction
* verifier
* adversarial benchmark

---

# 33. Golden dataset

This is particularly important.

Create a tiny fixed dataset:

```text
fixtures/
   laptop-review/
   sponsor-video/
   tutorial-video/
   podcast/
```

Each fixture contains:

```text
source.mp4
expected_segments.json
expected_claims.json
expected_findings.json
```

Then every code change can run against the same evidence.

This gives us reproducibility.

---

# 34. Adversarial benchmark

This should be a first-class repository component.

```text
benchmarks/
   numeric_drift/
   scope_drift/
   qualifier_removal/
   attribution_drift/
   sponsor_omission/
   invented_claim/
```

We can run:

```bash
pnpm benchmark
```

and get:

```text
Cases:           40
Correctly blocked: 37
Correctly reviewed: 2
False negative:    1
```

The numbers should be generated by the actual test suite—not invented for presentation.

---

# 35. Documentation stack

The project should have these documents from the beginning:

```text
docs/
├── architecture.md
├── evidence-model.md
├── verification-engine.md
├── ai-pipeline.md
├── sponsor-contract.md
├── provenance.md
├── benchmark.md
├── threat-model.md
└── adr/
```

The ADRs are especially useful.

Example:

```text
ADR-001:
Why Gemini video understanding is primary

ADR-002:
Why deterministic rules execute before semantic AI

ADR-003:
Why D1 instead of PostgreSQL

ADR-004:
Why R2 instead of database blob storage

ADR-005:
Why C2PA instead of custom media provenance
```

That makes the repository look like a deliberate engineering system.

---

# 36. Cost architecture

## Cloud infrastructure

### Cloudflare

Potentially:

**$0**

Workers Free, Pages Free, D1 Free, R2 free allocation, Vectorize free allocation and Workflows free allocation are all available today within their respective quotas. ([Cloudflare Docs][1])

### Gemini

Potentially:

**$0**

using the current free tier within its quotas. ([Google AI for Developers][12])

### Local AI

**$0**

Ollama + open models.

### WhisperX

**$0**

open source, running locally.

### FFmpeg

**$0**

open source.

### LanceDB

**$0**

open source.

### C2PA

**$0**

open source library.

### GitHub

**$0**

for our public repository/CI setup.

### Domain

**$0**

Use:

```text
<project>.pages.dev
```

during judging.

---

# 37. What could still cost money

The honest answer is:

**AI/video compute is the danger zone.**

Free tiers have quotas.

For example:

* Workers AI has a 10,000-neuron/day free allocation. ([Cloudflare Docs][25])
* OpenRouter free models currently have low request limits. ([OpenRouter][26])
* Hugging Face ZeroGPU Free provides only 5 minutes/day of GPU quota. ([Hugging Face][23])

Therefore we should not design the product around unlimited hosted GPU computation.

The design must assume:

> **the hackathon demo uses a small number of carefully selected processing runs.**

That is perfectly reasonable.

---

# 38. The $0 deployment model I recommend

### Production-like cloud path

```text
Cloudflare Pages
       +
Workers
       +
D1
       +
R2
       +
Vectorize
       +
Workflows
       +
Gemini Free Tier
```

### Local safety net

```text
Ollama
+
faster-whisper
+
WhisperX
+
FFmpeg
+
LanceDB
```

So even if a cloud AI endpoint starts rate limiting us, we aren't completely dead.

---

# 39. The stack I would lock today

# Frontend

```text
Next.js
TypeScript
Tailwind CSS
Zod
React Query
```

# Cloud

```text
Cloudflare Pages
Cloudflare Workers
Cloudflare D1
Cloudflare R2
Cloudflare Vectorize
Cloudflare Workflows
```

# AI

```text
Gemini 3.7 Flash
Ollama
Open-weight local embedding model
```

# Media

```text
FFmpeg
```

# Speech fallback

```text
faster-whisper
WhisperX
```

# Provenance

```text
C2PA Python SDK
```

# Backend logic

```text
TypeScript Workers
Python processing service only where genuinely necessary
```

# Testing

```text
Vitest
Playwright
pytest
```

# CI

```text
GitHub Actions
```

---

# 40. One further simplification I strongly recommend

I would actually **avoid Python for the cloud API entirely**.

Make:

```text
Next.js
      ↓
Cloudflare Worker
      ↓
D1/R2/Vectorize/Workflow
```

The only Python component should be:

```text
processing/
    verifier/
    whisperx/
    c2pa/
```

where Python genuinely has ecosystem advantages.

That means we avoid maintaining:

```text
Node backend
+
Python backend
+
Redis
+
Celery
```

simultaneously.

---

# 41. The implementation topology

The repository could therefore look like:

```text
Crex/
│
├── apps/
│   ├── web/                  # Next.js
│   └── worker/               # Cloudflare Worker
│
├── packages/
│   ├── schemas/              # Zod contracts
│   ├── rules/                # deterministic verification
│   ├── provenance/           # evidence graph definitions
│   └── ui/
│
├── processing/
│   ├── analyzer/             # Python analysis fallback
│   ├── verifier/             # semantic + deterministic verification
│   ├── media/                # FFmpeg utilities
│   └── provenance/           # C2PA
│
├── benchmarks/
│   ├── adversarial/
│   └── golden/
│
├── docs/
│
└── tests/
```

This is much cleaner than introducing 15 microservices.

---

# 42. The final recommended processing pipeline

```text
UPLOAD
  ↓
R2
  ↓
Create Project
  ↓
D1
  ↓
Start Workflow
  ↓
Gemini Video Understanding
  ↓
Structured Source Model
  ↓
Claims / Segments / Numbers / Qualifiers
  ↓
Evidence Graph
  ↓
Generate Assets
  ↓
Local Embeddings
  ↓
Vectorize
  ↓
Candidate Evidence Retrieval
  ↓
Semantic Verification
  ↓
Deterministic Verification
  ↓
Sponsor Verification
  ↓
Creator Intent Verification
  ↓
Platform Verification
  ↓
Repair
  ↓
Reverification
  ↓
Release Passport
  ↓
C2PA provenance
```

---

# 43. The most important engineering decisions

I would lock these as project rules:

### Rule 1

**Never use an LLM where deterministic code can solve the problem.**

### Rule 2

**Never make generated content authoritative over source evidence.**

### Rule 3

**Never send large video through our API server when direct upload is possible.**

### Rule 4

**Never run long media jobs synchronously.**

### Rule 5

**Never build infrastructure that a managed free primitive already solves.**

### Rule 6

**Every important generated claim must have provenance.**

### Rule 7

**Every verification result must be reproducible from stored evidence.**

### Rule 8

**Every AI response entering the application must conform to a schema.**

---

# 44. The final tech-stack decision

If I were starting the repository now, I would lock:

> **Next.js + TypeScript + Cloudflare Workers + D1 + R2 + Vectorize + Workflows + Gemini 3.7 Flash + FFmpeg + Ollama + faster-whisper/WhisperX fallback + C2PA + Zod/Pydantic + Vitest/Playwright/pytest + GitHub Actions.**

The important part isn't that these are individually “the best technologies.”

The important part is that **the combination minimizes the amount of technology we ourselves have to build and operate**.

We outsource:

**storage → R2**
**database → D1**
**vector search → Vectorize**
**orchestration → Workflows**
**video understanding → Gemini**
**provenance standard → C2PA**
**speech recognition fallback → WhisperX**
**media processing → FFmpeg**

And we spend our actual engineering effort on the thing that differentiates Crex:

# **the Evidence Graph + Integrity Engine + Repair Engine.**

That is where our code should be deep.

Everything else should be as boring, managed, reproducible and free as possible.

[1]: https://developers.cloudflare.com/workers/platform/limits/?utm_source=chatgpt.com "Limits · Cloudflare Workers docs"
[2]: https://developers.cloudflare.com/pages/platform/limits/?utm_source=chatgpt.com "Limits · Cloudflare Pages docs"
[3]: https://supabase.com/pricing?utm_source=chatgpt.com "Pricing & Fees | Supabase"
[4]: https://developers.cloudflare.com/d1/platform/limits/?utm_source=chatgpt.com "Limits · Cloudflare D1 docs"
[5]: https://developers.cloudflare.com/d1/platform/pricing/?utm_source=chatgpt.com "Pricing · Cloudflare D1 docs"
[6]: https://developers.cloudflare.com/r2/pricing/?utm_source=chatgpt.com "Pricing · Cloudflare R2 docs"
[7]: https://developers.cloudflare.com/r2/objects/upload-objects/?utm_source=chatgpt.com "Upload objects · Cloudflare R2 docs"
[8]: https://developers.cloudflare.com/r2/api/s3/presigned-urls/?utm_source=chatgpt.com "Presigned URLs · Cloudflare R2 docs"
[9]: https://ai.google.dev/gemini-api/docs/video-understanding?utm_source=chatgpt.com "Video understanding  |  Gemini API  |  Google AI for Developers"
[10]: https://ai.google.dev/gemini-api/docs/video-understanding?hl=en&utm_source=chatgpt.com "Video understanding  |  Gemini API  |  Google AI for Developers"
[11]: https://ai.google.dev/gemini-api/docs/structured-output?authuser=14&hl=en&utm_source=chatgpt.com "Structured outputs  |  Gemini API  |  Google AI for Developers"
[12]: https://ai.google.dev/gemini-api/docs/pricing?hl=en&utm_source=chatgpt.com "Gemini Developer API pricing  |  Gemini API  |  Google AI for Developers"
[13]: https://ai.google.dev/gemini-api/docs/caching?hl=en&utm_source=chatgpt.com "Context caching  |  Gemini API  |  Google AI for Developers"
[14]: https://github.com/HaolunLUO/whisperx/blob/main/README.md?utm_source=chatgpt.com "whisperx/README.md at main · HaolunLUO/whisperx · GitHub"
[15]: https://docs.ollama.com/capabilities/structured-outputs?utm_source=chatgpt.com "Structured Outputs - Ollama"
[16]: https://openrouter.ai/pricing?utm_source=chatgpt.com "Pricing | OpenRouter"
[17]: https://console.groq.com/docs/rate-limits?utm_source=chatgpt.com "Rate Limits - GroqDocs"
[18]: https://developers.cloudflare.com/vectorize/platform/pricing/?utm_source=chatgpt.com "Pricing · Cloudflare Vectorize docs"
[19]: https://docs.lancedb.com/quickstart?utm_source=chatgpt.com "Quickstart - LanceDB"
[20]: https://github.com/contentauth/c2pa-python?utm_source=chatgpt.com "GitHub - contentauth/c2pa-python: Python binding for c2pa-rs library · GitHub"
[21]: https://developers.cloudflare.com/workers/platform/pricing/?utm_source=chatgpt.com "Pricing · Cloudflare Workers docs"
[22]: https://developers.cloudflare.com/queues/platform/pricing/?utm_source=chatgpt.com "Cloudflare Queues - Pricing · Cloudflare Queues docs"
[23]: https://huggingface.co/docs/hub/spaces-zerogpu?utm_source=chatgpt.com "Spaces ZeroGPU: Dynamic GPU Allocation for Spaces · Hugging Face"
[24]: https://developers.google.com/youtube/v3/getting-started?utm_source=chatgpt.com "YouTube Data API Overview  |  Google for Developers"
[25]: https://developers.cloudflare.com/workers-ai/platform/pricing/?utm_source=chatgpt.com "Pricing · Cloudflare Workers AI docs"
[26]: https://openrouter.ai/docs/faq?utm_source=chatgpt.com "OpenRouter FAQ | Developer Documentation | OpenRouter | Documentation"
