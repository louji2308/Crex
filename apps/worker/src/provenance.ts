import { ProvenanceRepository } from "@crex/db/src/repositories/provenance";
import type { ProvenanceRow } from "@crex/db/src/repositories/provenance";
import { SourceAssetRepository } from "@crex/db/src/repositories/source-assets";
import type { SourceAsset } from "@crex/schemas/src/domain";
import { sha256Bytes } from "@crex/media";
import { buildManifest, verifyManifest } from "@crex/c2pa";

export interface ProvenanceService {
  createRecord(input: {
    assetId: string;
    projectId: string;
    title: string;
  }): Promise<ProvenanceRow>;
  getRecord(id: string): Promise<ProvenanceRow | undefined>;
  verifyAsset(assetId: string): Promise<{
    verification_status: string;
    recorded_sha256: string | null;
    computed_sha256: string | null;
    reasons: string[];
    record: ProvenanceRow | null;
  }>;
}

interface ProvenanceServiceDeps {
  now: () => string;
  uuid: () => string;
  projectExists: (projectId: string) => Promise<boolean>;
  getSourceAsset: (assetId: string) => Promise<SourceAsset | undefined>;
  getObjectBytes: (key: string) => Promise<Uint8Array | null>;
}

export function createProvenanceService(
  provenanceRepo: ProvenanceRepository,
  sourceRepo: SourceAssetRepository,
  deps: ProvenanceServiceDeps,
): ProvenanceService {
  return {
    async createRecord({ assetId, projectId, title }) {
      const existing = await provenanceRepo.getLatestByAssetId(assetId);
      if (existing !== undefined) {
        throw new Error(`PROVENANCE_RECORD_EXISTS:${existing.id}`);
      }

      const sourceAsset = await deps.getSourceAsset(assetId);
      if (sourceAsset === undefined) {
        throw new Error("SOURCE_NOT_FOUND");
      }
      if (sourceAsset.project_id !== projectId) {
        throw new Error("INVALID_SOURCE_STATE");
      }

      const recordId = deps.uuid();
      const assetSha256 = sourceAsset.checksum?.replace(/^sha256:/, "") ?? "";

      const provisional = await provenanceRepo.createProvisionally({
        id: recordId,
        project_id: projectId,
        asset_id: assetId,
        asset_sha256: assetSha256,
        signing_status: "UNSIGNED",
        verification_status: "UNSIGNED",
      });

      const c2paManifest = buildManifest({
        assetId,
        assetSha256,
        recordId,
        title,
        createdAt: deps.now(),
      });

      const record = await provenanceRepo.setManifest(recordId, {
        manifest_json: c2paManifest as unknown as Record<string, unknown>,
        signature_verified: false,
      });

      return record;
    },

    async getRecord(id) {
      return provenanceRepo.getById(id);
    },

    async verifyAsset(assetId) {
      const record = await provenanceRepo.getLatestByAssetId(assetId);
      const sourceAsset = await deps.getSourceAsset(assetId);

      if (record === undefined && sourceAsset === undefined) {
        return {
          verification_status: "MISSING",
          recorded_sha256: null,
          computed_sha256: null,
          reasons: ["no provenance record and no source asset found"],
          record: null,
        };
      }

      if (sourceAsset === undefined) {
        throw new Error("SOURCE_NOT_FOUND");
      }

      if (record === undefined) {
        const currentBytes = await deps.getObjectBytes(sourceAsset.object_key);
        const computedSha256 = currentBytes !== null ? sha256Bytes(currentBytes) : null;
        return {
          verification_status: "MISSING",
          recorded_sha256: null,
          computed_sha256: computedSha256,
          reasons: ["no provenance record found for this asset"],
          record: null,
        };
      }

      const currentBytes = await deps.getObjectBytes(sourceAsset.object_key);
      if (currentBytes === null) {
        throw new Error("STORAGE_READ_FAILED");
      }

      const computedSha256 = sha256Bytes(currentBytes);
      const recordedSha256 = record.asset_sha256;

      if (computedSha256 !== recordedSha256) {
        return {
          verification_status: "INVALID",
          recorded_sha256: recordedSha256,
          computed_sha256: computedSha256,
          reasons: [`asset hash mismatch: expected sha256:${recordedSha256}, computed sha256:${computedSha256}`],
          record,
        };
      }

      if (record.manifest?.manifest_json !== undefined) {
        const verifyResult = verifyManifest(record.manifest.manifest_json, {
          assetSha256: recordedSha256,
          recordId: record.id,
        });
        return {
          verification_status: verifyResult.status,
          recorded_sha256: recordedSha256,
          computed_sha256: computedSha256,
          reasons: verifyResult.reasons,
          record,
        };
      }

      if (record.signing_status === "UNSIGNED") {
        return {
          verification_status: "UNSIGNED",
          recorded_sha256: recordedSha256,
          computed_sha256: computedSha256,
          reasons: [],
          record,
        };
      }

      if (record.manifest?.signature_verified === true) {
        return {
          verification_status: "VALID",
          recorded_sha256: recordedSha256,
          computed_sha256: computedSha256,
          reasons: [],
          record,
        };
      }

      return {
        verification_status: "UNTRUSTED",
        recorded_sha256: recordedSha256,
        computed_sha256: computedSha256,
        reasons: ["signature not verified or signer not trusted"],
        record,
      };
    },
  };
}
