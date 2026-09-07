import { D1Adapter } from "@crex/infra";
import {
  AudienceProfileRepository,
  AudienceObservationRepository,
  AudienceInsightRepository,
  AudienceRecommendationRepository,
} from "@crex/db/src/repositories";
import {
  aggregateProfile,
  computeInsights,
  generateRecommendations,
} from "@crex/audience";
import type {
  AudienceProfile,
  AudienceObservation,
} from "@crex/schemas/src/audience";
import { CrexError } from "@crex/core/src/errors";
import { errorResponse } from "./http";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export interface AudienceDeps {
  now: () => string;
  uuid: () => string;
  projectExists: (projectId: string) => Promise<boolean>;
  insertProfile: (profile: AudienceProfile) => Promise<AudienceProfile>;
  getProfile: (id: string) => Promise<AudienceProfile | undefined>;
  listProfilesByProject: (projectId: string) => Promise<AudienceProfile[]>;
  upsertProfile: (profile: AudienceProfile) => Promise<AudienceProfile>;
  upsertObservation: (observation: AudienceObservation) => Promise<AudienceObservation>;
  listObservationsByProject: (projectId: string) => Promise<AudienceObservation[]>;
  insertInsight: (insight: any) => Promise<any>;
  listInsightsByProject: (projectId: string) => Promise<any[]>;
  deleteInsightsByProject: (projectId: string) => Promise<void>;
  insertRecommendation: (rec: any) => Promise<any>;
  listRecommendationsByProject: (projectId: string) => Promise<any[]>;
  deleteRecommendationsByProject: (projectId: string) => Promise<void>;
}

export interface AudienceApi {
  handle(request: Request, path: string): Promise<Response | null>;
}

