import { describe, expect, it } from "vitest";
import { env, exports } from "cloudflare:workers";
import { D1Adapter } from "@crex/infra";
import {
  AudienceProfileRepository,
  AudienceObservationRepository,
} from "@crex/db/src/repositories";

interface ErrorBody {
  error: { code: string; message: string };
}

const PROJECT_UUID = "77777777-7777-4777-8777-777777777777";
const NOW = "2026-02-03T04:05:06.000Z";

async function seedProject(projectId = PROJECT_UUID): Promise<void> {
  await new D1Adapter(env.DB).prepare(
    `INSERT INTO projects (id, name, target_platforms, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
  ).run(projectId, "Audience Test Project", "[]", NOW, NOW);
}

describe("crex-worker audience API", () => {
  it("POST /audience/profiles rejects missing projectId", async () => {
    const res = await exports.default.fetch("https://example.com/audience/profiles", {
      method: "POST",
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("INVALID_PROJECT_ID");
  });

  it("POST /audience/profiles returns 404 for unknown project", async () => {
    const res = await exports.default.fetch("https://example.com/audience/profiles", {
      method: "POST",
      body: JSON.stringify({ projectId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("PROJECT_NOT_FOUND");
  });

  it("POST /audience/profiles creates a profile", async () => {
    await seedProject();
    const res = await exports.default.fetch("https://example.com/audience/profiles", {
      method: "POST",
      body: JSON.stringify({
        projectId: PROJECT_UUID,
        name: "Primary",
        facts: {
          AGE_RANGE: { value: "25-40", source: "OBSERVED", confidence: 0.8 },
        },
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; project_id: string; name: string };
    expect(body.project_id).toBe(PROJECT_UUID);
    expect(body.name).toBe("Primary");

    const got = await new AudienceProfileRepository(new D1Adapter(env.DB)).get(body.id);
    expect(got?.facts.AGE_RANGE?.value).toBe("25-40");
  });

  it("GET /audience/profiles lists profiles by project", async () => {
    await seedProject();
    await exports.default.fetch("https://example.com/audience/profiles", {
      method: "POST",
      body: JSON.stringify({ projectId: PROJECT_UUID, name: "P1", facts: {} }),
    });
    const res = await exports.default.fetch(
      `https://example.com/audience/profiles?projectId=${PROJECT_UUID}`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { profiles: unknown[] };
    expect(body.profiles.length).toBeGreaterThan(0);
  });

  it("POST /audience/observations records and dedupes", async () => {
    await seedProject();
    const payload = {
      projectId: PROJECT_UUID,
      metric: "AGE_RANGE",
      value: "25-40",
      confidence: 0.8,
      source: "OBSERVED",
      dedupeKey: "age-1",
    };
    const res1 = await exports.default.fetch("https://example.com/audience/observations", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    expect(res1.status).toBe(201);
    const first = (await res1.json()) as { id: string };

    const res2 = await exports.default.fetch("https://example.com/audience/observations", {
      method: "POST",
      body: JSON.stringify({ ...payload, value: "18-25" }),
    });
    expect(res2.status).toBe(201);
    const second = (await res2.json()) as { id: string; value: string };

    expect(second.id).toBe(first.id);
    expect(second.value).toBe("25-40");

    const rows = await new AudienceObservationRepository(new D1Adapter(env.DB)).listByProject(PROJECT_UUID);
    expect(rows).toHaveLength(1);
  });

  it("POST /audience/compute produces profile, insights, recommendations", async () => {
    await seedProject();
    const db = new D1Adapter(env.DB);
    const obsRepo = new AudienceObservationRepository(db);

    const base = {
      project_id: PROJECT_UUID,
      confidence: 0.9,
      source: "OBSERVED" as const,
    };
    await obsRepo.insert({ id: crypto.randomUUID(), metric: "AGE_RANGE", value: "25-40", dedupe_key: "k1", created_at: NOW, ...base });
    await obsRepo.insert({ id: crypto.randomUUID(), metric: "AGE_RANGE", value: "25-40", dedupe_key: "k2", created_at: NOW, ...base });
    await obsRepo.insert({ id: crypto.randomUUID(), metric: "AGE_RANGE", value: "25-40", dedupe_key: "k3", created_at: NOW, ...base });
    await obsRepo.insert({ id: crypto.randomUUID(), metric: "KNOWLEDGE_LEVEL", value: "expert", dedupe_key: "k4", created_at: NOW, ...base });
    await obsRepo.insert({ id: crypto.randomUUID(), metric: "KNOWLEDGE_LEVEL", value: "expert", dedupe_key: "k5", created_at: NOW, ...base });
    await obsRepo.insert({ id: crypto.randomUUID(), metric: "KNOWLEDGE_LEVEL", value: "expert", dedupe_key: "k6", created_at: NOW, ...base });
    await obsRepo.insert({ id: crypto.randomUUID(), metric: "INTERESTS", value: "battery", dedupe_key: "k7", created_at: NOW, ...base });
    await obsRepo.insert({ id: crypto.randomUUID(), metric: "INTERESTS", value: "battery", dedupe_key: "k8", created_at: NOW, ...base });
    await obsRepo.insert({ id: crypto.randomUUID(), metric: "INTERESTS", value: "battery", dedupe_key: "k9", created_at: NOW, ...base });
    await obsRepo.insert({ id: crypto.randomUUID(), metric: "RISK_TOLERANCE", value: "low", dedupe_key: "k10", created_at: NOW, ...base });
    await obsRepo.insert({ id: crypto.randomUUID(), metric: "RISK_TOLERANCE", value: "low", dedupe_key: "k11", created_at: NOW, ...base });
    await obsRepo.insert({ id: crypto.randomUUID(), metric: "RISK_TOLERANCE", value: "low", dedupe_key: "k12", created_at: NOW, ...base });

    const res = await exports.default.fetch("https://example.com/audience/compute", {
      method: "POST",
      body: JSON.stringify({ projectId: PROJECT_UUID }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      profile: { facts: Record<string, unknown> };
      insights: unknown[];
      recommendations: unknown[];
      has_sufficient_data: boolean;
    };
    expect(body.profile.facts.AGE_RANGE).toBeDefined();
    expect(body.insights.length).toBeGreaterThan(0);
    expect(body.has_sufficient_data).toBe(true);
    expect(Array.isArray(body.recommendations)).toBe(true);
  });

  it("GET /audience/context returns assembled context", async () => {
    await seedProject();
    const res = await exports.default.fetch(
      `https://example.com/audience/context?projectId=${PROJECT_UUID}`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      project_id: string;
      primary_profile: unknown;
      complementary_profiles: unknown[];
      insights: unknown[];
      recommendations: unknown[];
      has_sufficient_data: boolean;
    };
    expect(body.project_id).toBe(PROJECT_UUID);
    expect(Array.isArray(body.complementary_profiles)).toBe(true);
    expect(Array.isArray(body.insights)).toBe(true);
    expect(Array.isArray(body.recommendations)).toBe(true);
  });
});
