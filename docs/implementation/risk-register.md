# Crex — Risk & Infrastructure Audit

**Worker C — Wave 0 Audit**
**Date:** September 6, 2026

---

## Summary

This audit identifies all risks and infrastructure concerns for the Crex project.

---

## External Service Dependencies

| # | Service | Purpose | Provider |
|---|---------|---------|----------|
| D1 | Gemini 3.7 Flash | Primary AI: video understanding, generation, verification | Google |
| D2 | Cloudflare Workers | API server | Cloudflare |
| D3 | Cloudflare D1 | Primary database (SQLite) | Cloudflare |
| D4 | Cloudflare R2 | Object storage | Cloudflare |
| D5 | Cloudflare Vectorize | Vector search | Cloudflare |
| D6 | Cloudflare Workflows | Durable orchestration | Cloudflare |
| D7 | Cloudflare Pages | Frontend deployment | Cloudflare |
| D8 | Ollama | Local fallback AI | Local |
| D9 | faster-whisper/WhisperX | Fallback transcription | Local |
| D10 | FFmpeg | Media processing | Local |
| D11 | C2PA Python SDK | Provenance metadata | Open-source |
| D12 | OpenRouter | Emergency fallback | Third-party |
| D13 | Groq | Fast text verification fallback | Third-party |
| D14 | YouTube Data API | Optional input | Google |
| D15 | SentenceTransformers | Local embeddings | Local |
| D16 | GitHub Actions | CI/CD | GitHub |

**Total: 16 external dependencies**

---

## Rate Limit Concerns

| Service | Free Tier Limit | Risk Severity |
|---------|----------------|--------------|
| Gemini 3.7 Flash | Token quota | **HIGH** — Primary AI for entire pipeline |
| Cloudflare Workers | 100K req/day, 10ms CPU | MEDIUM |
| Cloudflare D1 | 5M reads, 100K writes/day | LOW |
| Cloudflare R2 | 10 GB storage, 1M/10M ops | LOW |
| Cloudflare Vectorize | 5M stored dims | LOW |
| OpenRouter | ~50 req/day | HIGH |
| Hugging Face ZeroGPU | 5 min/day GPU | HIGH (if relied upon) |

**Key Risk:** Gemini free-tier limits are the single biggest rate-limit threat.

---

## Storage/Database Assumptions

| Assumption | Risk |
|------------|------|
| D1 (SQLite) is sufficient | Low — fine for single demo |
| 500 MB max per D1 database | Medium — multiple demo runs could approach limits |
| R2 10 GB free storage | Low — videos are small |
| Presigned URL uploads to R2 | Medium — CORS misconfiguration risk |
| D1 row write limit (100K/day) | Low — demo-scale is fine |

---

## Workflow Assumptions

| Assumption | Risk |
|------------|------|
| Workflows handle all long operations | Medium — idempotency required |
| Gemini replaces Whisper for transcription | Medium — fallback quality lower |
| Async processing via Workflows | Medium — frontend polling needed |
| Workflows support 9 pipeline steps | Medium — step failures must be resumable |
| FFmpeg runs on separate processing service | **HIGH — unresolved deployment question** |
| Browser uploads directly to R2 | Medium — token management |

---

## Fallback Requirements

| Primary | Fallback | Gap |
|---------|----------|-----|
| Gemini video understanding | WhisperX | Loses visual understanding |
| Gemini generation | Ollama | Quality may be lower |
| Cloudflare Vectorize | LanceDB | API surfaces differ |
| Cloudflare Workers | Local processing | Two deployment modes |

**Critical Gap:** If Gemini is unavailable and WhisperX is used, the system loses visual understanding entirely.

---

## Likely Failure Modes

| Failure Mode | Probability | Impact |
|-------------|-------------|--------|
| Gemini API quota exhausted | Medium | **CRITICAL** |
| Gemini malformed output | Medium | HIGH |
| R2 presigned URL CORS issues | Medium | HIGH |
| D1 migration failure | Low-Med | HIGH |
| FFmpeg not available in Cloud | High | HIGH |
| Workflow step timeout | Medium | MEDIUM |
| Ollama not running | Medium | MEDIUM |
| WhisperX model download failure | Medium | MEDIUM |

---

## Security Concerns

