# Crex — Specification Consistency Audit

**Worker A — Wave 0 Audit**
**Date:** September 6, 2026

---

## Summary

This audit cross-checks all four specification documents for Crex:
1. `Project Spec/Hackathon details & requirements.md`
2. `Project Spec/Idea.md`
3. `Project Spec/Architecture & Techstack.md`
4. `Project Spec/Implementation.md`

---

## Critical Findings

### Contradictions Found: 7

| # | Topic | Idea.md Says | Architecture Says | Resolution |
|---|-------|-------------|-------------------|------------|
| 1 | Database | PostgreSQL + pgvector | Cloudflare D1 + Vectorize | Architecture supersedes |
| 2 | Backend | FastAPI (Python) | Cloudflare Workers (TypeScript) | Architecture supedes |
| 3 | AI Provider | Vague ("hackathon-supported model") | Gemini 3.7 Flash | Architecture specifies |
| 4 | Transcription | Whisper pipeline primary | Gemini video understanding primary | Architecture supersedes |
| 5 | Repository Structure | `apps/api/` | `apps/worker/` | Architecture supersedes |
| 6 | Vector Search | pgvector | Vectorize + LanceDB | Architecture supersedes |
| 7 | Testing | Not specified | Vitest + Playwright + pytest | Architecture specifies |

**All contradictions are resolved by Architecture & Techstack superseding Idea.md for technology choices.**

### Missing Requirements: 17

1. Authentication implementation details
2. User model field definitions
3. YouTube integration depth
4. C2PA signing deployment constraints
5. Gemini File API integration details
6. D1 schema field definitions
7. API route specifications
8. Workflow step granularity
9. Error model format
10. Logging conventions
11. Frontend state management
12. Cache invalidation strategy
13. Multi-project support
14. Demo video format
15. Gemini structured output schema definitions
16. Repair strategy specifics (deterministic vs AI)
17. Integrity score computation formula

### Architecture Assumptions: 21

Key assumptions that downstream workers MUST obey:

1. Cloudflare is the infrastructure layer
2. D1 is the database
3. R2 is the object store
4. Gemini 3.7 Flash is the primary AI
5. Workflows are the orchestration primitive
6. Vectorize is the vector search
7. Python is confined to `processing/` directory
8. Three-tier verification: deterministic → retrieval → semantic AI
9. Generation and verification MUST be separate
10. All AI outputs pass schema validation
11. Deterministic checks run before AI checks
12. Presigned URL direct upload
13. Long-running work is asynchronous
14. Fallback paths are explicit
15. No mock/fake behavior in production
16. C2PA is the provenance standard
17. Ollama is the local AI fallback
18. WhisperX/faster-whisper is the transcription fallback
19. Wave execution order is fixed
20. Shared contracts must be frozen before parallel work
21. Schema versioning required

---

## Detailed Analysis

### Requirements List

85+ requirements identified across all four documents. Key categories:
- Hackathon: 7 requirements
- Product (Idea.md): 35+ features
- Architecture: 22 technology decisions
- Implementation: 21 waves with 80+ worker tasks

### Features List

36 features identified, organized into three tiers:
- **Tier 1 (Must Exist):** 16 features
- **Tier 2 (Strongly Preferred):** 5 features
- **Tier 3 (Optional):** 15 features

### Constraints

25 technical constraints identified, including:
- D1 is SQLite (single-threaded)
- Workers: 100K requests/day, 128 MB memory, 10ms CPU
- R2: 10 GB/month free storage
- Vectorize: 5M stored dimensions
- No video blobs in D1
- FFmpeg cannot run inside Workers
- Python restricted to `processing/` directory
- $0 deployment target

### Non-Goals

16 items explicitly excluded from MVP, including:
- Full video editor
- Social media management suite
- Generic chatbot
- Autonomous publishing system
- Redis/Celery infrastructure

### External Services

17 external dependencies identified:
- Primary: 7 Cloudflare services + Gemini
- Fallback: Ollama, WhisperX, OpenRouter, Groq
- Media: FFmpeg
- Provenance: C2PA
- DevOps: GitHub Actions

### Fallback Behavior

8 fallback chains identified:
1. Transcription: Gemini → user transcript → WhisperX
2. AI Reasoning: Deterministic → Ollama → Gemini
3. Input: Video → YouTube URL → Transcript
4. Vector Search: Vectorize → LanceDB
5. Media Processing: Cloud → Local
6. Failure A: Primary AI unavailable → fallback → explicit report
7. Failure B: Invalid source → clear error
8. Failure C: Invalid AI schema → retry → fallback

### Security Requirements

19 security requirements identified, including:
- Never commit secrets
- Presigned URL security
- File validation
- Path traversal prevention
- Prompt injection defense
- AI output validation
- Database constraints
- Error message safety

### Deployment Constraints

13 deployment constraints identified:
- Cloud demo mode + Local power mode
- $0 target
- D1 migrations required
- Cloudflare bindings required
- FFmpeg not in Workers
- Free domain: `<project>.pages.dev`

---

## Dependency Map

```
W0: Specification Audit (no dependencies)
 ↓
W1: Shared Contracts (depends on W0)
 ↓
W2: Infrastructure Foundation (depends on W1)
 ↓
W3: Source Ingestion (depends on W2)
 ↓
W4: Video Understanding (depends on W3)
 ↓
W5: Evidence Graph (depends on W4)
 ↓
W6: Creator Intent (depends on W1, W5)
 ↓
W7: Sponsor Contract (depends on W1, W5)
 ↓
W8: Content Generation (depends on W5, W6, W7)
 ↓
W9: Verification Engine (depends on W8)
 ↓
W10: Repair Engine (depends on W9)
 ↓
W11: Re-Verification (depends on W10)
 ↓
W12: Release Passport (depends on W9, W11)
 ↓
W13: Provenance (depends on W12)
 ↓
W14: Audience + Learning (OPTIONAL; depends on W12)
 ↓
W15: End-to-End Integration (depends on W9-W12)
 ↓
W16: Adversarial Benchmark (depends on W9)
 ↓
W17: Security Hardening (depends on W15)
 ↓
W18: Full Testing (depends on W17)
 ↓
W19: Deployment (depends on W18)
 ↓
W20: Judge-Path Hardening (depends on W19)
 ↓
W21: Scope Freeze (depends on W20)
```

---

## Summary

| Category | Count |
|----------|-------|
| Requirements | 85+ |
| Features | 36 |
| Constraints | 25 |
| Non-goals | 16 |
| External services | 17 |
| Fallback chains | 8 |
| Security requirements | 19 |
| Deployment constraints | 13 |
| **Contradictions** | **7** |
| **Missing requirements** | **17** |
| Architecture assumptions | 21 |
| Implementation waves | 22 |

**Most critical contradictions:** Database (PostgreSQL→D1), Backend (FastAPI→Workers), Vector layer (pgvector→Vectorize). All resolved by Architecture superseding Idea.md.

**Most critical missing requirement:** No document specifies actual REST API endpoint definitions, D1 column schemas, or Gemini prompt JSON Schema definitions. These must be created in Wave 1.
