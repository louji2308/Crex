# Demo Data Recommendation

Generated: 2026-08-20
Worktree: `agent/w20/obs-perf` at `516bf8c`

## Recommended Demo: `benchmarks/golden/laptop-review.json`

The laptop-review fixture exercises the full judge path with **all four
BLOCK-capable finding types** in one coherent story: numeric drift, sponsor
compliance (x3), and qualifier loss.

### What the Source Contains

- 5 transcript segments (720 s clip), host-reviewed ProBook X1.
- Claims: battery "approximately 10 hours", testing "9.5 hours", NUMERICAL
  "$1,299", RECOMMENDATION "code TECH20".
- Sponsor requirements (all required):
  - DISCLOSURE: "Sponsored by TechBrand"
  - DISCOUNT_CODE: "TECH20"
  - REQUIRED_URL: "techbrand.example/probook"
  - MUST_NOT_CLAIM: "guaranteed battery life"

### Live-Engine Findings (severities verified against `verification.ts`)

| Generated violation        | Finding type       | Severity | Source rule |
|----------------------------|--------------------|----------|-------------|
| Drops "$1,299" claim value | NUMERICAL_DRIFT    | BLOCK    | `verification.ts:217` |
| Missing "Sponsored by TechBrand" | SPONSOR_COMPLIANCE | BLOCK | `verification.ts:303` |
| Missing "TECH20"           | SPONSOR_COMPLIANCE | BLOCK    | `verification.ts:303` |
| Missing required URL       | SPONSOR_COMPLIANCE | BLOCK    | `verification.ts:303` |
| "Guaranteed battery life"  | CREATOR_INTENT     | REVIEW   | `verification.ts:283` |
| Drops "approximately"      | CONTEXT_REMOVAL    | REVIEW   | `verification.ts:240` |

The golden fixture's `expected_findings` severities **agree** with the live
engine (NUMERICAL_DRIFT / SPONSOR_COMPLIANCE = BLOCK). This fixture is the
primary recommendation.

## The Demo Story: "The Verifier Never Lies"

1. AI generation produces attractive social copy that quietly drops the
   sponsor disclosure, discount code, required URL, and (in a variant) the
   "$1,299" number.
2. The deterministic verifier flags each violation — no AI judgment involved
   for any of these; numeric and sponsor rules are code, not model opinion.
3. Repair proposes a **single honest action per repairable finding**
   (append the sponsor phrase / restore the number). Qualitative drifts
   (SCOPE_DRIFT, CREATOR_INTENT) correctly get **zero actions**.
4. Applying repairs and re-verifying returns PASS; un-repaired BLOCKs keep the
   passport BLOCKED.

## Alternative Fixture: `benchmarks/golden/sponsor-video.json`

GameCorp mouse review: 3× SPONSOR_COMPLIANCE BLOCK (DISCLOSURE, GAME15,
gamecorp.example/mouse) + CREATOR_INTENT REVIEW for "best mouse ever"
(ABSOLUTE_CLAIM_BAN). Slightly smaller claim surface, heavier sponsor story.

| Fixture            | BLOCK findings      | REVIEW findings | Repair story                         |
|--------------------|---------------------|-----------------|--------------------------------------|
| laptop-review.json | NUMERICAL_DRIFT, 3× SPONSOR | CONTEXT_REMOVAL, CREATOR_INTENT | restore number + append 3 sponsor lines; qualifier restore |
| sponsor-video.json | 3× SPONSOR          | CREATOR_INTENT  | append disclosure / code / URL      |

## Demo Run Script

Seed depends on whether the full AI pipeline or the workflow path is available.
Two options:

**Option A — full workflow (judges see real AI + verification):**

```
POST /workflows/source-to-release   {projectId, sourceId}
→ pipeline: video-understanding → evidence-graph → generation
→ verification finds the violations            (verification is code, not AI)
```

**Option B — deterministic-only (no AI provider needed):**

```
POST /verify                     {projectId, assetId}   → BLOCK
GET  /verify/findings/{runId}    → NUMERICAL_DRIFT + 3× SPONSOR_COMPLIANCE
POST /repair                     {projectId, assetId}
POST /repair/{actionId}/apply    {projectId}             (each action)
POST /reverify                   {projectId, assetId}   → PASS
POST /passports                  {projectId, assetId}   → READY
```

## What to Show Judges

1. **Findings**: deterministic severities, no AI for numeric/sponsor rules.
2. **Repair**: original text vs repaired text with source references; zero
   actions for non-repairable drifts (never a fake fix).
3. **Passport**: BLOCKED → (repairs applied) → READY, computed from real
   verification runs and provenance.
4. **Timing** (optional): run the worker with `CREX_PERF=1` to print per-stage
   durations (`[crex-perf] pipeline:*` lines) during the demo.

## Limitations

- `benchmarks/adversarial/*.test.ts` fixture severities (all "BLOCK") do **not**
  reflect live-engine severities for qualitative drifts; use
  `benchmarks/golden/*` (verified above) for demos instead. See
  `benchmarks/REPORT.md`.
- CONTEXT_REMOVAL / SCOPE_DRIFT / CREATOR_INTENT are REVIEW in the engine, so a
  qualifier-loss-only demo yields a DRAFT (not BLOCKED) passport — pair it with
  a numeric or sponsor violation to show a BLOCKED state.