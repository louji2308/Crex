import { describe, expect, it } from "vitest";
import {
  claimExtractionSchema,
  sourceUnderstandingSchema,
  aiTaskContentSchema,
} from "../src/index";

describe("sourceUnderstandingSchema", () => {
  const valid = () => ({
    summary: "Reviewer states the laptop holds a charge for eighteen hours.",
    claims: [
      "The laptop battery lasts eighteen hours.",
      "The display is laminated to the glass.",
    ],
  });

  it("parses a valid source understanding", () => {
    const parsed = sourceUnderstandingSchema.parse(valid());
    expect(parsed.summary).toMatch(/eighteen hours/);
    expect(parsed.claims).toHaveLength(2);
  });

  it("rejects an empty summary", () => {
    expect(() => sourceUnderstandingSchema.parse({ ...valid(), summary: "" })).toThrow();
  });

  it("rejects an empty claims array", () => {
    expect(() => sourceUnderstandingSchema.parse({ ...valid(), claims: [] })).toThrow();
  });

  it("rejects an unknown key", () => {
    expect(() => sourceUnderstandingSchema.parse({ ...valid(), stray: true })).toThrow();
  });
});

describe("claimExtractionSchema", () => {
  const valid = () => ({
    claims: [
      {
        text: "The laptop battery lasts eighteen hours.",
        type: "DURATION",
        spans: [{ segment_index: 0, start: 10, end: 28 }],
      },
    ],
  });

  it("parses a valid claim extraction", () => {
    const parsed = claimExtractionSchema.parse(valid());
    expect(parsed.claims[0]?.type).toBe("DURATION");
  });

  it("rejects claims with a negative span", () => {
    expect(() =>
      claimExtractionSchema.parse({
        claims: [
          {
            text: "a claim",
            type: "OTHER",
            spans: [{ segment_index: 0, start: -1, end: 2 }],
          },
        ],
      }),
    ).toThrow();
  });
});

describe("aiTaskContentSchema", () => {
  it("discriminates on the task field", () => {
    const source = aiTaskContentSchema.parse({
      task: "SEMANTIC_UNDERSTANDING",
      content: {
        summary: "A summary.",
        claims: ["A claim."],
      },
    });
    expect(source.task).toBe("SEMANTIC_UNDERSTANDING");

    const extraction = aiTaskContentSchema.parse({
      task: "CLAIM_EXTRACTION",
      content: {
        claims: [
          {
            text: "A claim.",
            type: "OTHER",
            spans: [{ segment_index: 0, start: 0, end: 1 }],
          },
        ],
      },
    });
    expect(extraction.task).toBe("CLAIM_EXTRACTION");
  });

  it("rejects mismatched task and content", () => {
    expect(() =>
      aiTaskContentSchema.parse({
        task: "SEMANTIC_UNDERSTANDING",
        content: {
          claims: [
            {
              text: "A claim.",
              type: "OTHER",
              spans: [{ segment_index: 0, start: 0, end: 1 }],
            },
          ],
        },
      }),
    ).toThrow();
  });
});