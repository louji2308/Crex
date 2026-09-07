import {
  GENERATION_STAGE,
  VERIFICATION_STATUS,
  WORKFLOW_PHASE,
  workflowStateSchema,
  type WorkflowState,
} from "@crex/schemas";
import { CrexError } from "./errors";

export type WorkflowPhase = (typeof WORKFLOW_PHASE)[number];
export type GenerationStage = (typeof GENERATION_STAGE)[number];
export type VerificationStatus = (typeof VERIFICATION_STATUS)[number];

const PHASES: ReadonlySet<WorkflowPhase> = new Set(WORKFLOW_PHASE);
const STAGES: readonly GenerationStage[] = GENERATION_STAGE;

export function createWorkflowState(
  input: {
    id: string;
    project_id: string;
    workflow_name: string;
    stage: GenerationStage;
    phase?: WorkflowPhase;
  },
  now: string = new Date().toISOString(),
): WorkflowState {
  const phase = input.phase ?? "QUEUED";
  return workflowStateSchema.parse({
    id: input.id,
    project_id: input.project_id,
    workflow_name: input.workflow_name,
    phase,
    stage: input.stage,
    created_at: now,
    updated_at: now,
  });
}

export function transitionPhase(
  state: WorkflowState,
  next: WorkflowPhase,
  now: string = new Date().toISOString(),
): WorkflowState {
  if (!PHASES.has(next)) {
    throw new CrexError("INVALID_WORKFLOW_PHASE", `unknown phase: ${next}`);
  }
  return workflowStateSchema.parse({
    ...state,
    phase: next,
    updated_at: now,
    ...(next === "COMPLETED" ? { completed_at: now } : {}),
    ...(next === "QUEUED" || next === "RUNNING" ? { completed_at: undefined } : {}),
  });
}

export function transitionStage(
  state: WorkflowState,
  next: GenerationStage,
  now: string = new Date().toISOString(),
): WorkflowState {
  const currentIndex = STAGES.indexOf(state.stage);
  const nextIndex = STAGES.indexOf(next);
  if (currentIndex === -1 || nextIndex === -1) {
    throw new CrexError("INVALID_WORKFLOW_STAGE", `unknown stage: ${next}`);
  }
  if (nextIndex <= currentIndex) {
    throw new CrexError(
      "INVALID_WORKFLOW_TRANSITION",
      `cannot move stage backwards or sideways from ${state.stage} to ${next}`,
    );
  }
  return workflowStateSchema.parse({
    ...state,
    stage: next,
    updated_at: now,
  });
}

export function parseWorkflowState(value: unknown): WorkflowState {
  const result = workflowStateSchema.safeParse(value);
  if (!result.success) {
    throw new CrexError("INVALID_WORKFLOW_STATE", `invalid workflow state: ${result.error.message}`);
  }
  return result.data;
}