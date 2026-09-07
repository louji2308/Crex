import { describe, it, expect } from "vitest";
import { buildManifest, type ManifestInput } from "../src/manifest.js";

const BASE_INPUT: ManifestInput = {
  assetId: "asset-abc-123",
  assetSha256: "a".repeat(64),
  recordId: "rec-xyz-789",
};

describe("buildManifest", () => {
  it("returns correct top-level shape", () => {
    const m = buildManifest(BASE_INPUT);

    expect(m.claim_generator).toBe("crex/0.1.0");
    expect(m.format).toBe("video/mp4");
    expect(m.title).toBe("asset-abc-123");
    expect(Array.isArray(m.assertions)).toBe(true);
    expect(m.assertions.length).toBe(1);
    expect(Array.isArray(m.ingredients)).toBe(true);
  });

  it("first assertion has label c2pa.crex_provenance with correct data", () => {
    const m = buildManifest(BASE_INPUT);
    const a = m.assertions[0]!;

    expect(a.label).toBe("c2pa.crex_provenance");
    expect(a.data.record_id).toBe("rec-xyz-789");
    expect(a.data.asset_id).toBe("asset-abc-123");
    expect(a.data.asset_sha256).toBe("a".repeat(64));
    expect(a.data.title).toBe("asset-abc-123");
    expect(typeof a.data.created_at).toBe("string");
  });

  it("uses provided title and createdAt", () => {
    const m = buildManifest({
      ...BASE_INPUT,
      title: "My Video",
      createdAt: "2026-01-15T10:00:00.000Z",
    });

    expect(m.title).toBe("My Video");
    expect(m.assertions[0]!.data.title).toBe("My Video");
    expect(m.assertions[0]!.data.created_at).toBe("2026-01-15T10:00:00.000Z");
  });

  it("is deterministic across calls", () => {
    const frozenNow = "2026-09-07T00:00:00.000Z";
    const input: ManifestInput = {
      ...BASE_INPUT,
      createdAt: frozenNow,
    };

    const m1 = buildManifest(input);
    const m2 = buildManifest(input);

    expect(JSON.stringify(m1)).toBe(JSON.stringify(m2));
  });

  it("maps ingredients with hash_alg sha256", () => {
    const m = buildManifest({
      ...BASE_INPUT,
      ingredients: [
        { title: "clip-a.mp4", sha256: "b".repeat(64) },
        { title: "clip-b.mp4", sha256: "c".repeat(64) },
      ],
    });

    expect(m.ingredients.length).toBe(2);
    expect(m.ingredients[0]).toEqual({
      title: "clip-a.mp4",
      hash: "b".repeat(64),
      hash_alg: "sha256",
    });
    expect(m.ingredients[1]).toEqual({
      title: "clip-b.mp4",
      hash: "c".repeat(64),
      hash_alg: "sha256",
    });
  });

  it("defaults ingredients to empty array", () => {
    const m = buildManifest(BASE_INPUT);
    expect(m.ingredients).toEqual([]);
  });
});
