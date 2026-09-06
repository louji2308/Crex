# Crex — Implementation Plan

## 0. Purpose

This document defines the complete implementation sequence for Crex.

Crex is a provenance-aware AI content compiler that:

1. ingests real creator source content,
2. understands the source,
3. constructs an evidence graph,
4. accepts creator and sponsor constraints,
5. generates real derivative content,
6. verifies generated content independently,
7. detects semantic, numerical, contextual and compliance drift,
8. repairs invalid content,
9. re-verifies repaired content,
10. produces a Release Passport,
11. optionally attaches provenance metadata,
12. and provides a real working end-to-end demonstration.

This document is an **implementation execution plan**, not a product-specification document.

The authoritative product requirements are defined in:

```text
Hackathon Requirements.md
Idea.md
Architecture/
Techstack.md
```

The implementation MUST remain inside those documents.

---

# 1. Non-Negotiable Engineering Rules

These rules apply to every worker, including the lead/orchestrator.

## 1.1 Read the specifications before touching code

Before starting any task, the agent MUST read:

```text
Hackathon Requirements.md
Idea.md
Architecture/
Techstack.md
```

The agent MUST understand the relevant parts before implementing.

If another specification document is later added to the Project Spec folder, it becomes part of the authoritative specification set and MUST also be read.

---

## 1.2 Never silently change the architecture

Agents MUST NOT replace an architecture decision because another technology appears easier.

Examples of prohibited unilateral changes:

```text
Supabase instead of D1
Postgres instead of D1
Redis instead of Workflows
Celery instead of Workflows
Another vector database instead of the selected vector layer
Another AI provider instead of the selected primary provider
A generic mock AI layer instead of the real AI pipeline
```

If an architecture change genuinely becomes necessary, the agent MUST:

1. document the technical reason,
2. identify the affected contracts,
3. identify downstream impact,
4. propose the smallest compatible change,
5. ask the lead/orchestrator for a decision before implementing it.

Do not create architectural drift inside a worker branch.

---

## 1.3 No mock product behavior

The application MUST NOT use:

```text
mock API responses
fake analysis
hardcoded scores
fake processing progress
pretend verification
static demo findings
fake generated assets
```

unless they are explicitly part of an isolated automated test fixture.

The visible prototype/demo MUST use real functionality.

For example:

```text
Real uploaded video
→ real analysis
→ real extracted claims
→ real generated asset
→ real verification
→ real finding
→ real repair
→ real re-verification
→ real passport
```

---

## 1.4 Test fixtures are allowed only for tests

Deterministic fixtures may exist under:

```text
tests/
fixtures/
benchmarks/
```

They MUST never accidentally become the production application's data path.

Production code must distinguish between:

```text
production/live
```

and:

```text
test/fixture
```

---

## 1.5 Fallbacks must be explicit

Whenever a fallback is used, the system MUST know and expose that it is a fallback.

Examples:

```text
Primary:
Gemini video understanding

Fallback:
user-provided transcript
or
local transcription
```

The UI should communicate this clearly where relevant:

```text
Primary analysis: Gemini
Fallback analysis: local transcription
```

Never present fallback output as though the primary pipeline ran.

---

## 1.6 No silent degradation

If a dependency is unavailable, the product must not silently fabricate a result.

Correct:

```text
Gemini unavailable
→ workflow enters fallback
→ UI reports fallback
```

Incorrect:

```text
Gemini unavailable
→ return hardcoded analysis
```

---

## 1.7 No premature abstraction

Workers should not create generic frameworks before the actual use case exists.

Prefer:

```text
small real implementation
→ repeated real usage
→ abstraction only when justified
```

---

## 1.8 Every contract must be explicit

Cross-module data must use explicit schemas.

At minimum:

```text
Project
SourceAsset
TranscriptSegment
Claim
Evidence
Constraint
SponsorRequirement
GeneratedAsset
GeneratedComponent
VerificationRun
VerificationFinding
RepairAction
ReleasePassport
PerformanceObservation
LearningRecord
```

---

# 2. Execution Model

The project uses a **lead + 3 subagent model**.

Maximum simultaneous engineering agents:

```text
Lead / Orchestrator
Worker A
Worker B
Worker C
```

The lead is an active engineer, not only a coordinator.

The lead MUST continue useful implementation work whenever workers are executing independent tasks.

---

# 3. Work Allocation Model

Each wave has:

```text
Lead:
integration / architecture / shared work / unresolved issues

Worker A:
parallel implementation stream 1

Worker B:
parallel implementation stream 2

Worker C:
parallel implementation stream 3
```