export function createAudienceApi(env: Env, deps?: Partial<AudienceDeps>): AudienceApi {
  const db = new D1Adapter(env.DB);
  const profiles = new AudienceProfileRepository(db);
  const observations = new AudienceObservationRepository(db);
  const insights = new AudienceInsightRepository(db);
  const recommendations = new AudienceRecommendationRepository(db);

  const resolved: AudienceDeps = {
    now: deps?.now ?? (() => new Date().toISOString()),
    uuid: deps?.uuid ?? (() => crypto.randomUUID()),
    projectExists:
      deps?.projectExists ??
      ((projectId: string) => projectExists(db, projectId)),
    insertProfile:
      deps?.insertProfile ?? ((p: AudienceProfile) => profiles.insert(p)),
    getProfile:
      deps?.getProfile ?? ((id: string) => profiles.get(id)),
    listProfilesByProject:
      deps?.listProfilesByProject ??
      ((projectId: string) => profiles.listByProject(projectId)),
    upsertProfile:
      deps?.upsertProfile ?? ((p: AudienceProfile) => profiles.upsert(p)),
    upsertObservation:
      deps?.upsertObservation ??
      ((o: AudienceObservation) => observations.upsert(o)),
    listObservationsByProject:
      deps?.listObservationsByProject ??
      ((projectId: string) => observations.listByProject(projectId)),
    insertInsight:
      deps?.insertInsight ?? ((i: any) => insights.insert(i)),
    listInsightsByProject:
      deps?.listInsightsByProject ??
      ((projectId: string) => insights.listByProject(projectId)),
    deleteInsightsByProject:
      deps?.deleteInsightsByProject ??
      ((projectId: string) => insights.deleteByProject(projectId)),
    insertRecommendation:
      deps?.insertRecommendation ?? ((r: any) => recommendations.insert(r)),
    listRecommendationsByProject:
      deps?.listRecommendationsByProject ??
      ((projectId: string) => recommendations.listByProject(projectId)),
    deleteRecommendationsByProject:
      deps?.deleteRecommendationsByProject ??
      ((projectId: string) => recommendations.deleteByProject(projectId)),
  };

  async function handleCreateProfile(request: Request): Promise<Response> {
    let body: {
      projectId?: unknown;
      name?: unknown;
      facts?: unknown;
      summary?: unknown;
    } = {};
    try {
      body = await request.json();
    } catch {
      throw new CrexError("INVALID_BODY", "request body must be valid JSON");
    }
    const { projectId, name, facts, summary } = body;
    if (typeof projectId !== "string" || !isUuid(projectId)) {
      throw new CrexError("INVALID_PROJECT_ID", "projectId must be a canonical UUID");
    }
    if (!(await resolved.projectExists(projectId))) {
      throw new CrexError("PROJECT_NOT_FOUND", `project not found: ${projectId}`);
    }
    if (typeof name !== "string" || name.length === 0) {
      throw new CrexError("INVALID_NAME", "name must be a non-empty string");
    }
    if (typeof facts !== "object" || facts === null || Array.isArray(facts)) {
      throw new CrexError("INVALID_FACTS", "facts must be an object");
    }

    const now = resolved.now();
    const profile: AudienceProfile = {
      id: resolved.uuid(),
      project_id: projectId,
      name,
      facts: facts as AudienceProfile["facts"],
      summary: typeof summary === "string" ? summary : undefined,
      created_at: now,
      updated_at: now,
    };

    const created = await resolved.insertProfile(profile);
    return Response.json(created, { status: 201 });
  }

  async function handleListProfiles(url: URL): Promise<Response> {
    const projectId = url.searchParams.get("projectId");
    if (projectId === null || !isUuid(projectId)) {
      throw new CrexError("INVALID_PROJECT_ID", "projectId must be a canonical UUID");
    }
    if (!(await resolved.projectExists(projectId))) {
      throw new CrexError("PROJECT_NOT_FOUND", `project not found: ${projectId}`);
    }
    const items = await resolved.listProfilesByProject(projectId);
    return Response.json({ profiles: items });
  }

  async function handleGetProfile(id: string): Promise<Response> {
    if (!isUuid(id)) {
      throw new CrexError("PROFILE_NOT_FOUND", `profile not found: ${id}`);
    }
    const profile = await resolved.getProfile(id);
    if (profile === undefined) {
      throw new CrexError("PROFILE_NOT_FOUND", `profile not found: ${id}`);
    }
    return Response.json(profile);
  }

  async function handleRecordObservation(request: Request): Promise<Response> {
    let body: {
      projectId?: unknown;
      metric?: unknown;
      value?: unknown;
      confidence?: unknown;
      sourceAssetId?: unknown;
      source?: unknown;
      dedupeKey?: unknown;
    } = {};
    try {
      body = await request.json();
    } catch {
      throw new CrexError("INVALID_BODY", "request body must be valid JSON");
    }
    const { projectId, metric, value, confidence, sourceAssetId, source, dedupeKey } = body;
    if (typeof projectId !== "string" || !isUuid(projectId)) {
      throw new CrexError("INVALID_PROJECT_ID", "projectId must be a canonical UUID");
    }
    if (!(await resolved.projectExists(projectId))) {
      throw new CrexError("PROJECT_NOT_FOUND", `project not found: ${projectId}`);
    }
    if (typeof metric !== "string" || metric.length === 0) {
      throw new CrexError("INVALID_METRIC", "metric must be a non-empty string");
    }
    if (typeof value !== "string" || value.length === 0) {
      throw new CrexError("INVALID_VALUE", "value must be a non-empty string");
    }
    if (typeof dedupeKey !== "string" || dedupeKey.length === 0) {
      throw new CrexError("INVALID_DEDUPE_KEY", "dedupeKey must be a non-empty string");
    }

    const now = resolved.now();
    const observation: AudienceObservation = {
      id: resolved.uuid(),
      project_id: projectId,
      metric: metric as AudienceObservation["metric"],
      value,
      confidence: typeof confidence === "number" ? confidence : 1,
      source_asset_id:
        typeof sourceAssetId === "string" && isUuid(sourceAssetId)
          ? sourceAssetId
          : undefined,
      source: (typeof source === "string" ? source : "OBSERVED") as AudienceObservation["source"],
      dedupe_key: dedupeKey,
      created_at: now,
    };

    const result = await resolved.upsertObservation(observation);
    return Response.json(result, { status: 201 });
  }

  async function handleListObservations(url: URL): Promise<Response> {
    const projectId = url.searchParams.get("projectId");
    if (projectId === null || !isUuid(projectId)) {
      throw new CrexError("INVALID_PROJECT_ID", "projectId must be a canonical UUID");
    }
    if (!(await resolved.projectExists(projectId))) {
      throw new CrexError("PROJECT_NOT_FOUND", `project not found: ${projectId}`);
    }
    const items = await resolved.listObservationsByProject(projectId);
    return Response.json({ observations: items });
  }

  async function handleCompute(request: Request): Promise<Response> {
    let body: { projectId?: unknown } = {};
    try {
      body = await request.json();
    } catch {
      throw new CrexError("INVALID_BODY", "request body must be valid JSON");
    }
    const { projectId } = body;
    if (typeof projectId !== "string" || !isUuid(projectId)) {
      throw new CrexError("INVALID_PROJECT_ID", "projectId must be a canonical UUID");
    }
    if (!(await resolved.projectExists(projectId))) {
      throw new CrexError("PROJECT_NOT_FOUND", `project not found: ${projectId}`);
    }

    const allObservations = await resolved.listObservationsByProject(projectId);
    const existingProfiles = await resolved.listProfilesByProject(projectId);

    const { profile } = aggregateProfile(projectId, allObservations);

    const upsertedProfile = await resolved.upsertProfile(profile);

    await resolved.deleteInsightsByProject(projectId);
    await resolved.deleteRecommendationsByProject(projectId);

    const { insights: computedInsights, hasSufficientData } = computeInsights(
      projectId,
      allObservations,
      existingProfiles,
    );

    const storedInsights = [];
    for (const insight of computedInsights) {
      const stored = await resolved.insertInsight(insight);
      storedInsights.push(stored);
    }

    const { recommendations: computedRecs } = generateRecommendations(
      projectId,
      computedInsights,
      hasSufficientData,
    );

    const storedRecs = [];
    for (const rec of computedRecs) {
      const stored = await resolved.insertRecommendation(rec);
      storedRecs.push(stored);
    }

    return Response.json({
      profile: upsertedProfile,
      insights: storedInsights,
      recommendations: storedRecs,
      has_sufficient_data: hasSufficientData,
    }, { status: 201 });
  }

  async function handleGetContext(url: URL): Promise<Response> {
    const projectId = url.searchParams.get("projectId");
    if (projectId === null || !isUuid(projectId)) {
      throw new CrexError("INVALID_PROJECT_ID", "projectId must be a canonical UUID");
    }
    if (!(await resolved.projectExists(projectId))) {
      throw new CrexError("PROJECT_NOT_FOUND", `project not found: ${projectId}`);
    }

    const profilesList = await resolved.listProfilesByProject(projectId);
    const observationsList = await resolved.listObservationsByProject(projectId);
    const insightsList = await resolved.listInsightsByProject(projectId);
    const recsList = await resolved.listRecommendationsByProject(projectId);

    const primaryProfile = profilesList.length > 0 ? profilesList[0]! : null;
    const complementaryProfiles = profilesList.slice(1);

    const dataInsufficient = insightsList.some(
      (i: any) => i.type === "DATA_INSUFFICIENT",
    );

    return Response.json({
      project_id: projectId,
      primary_profile: primaryProfile,
      complementary_profiles: complementaryProfiles,
      insights: insightsList,
      recommendations: recsList,
      has_sufficient_data: !dataInsufficient && profilesList.length > 0,
      created_at: resolved.now(),
    });
  }

  return {
    async handle(request: Request, path: string): Promise<Response | null> {
      try {
        return await dispatch(request, path);
      } catch (error) {
        return errorResponse(error);
      }
    },
  };

  async function dispatch(request: Request, path: string): Promise<Response | null> {
    const url = new URL(request.url);

    if (request.method === "POST" && path === "/audience/profiles") {
      return await handleCreateProfile(request);
    }

    if (request.method === "GET" && path === "/audience/profiles") {
      return await handleListProfiles(url);
    }

    const profileIdMatch = /^\/audience\/profiles\/([^/]+)$/.exec(path);
    if (request.method === "GET" && profileIdMatch !== null) {
      const id = decodeURIComponent(profileIdMatch[1]!);
      if (!isUuid(id)) {
        return null;
      }
      return await handleGetProfile(id);
    }

    if (request.method === "POST" && path === "/audience/observations") {
      return await handleRecordObservation(request);
    }

    if (request.method === "GET" && path === "/audience/observations") {
      return await handleListObservations(url);
    }

    if (request.method === "POST" && path === "/audience/compute") {
      return await handleCompute(request);
    }

    if (request.method === "GET" && path === "/audience/context") {
      return await handleGetContext(url);
    }

    return null;
  }
}

async function projectExists(db: D1Adapter, projectId: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 AS found FROM projects WHERE id = ?")
    .get(projectId);
  return row !== undefined;
}
