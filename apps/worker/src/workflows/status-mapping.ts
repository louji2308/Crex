import type { WorkflowPhase } from "@crex/core/src/workflow";

export const INSTANCE_STATUS_VALUES = [
  "queued",
  "running",
  "paused",
  "errored",
  "terminated",
  "complete",
  "waiting",
  "waitingForPause",
  "unknown",
] as const;

export type InstanceStatusValue = (typeof INSTANCE_STATUS_VALUES)[number];

const STATUS_TO_PHASE: ReadonlyMap<InstanceStatusValue, WorkflowPhase> = new Map([
  ["queued", "QUEUED"],
  ["running", "RUNNING"],
  ["waiting", "RUNNING"],
  ["waitingForPause", "RUNNING"],
  ["paused", "RUNNING"],
  ["complete", "COMPLETED"],
  ["errored", "FAILED"],
  ["terminated", "CANCELLED"],
]);

export function mapInstanceStatusToPhase(status: string): WorkflowPhase | undefined {
  if (!INSTANCE_STATUS_VALUES.includes(status as InstanceStatusValue)) {
    return undefined;
  }
  return STATUS_TO_PHASE.get(status as InstanceStatusValue);
}