Workers MUST NOT receive tasks with unresolved dependencies.

The lead MUST resolve shared-contract questions before spawning dependent work.

---

# 4. Dependency Philosophy

The implementation follows:

```text
SPEC
 ↓
CONTRACTS
 ↓
FOUNDATION
 ↓
REAL INFRASTRUCTURE
 ↓
INGESTION
 ↓
UNDERSTANDING
 ↓
EVIDENCE GRAPH
 ↓
GENERATION
 ↓
VERIFICATION
 ↓
REPAIR
 ↓
RE-VERIFICATION
 ↓
RELEASE PASSPORT
 ↓
END-TO-END UI
 ↓
HARDENING
 ↓
BENCHMARK
 ↓
DEPLOYMENT
```

Do not reverse this sequence.

---

# 5. Wave 0 — Repository Discovery and Contract Freeze

## Goal

Understand the project before implementation and freeze the shared contracts.

## Lead

The lead MUST:

1. read all Project Spec documents,
2. inspect the repository,
3. inspect existing code,
4. identify current files,
5. identify what already exists,
6. confirm the actual configured stack,
7. identify potential conflicts,
8. create the implementation task map,
9. freeze shared contracts.

No large feature implementation should begin before this wave is complete.

## Worker A — Specification consistency audit

Audit:

```text
Hackathon Requirements.md
Idea.md
Architecture/
Techstack.md
```

Identify:

```text
requirements
features
constraints
non-goals
external services
fallback behavior
security requirements
deployment constraints
```

Produce:

```text
docs/implementation/spec-audit.md
```

## Worker B — Repository/codebase audit

Inspect:

```text
application structure
configuration
package manifests
database configuration
environment handling
existing tests
existing deployment config
```

Do not rewrite code.

Produce:

```text
docs/implementation/repository-audit.md
```

## Worker C — Integration/risk audit

Identify:

```text
external API dependencies
file size risks
long-running operation risks
authentication requirements
rate-limit risks
failure paths
local fallback requirements
deployment blockers
```

Produce:

```text
docs/implementation/risk-register.md
```

## Exit Gate

Wave 0 is complete only when:

* specification conflicts are identified,
* repository state is known,
* architecture is understood,
* implementation risks are documented,
* shared contracts can be frozen.

---

# 6. Wave 1 — Shared Contracts and Project Foundation

## Goal

Create the stable interfaces all later workers depend on.

## Lead

Implement and freeze:

```text
shared schemas
environment/config loader
error model
API conventions
workflow/job status model
logging conventions
```

The lead MUST ensure all workers consume the same schemas.

## Worker A — Type/schema contracts

Implement:

```text
Zod schemas
shared TypeScript types
serialization contracts
API response contracts
```

## Worker B — Python/domain contracts

Implement:

```text
Pydantic models
verification models
analysis models
provenance models
```

Only models required by the architecture should be added.

## Worker C — Test foundation

Implement:

```text
Vitest setup
pytest setup
Playwright setup
test utilities
fixture conventions
```

Create initial contract tests.

## Exit Gate

All contracts compile and tests run.

No downstream worker should create duplicate versions of the same schema.

---

# 7. Wave 2 — Real Infrastructure Foundation

## Goal

Make the application capable of using real infrastructure.

## Lead

Implement:

```text
Cloudflare Worker application shell
environment handling
D1 binding
R2 binding
Workflow binding
Vector layer binding if enabled in the architecture
```

The lead verifies that infrastructure is usable from local development and deployment.

## Worker A — Database

Implement:

```text
D1 schema
migrations
indexes
repository/data-access layer
```

Core entities:

```text
projects
source_assets
transcript_segments
claims
evidence
constraints
sponsor_requirements
generated_assets
generated_components
verification_runs
verification_findings
repair_actions
release_passports
performance_observations
learning_records
```

Only fields required by the current architecture should be included.

## Worker B — Object storage

Implement:

```text
R2 integration
upload initialization
presigned/multipart upload flow
object naming
metadata
download/access policy
```

The browser should upload large files directly where the architecture permits.

## Worker C — Workflow/infrastructure integration

Implement:

```text
workflow creation
workflow status persistence
retry model
failure model
workflow step conventions
```

## Exit Gate

The system can:

```text
create project
store project
upload real source file
store source metadata
start real workflow
track real workflow status
```

No fake processing status.

---

# 8. Wave 3 — Source Ingestion Pipeline

## Goal

Transform real source media into a stable Source Record.

## Lead

