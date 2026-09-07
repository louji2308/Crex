import { D1Adapter } from "@crex/infra";
import { ConstraintRepository } from "@crex/db/src/repositories/constraints";
import { SponsorRequirementRepository } from "@crex/db/src/repositories/sponsor-requirements";
import type { Constraint, SponsorRequirement } from "@crex/schemas/src/domain";
import { CrexError } from "@crex/core/src/errors";
import { errorResponse } from "./http";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

async function projectExists(
  db: D1Adapter,
  projectId: string,
): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 AS found FROM projects WHERE id = ?")
    .get(projectId);
  return row !== undefined;
}

export interface ContractsDeps {
  now: () => string;
  uuid: () => string;
  projectExists: (projectId: string) => Promise<boolean>;
  insertConstraint: (constraint: Constraint) => Promise<Constraint>;
  getConstraint: (id: string) => Promise<Constraint | undefined>;
  listConstraintsByProject: (projectId: string) => Promise<Constraint[]>;
  insertSponsorRequirement: (requirement: SponsorRequirement) => Promise<SponsorRequirement>;
  getSponsorRequirement: (id: string) => Promise<SponsorRequirement | undefined>;
  listSponsorRequirementsByProject: (projectId: string) => Promise<SponsorRequirement[]>;
}

export interface ContractsApi {
  handle(request: Request, path: string): Promise<Response | null>;
}

