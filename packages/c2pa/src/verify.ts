import type { C2paManifest, ProvenanceAssertion } from "./manifest.js";

export type VerifyStatus =
  | "VALID"
  | "INVALID"
  | "UNSIGNED"
  | "UNTRUSTED"
  | "MISSING";

export interface VerifyResult {
  status: VerifyStatus;
  reasons: string[];
}

export interface VerifyOpts {
  assetSha256: string;
  recordId?: string;
}

function findProvenanceAssertion(
  manifest: C2paManifest,
): ProvenanceAssertion | undefined {
  const entry = manifest.assertions?.find(
    (a) => a.label === "c2pa.crex_provenance",
  );
  return entry?.data;
}

function isSignatureTrusted(manifest: C2paManifest): boolean {
  const ext = manifest as unknown as Record<string, unknown>;
  const meta = ext["signature_metadata"];
  if (meta && typeof meta === "object") {
    const obj = meta as Record<string, unknown>;
    if (typeof obj["signature_verified"] === "boolean") {
      return obj["signature_verified"] === true;
    }
  }
  const claimSig = ext["signature"];
  if (claimSig && typeof claimSig === "object") {
    const obj = claimSig as Record<string, unknown>;
    if (typeof obj["signature_verified"] === "boolean") {
      return obj["signature_verified"] === true;
    }
  }
  return false;
}

function hasSignatureClaim(manifest: C2paManifest): boolean {
  const ext = manifest as unknown as Record<string, unknown>;
  if ("signature_metadata" in ext) return true;
  if ("signature" in ext) return true;
  return false;
}

export function verifyManifest(
  manifest: unknown,
  opts: VerifyOpts,
): VerifyResult {
  const reasons: string[] = [];

  if (
    !manifest ||
    typeof manifest !== "object" ||
    !("assertions" in manifest)
  ) {
    return { status: "MISSING", reasons: ["No manifest or assertions found"] };
  }

  const m = manifest as C2paManifest;

  if (!Array.isArray(m.assertions) || m.assertions.length === 0) {
    return {
      status: "MISSING",
      reasons: ["Manifest has no assertions array"],
    };
  }

  const provenance = findProvenanceAssertion(m);
  if (!provenance) {
    reasons.push("No c2pa.crex_provenance assertion found");
    return { status: "MISSING", reasons };
  }

  if (provenance.asset_sha256 !== opts.assetSha256) {
    reasons.push(
      `asset_sha256 mismatch: expected ${opts.assetSha256}, got ${provenance.asset_sha256}`,
    );
  }

  if (opts.recordId && provenance.record_id !== opts.recordId) {
    reasons.push(
      `record_id mismatch: expected ${opts.recordId}, got ${provenance.record_id}`,
    );
  }

  if (reasons.length > 0) {
    return { status: "INVALID", reasons };
  }

  if (!hasSignatureClaim(m)) {
    return {
      status: "UNSIGNED",
      reasons: ["Assertion present but no signature claim"],
    };
  }

  if (!isSignatureTrusted(m)) {
    return {
      status: "UNTRUSTED",
      reasons: ["Signature metadata present but signature_verified is not true"],
    };
  }

  return { status: "VALID", reasons: [] };
}