Integrate the complete ingestion pathway:

```text
upload
→ source registration
→ metadata extraction
→ source validation
→ workflow trigger
```

Implement media validation.

## Worker A — Upload and source management

Implement:

```text
upload lifecycle
source asset records
checksums
file metadata
source status
```

## Worker B — Media inspection

Implement real:

```text
duration extraction
format detection
audio/video stream information
basic media validation
```

Use FFmpeg or the architecture-approved media tooling.

## Worker C — Ingestion API/UI

Implement:

```text
source upload UI
upload progress
processing state
error state
source summary
```

## Exit Gate

A real video can enter the system without manual database edits or fabricated state.

---

# 9. Wave 4 — Video Understanding

## Goal

Produce the Source Understanding Model from real content.

## Lead

Own the primary AI integration.

Primary path:

```text
real video
→ Gemini video understanding
→ structured output
→ schema validation
→ persisted source model
```

The implementation MUST use structured output.

## Worker A — Gemini integration

Implement:

```text
file handling
model invocation
structured schema response
retry/error handling
rate-limit handling
```

## Worker B — Source analysis normalization

Implement normalization for:

```text
segments
topics
entities
numbers
claims
opinions
recommendations
qualifiers
sponsor references
```

## Worker C — fallback analysis

Implement only approved fallbacks.

Examples:

```text
provided transcript
local faster-whisper/WhisperX
other architecture-approved fallback
```

Every fallback path MUST emit explicit metadata.

## Exit Gate

For a real source video:

```text
segments exist
claims exist
timestamps exist
numbers are extracted
qualifiers are represented
fallback status is known
```

No manually entered claims.

---

# 10. Wave 5 — Evidence Graph

## Goal

Build the central provenance structure.

## Lead

Implement the source-to-evidence data model and graph persistence.

The central relationship MUST support:

```text
source segment
→ claim
→ evidence
→ generated component
```

## Worker A — Claim/evidence persistence

Implement:

```text
claim repository
evidence repository
relations
indexes
```

## Worker B — Evidence retrieval

Implement:

```text
cheap candidate filtering
semantic retrieval
vector indexing
evidence ranking
```

Use the approved vector/search technology.

Do not add another database only for convenience.

## Worker C — Evidence Explorer UI

Implement:

```text
claim list
evidence list
source timestamp
click-to-jump behavior
```

## Exit Gate

A user can select a source claim and trace it to real timestamped source evidence.

---

# 11. Wave 6 — Creator Intent Contract

## Goal

Make creator-specific constraints machine-readable.

## Lead

Implement the contract model and evaluation mechanism.

Core examples:

```text
tone
target audience
avoid absolute claims
preserve technical nuance
avoid misleading clickbait
preferred title style
```

## Worker A — Intent schema/persistence

Implement:

```text
constraint model
validation
CRUD
```

## Worker B — Intent extraction

Implement optional real AI-assisted inference from source/profile.

Inferred constraints MUST be marked as inferred.

They MUST NOT be presented as manually confirmed preferences.

## Worker C — Intent UI

Implement:

```text
creator intent editor
constraint categories
enabled/disabled state
source of constraint
```

## Exit Gate

Creator intent is represented as explicit structured constraints and is usable by generation and verification.

---

# 12. Wave 7 — Sponsor Contract

## Goal

Turn sponsor obligations into machine-checkable requirements.

## Lead

Implement the Sponsor Contract architecture and validation semantics.

## Worker A — Sponsor requirements

Implement:

```text
sponsor
required phrase
disclosure requirement
discount code
required URL
must-not-claim
timing constraints
```

## Worker B — Sponsor ingestion

Implement parsing from approved inputs:

```text
structured form
supported uploaded brief
```

Do not claim arbitrary PDF/document intelligence unless actually implemented.

## Worker C — Sponsor UI

Implement:

```text
contract editor
requirements view
validation status
failure details
```

## Exit Gate

A sponsor requirement can be persisted and evaluated against an asset.

---

# 13. Wave 8 — Content Generation Engine

## Goal

Generate real derivative content from real source data.

## Lead

Implement the generation orchestration and ensure all generation inputs are explicit.

Generation MUST consume:

```text
source evidence
creator intent
sponsor requirements
audience context
target platform
```

## Worker A — YouTube package

Implement:

```text
title
description
chapters
```

## Worker B — Short/social generation

Implement:

```text
Short script
social post
pinned comment
```

## Worker C — media-derived asset path

Implement actual supported media generation:

```text
clip selection
FFmpeg trimming
caption rendering
thumbnail extraction/conversion
```

Do not expand into a full video editor.

## Exit Gate

Real source content produces real generated assets.

Every generated semantic component has provenance references or is explicitly marked non-factual/creative.

---

# 14. Wave 9 — Independent Verification Engine

## Goal

Build the core Integrity Engine.

This is a critical wave.

Generation and verification MUST remain separate.

## Lead

Design and integrate:

```text
rule verifier
semantic verifier
finding merger
decision engine
```

## Worker A — Deterministic verifier

Implement:

```text
numeric comparison
timestamp validation
required phrase checks
URL checks
duration checks
character/length limits
media properties
platform rules
```

## Worker B — Semantic verifier

Implement real analysis for:

```text
claim fidelity
scope drift
certainty drift
qualifier removal
attribution drift
unsupported claims
semantic contradiction
```

The verifier must compare generated content against stored evidence.

## Worker C — Sponsor/intent verification

Implement:

```text
sponsor compliance
creator intent compliance
mandatory disclosure checks
must-not-claim checks
```

## Exit Gate

The verification engine can return:

```text
PASS
REVIEW
BLOCK
```

with structured findings and real evidence.

---

# 15. Wave 10 — Repair Engine

## Goal

Turn violations into actionable repairs.

## Lead

Implement:

```text
finding
→ repair proposal
→ modified content
→ provenance update
```

## Worker A — Repair generation

Implement AI-assisted repair suggestions.

Repairs must reference:

```text
finding
source evidence
constraint
```

## Worker B — Repair persistence

Implement:

```text
repair action
version history
before/after
accepted/rejected state
```

## Worker C — Repair UI

Implement:

```text
violation display
suggested correction
accept
reject
regenerate
manual edit
```

## Exit Gate

A blocked asset can be repaired through the real application.

---

# 16. Wave 11 — Re-Verification

## Goal

Ensure repaired outputs are actually safe.

## Lead

Implement the full:

```text
repair
→ verify again
```

workflow.

A repaired asset MUST NOT automatically become READY.

## Worker A — verification rerun

Implement deterministic and semantic re-checks.

## Worker B — state transitions

Implement:

```text
BLOCKED
→ REPAIR_REQUIRED
→ REPAIRED
→ REVERIFYING
→ READY / REVIEW / BLOCK
```

## Worker C — verification history UI

Implement:

```text
verification versions
findings before repair
result after repair
```

## Exit Gate

The same violation can be demonstrated as:

```text
BLOCK
→ REPAIR
→ PASS
```

using real system behavior.

---

# 17. Wave 12 — Release Passport

## Goal

Create the final release artifact.

## Lead

Define and integrate the Release Passport.

Passport MUST summarize real verification results.

Example:

```text
Project
Asset count
Claim count
Evidence coverage
Claim fidelity
Numerical integrity
Creator intent status
Sponsor compliance
Platform QA
Integrity score
Release status
```

## Worker A — Passport backend

Implement:

```text
passport generation
snapshot semantics
storage
versioning
```

## Worker B — Passport UI

Implement:

```text
summary
metrics
findings
evidence links
asset statuses
```

## Worker C — Export

Implement the approved export format(s):

```text
JSON
Markdown
other explicitly required format
```

Do not build multiple exporters unless required.

## Exit Gate

A completed content project can produce a real persisted Release Passport.

---

# 18. Wave 13 — Provenance Metadata

## Goal

Integrate approved provenance standards without replacing the internal evidence graph.

## Lead

Integrate the approved C2PA path.

Internal provenance and external media provenance remain separate concepts.

## Worker A — C2PA integration

Implement only the supported operations needed by the prototype.

## Worker B — asset metadata verification

Verify the resulting output artifact.

## Worker C — provenance UI

Show provenance status clearly.

## Exit Gate

At least one real generated output can carry or expose the approved provenance information.

If full C2PA signing is impractical in the final deployment environment, the limitation MUST be explicit and the system MUST NOT pretend signing succeeded.

---

# 19. Wave 14 — Audience Context and Learning

## Goal

Add contextual intelligence without destabilizing the core pipeline.

This is intentionally later than the core verification system.

## Lead

Integrate:

```text
audience signals
performance observations
creator-specific learning
```

Only real available data should be used.

## Worker A — audience context

Implement approved sources such as:

```text
previous comments
channel content metadata
known audience signals
```

## Worker B — performance observations

Implement:

```text
prediction
actual result
difference
```

## Worker C — learning UI

Implement:

```text
creator-specific patterns
confidence
historical evidence
```

