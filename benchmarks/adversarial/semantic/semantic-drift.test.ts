import {
  baseClaim,
  baseEvidence,
  baseComponent,
  makeFinding,
  BenchmarkCase,
  runBenchmark,
  printResults,
} from "../common";

const claim = baseClaim();
const evidence = baseEvidence({ claim_id: claim.id });
const component = baseComponent({ content: "Battery life: 10 hours", claim_references: [claim.id] });

export const semanticDriftCases: BenchmarkCase[] = [
  {
    name: "scope_inflation_broad_to_specific",
    finding: makeFinding("SCOPE_DRIFT", {
      generated_text: "All laptops have 10-hour battery life.",
      source_text: "The laptop battery lasts approximately 10 hours under typical usage.",
      evidence_ranges: [{ start: 120, end: 145 }],
    }),
    expectedSeverity: "BLOCK",
    description: "Generated claim inflates scope from 'the laptop' to 'all laptops'",
  },
  {
    name: "scope_inflation_conditional_to_absolute",
    finding: makeFinding("SCOPE_DRIFT", {
      generated_text: "The laptop battery lasts 10 hours.",
      source_text: "The laptop battery lasts approximately 10 hours under typical usage.",
      evidence_ranges: [{ start: 120, end: 145 }],
    }),
    expectedSeverity: "BLOCK",
    description: "Removes conditional qualifier 'under typical usage' making claim absolute",
  },
  {
    name: "certainty_inflation_qualifier_removal",
    finding: makeFinding("CERTAINTY_DRIFT", {
      generated_text: "The laptop battery definitely lasts 10 hours.",
      source_text: "The laptop battery lasts approximately 10 hours under typical usage.",
      evidence_ranges: [{ start: 120, end: 145 }],
    }),
    expectedSeverity: "BLOCK",
    description: "Replaces 'approximately' with 'definitely' - certainty inflation",
  },
  {
    name: "certainty_inflation_maybe_to_is",
    finding: makeFinding("CERTAINTY_DRIFT", {
      generated_text: "The laptop battery is 10 hours.",
      source_text: "The laptop battery may last up to 10 hours depending on workload.",
      evidence_ranges: [{ start: 120, end: 145 }],
    }),
    expectedSeverity: "BLOCK",
    description: "Changes uncertain 'may last up to' to certain 'is'",
  },
  {
    name: "qualifier_removal_approximate",
    finding: makeFinding("CONTEXT_REMOVAL", {
      generated_text: "Battery life is exactly 10 hours.",
      source_text: "The laptop battery lasts approximately 10 hours.",
      evidence_ranges: [{ start: 120, end: 145 }],
    }),
    expectedSeverity: "BLOCK",
    description: "Removes 'approximately' qualifier",
  },
  {
    name: "qualifier_removal_under_conditions",
    finding: makeFinding("CONTEXT_REMOVAL", {
      generated_text: "The laptop gets 10 hours battery life.",
      source_text: "The laptop battery lasts approximately 10 hours under typical usage.",
      evidence_ranges: [{ start: 120, end: 145 }],
    }),
    expectedSeverity: "BLOCK",
    description: "Removes 'under typical usage' condition qualifier",
  },
  {
    name: "attribution_loss_removes_source",
    finding: makeFinding("ATTRIBUTION_DRIFT", {
      generated_text: "Independent testing confirms 10-hour battery life.",
      source_text: "The manufacturer states the laptop battery lasts approximately 10 hours under typical usage.",
      evidence_ranges: [{ start: 120, end: 145 }],
    }),
    expectedSeverity: "BLOCK",
    description: "Changes attribution from 'manufacturer states' to 'independent testing confirms'",
  },
  {
    name: "attribution_loss_generic_to_specific",
    finding: makeFinding("ATTRIBUTION_DRIFT", {
      generated_text: "Our tests show 10-hour battery life.",
      source_text: "The reviewer noted the laptop battery lasted approximately 10 hours.",
      evidence_ranges: [{ start: 120, end: 145 }],
    }),
    expectedSeverity: "BLOCK",
    description: "Changes attribution from reviewer to 'our tests'",
  },
  {
    name: "unsupported_claim_no_evidence",
    finding: makeFinding("SCOPE_DRIFT", {
      generated_text: "The laptop charges to 80% in 30 minutes.",
      source_text: "The laptop battery lasts approximately 10 hours under typical usage.",
      evidence_ranges: [{ start: 120, end: 145 }],
    }),
    expectedSeverity: "BLOCK",
    description: "Generated claim about charging speed has no supporting evidence in source",
  },
  {
    name: "unsupported_claim_new_metric",
    finding: makeFinding("SCOPE_DRIFT", {
      generated_text: "This laptop has the best battery in its class.",
      source_text: "The laptop battery lasts approximately 10 hours under typical usage.",
      evidence_ranges: [{ start: 120, end: 145 }],
    }),
    expectedSeverity: "BLOCK",
    description: "Generates comparative claim 'best in class' without any comparative evidence",
  },
];

export function runSemanticDriftBenchmark() {
  const result = runBenchmark(semanticDriftCases);
  printResults(result);
  return result;
}

if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest;

  describe("Semantic Drift Adversarial Benchmark", () => {
    for (const c of semanticDriftCases) {
      it(c.name, () => {
        expect(c.finding.severity).toBe(c.expectedSeverity);
      });
    }

    it("benchmark summary", () => {
      const result = runBenchmark(semanticDriftCases);
      expect(result.passed).toBe(result.total);
    });
  });
}