export function createContractsApi(env: Env, deps?: Partial<ContractsDeps>): ContractsApi {
  const db = new D1Adapter(env.DB);
  const constraints = new ConstraintRepository(db);
  const sponsorRequirements = new SponsorRequirementRepository(db);

  const resolved: ContractsDeps = {
    now: deps?.now ?? (() => new Date().toISOString()),
    uuid: deps?.uuid ?? (() => crypto.randomUUID()),
    projectExists: deps?.projectExists ?? ((projectId: string) => projectExists(db, projectId)),
    insertConstraint: deps?.insertConstraint ?? ((constraint: Constraint) => constraints.insert(constraint)),
    getConstraint: deps?.getConstraint ?? ((id: string) => constraints.get(id)),
    listConstraintsByProject: deps?.listConstraintsByProject ?? ((projectId: string) => constraints.listByProject(projectId)),
    insertSponsorRequirement: deps?.insertSponsorRequirement ?? ((requirement: SponsorRequirement) => sponsorRequirements.insert(requirement)),
    getSponsorRequirement: deps?.getSponsorRequirement ?? ((id: string) => sponsorRequirements.get(id)),
    listSponsorRequirementsByProject: deps?.listSponsorRequirementsByProject ?? ((projectId: string) => sponsorRequirements.listByProject(projectId)),
  };

  async function handleCreateConstraint(request: Request): Promise<Response> {
    let body: { projectId?: unknown; category?: unknown; source?: unknown; summary?: unknown; details?: unknown; enabled?: unknown } = {};
    try {
      body = await request.json() as { projectId?: unknown; category?: unknown; source?: unknown; summary?: unknown; details?: unknown; enabled?: unknown };
    } catch {
      throw new CrexError("INVALID_BODY", "request body must be valid JSON");
    }
    const { projectId, category, source, summary, details, enabled } = body;
    if (typeof projectId !== "string" || !isUuid(projectId)) {
      throw new CrexError("INVALID_PROJECT_ID", "projectId must be a canonical UUID");
    }
    if (!(await resolved.projectExists(projectId))) {
      throw new CrexError("PROJECT_NOT_FOUND", `project not found: ${projectId}`);
    }
    if (typeof category !== "string" || category.length === 0) {
      throw new CrexError("INVALID_CATEGORY", "category must be a non-empty string");
    }
    if (typeof source !== "string" || source.length === 0) {
      throw new CrexError("INVALID_SOURCE", "source must be a non-empty string");
    }
    if (typeof summary !== "string" || summary.length === 0) {
      throw new CrexError("INVALID_SUMMARY", "summary must be a non-empty string");
    }

    const now = resolved.now();
    const constraint: Constraint = {
      id: resolved.uuid(),
      project_id: projectId,
      category: category as Constraint["category"],
      source: source as Constraint["source"],
      summary,
      details: typeof details === "string" ? details : undefined,
      enabled: typeof enabled === "boolean" ? enabled : true,
      created_at: now,
      updated_at: now,
    };

    const created = await resolved.insertConstraint(constraint);
    return Response.json(created, { status: 201 });
  }

  async function handleListConstraints(url: URL): Promise<Response> {
    const projectId = url.searchParams.get("projectId");
    if (projectId === null || !isUuid(projectId)) {
      throw new CrexError("INVALID_PROJECT_ID", "projectId must be a canonical UUID");
    }
    if (!(await resolved.projectExists(projectId))) {
      throw new CrexError("PROJECT_NOT_FOUND", `project not found: ${projectId}`);
    }
    const items = await resolved.listConstraintsByProject(projectId);
    return Response.json({ constraints: items });
  }

  async function handleGetConstraint(id: string): Promise<Response> {
    if (!isUuid(id)) {
      throw new CrexError("CONSTRAINT_NOT_FOUND", `constraint not found: ${id}`);
    }
    const constraint = await resolved.getConstraint(id);
    if (constraint === undefined) {
      throw new CrexError("CONSTRAINT_NOT_FOUND", `constraint not found: ${id}`);
    }
    return Response.json(constraint);
  }

  async function handleCreateSponsorRequirement(request: Request): Promise<Response> {
    let body: { projectId?: unknown; sponsorName?: unknown; requirementType?: unknown; value?: unknown; required?: unknown; timing?: unknown; enabled?: unknown } = {};
    try {
      body = await request.json() as { projectId?: unknown; sponsorName?: unknown; requirementType?: unknown; value?: unknown; required?: unknown; timing?: unknown; enabled?: unknown };
    } catch {
      throw new CrexError("INVALID_BODY", "request body must be valid JSON");
    }
    const { projectId, sponsorName, requirementType, value, required, timing, enabled } = body;
    if (typeof projectId !== "string" || !isUuid(projectId)) {
      throw new CrexError("INVALID_PROJECT_ID", "projectId must be a canonical UUID");
    }
    if (!(await resolved.projectExists(projectId))) {
      throw new CrexError("PROJECT_NOT_FOUND", `project not found: ${projectId}`);
    }
    if (typeof sponsorName !== "string" || sponsorName.length === 0) {
      throw new CrexError("INVALID_SPONSOR_NAME", "sponsorName must be a non-empty string");
    }
    if (typeof requirementType !== "string" || requirementType.length === 0) {
      throw new CrexError("INVALID_REQUIREMENT_TYPE", "requirementType must be a non-empty string");
    }
    if (typeof value !== "string" || value.length === 0) {
      throw new CrexError("INVALID_VALUE", "value must be a non-empty string");
    }

    const now = resolved.now();
    const requirement: SponsorRequirement = {
      id: resolved.uuid(),
      project_id: projectId,
      sponsor_name: sponsorName,
      requirement_type: requirementType as SponsorRequirement["requirement_type"],
      value,
      required: typeof required === "boolean" ? required : true,
      timing: typeof timing === "string" ? timing : undefined,
      enabled: typeof enabled === "boolean" ? enabled : true,
      created_at: now,
      updated_at: now,
    };

    const created = await resolved.insertSponsorRequirement(requirement);
    return Response.json(created, { status: 201 });
  }

  async function handleListSponsorRequirements(url: URL): Promise<Response> {
    const projectId = url.searchParams.get("projectId");
    if (projectId === null || !isUuid(projectId)) {
      throw new CrexError("INVALID_PROJECT_ID", "projectId must be a canonical UUID");
    }
    if (!(await resolved.projectExists(projectId))) {
      throw new CrexError("PROJECT_NOT_FOUND", `project not found: ${projectId}`);
    }
    const items = await resolved.listSponsorRequirementsByProject(projectId);
    return Response.json({ sponsorRequirements: items });
  }

  async function handleGetSponsorRequirement(id: string): Promise<Response> {
    if (!isUuid(id)) {
      throw new CrexError("SPONSOR_REQUIREMENT_NOT_FOUND", `sponsor requirement not found: ${id}`);
    }
    const requirement = await resolved.getSponsorRequirement(id);
    if (requirement === undefined) {
      throw new CrexError("SPONSOR_REQUIREMENT_NOT_FOUND", `sponsor requirement not found: ${id}`);
    }
    return Response.json(requirement);
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

    if (request.method === "POST" && path === "/contracts/constraints") {
      return await handleCreateConstraint(request);
    }

    if (request.method === "GET" && path === "/contracts/constraints") {
      return await handleListConstraints(url);
    }

    const constraintIdMatch = /^\/contracts\/constraints\/([^/]+)$/.exec(path);
    if (request.method === "GET" && constraintIdMatch !== null) {
      const id = decodeURIComponent(constraintIdMatch[1]!);
      if (!isUuid(id)) {
        return null;
      }
      return await handleGetConstraint(id);
    }

    if (request.method === "POST" && path === "/contracts/sponsor-requirements") {
      return await handleCreateSponsorRequirement(request);
    }

    if (request.method === "GET" && path === "/contracts/sponsor-requirements") {
      return await handleListSponsorRequirements(url);
    }

    const sponsorIdMatch = /^\/contracts\/sponsor-requirements\/([^/]+)$/.exec(path);
    if (request.method === "GET" && sponsorIdMatch !== null) {
      const id = decodeURIComponent(sponsorIdMatch[1]!);
      if (!isUuid(id)) {
        return null;
      }
      return await handleGetSponsorRequirement(id);
    }

    return null;
  }
}