| Concern | Risk |
|---------|------|
| Gemini API key in Worker env | If leaked, quota is usable by anyone |
| R2 presigned URL abuse | Short expiry, single-use tokens |
| Prompt injection via source content | Schema validation primary defense |
| Untrusted video file input | FFmpeg vulnerabilities |
| Path traversal in filenames | Sanitize, opaque keys |
| No authentication in demo mode | Single protected workspace |
| SQL injection | Parameterized queries only |

---

## Deployment Problems

| Problem | Impact |
|---------|--------|
| **FFmpeg deployment path unresolved** | **CRITICAL** — Workers cannot run FFmpeg |
| Dual-mode architecture (Cloud + Local) | HIGH — testing matrix doubles |
| Cloudflare Workflows are new | MEDIUM — edge cases |
| D1 migrations in CI/CD | MEDIUM — must be automated |
| Worker bundle size limits | MEDIUM |
| Environment variable management | MEDIUM |

---

## Testability Concerns

| Concern | Why It's Hard |
|---------|---------------|
| Gemini non-determinism | Outputs vary between runs |
| End-to-end workflow timing | Playwright tests flake |
| FFmpeg in CI | Environment differences |
| Ollama in CI | May not be available |
| R2/D1 in tests | Local vs production differences |
| Video fixture sizes | Git bloat, need LFS |

---

## Integration Risks

| Risk | Impact |
|------|--------|
| TS ↔ Python contract drift | Zod/Pydantic must stay synchronized |
| Worker ↔ Workflow ↔ D1 consistency | Atomic state management |
| Gemini output ↔ Zod schema mismatch | Retry logic required |
| R2 presigned URL ↔ Worker auth | File validation at both ends |
| Frontend ↔ Worker version mismatch | API contract versioning |

---

## Timeline Risks

| Risk | Impact |
|------|--------|
| 21 waves in ~7 days | **CRITICAL** |
| FFmpeg decision not made | Blocks Waves 3, 8, 13, 19 |
| Gemini free tier behavior unknown | Must test early |
| End-to-end integration at Wave 15 | Late integration risk |
| Security at Wave 17 | Late discovery risk |
| Deployment at Wave 19 | Very late |

---

## Cost Risks

| Risk | Likelihood |
|------|-----------|
| Gemini free tier exhaustion | Medium |
| R2 overage (>10 GB) | Low |
| D1 overage | Low |
| Workers overage | Low |

**Overall:** $0 target is achievable IF free tiers are not exceeded.

---

## Risk Matrix

| Risk | Severity | Likelihood | Rating |
|------|----------|------------|--------|
| Gemini quota exhausted | Critical | Medium | **CRITICAL** |
| FFmpeg deployment unresolved | High | High | **CRITICAL** |
| 21 waves in 7 days | High | High | **CRITICAL** |
| Gemini invalid output | High | Medium | HIGH |
| R2 presigned URL failure | High | Medium | HIGH |
| TS ↔ Python contract drift | High | Medium | HIGH |
| Fallback loses visual understanding | Medium | High | HIGH |
| OpenRouter too restrictive | Medium | High | MEDIUM |
| WhisperX environment failure | Medium | Medium | MEDIUM |
| Workflow step timeout | Medium | Medium | MEDIUM |
| C2PA SDK issues | Low | Medium | MEDIUM |

---

## Mitigation Recommendations

### CRITICAL — Resolve Immediately

1. **Lock the FFmpeg deployment decision NOW.** Recommend a lightweight Python sidecar/container running FFmpeg, WhisperX, C2PA.
2. **Test Gemini free-tier behavior on Day 1.** Measure token consumption with a real video.
3. **Compress the wave schedule.** Merge related waves. Target 15 max.

### HIGH — Resolve Within First 48 Hours

4. **Build Gemini retry/resilience layer from Day 1.**
5. **Test R2 presigned URL flow immediately.**
6. **Establish single source-of-truth contracts (Zod).**
7. **Set up deployment pipeline by end of Wave 2.**

### MEDIUM — Ongoing

8. **Create golden test fixtures with fixed videos.**
9. **Implement workflow idempotency.**
10. **Add "demo resilience mode" with cached results (explicitly labeled).**

### LOW

11. **Document all free-tier quotas.**
12. **Graceful C2PA degradation.**
13. **Keep video fixtures ≤200 MB.**

---

**Ready for integration: YES**