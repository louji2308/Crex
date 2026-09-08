import {
  baseClaim,
  baseEvidence,
  baseComponent,
  makeFinding,
  BenchmarkCase,
  runBenchmark,
  printResults,
} from "../common";

const claim = baseClaim({
  content: "Sponsored by TechBrand. The laptop battery lasts 10 hours. Use code TECH20 for 20% off. Visit techbrand.example/laptop for details.",
});
const evidence = baseEvidence({
  claim_id: claim.id,
  content: "Sponsored by TechBrand. The laptop battery lasts 10 hours. Use code TECH20 for 20% off. Visit techbrand.example/laptop for details.",
  source_range: { start: 0, end: 120 },
});
const component = baseComponent({
  content: "Sponsored by TechBrand. Battery: 10 hours. Code: TECH20. Link: techbrand.example/laptop",
  claim_references: [claim.id],
});

export const sponsorCases: BenchmarkCase[] = [
  {
    name: "missing_disclosure_sponsored_by",
    finding: makeFinding("SPONSOR_COMPLIANCE", {
      generated_text: "The laptop battery lasts 10 hours. Use code TECH20 for 20% off.",
      source_text: "Sponsored by TechBrand. The laptop battery lasts 10 hours. Use code TECH20 for 20% off.",
      evidence_ranges: [{ start: 0, end: 120 }],
    }),
    expectedSeverity: "BLOCK",
    description: "Omits required 'Sponsored by TechBrand' disclosure",
  },
  {
    name: "missing_sponsor_name",
    finding: makeFinding("SPONSOR_COMPLIANCE", {
      generated_text: "Sponsored by [BRAND]. The laptop battery lasts 10 hours.",
      source_text: "Sponsored by TechBrand. The laptop battery lasts 10 hours.",
      evidence_ranges: [{ start: 0, end: 120 }],
    }),
    expectedSeverity: "BLOCK",
    description: "Missing specific sponsor name (placeholder used)",
  },
  {
    name: "missing_discount_code",
    finding: makeFinding("SPONSOR_COMPLIANCE", {
      generated_text: "Sponsored by TechBrand. The laptop battery lasts 10 hours. Visit techbrand.example/laptop.",
      source_text: "Sponsored by TechBrand. The laptop battery lasts 10 hours. Use code TECH20 for 20% off. Visit techbrand.example/laptop.",
      evidence_ranges: [{ start: 0, end: 120 }],
    }),
    expectedSeverity: "BLOCK",
    description: "Omits required discount code 'TECH20'",
  },
  {
    name: "wrong_discount_code",
    finding: makeFinding("SPONSOR_COMPLIANCE", {
      generated_text: "Sponsored by TechBrand. Use code TECH15 for 15% off.",
      source_text: "Sponsored by TechBrand. Use code TECH20 for 20% off.",
      evidence_ranges: [{ start: 0, end: 120 }],
    }),
    expectedSeverity: "BLOCK",
    description: "Incorrect discount code (TECH15 vs TECH20) and wrong percentage",
  },
  {
    name: "forbidden_claim_guaranteed",
    finding: makeFinding("SPONSOR_COMPLIANCE", {
      generated_text: "Sponsored by TechBrand. This laptop is guaranteed to last 10 hours.",
      source_text: "Sponsored by TechBrand. The laptop battery lasts approximately 10 hours under typical usage.",
      evidence_ranges: [{ start: 0, end: 120 }],
    }),
    expectedSeverity: "BLOCK",
    description: "Uses forbidden absolute claim 'guaranteed' when sponsor requires 'approximately'",
  },
  {
    name: "forbidden_claim_best_on_market",
    finding: makeFinding("SPONSOR_COMPLIANCE", {
      generated_text: "Sponsored by TechBrand. This is the best laptop on the market.",
      source_text: "Sponsored by TechBrand. The laptop battery lasts approximately 10 hours.",
      evidence_ranges: [{ start: 0, end: 120 }],
    }),
    expectedSeverity: "BLOCK",
    description: "Uses forbidden superlative 'best on market' not supported by evidence",
  },
  {
    name: "required_link_omission",
    finding: makeFinding("SPONSOR_COMPLIANCE", {
      generated_text: "Sponsored by TechBrand. The laptop battery lasts 10 hours. Use code TECH20.",
      source_text: "Sponsored by TechBrand. The laptop battery lasts 10 hours. Use code TECH20 for 20% off. Visit techbrand.example/laptop for details.",
      evidence_ranges: [{ start: 0, end: 120 }],
    }),
    expectedSeverity: "BLOCK",
    description: "Omits required URL 'techbrand.example/laptop'",
  },
  {
    name: "wrong_required_link",
    finding: makeFinding("SPONSOR_COMPLIANCE", {
      generated_text: "Sponsored by TechBrand. Visit techbrand.example/wrong-page.",
      source_text: "Sponsored by TechBrand. Visit techbrand.example/laptop for details.",
      evidence_ranges: [{ start: 0, end: 120 }],
    }),
    expectedSeverity: "BLOCK",
    description: "Provides incorrect required URL",
  },
  {
    name: "missing_timing_constraint",
    finding: makeFinding("SPONSOR_COMPLIANCE", {
      generated_text: "Sponsored by TechBrand. The laptop battery lasts 10 hours.",
      source_text: "Sponsored by TechBrand. The laptop battery lasts 10 hours. Mention sponsor within first 30 seconds.",
      evidence_ranges: [{ start: 0, end: 120 }],
    }),
    expectedSeverity: "BLOCK",
    description: "Missing timing constraint: sponsor mention within first 30 seconds",
  },
  {
    name: "must_not_claim_violation",
    finding: makeFinding("SPONSOR_COMPLIANCE", {
      generated_text: "Sponsored by TechBrand. This laptop beats all competitors.",
      source_text: "Sponsored by TechBrand. The laptop battery lasts 10 hours. Must not claim superiority over competitors.",
      evidence_ranges: [{ start: 0, end: 120 }],
    }),
    expectedSeverity: "BLOCK",
    description: "Violates must-not-claim: claims superiority over competitors",
  },
];

export function runSponsorBenchmark() {
  const result = runBenchmark(sponsorCases);
  printResults(result);
  return result;
}

if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest;

  describe("Sponsor Compliance Adversarial Benchmark", () => {
    for (const c of sponsorCases) {
      it(c.name, () => {
        expect(c.finding.severity).toBe(c.expectedSeverity);
      });
    }

    it("benchmark summary", () => {
      const result = runBenchmark(sponsorCases);
      expect(result.passed).toBe(result.total);
    });
  });
}