## Exit Gate

This layer must remain optional.

The core product MUST continue working without it.

---

# 20. Wave 15 — End-to-End Integration

## Goal

Connect every subsystem into one real workflow.

The complete path must be:

```text
Create Project
    ↓
Upload Source
    ↓
Analyze
    ↓
Build Evidence Graph
    ↓
Define Creator Intent
    ↓
Define Sponsor Contract
    ↓
Generate Assets
    ↓
Verify
    ↓
Find Problems
    ↓
Repair
    ↓
Re-Verify
    ↓
Release Passport
```

## Lead

Own full integration.

Do not assign the entire integration to one worker.

## Worker A

Test source → evidence integration.

## Worker B

Test evidence → generation → verification.

## Worker C

Test repair → re-verification → passport.

## Exit Gate

The complete user journey works without:

```text
manual database editing
manual code execution
hardcoded results
fake progress
mock production data
```

---

# 21. Wave 16 — Adversarial Benchmark

## Goal

Demonstrate that the Integrity Engine catches realistic failures.

## Lead

Define benchmark categories and evaluation methodology.

## Worker A — semantic drift fixtures

Create real fixtures for:

```text
scope inflation
certainty inflation
qualifier removal
attribution loss
unsupported claim
```

## Worker B — deterministic fixtures

Create:

```text
numeric drift
timestamp errors
duration errors
required phrase omission
platform constraint failures
```

## Worker C — sponsor fixtures

Create:

```text
missing disclosure
missing sponsor name
missing discount code
forbidden claim
required-link omission
```

## Exit Gate

Run a reproducible benchmark.

The benchmark MUST produce its numbers automatically.

Do not manually type benchmark results into documentation.

---

# 22. Wave 17 — Security and Reliability Hardening

## Goal

Eliminate obvious production-quality weaknesses.

## Lead

Perform final architecture review.

Check:

```text
secrets
authorization
input validation
file validation
signed URLs
object access
prompt injection risks
untrusted source content
AI output validation
database constraints
error leakage
rate limits
```

## Worker A — application security

Audit:

```text
auth
API
storage
permissions
environment variables
```

## Worker B — AI security

Audit:

```text
prompt injection
untrusted content
tool invocation boundaries
generated output validation
```

## Worker C — media/security

Audit:

```text
file types
file sizes
FFmpeg input handling
path traversal
unsafe filenames
temporary file cleanup
```

## Exit Gate

No known high-severity security issue remains unresolved for the prototype.

---

# 23. Wave 18 — Full Automated Testing

## Goal

Turn the implementation into a reproducible engineering project.

## Lead

Run and fix the complete suite.

Required categories:

```text
unit
integration
workflow
API
database
AI contract
verification
browser
end-to-end
adversarial
```

## Worker A

Run:

```text
Vitest
pytest
```

Fix failures.

## Worker B

Run:

```text
Playwright
```

Fix failures.

## Worker C

Run:

```text
benchmark suite
schema compatibility tests
workflow failure tests
```

Fix failures.

## Exit Gate

All mandatory automated tests pass.

---

# 24. Wave 19 — Deployment

## Goal

Produce the actual judgeable deployed application.

## Lead

Own deployment.

Validate:

```text
production environment variables
Cloudflare bindings
D1 migrations
R2
Workflows
AI credentials
domain/URL
build
runtime
```

## Worker A

Production frontend validation.

## Worker B

Production API/workflow validation.

## Worker C

Production AI/media validation.

## Exit Gate

The deployed environment can complete the full demo path using real services.

---

# 25. Wave 20 — Judge-Path Hardening

## Goal

Optimize specifically for a live judging session without compromising engineering integrity.

The exact judging path should be:

```text
Open application
    ↓
Create project
    ↓
Upload prepared source
    ↓
Run analysis
    ↓
Show extracted claims
    ↓
Show evidence graph
    ↓
Generate asset
    ↓
Show integrity problem
    ↓
Open source evidence
    ↓
Repair
    ↓
Re-verify
    ↓
Show PASS
    ↓
Show Release Passport
```

## Lead

Optimize:

```text
time-to-first-result
loading states
failure handling
demo stability
logging
```

## Worker A

Polish source/evidence experience.

## Worker B

Polish verification/repair experience.

## Worker C

Polish Release Passport/provenance experience.

## Exit Gate

The judging flow is stable and requires no developer intervention.

---

# 26. Wave 21 — Final Scope Freeze

## Goal

Stop adding features.

At this point:

```text
NO NEW CORE FEATURES
```

