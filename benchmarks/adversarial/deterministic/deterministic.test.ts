/// <reference types="vitest/import-meta" />
import {
  baseClaim,
  baseEvidence,
  baseComponent,
  makeFinding,
  runBenchmark,
  printResults,
} from "../common";
import type { BenchmarkCase } from "../common";

const claim = baseClaim({ content: "The laptop battery lasts 10 hours and costs $999." });
const evidence = baseEvidence({
  claim_id: claim.id,
  content: "The laptop battery lasts 10 hours and costs $999.",
  source_range: { start: 120, end: 150 },
});
const component = baseComponent({
  content: "Battery: 10 hours, Price: $999",
  claim_references: [claim.id],
});

export const deterministicCases: BenchmarkCase[] = [
  {
    name: "numeric_drift_battery_hours",
    finding: makeFinding("NUMERICAL_DRIFT", {
      generated_text: "Battery life: 12 hours",
      source_text: "The laptop battery lasts 10 hours and costs $999.",
      evidence_ranges: [{ start: 120, end: 150 }],
    }),
    expectedSeverity: "BLOCK",
    description: "Numeric drift: 10 hours → 12 hours",
  },
  {
    name: "numeric_drift_price",
    finding: makeFinding("NUMERICAL_DRIFT", {
      generated_text: "Price: $899",
      source_text: "The laptop battery lasts 10 hours and costs $999.",
      evidence_ranges: [{ start: 120, end: 150 }],
    }),
    expectedSeverity: "BLOCK",
    description: "Numeric drift: $999 → $899",
  },
  {
    name: "numeric_drift_percentage",
    finding: makeFinding("NUMERICAL_DRIFT", {
      generated_text: "Performance improved by 25%",
      source_text: "Performance improved by 15% over the previous generation.",
      evidence_ranges: [{ start: 120, end: 150 }],
    }),
    expectedSeverity: "BLOCK",
    description: "Numeric drift: 15% → 25%",
  },
  {
    name: "timestamp_error_segment_boundary",
    finding: makeFinding("NUMERICAL_DRIFT", {
      generated_text: "At 2:30, the reviewer mentions battery life.",
      source_text: "At 3:45, the reviewer mentions the laptop battery lasts 10 hours.",
      evidence_ranges: [{ start: 225, end: 250 }],
    }),
    expectedSeverity: "BLOCK",
    description: "Timestamp error: 3:45 → 2:30 (wrong segment reference)",
  },
  {
    name: "duration_error_video_length",
    finding: makeFinding("NUMERICAL_DRIFT", {
      generated_text: "This 20-minute review covers battery life.",
      source_text: "This 12-minute review covers the laptop battery lasting 10 hours.",
      evidence_ranges: [{ start: 10, end: 30 }],
    }),
    expectedSeverity: "BLOCK",
    description: "Duration error: 12-minute → 20-minute video",
  },
  {
    name: "required_phrase_omission_sponsored",
    finding: makeFinding("SPONSOR_COMPLIANCE", {
      generated_text: "Check out this amazing laptop!",
      source_text: "Sponsored by TechBrand. The laptop battery lasts 10 hours.",
      evidence_ranges: [{ start: 0, end: 50 }],
    }),
    expectedSeverity: "BLOCK",
    description: "Omits required sponsor disclosure phrase",
  },
  {
    name: "required_phrase_omission_disclaimer",
    finding: makeFinding("SPONSOR_COMPLIANCE", {
      generated_text: "Results may vary.",
      source_text: "Individual results may vary. The laptop battery lasts approximately 10 hours.",
      evidence_ranges: [{ start: 0, end: 50 }],
    }),
    expectedSeverity: "BLOCK",
    description: "Omits required disclaimer 'Individual results may vary'",
  },
  {
    name: "platform_constraint_title_length_youtube",
    finding: makeFinding("PLATFORM_QA", {
      generated_text: "This is an extremely long YouTube video title that exceeds the one hundred character limit for YouTube titles and should be flagged",
      source_text: "Laptop Review: 10-Hour Battery Life",
      evidence_ranges: [{ start: 0, end: 30 }],
    }),
    expectedSeverity: "BLOCK",
    description: "YouTube title exceeds 100 character limit",
  },
  {
    name: "platform_constraint_description_length",
    finding: makeFinding("PLATFORM_QA", {
      generated_text: "x".repeat(5001),
      source_text: "Laptop review with battery test results.",
      evidence_ranges: [{ start: 0, end: 30 }],
    }),
    expectedSeverity: "BLOCK",
    description: "YouTube description exceeds 5000 character limit",
  },
  {
    name: "platform_constraint_hashtag_limit_instagram",
    finding: makeFinding("PLATFORM_QA", {
      generated_text: "Great laptop! " + "#tag ".repeat(31),
      source_text: "Great laptop with 10-hour battery! #tech #review",
      evidence_ranges: [{ start: 0, end: 30 }],
    }),
    expectedSeverity: "BLOCK",
    description: "Instagram post exceeds 30 hashtag limit",
  },
];

export function runDeterministicBenchmark() {
  const result = runBenchmark(deterministicCases);
  printResults(result);
  return result;
}

if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest;

  describe("Deterministic Adversarial Benchmark", () => {
    for (const c of deterministicCases) {
      it(c.name, () => {
        expect(c.finding.severity).toBe(c.expectedSeverity);
      });
    }

    it("benchmark summary", () => {
      const result = runBenchmark(deterministicCases);
      expect(result.passed).toBe(result.total);
    });
  });
}