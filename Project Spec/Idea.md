# Crex

## The Content Integrity Compiler

### One-line definition

**Crex is an AI content-production system that converts a creator’s source video into publishable content assets while preserving the original meaning, linking every important generated claim to source evidence, enforcing creator and sponsor constraints, and blocking or repairing outputs that drift from the source before publication.**

---

# 1. The exact problem

Creators increasingly use AI to transform one original piece of content into many derivative assets:

```text
One video
   ↓
YouTube title
YouTube description
Chapters
Shorts
Reels
TikToks
Social posts
Pinned comments
Thumbnail concepts
Sponsor integrations
```

The dangerous part is the **transformation**.

During transformation, AI can accidentally:

* change numbers
* exaggerate claims
* remove qualifiers
* change opinions into facts
* change “I tested” into “best”
* omit important context
* invent information
* remove sponsor disclosures
* alter the creator's intended tone
* produce assets that technically work but no longer represent the original content

Crex treats the original content as the **source of truth** and treats every generated asset as something that must be checked before release.

---

# 2. Core product principle

The entire system follows four rules:

```text
SOURCE → GENERATE → VERIFY → RELEASE
```

More precisely:

> **Generation proposes. Verification decides. Evidence explains. The creator approves.**

The AI that creates an asset is **not** allowed to be the final authority over whether that asset is trustworthy.

---

# 3. Complete workflow

## Stage 0 — Create a Content Project

The creator opens Crex and creates:

```text
Project
 ├── Source content
 ├── Creator preferences
 ├── Audience context
 ├── Sponsor requirements
 └── Target platform
```

Example:

```text
Project:
"Budget Laptop Review"

Source:
12-minute YouTube video

Target:
YouTube + YouTube Shorts

Audience:
Developers

Sponsor:
TechBrand

Output requested:
1 YouTube package
2 Shorts
1 pinned comment
```

---

# 4. Stage 1 — Source ingestion

The creator can provide:

* video file
* audio file
* transcript
* YouTube URL
* existing captions

The system creates an immutable **Source Record**.

Example:

```text
SourceRecord
─────────────
source_id
file
duration
checksum
created_at
transcription_status
analysis_status
```

The original source is never modified.

---

# 5. Stage 2 — Transcription and segmentation

The source video is processed into timestamped segments.

Example:

```text
00:00–00:28  Introduction
00:29–01:40  Laptop A
01:41–03:10  Laptop B
03:11–05:02  Laptop C
05:03–05:40  Sponsor
05:41–08:20  Performance testing
08:21–09:17  Battery test
09:18–11:10  Comparison
11:11–12:00  Conclusion
```

Each transcript segment retains:

```text
segment_id
start_time
end_time
text
speaker
confidence
```

---

# 6. Stage 3 — Content understanding

Crex analyzes the source and constructs structured information.

It extracts:

### Topics

```text
budget laptops
battery life
gaming
development
performance
```

### Entities

```text
Laptop A
Laptop B
Laptop C
TechBrand
```

### Numbers

```text
11 hours
16 GB RAM
$799
3 laptops
```

### Claims

```text
Laptop C lasted longest in the test.
Laptop A performed better in gaming.
Laptop B was cheaper.
```

### Opinions

```text
I prefer Laptop C for developers.
```

### Recommendations

```text
Developers should consider Laptop C.
```

### Qualifiers

```text
in my test
for developers
in this price range
based on our results
```

### Sponsor references

```text
Sponsor name
discount code
disclosure
required CTA
```

---

# 7. Stage 4 — Build the Evidence Graph

This is the central data structure of Crex.

Every meaningful piece of information becomes connected to its source evidence.

Example:

```text
CLAIM
"Laptop C lasted longest in our test."
        │
        ├── transcript evidence
        │      08:43–09:17
        │
        ├── numerical evidence
        │      11h 07m
        │
        └── source video evidence
               08:43–09:17
```

The graph can look like:

```text
Source Video
     │
     ├── Segment
     │      │
     │      └── Claim
     │             │
     │             └── Evidence
     │
     ├── Segment
     │      │
     │      └── Sponsor Requirement
     │
     └── Segment
            │
            └── Opinion
```

Every important generated statement can later point backwards through this graph.

---

# 8. Stage 5 — Creator Intent Contract

Before generation, Crex creates a structured **Creator Intent Contract**.

This captures things the source itself cannot completely determine.

Example:

```yaml
tone: analytical
audience: developers

avoid:
  - exaggerated_superlatives
  - unsupported_absolute_claims
  - misleading_clickbait

preserve:
  - technical_nuance
  - test_context
  - uncertainty

preferred:
  title_style: evidence_led
  response_style: concise
```

The creator can manually edit this.

The contract becomes a generation constraint.

---

# 9. Stage 6 — Sponsor Contract

A sponsor brief can be uploaded or entered manually.

Example:

```yaml
sponsor:
  name: TechBrand

required:
  - sponsor_name
  - disclosure
  - discount_code

discount_code:
  value: CODE20

must_not_claim:
  - "best laptop on the market"

required_link:
  value: https://example.com
```

The system converts this into machine-checkable requirements.

---

# 10. Stage 7 — Audience context

Optional audience information can be attached.

Sources may include:

* previous comments
* previous content
* audience topics
* recurring questions
* previous performance data

Crex summarizes this into structured signals.

Example:

```text
Audience frequently asks:
1. battery performance
2. developer compatibility
3. price/value

High-interest topic:
battery testing
```

These signals influence asset generation.

---

# 11. Stage 8 — Asset generation

Now the system generates content.

For example:

### YouTube title

> I Tested 3 Budget Laptops — Which One Should Developers Buy?

### Description

Structured from verified information.

### Chapters

Only generated from actual timestamped source segments.

### Short

30–60 second derivative using source footage.

### Pinned comment

Based on verified content.

### Social post

Based on the same source evidence.

### Thumbnail concept

Created from the video's actual subject and creator preferences.

---

# 12. Every generated component gets provenance

Crex does not store only:

```text
generated_text
```

It stores:

```text
GeneratedComponent
──────────────────
component_id
asset_id
content
source_references[]
claim_references[]
constraint_references[]
generation_metadata
verification_status
```

Example:

```text
Generated sentence:
"Laptop C delivered the longest battery life."

References:
claim_102
segment_083
segment_084
```

---

# 13. Stage 9 — Independent verification

This is where generated content is checked.

Verification happens separately from generation.

There are multiple verification engines.

---

## 13.1 Claim verification

For every factual claim:

```text
Generated claim
      ↓
Find source-supported evidence
      ↓
Compare meaning
      ↓
PASS / REVIEW / BLOCK
```

---

# 14. Semantic drift detection

This is one of the most important mechanisms.

The system looks for changes such as:

### Scope expansion

Source:

> “best in our test”

Generated:

> “best on the market”

Result:

```text
BLOCK
Reason:
scope inflation
```

---

### Certainty inflation

Source:

> “may improve battery life”

Generated:

> “improves battery life”

Result:

```text
REVIEW
Reason:
certainty increased
```

---

### Context removal

Source:

> “for developers”

Generated:

> “for everyone”

Result:

```text
REVIEW
Reason:
audience qualifier removed
```

---

### Numerical drift

Source:

> 11 hours

Generated:

> 18 hours

Result:

```text
BLOCK
Reason:
unsupported numerical change
```

---

### Attribution drift

Source:

> “TechBrand claims…”

Generated:

> “TechBrand provides…”

Result:

```text
REVIEW
Reason:
attribution removed
```

---

# 15. Stage 10 — Evidence coverage

Every generated asset receives an evidence coverage measurement.

Example:

```text
Asset:
YouTube Short #1

12 factual statements
12 mapped to evidence

Evidence coverage:
100%
```

Another asset:

```text
15 factual statements
13 mapped to evidence

Evidence coverage:
86.7%

Status:
REVIEW
```

---

# 16. Stage 11 — Numerical integrity

Numbers receive special treatment.

The system extracts all numerical values from:

* source
* generated text
* metadata
* titles
* captions

Then compares them.

Example:

```text
Source:
11 hours

Generated:
18 hours

Difference:
+63.6%

Status:
BLOCK
```

This is deterministic and should not depend solely on an LLM.

---

# 17. Stage 12 — Sponsor compliance

Every generated asset is checked against the Sponsor Contract.

Example:

```text
Sponsor name:
✓

Disclosure:
✗

Discount code:
✓

Required link:
✓
```

Result:

# BLOCKED

Reason:

> Required sponsor disclosure missing.

The system identifies exactly which asset and which portion failed.

---

# 18. Stage 13 — Creator intent verification

Generated content is checked against the Creator Intent Contract.

Example:

```text
Creator rule:
Avoid absolute claims

Generated:
"This is the best laptop for developers."

Result:
BLOCK
```

Suggested repair:

> “This was the strongest laptop for developers in our test.”

---

