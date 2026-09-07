import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createSqlDb, type SqlDb } from "../src/sqlite";
import { migrate } from "../src/migrations";

let schemas: typeof import("@crex/schemas") | null = null;
try {
  schemas = await import("@crex/schemas");
} catch {
  schemas = null;
}

let repos: typeof import("../src/repositories") | null = null;
let fixtures: typeof import("./fixtures") | null = null;

function reposOf(): typeof import("../src/repositories") {
  if (repos === null) {
    throw new Error("repositories unavailable: pending @crex/schemas integration");
  }
  return repos;
}

function fixturesOf(): typeof import("./fixtures") {
  if (fixtures === null) {
    throw new Error("fixtures unavailable: pending @crex/schemas integration");
  }
  return fixtures;
}

const suite = schemas ? describe : describe.skip;

suite("provenance repository", () => {
  let db: SqlDb;

  beforeEach(async () => {
    db = createSqlDb(":memory:");
    await migrate(db);
  });

  afterEach(async () => {
    if (db.isOpen) {
      await db.close();
    }
  });

  beforeAll(async () => {
    if (schemas === null) {
      return;
    }
    repos = await import("../src/repositories");
    fixtures = await import("./fixtures");
  });

  it("createProvisionally + getById roundtrip preserves sha256 and statuses", async () => {
    const { ProjectRepository, ProvenanceRepository } = reposOf();
    const fx = fixturesOf();
    await new ProjectRepository(db).insert(fx.makeProject());
    const repo = new ProvenanceRepository(db);

    const input = fx.makeProvenanceRecord();
    const created = await repo.createProvisionally({
      id: input.id,
      project_id: input.project_id,
      asset_id: input.asset_id,
      asset_sha256: input.asset_sha256,
      signing_status: "UNSIGNED",
      verification_status: "UNSIGNED",
    });

    expect(created.id).toBe(fx.PROVENANCE_ID);
    expect(created.asset_sha256).toBe(input.asset_sha256);
    expect(created.signing_status).toBe("UNSIGNED");
    expect(created.verification_status).toBe("UNSIGNED");
    expect(created.manifest).toBeUndefined();

    const got = await repo.getById(fx.PROVENANCE_ID);
    expect(got).toBeDefined();
    expect(got!.id).toBe(created.id);
    expect(got!.asset_sha256).toBe(created.asset_sha256);
    expect(got!.signing_status).toBe("UNSIGNED");
    expect(got!.verification_status).toBe("UNSIGNED");
  });

  it("getByAssetId returns records ordered by created_at DESC", async () => {
    const { ProjectRepository, ProvenanceRepository } = reposOf();
    const fx = fixturesOf();
    await new ProjectRepository(db).insert(fx.makeProject());
    const repo = new ProvenanceRepository(db);

    const first = await repo.createProvisionally({
      id: fx.PROVENANCE_ID,
      project_id: fx.PROJECT_ID,
      asset_id: fx.ASSET_ID,
      asset_sha256: fx.makeProvenanceRecord().asset_sha256,
      signing_status: "UNSIGNED",
      verification_status: "UNSIGNED",
    });

    const second = await repo.createProvisionally({
      id: "a0000000-0000-4000-8000-000000000020",
      project_id: fx.PROJECT_ID,
      asset_id: fx.ASSET_ID,
      asset_sha256: "a".repeat(64),
      signing_status: "SIGNING",
      verification_status: "MISSING",
    });

    const all = await repo.getByAssetId(fx.ASSET_ID);
    expect(all).toHaveLength(2);
    expect(all[0]!.id).toBe(second.id);
    expect(all[1]!.id).toBe(first.id);
  });

  it("getLatestByAssetId returns the most recent record", async () => {
    const { ProjectRepository, ProvenanceRepository } = reposOf();
    const fx = fixturesOf();
    await new ProjectRepository(db).insert(fx.makeProject());
    const repo = new ProvenanceRepository(db);

    await repo.createProvisionally({
      id: fx.PROVENANCE_ID,
      project_id: fx.PROJECT_ID,
      asset_id: fx.ASSET_ID,
      asset_sha256: fx.makeProvenanceRecord().asset_sha256,
      signing_status: "UNSIGNED",
      verification_status: "UNSIGNED",
    });

    const second = await repo.createProvisionally({
      id: "a0000000-0000-4000-8000-000000000020",
      project_id: fx.PROJECT_ID,
      asset_id: fx.ASSET_ID,
      asset_sha256: "a".repeat(64),
      signing_status: "SIGNED",
      verification_status: "VALID",
    });

    const latest = await repo.getLatestByAssetId(fx.ASSET_ID);
    expect(latest).toBeDefined();
    expect(latest!.id).toBe(second.id);
  });

  it("setManifest persists manifest_json and signature_verified", async () => {
    const { ProjectRepository, ProvenanceRepository } = reposOf();
    const fx = fixturesOf();
    await new ProjectRepository(db).insert(fx.makeProject());
    const repo = new ProvenanceRepository(db);

    await repo.createProvisionally({
      id: fx.PROVENANCE_ID,
      project_id: fx.PROJECT_ID,
      asset_id: fx.ASSET_ID,
      asset_sha256: fx.makeProvenanceRecord().asset_sha256,
      signing_status: "SIGNED",
      verification_status: "UNSIGNED",
    });

    const manifest = {
      manifest_json: { claim: { title: "Test" }, dummy: true },
      signer: { name: "Adobe", issuer: "CIPA" },
      embedded_at: "2025-01-15T10:30:00.000Z",
      signature_verified: true,
    };

    const updated = await repo.setManifest(fx.PROVENANCE_ID, manifest);
    expect(updated.manifest).toBeDefined();
    expect(updated.manifest!.manifest_json).toEqual({ claim: { title: "Test" }, dummy: true });
    expect(updated.manifest!.signer).toEqual({ name: "Adobe", issuer: "CIPA" });
    expect(updated.manifest!.embedded_at).toBe("2025-01-15T10:30:00.000Z");
    expect(updated.manifest!.signature_verified).toBe(true);

    const got = await repo.getById(fx.PROVENANCE_ID);
    expect(got!.manifest!.manifest_json).toEqual({ claim: { title: "Test" }, dummy: true });
    expect(got!.manifest!.signer).toEqual({ name: "Adobe", issuer: "CIPA" });
    expect(got!.manifest!.signature_verified).toBe(true);
  });

  it("setSigningStatus transitions and persists", async () => {
    const { ProjectRepository, ProvenanceRepository } = reposOf();
    const fx = fixturesOf();
    await new ProjectRepository(db).insert(fx.makeProject());
    const repo = new ProvenanceRepository(db);

    await repo.createProvisionally({
      id: fx.PROVENANCE_ID,
      project_id: fx.PROJECT_ID,
      asset_id: fx.ASSET_ID,
      asset_sha256: fx.makeProvenanceRecord().asset_sha256,
      signing_status: "UNSIGNED",
      verification_status: "UNSIGNED",
    });

    const signing = await repo.setSigningStatus(fx.PROVENANCE_ID, "SIGNING");
    expect(signing.signing_status).toBe("SIGNING");

    const signed = await repo.setSigningStatus(fx.PROVENANCE_ID, "SIGNED");
    expect(signed.signing_status).toBe("SIGNED");

    const got = await repo.getById(fx.PROVENANCE_ID);
    expect(got!.signing_status).toBe("SIGNED");
  });

  it("setVerificationStatus transitions and persists", async () => {
    const { ProjectRepository, ProvenanceRepository } = reposOf();
    const fx = fixturesOf();
    await new ProjectRepository(db).insert(fx.makeProject());
    const repo = new ProvenanceRepository(db);

    await repo.createProvisionally({
      id: fx.PROVENANCE_ID,
      project_id: fx.PROJECT_ID,
      asset_id: fx.ASSET_ID,
      asset_sha256: fx.makeProvenanceRecord().asset_sha256,
      signing_status: "SIGNED",
      verification_status: "UNSIGNED",
    });

    const valid = await repo.setVerificationStatus(fx.PROVENANCE_ID, "VALID");
    expect(valid.verification_status).toBe("VALID");

    const got = await repo.getById(fx.PROVENANCE_ID);
    expect(got!.verification_status).toBe("VALID");

    const invalid = await repo.setVerificationStatus(fx.PROVENANCE_ID, "INVALID");
    expect(invalid.verification_status).toBe("INVALID");
  });

  it("listByProjectId scoped to project", async () => {
    const { ProjectRepository, ProvenanceRepository } = reposOf();
    const fx = fixturesOf();
    await new ProjectRepository(db).insert(fx.makeProject());
    const repo = new ProvenanceRepository(db);

    await repo.createProvisionally({
      id: fx.PROVENANCE_ID,
      project_id: fx.PROJECT_ID,
      asset_id: fx.ASSET_ID,
      asset_sha256: fx.makeProvenanceRecord().asset_sha256,
      signing_status: "UNSIGNED",
      verification_status: "UNSIGNED",
    });

    await repo.createProvisionally({
      id: "a0000000-0000-4000-8000-000000000021",
      project_id: fx.PROJECT_ID,
      asset_id: "a0000000-0000-4000-8000-000000000030",
      asset_sha256: "b".repeat(64),
      signing_status: "SIGNED",
      verification_status: "VALID",
    });

    const scoped = await repo.listByProjectId(fx.PROJECT_ID);
    expect(scoped).toHaveLength(2);
    expect(scoped.every((r) => r.project_id === fx.PROJECT_ID)).toBe(true);

    const empty = await repo.listByProjectId("nonexistent-project");
    expect(empty).toEqual([]);
  });

  it("project FK ensures record requires an existing project row", async () => {
    const { ProvenanceRepository } = reposOf();
    const fx = fixturesOf();
    const repo = new ProvenanceRepository(db);

    await expect(
      repo.createProvisionally({
        id: fx.PROVENANCE_ID,
        project_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        asset_id: fx.ASSET_ID,
        asset_sha256: fx.makeProvenanceRecord().asset_sha256,
        signing_status: "UNSIGNED",
        verification_status: "UNSIGNED",
      }),
    ).rejects.toThrow(/foreign key/i);
  });

  it("getById returns undefined for a missing id", async () => {
    const { ProjectRepository, ProvenanceRepository } = reposOf();
    const fx = fixturesOf();
    await new ProjectRepository(db).insert(fx.makeProject());
    const repo = new ProvenanceRepository(db);

    expect(await repo.getById("missing")).toBeUndefined();
  });

  it("setManifest throws PROVENANCE_NOT_FOUND for a missing id", async () => {
    const { ProjectRepository, ProvenanceRepository } = reposOf();
    const fx = fixturesOf();
    await new ProjectRepository(db).insert(fx.makeProject());
    const repo = new ProvenanceRepository(db);

    await expect(
      repo.setManifest("missing", {
        manifest_json: {},
        signature_verified: false,
      }),
    ).rejects.toThrow(/PROVENANCE_NOT_FOUND/);
  });

  it("setSigningStatus throws PROVENANCE_NOT_FOUND for a missing id", async () => {
    const { ProvenanceRepository } = reposOf();
    const repo = new ProvenanceRepository(db);

    await expect(repo.setSigningStatus("missing", "SIGNING")).rejects.toThrow(/PROVENANCE_NOT_FOUND/);
  });

  it("setVerificationStatus throws PROVENANCE_NOT_FOUND for a missing id", async () => {
    const { ProvenanceRepository } = reposOf();
    const repo = new ProvenanceRepository(db);

    await expect(repo.setVerificationStatus("missing", "VALID")).rejects.toThrow(/PROVENANCE_NOT_FOUND/);
  });
});
