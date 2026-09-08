import { describe, expect, it } from "vitest";
import {
  createWorkflowState,
  transitionPhase,
  transitionStage,
  parseWorkflowState,
} from "../src/workflow.js";
import { CrexError } from "../src/errors.js";
import { createId } from "@crex/schemas";

const baseState = () =>
  createWorkflowState({
    id: createId(),
    project_id: createId(),
    workflow_name: "crex.demo",
    stage: "SOURCE_INGESTION",
    phase: "QUEUED",
  });

describe("workflow state machine", () => {
  it("creates a valid initial state", () => {
    const state = baseState();
    expect(state.phase).toBe("QUEUED");
    expect(state.stage).toBe("SOURCE_INGESTION");
    expect(state.created_at).toBe(state.updated_at);
  });

  it("moves phase forward and stamps completed_at on completion", () => {
    const running = transitionPhase(baseState(), "RUNNING");
    expect(running.phase).toBe("RUNNING");
    const done = transitionPhase(running, "COMPLETED");
    expect(done.completed_at).toBeDefined();
  });

  it("rejects a transition out of a terminal phase", () => {
    const running = transitionPhase(baseState(), "RUNNING");
    const done = transitionPhase(running, "COMPLETED");
    expect(() => transitionPhase(done, "RUNNING")).toThrow(CrexError);
    expect(() => transitionPhase(done, "COMPLETED")).toThrow(CrexError);

    const failed = transitionPhase(running, "FAILED");
    expect(() => transitionPhase(failed, "RUNNING")).toThrow(CrexError);
    expect(() => transitionPhase(failed, "COMPLETED")).toThrow(CrexError);

    const cancelled = transitionPhase(running, "CANCELLED");
    expect(() => transitionPhase(cancelled, "QUEUED")).toThrow(CrexError);
  });

  it("allows active-to-terminal transitions and rejects unknown phases", () => {
    const failed = transitionPhase(baseState(), "FAILED");
    expect(failed.phase).toBe("FAILED");
    expect(() => transitionPhase(baseState(), "NOT_A_PHASE" as never)).toThrow(CrexError);
  });

  it("advances through forward stages", () => {
    const state = transitionStage(baseState(), "TRANSCRIPTION");
    expect(state.stage).toBe("TRANSCRIPTION");
  });

  it("rejects a backwards stage transition", () => {
    const advanced = transitionStage(baseState(), "TRANSCRIPTION");
    expect(() => transitionStage(advanced, "SOURCE_INGESTION")).toThrow(CrexError);
  });

  it("rejects a sideways stage transition", () => {
    const advanced = transitionStage(baseState(), "CONTENT_UNDERSTANDING");
    expect(() => transitionStage(advanced, "TRANSCRIPTION")).toThrow(CrexError);
  });

  it("round-trips through parseWorkflowState", () => {
    const original = baseState();
    const parsed = parseWorkflowState(original);
    expect(parsed).toEqual(original);
  });

  it("raises on malformed state", () => {
    expect(() => parseWorkflowState({ not: "a state" })).toThrow(CrexError);
  });
});