# 19. Stage 14 — Platform QA

The system runs deterministic platform checks.

Examples:

### YouTube title

```text
Length:
PASS
```

### Description

```text
Required sections:
PASS
```

### Chapters

```text
Timestamp validity:
PASS
```

### Caption density

```text
Readability:
PASS
```

### Thumbnail

```text
Dimensions:
PASS

Contrast:
PASS

Text readability:
PASS
```

### Short

```text
Duration:
PASS

Aspect ratio:
PASS
```

---

# 20. Stage 15 — Audience-fit evaluation

The generated asset is checked against audience signals.

Example:

```text
Audience interest:
Battery performance       HIGH
Gaming                    MEDIUM
Developer workflow        HIGH
Price                     HIGH
```

Generated Short:

```text
Primary focus:
battery performance

Audience alignment:
94/100
```

This layer is advisory rather than a hard truth.

---

# 21. Stage 16 — Integrity score

Every asset receives an overall score composed from separate signals.

Example:

```text
Integrity Score
────────────────────
Evidence coverage       100
Claim fidelity           98
Numerical accuracy      100
Creator intent            96
Sponsor compliance       100
Platform QA               97

Overall                  98
```

The score alone is never sufficient.

The system also provides the actual reasons.

---

# 22. Stage 17 — Status decision

Every asset receives one of three statuses.

## READY

All mandatory checks pass.

```text
✅ READY
```

---

## REVIEW

There is an ambiguous or non-critical issue.

```text
⚠ REVIEW
```

The creator decides.

---

## BLOCK

A serious integrity or compliance problem exists.

```text
🚫 BLOCK
```

The asset cannot be released until repaired.

---

# 23. Stage 18 — Automatic repair

When possible, Crex proposes a repair.

Example:

### Original generated text

> This is the best laptop on the market.

### Violation

```text
Scope inflation
```

### Evidence-supported version

> This was the best-performing laptop in our test.

The creator can:

```text
Accept repair
```

or

```text
Edit manually
```

or

```text
Regenerate
```

---

# 24. Stage 19 — Reverification

After a repair, the entire affected verification chain runs again.

```text
Repair
   ↓
Verify again
   ↓
PASS?
   ├── YES → continue
   └── NO  → remain blocked
```

Nothing is assumed to be safe merely because the text was regenerated.

---

# 25. Stage 20 — Release Passport

Once assets pass their checks, Crex generates a **Release Passport**.

Example:

# RELEASE PASSPORT

```text
Project
Budget Laptop Review

Assets
5

Claims
37

Evidence-linked claims
37 / 37

Unsupported claims
0

Sponsor violations
0

Creator intent violations
0

Platform failures
0

Integrity
98 / 100

Release status
READY
```

The passport can be exported as JSON/Markdown/PDF-style documentation depending on implementation scope.

---

# 26. Evidence Explorer

A judge or creator can click any generated claim.

Example:

```text
Generated:
"Laptop C lasted longest."

       ↓

Supported by:

08:43–09:17

Transcript:
"Laptop C reached eleven hours and seven minutes..."

       ↓

Source video
[play from 08:43]
```

This is the primary provenance experience.

---

# 27. Content Graph visualization

Crex should include a visual graph.

```text
                SOURCE VIDEO
                     │
          ┌──────────┼──────────┐
          ▼          ▼          ▼
       CLAIM 1     CLAIM 2   SPONSOR
          │          │          │
       EVIDENCE    EVIDENCE   REQUIREMENT
          │          │          │
          └─────┬────┴──────────┘
                ▼
          GENERATED ASSETS
         ┌──────┼──────┐
         ▼      ▼      ▼
       Short  Title  Social
```

This lets the creator see where every asset came from.

---

# 28. Post-publication learning

After publishing, Crex stores actual results.

Example:

```text
Asset
    ↓
Prediction
    ↓
Published
    ↓
Actual performance
```

Tracked signals can include:

* CTR
* views
* retention
* engagement
* comments
* subscriber conversion

The system compares prediction against reality.

Example:

```text
Predicted:
High CTR

Actual:
Low CTR
```

The system records that discrepancy.

---

# 29. Creator-specific learning

Over multiple projects, Crex builds a private creator profile.

Example:

```text
Creator Learning

Evidence-led titles:
Strong performance

Question-based titles:
Average performance

Titles > 70 characters:
Weak performance

Thumbnail text > 5 words:
Weak performance

Audience response to benchmark content:
Very strong
```

This becomes part of future recommendations.

---