unless required to fix a critical failure.

The team should focus only on:

```text
correctness
reliability
performance
security
documentation
demo stability
```

## Lead

Create final release checklist.

## Workers

Each performs one independent final audit:

```text
Worker A:
product correctness

Worker B:
engineering correctness

Worker C:
judge/demo correctness
```

---

# 27. Mandatory End-to-End Acceptance Test

The following scenario MUST work on the final system.

## Input

A real source video containing:

```text
multiple factual claims
at least one number
at least one qualifier
at least one recommendation
at least one sponsor requirement
```

## Expected process

```text
1. Upload source
2. Store source
3. Analyze source
4. Extract structured claims
5. Build evidence graph
6. Define creator intent
7. Define sponsor requirements
8. Generate derivative assets
9. Verify assets
10. Detect at least one realistic integrity issue
11. Show evidence
12. Generate repair
13. Re-run verification
14. Mark repaired asset READY where appropriate
15. Generate Release Passport
16. Expose provenance
```

No manual DB modifications.

No manually inserted claims.

No static findings.

No fake status updates.

---

# 28. Failure-Path Acceptance Tests

The system must also demonstrate controlled failure.

## Failure A — Primary AI unavailable

Expected:

```text
primary failed
→ fallback selected
→ fallback explicitly reported
→ processing continues if supported
```

## Failure B — Invalid source

Expected:

```text
validation failure
→ clear error
→ no corrupted workflow state
```

## Failure C — AI returns invalid schema

Expected:

```text
schema validation failure
→ retry/repair strategy
→ never persist malformed model output
```

## Failure D — Missing evidence

Expected:

```text
unsupported claim
→ REVIEW or BLOCK
```

## Failure E — Sponsor obligation missing

Expected:

```text
BLOCK
```

## Failure F — Repair does not resolve issue

Expected:

```text
REVERIFY
→ issue remains
→ asset remains BLOCK/REVIEW
```

---

# 29. Definition of Done

The project is not considered complete because the code compiles.

A feature is complete only when all of the following are true:

```text
[ ] Reads the authoritative specification
[ ] Uses the approved architecture
[ ] Uses real implementation
[ ] Has explicit schemas
[ ] Handles expected errors
[ ] Has tests
[ ] Has observable state
[ ] Has no fake production behavior
[ ] Clearly reports fallback usage
[ ] Integrates with dependent modules
[ ] Works in the deployed environment
```

---

# 30. Lead Agent Responsibilities

The lead/orchestrator MUST:

1. read specifications before every major phase,
2. maintain contract compatibility,
3. freeze interfaces before parallel implementation,
4. assign only dependency-safe tasks,
5. continue engineering while workers execute,
6. integrate worker outputs,
7. run tests after every wave,
8. resolve conflicts,
9. reject architecture drift,
10. remove duplicate implementations,
11. keep the repository buildable,
12. maintain the dependency graph,
13. maintain the risk register,
14. perform final end-to-end validation.

The lead MUST NOT become a passive task router.

---

# 31. Worker Responsibilities

Each worker MUST:

1. read the relevant specification files,
2. understand the architectural constraints,
3. inspect existing implementations before adding code,
4. reuse existing infrastructure,
5. avoid unnecessary dependencies,
6. avoid duplicate contracts,
7. avoid mock behavior in production,
8. write tests for meaningful logic,
9. document meaningful decisions,
10. validate its own work,
11. report blockers immediately,
12. leave the branch in a coherent state.

---

# 32. Worker Completion Report

Every worker task should end with a structured report:

```text
Task:
<task name>

Implemented:
<what actually changed>

Files:
<important files>

Tests:
<tests executed>

Integration:
<what dependency was consumed / produced>

Fallbacks:
<none or explicit fallback behavior>

Known limitations:
<real limitations only>

Architecture impact:
<none / documented impact>

Ready for downstream:
YES / NO
```

---

# 33. Agent Communication Rules

Workers should communicate through code, contracts and concise implementation reports.

Avoid vague messages such as:

```text
"It should work now."
"Basically done."
"Probably compatible."
```

Use concrete reports:

```text
D1 migration 004 applied.
ClaimSchema v1 implemented.
VerificationFinding persistence tested.
Playwright scenario 7 passes.
```

---

# 34. Shared Contract Freeze Points

Contracts MUST be frozen before these waves begin:

