const VERSION = "0.1.0";

export interface Ingredient {
  title: string;
  sha256: string;
}

export interface ManifestInput {
  assetId: string;
  assetSha256: string;
  recordId: string;
  title?: string;
  ingredients?: Ingredient[];
  createdAt?: string;
}

export interface ProvenanceAssertion {
  record_id: string;
  asset_id: string;
  asset_sha256: string;
  title: string;
  created_at: string;
}

export interface C2paManifest {
  claim_generator: string;
  format: string;
  title: string;
  assertions: Array<{ label: string; data: ProvenanceAssertion }>;
  ingredients: Array<{ title: string; hash: string; hash_alg: string }>;
}

export function buildManifest(input: ManifestInput): C2paManifest {
  const title = input.title ?? input.assetId;
  const createdAt = input.createdAt ?? new Date(0).toISOString();

  const provenance: ProvenanceAssertion = {
    record_id: input.recordId,
    asset_id: input.assetId,
    asset_sha256: input.assetSha256,
    title,
    created_at: createdAt,
  };

  const ingredients = (input.ingredients ?? []).map((ing) => ({
    title: ing.title,
    hash: ing.sha256,
    hash_alg: "sha256" as const,
  }));

  return {
    claim_generator: `crex/${VERSION}`,
    format: "video/mp4",
    title,
    assertions: [
      {
        label: "c2pa.crex_provenance",
        data: provenance,
      },
    ],
    ingredients,
  };
}