# 30. The final long-term loop

The complete product becomes:

```text
CREATE
   ↓
UNDERSTAND
   ↓
BUILD EVIDENCE
   ↓
GENERATE
   ↓
VERIFY
   ↓
REPAIR
   ↓
REVERIFY
   ↓
RELEASE
   ↓
MEASURE
   ↓
LEARN
   ↓
CREATE AGAIN
```

---

# 31. Exact MVP for the hackathon

Do **not** attempt the entire long-term system.

The hackathon MVP should concentrate on this path:

```text
Upload video
      ↓
Transcribe
      ↓
Extract claims + numbers + qualifiers
      ↓
Create Evidence Graph
      ↓
Generate:
  • YouTube title
  • YouTube description
  • 1 Short script
  • 1 social post
      ↓
Verify every generated asset
      ↓
Find semantic drift
      ↓
Find numerical drift
      ↓
Check creator rules
      ↓
Check sponsor requirements
      ↓
Repair violations
      ↓
Generate Release Passport
```

That is the **core product**.

---

# 32. The exact demo scenario

Use one deliberately chosen source video containing multiple things that can go wrong.

For example:

```text
12-minute product review
```

The source contains:

```text
3 tested products
specific battery numbers
qualified recommendations
a sponsor segment
a discount code
a nuanced conclusion
```

Then intentionally make the generator produce several bad transformations.

Crex should catch them.

### Failure 1

```text
11 hours
→
18 hours
```

**BLOCK**

### Failure 2

```text
best in my test
→
best on the market
```

**BLOCK**

### Failure 3

Sponsor disclosure disappears.

**BLOCK**

### Failure 4

Qualifier disappears:

```text
for developers
→
for everyone
```

**REVIEW**

Then click **Repair**.

The system fixes them.

Run verification again.

Everything becomes:

```text
PASS
```

Then show the Release Passport.

That is the entire story.

---

# 33. Core system architecture

```text
                    ┌─────────────────────┐
                    │       Next.js       │
                    │      Frontend       │
                    └──────────┬──────────┘
                               │
                         REST / API
                               │
                    ┌──────────▼──────────┐
                    │      FastAPI        │
                    │      Backend        │
                    └──────────┬──────────┘
                               │
        ┌──────────────┬───────┼──────────────┐
        ▼              ▼       ▼              ▼
   Ingestion       Analysis  Generation   Verification
        │              │       │              │
        ▼              ▼       ▼              ▼
    Whisper       Claim/Graph LLM        Rule Engine
                   Extraction             Semantic Check
                                         Numerical Check
                                         Compliance Check
        │                                      │
        └──────────────────┬───────────────────┘
                           ▼
                     Evidence Store
                           │
                           ▼
                    Release Passport
```

---

# 34. Suggested technology stack

### Frontend

```text
Next.js
TypeScript
Tailwind CSS
```

### Backend

```text
FastAPI
Python
Pydantic
```

### Database

```text
PostgreSQL
```

### Vector/search layer

```text
pgvector
```

### Transcription

```text
Whisper
```

### AI reasoning/generation

Use the hackathon-supported model/API appropriate to the available credits or free tier.

The model should produce structured outputs rather than arbitrary prose.

### Video processing

```text
FFmpeg
```

### Validation

Custom deterministic Python/TypeScript rules.

---

# 35. Important separation of responsibilities

The architecture should explicitly separate:

## AI tasks

* semantic understanding
* claim extraction
* asset generation
* semantic comparison
* repair suggestions

## Deterministic tasks

* number comparison
* timestamp validation
* disclosure presence
* required phrase checks
* duration
* aspect ratio
* text length
* contrast
* file validation

That makes the system much more trustworthy.

---

# 36. Database structure

A clean schema could contain:

```text
users
projects
source_assets
transcript_segments
claims
evidence
creator_constraints
sponsor_contracts
sponsor_requirements
generated_assets
generated_components
component_evidence
verification_runs
verification_findings
repair_actions
release_passports
performance_observations
learning_records
```

Relationship example:

```text
project
  ↓
source_asset
  ↓
transcript_segment
  ↓
claim
  ↓
evidence
  ↓
generated_component
  ↓
verification_run
  ↓
verification_finding
  ↓
repair_action
  ↓
release_passport
```

---

# 37. Verification finding structure

Every violation should be structured.

Example:

```json
{
  "type": "SCOPE_DRIFT",
  "severity": "BLOCK",
  "asset_id": "short_01",
  "component_id": "claim_07",
  "generated_text": "Best laptop on the market",
  "source_text": "Best laptop in our test",
  "evidence": [
    {
      "start": 523,
      "end": 557
    }
  ],
  "recommendation": "Restore test-specific qualifier"
}
```

This makes the system explainable.

---

# 38. Testing strategy

The repository should contain an **adversarial verification suite**.

Example cases:

```text
Case 01:
11 → 18 hours

Case 02:
3 products → 4 products

Case 03:
"in our test" removed

Case 04:
"may" → "will"

Case 05:
"sponsor" removed

Case 06:
discount code removed

Case 07:
opinion → factual statement

Case 08:
attribution removed

Case 09:
audience qualifier removed

Case 10:
incorrect timestamp
```

Each test should have expected behavior:

```text
PASS
REVIEW
BLOCK
```

---

# 39. Repository documentation structure

The GitHub repository should be organized around the actual engineering system.

```text
Crex/
│
├── apps/
│   ├── web/
│   └── api/
│
├── packages/
│   ├── schemas/
│   ├── verifier/
│   ├── provenance/
│   ├── rules/
│   └── shared/
│
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── adversarial/
│   └── fixtures/
│
├── docs/
│   ├── architecture.md
│   ├── verification.md
│   ├── provenance.md
│   ├── evaluation.md
│   ├── threat-model.md
│   └── decisions/
│
├── examples/
│   ├── normal/
│   ├── drift/
│   ├── sponsor-failure/
│   └── numerical-failure/
│
└── README.md
```

---

# 40. The README should make the system immediately understandable

The opening should communicate:

```text
Crex
The Content Integrity Compiler

Generate creator content.
Trace it to evidence.
Detect meaning drift.
Repair violations.
Publish with confidence.
```

Then immediately show:

```text
SOURCE
 ↓
CLAIM
 ↓
GENERATED ASSET
 ↓
EVIDENCE
 ↓
VERIFICATION
 ↓
RELEASE
```

The first screenshot should preferably show a real violation being detected.

---

# 41. Exact primary screens

## Dashboard

```text
Projects
Recent releases
Blocked assets
Integrity overview
```

## Project

```text
Source
Claims
Constraints
Sponsor
Audience
Assets
```

## Asset Lab

```text
Generated assets
Versions
Evidence
Verification
```

## Integrity Review

```text
PASS
REVIEW
BLOCK

Findings
Evidence
Repair
```

## Evidence Explorer

```text
Generated statement
↓
Source evidence
↓
Timestamp
```

## Release Passport

```text
Final status
Integrity
Evidence coverage
Compliance
QA
```

---

# 42. What Crex should NOT become

The MVP should deliberately avoid becoming:

```text
❌ full video editor
❌ giant social media management suite
❌ generic chatbot
❌ autonomous publishing system
❌ generic image generator
❌ generic SEO tool
❌ generic analytics dashboard
```

Those are secondary capabilities.

The product identity remains:

# **Content integrity and provenance.**

---

# 43. The exact product hierarchy

```text
Crex
│
├── Source of Truth
│
├── Content Understanding
│
├── Evidence Graph
│
├── Content Compiler
│
├── Integrity Engine
│
├── Compliance Engine
│
├── Repair Engine
│
├── Release Passport
│
└── Learning Engine
```

---

# 44. Final definition

### Crex is:

> A provenance-aware AI content compiler that transforms original creator content into derivative assets while maintaining an explicit chain between generated claims and source evidence, validating creator intent and external requirements, detecting semantic and numerical drift, automatically repairing violations, and producing a verifiable release passport before publication.

### The central workflow:

```text
SOURCE
  ↓
UNDERSTAND
  ↓
EVIDENCE GRAPH
  ↓
CREATOR CONTRACT
  ↓
SPONSOR CONTRACT
  ↓
AUDIENCE CONTEXT
  ↓
GENERATE
  ↓
PROVENANCE ATTACHMENT
  ↓
INDEPENDENT VERIFICATION
  ↓
 ┌───────────────┐
 │               │
 ▼               ▼
PASS           FAILURE
 │               │
 │          DIAGNOSE
 │               ↓
 │            REPAIR
 │               ↓
 │          RE-VERIFY
 │               │
 └───────┬───────┘
         ↓
RELEASE PASSPORT
         ↓
PUBLISH
         ↓
MEASURE
         ↓
LEARN
         ↓
NEXT PROJECT
```

## The core sentence to remember

> **Crex does not just create content from a creator's work; it proves that the resulting content still says what the creator actually meant.**
