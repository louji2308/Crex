import { describe, it, expect } from "vitest";
import { verifyManifest } from "../src/verify.js";
import { buildManifest } from "../src/manifest.js";

const ASSET_SHA256 = "a".repeat(64);
const RECORD_ID = "rec-test-001";

function makeManifestWithSignature(sigVerified: boolean) {
  const base = buildManifest({
    assetId: "asset-test",
    assetSha256: ASSET_SHA256,
    recordId: RECORD_ID,
  });
  return {
    ...base,
    signature_metadata: {
      issuer: "test-issuer",
      signature_verified: sigVerified,
    },
  };
}

describe("verifyManifest", () => {
  it("MISSING: null manifest", () => {
    const r = verifyManifest(null, { assetSha256: ASSET_SHA256 });
    expect(r.status).toBe("MISSING");
    expect(r.reasons.length).toBeGreaterThan(0);
  });

  it("MISSING: object without assertions", () => {
    const r = verifyManifest({ foo: "bar" }, { assetSha256: ASSET_SHA256 });
    expect(r.status).toBe("MISSING");
  });

  it("MISSING: empty assertions array", () => {
    const r = verifyManifest(
      { assertions: [] },
      { assetSha256: ASSET_SHA256 },
    );
    expect(r.status).toBe("MISSING");
  });

  it("MISSING: no c2pa.crex_provenance assertion", () => {
    const r = verifyManifest(
      { assertions: [{ label: "other", data: {} }] },
      { assetSha256: ASSET_SHA256 },
    );
    expect(r.status).toBe("MISSING");
  });

  it("INVALID: sha256 mismatch", () => {
    const m = buildManifest({
      assetId: "asset-x",
      assetSha256: "b".repeat(64),
      recordId: RECORD_ID,
    });
    const r = verifyManifest(m, { assetSha256: ASSET_SHA256 });
    expect(r.status).toBe("INVALID");
    expect(r.reasons.some((x) => x.includes("asset_sha256 mismatch"))).toBe(
      true,
    );
  });

  it("INVALID: record_id mismatch", () => {
    const m = buildManifest({
      assetId: "asset-x",
      assetSha256: ASSET_SHA256,
      recordId: RECORD_ID,
    });
    const r = verifyManifest(m, {
      assetSha256: ASSET_SHA256,
      recordId: "wrong-record",
    });
    expect(r.status).toBe("INVALID");
    expect(r.reasons.some((x) => x.includes("record_id mismatch"))).toBe(true);
  });

  it("UNSIGNED: assertion present but no signature claim", () => {
    const m = buildManifest({
      assetId: "asset-x",
      assetSha256: ASSET_SHA256,
      recordId: RECORD_ID,
    });
    const r = verifyManifest(m, { assetSha256: ASSET_SHA256 });
    expect(r.status).toBe("UNSIGNED");
    expect(r.reasons.some((x) => x.includes("no signature claim"))).toBe(true);
  });

  it("UNTRUSTED: signature present but signature_verified is false", () => {
    const m = makeManifestWithSignature(false);
    const r = verifyManifest(m, { assetSha256: ASSET_SHA256 });
    expect(r.status).toBe("UNTRUSTED");
    expect(
      r.reasons.some((x) => x.includes("signature_verified")),
    ).toBe(true);
  });

  it("UNTRUSTED: signature present but signature_verified missing", () => {
    const m = {
      ...buildManifest({
        assetId: "asset-x",
        assetSha256: ASSET_SHA256,
        recordId: RECORD_ID,
      }),
      signature_metadata: { issuer: "test" },
    };
    const r = verifyManifest(m, { assetSha256: ASSET_SHA256 });
    expect(r.status).toBe("UNTRUSTED");
  });

  it("VALID: matching assertion sha256 and signature_verified true", () => {
    const m = makeManifestWithSignature(true);
    const r = verifyManifest(m, { assetSha256: ASSET_SHA256 });
    expect(r.status).toBe("VALID");
    expect(r.reasons).toEqual([]);
  });

  it("VALID: signature field (alternate location) with signature_verified true", () => {
    const base = buildManifest({
      assetId: "asset-x",
      assetSha256: ASSET_SHA256,
      recordId: RECORD_ID,
    });
    const m = {
      ...base,
      signature: {
        issuer: "alt-issuer",
        signature_verified: true,
      },
    };
    const r = verifyManifest(m, { assetSha256: ASSET_SHA256 });
    expect(r.status).toBe("VALID");
  });
});