```text
Before Wave 2:
infrastructure/config contracts

Before Wave 3:
source asset contracts

Before Wave 4:
AI/source understanding contracts

Before Wave 5:
claim/evidence contracts

Before Wave 8:
generation contracts

Before Wave 9:
verification contracts

Before Wave 10:
finding/repair contracts

Before Wave 12:
passport contracts
```

After each freeze point, downstream teams build against the frozen contract.

---

# 35. Integration Policy

When merging work:

```text
1. Pull latest shared contracts
2. Run type checks
3. Run unit tests
4. Run integration tests
5. Resolve schema mismatch
6. Run end-to-end tests for affected path
7. Only then continue to next wave
```

Do not accumulate weeks of unintegrated branches.

---

# 36. Priority Rules When Time Becomes Limited

Use this priority order.

## Tier 1 — Must exist

```text
real ingestion
real source understanding
evidence graph
real generation
real verification
real repair
re-verification
Release Passport
end-to-end workflow
```

## Tier 2 — Strongly preferred

```text
sponsor contract
creator intent
C2PA/provenance
adversarial benchmark
fallback pipeline
```

## Tier 3 — Optional

```text
audience intelligence
performance learning
advanced analytics
additional platforms
extra export formats
```

Never sacrifice Tier 1 reliability to implement Tier 3 features.

---

# 37. What Must Never Happen

The implementation MUST NOT reach the demo stage with:

```text
mock analysis
mock AI responses
fake generated videos
hardcoded integrity scores
hardcoded benchmark numbers
manual evidence insertion
manually triggered verification
fake loading states
fake sponsor validation
fake provenance
fake deployment status
```

The judge must be able to cause the system to perform the actual work.

---

# 38. Prototype Fallback Presentation

Any fallback path shown to users must be visibly labeled.

Examples:

```text
Primary analysis:
Gemini video understanding

Fallback active:
Local transcript analysis
```

or:

```text
Primary media pipeline:
Cloud processing

Fallback:
Local processing mode
```

The UI MUST NOT suggest equivalent guarantees when the fallback has lower capability.

---

# 39. Engineering Principle for AI

Crex MUST follow:

```text
GENERATE
    ↓
VALIDATE STRUCTURE
    ↓
RETRIEVE EVIDENCE
    ↓
VERIFY
    ↓
DECIDE
```

Never:

```text
GENERATE
    ↓
ASK THE SAME MODEL
"Is this correct?"
    ↓
TRUST IT
```

Independent verification must be materially different from generation.

---

# 40. Engineering Principle for Deterministic Rules

Use code whenever the answer can be deterministic.

Examples:

```text
number comparison
duration
timestamps
required strings
URLs
file dimensions
file type
character counts
sponsor code presence
platform limits
```

Do not consume model calls for deterministic checks.

---

# 41. Engineering Principle for Semantic Checks

Use semantic reasoning where meaning must be evaluated.

Examples:

```text
scope drift
meaning change
certainty inflation
qualifier loss
attribution loss
unsupported implication
context removal
```

Semantic verification must reference evidence stored in the system.

---

# 42. Engineering Principle for Provenance

Every important factual generated component should answer:

```text
What is this?
Where did it come from?
Which source claim supports it?
Which evidence supports that claim?
Which constraints apply?
Which verification run approved it?
```

If the system cannot answer those questions, the provenance chain is incomplete.

---

# 43. Engineering Principle for the Database

The database stores structured system truth.

Do not use:

```text
one giant JSON document
```

as the entire application state.

Use relational records for core entities and explicit relationships.

JSON may be used where the schema is intentionally flexible, but important entities must remain queryable.

---

# 44. Engineering Principle for AI Outputs

All AI outputs entering the core system must pass schema validation.

Pipeline:

```text
AI output
  ↓
schema validation
  ↓
normalization
  ↓
domain validation
  ↓
persistence
```

Never persist raw model output directly as trusted application state.

---

# 45. Engineering Principle for Observability

Every workflow run should expose enough information to answer:

```text
Which step is running?
Which step failed?
Why did it fail?
Was fallback used?
How long did the step take?
Which model/service was used?
What output version was produced?
```

Do not expose secrets or sensitive provider credentials.

---

# 46. Engineering Principle for Reproducibility

Where possible, store:

```text
source identifier
source checksum
model identifier
prompt/template version
schema version
verification version
workflow version
generated asset version
```

This makes debugging and benchmarking possible.

---

# 47. Final Required Repository State

Before declaring implementation complete, the repository should contain approximately:

```text
apps/
packages/
processing/
tests/
benchmarks/
docs/
```

with:

```text
architecture documentation
verification documentation
provenance documentation
benchmark documentation
decision records
environment documentation
```

