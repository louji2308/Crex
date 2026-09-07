import { describe, expect, it } from "vitest";
import {
  INSTANCE_STATUS_VALUES,
  mapInstanceStatusToPhase,
} from "../src/workflows/status-mapping";

describe("mapInstanceStatusToPhase", () => {
  it("maps queued to QUEUED", () => {
    expect(mapInstanceStatusToPhase("queued")).toBe("QUEUED");
  });

  it("maps running-family states to RUNNING", () => {
    for (const status of ["running", "waiting", "waitingForPause", "paused"]) {
      expect(mapInstanceStatusToPhase(status)).toBe("RUNNING");
    }
  });

  it("maps complete to COMPLETED", () => {
    expect(mapInstanceStatusToPhase("complete")).toBe("COMPLETED");
  });

  it("maps errored to FAILED", () => {
    expect(mapInstanceStatusToPhase("errored")).toBe("FAILED");
  });

  it("maps terminated to CANCELLED", () => {
    expect(mapInstanceStatusToPhase("terminated")).toBe("CANCELLED");
  });

  it("returns undefined for unknown statuses", () => {
    expect(mapInstanceStatusToPhase("unknown")).toBeUndefined();
    expect(mapInstanceStatusToPhase("failed")).toBeUndefined();
    expect(mapInstanceStatusToPhase("random-status")).toBeUndefined();
  });

  it("covers every documented instance status value except unknown", () => {
    const era = INSTANCE_STATUS_VALUES.filter((status) => status !== "unknown");
    for (const value of era) {
      expect(mapInstanceStatusToPhase(value)).toBeDefined();
    }
  });
});

describe("status mapping completeness and honesty", () => {
  it("does not map unknown to a fake phase", () => {
    expect(mapInstanceStatusToPhase("unknown")).toBeUndefined();
  });

  it("keeps contract `unknown` as an explicit non-phase", () => {
    expect(INSTANCE_STATUS_VALUES).toContain("unknown");
  });
});