The exact structure must follow `Architecture/` and `Techstack.md`.

Do not introduce directory structures merely because this document mentions them if they conflict with the authoritative architecture.

---

# 48. Final Build Gate

The project may be declared:

```text
IMPLEMENTATION COMPLETE
```

only when all of the following are true:

```text
[ ] Project specs are satisfied
[ ] Architecture is preserved
[ ] Real production path works
[ ] Real AI path works
[ ] Real storage works
[ ] Real database works
[ ] Real workflow orchestration works
[ ] Evidence graph works
[ ] Generation works
[ ] Verification works
[ ] Repair works
[ ] Re-verification works
[ ] Release Passport works
[ ] Fallbacks are explicit
[ ] No production mocks remain
[ ] Unit tests pass
[ ] Integration tests pass
[ ] End-to-end tests pass
[ ] Adversarial tests pass
[ ] Deployment works
[ ] Judge path works without developer intervention
```

---

# 49. The Exact Execution Sequence

The orchestrator should execute the waves in this order:

```text
W0  Specification + Repository Audit
 ↓
W1  Shared Contracts
 ↓
W2  Infrastructure Foundation
 ↓
W3  Source Ingestion
 ↓
W4  Video Understanding
 ↓
W5  Evidence Graph
 ↓
W6  Creator Intent
 ↓
W7  Sponsor Contract
 ↓
W8  Content Generation
 ↓
W9  Integrity Verification
 ↓
W10 Repair
 ↓
W11 Re-Verification
 ↓
W12 Release Passport
 ↓
W13 Provenance
 ↓
W14 Audience + Learning
 ↓
W15 End-to-End Integration
 ↓
W16 Adversarial Benchmark
 ↓
W17 Security + Reliability
 ↓
W18 Full Automated Testing
 ↓
W19 Deployment
 ↓
W20 Judge-Path Hardening
 ↓
W21 Final Scope Freeze
 ↓
FINAL RELEASE
```

---

# 50. Parallelization Summary

The intended parallel structure is:

```text
W0
└── Lead + A + B + C

W1
└── Lead + A + B + C

W2
├── Lead + A + B + C
└── Wait for infrastructure contracts

W3
├── Lead
├── A: source/upload
├── B: media inspection
└── C: UI

W4
├── Lead
├── A: Gemini
├── B: normalization
└── C: fallback

W5
├── Lead
├── A: persistence
├── B: retrieval
└── C: evidence UI

W6
├── Lead
├── A: schema
├── B: inference
└── C: UI

W7
├── Lead
├── A: requirements
├── B: ingestion
└── C: UI

W8
├── Lead
├── A: YouTube
├── B: Short/social
└── C: media output

W9
├── Lead
├── A: deterministic
├── B: semantic
└── C: sponsor/intent

W10
├── Lead
├── A: repair generation
├── B: persistence
└── C: UI

W11
├── Lead
├── A: verification
├── B: state machine
└── C: history UI

W12
├── Lead
├── A: passport backend
├── B: passport UI
└── C: export

W13
├── Lead
├── A: C2PA
├── B: artifact validation
└── C: provenance UI

W14
├── Lead
├── A: audience
├── B: performance
└── C: learning UI

W15
├── Lead
├── A: source→evidence
├── B: generation→verification
└── C: repair→passport

W16
├── Lead
├── A: semantic benchmark
├── B: deterministic benchmark
└── C: sponsor benchmark

W17
├── Lead
├── A: application security
├── B: AI security
└── C: media security

W18
├── Lead
├── A: unit/integration
├── B: browser
└── C: benchmarks/workflows

W19
├── Lead
├── A: frontend deployment
├── B: backend deployment
└── C: AI/media deployment

W20
├── Lead
├── A: source/evidence UX
├── B: verification UX
└── C: passport/provenance UX

W21
└── Lead + A + B + C final audits
```

---

# 51. Final Operating Rule

The team should continuously follow:

```text
UNDERSTAND
    ↓
CONTRACT
    ↓
IMPLEMENT
    ↓
TEST
    ↓
INTEGRATE
    ↓
VERIFY
    ↓
ONLY THEN MOVE FORWARD
```

The project is not a collection of independent feature branches.

It is one engineered system.

Every parallel worker must therefore optimize for:

```text
compatibility
correctness
reproducibility
testability
real integration
```

rather than merely maximizing the number of files or features produced.

**The objective is not to finish the most code.**

**The objective is to finish a real, coherent, verifiable Crex system that survives an adversarial judge.**
