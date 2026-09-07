import { describe, expect, it } from "vitest";
import { sanitizeFilename, sourceAssetObjectKey, validateObjectKey } from "../src/objectKeys";

describe("validateObjectKey", () => {
  it("accepts nested safe keys", () => {
    expect(() => validateObjectKey("projects/p-1/source-assets/sa-2/clip.mp4")).not.toThrow();
  });

  it("rejects empty keys", () => {
    expect(() => validateObjectKey("")).toThrow(/must not be empty/);
  });

  it("rejects absolute keys", () => {
    expect(() => validateObjectKey("/etc/passwd")).toThrow(/must not be absolute/);
    expect(() => validateObjectKey("\\etc\\passwd")).toThrow(/must not be absolute/);
  });

  it("rejects traversal segments", () => {
    expect(() => validateObjectKey("a/../b")).toThrow(/path traversal/);
    expect(() => validateObjectKey("a/..")).toThrow(/path traversal/);
    expect(() => validateObjectKey("..")).toThrow(/path traversal/);
  });

  it("rejects control characters", () => {
    expect(() => validateObjectKey("a\u0000b")).toThrow(/NUL/);
    expect(() => validateObjectKey("a\u0007b")).toThrow(/control characters/);
    expect(() => validateObjectKey("a\u001fb")).toThrow(/control characters/);
  });

  it("rejects empty path segments", () => {
    expect(() => validateObjectKey("projects//x")).toThrow(/empty path segments/);
  });

  it("rejects keys that are too long", () => {
    expect(() => validateObjectKey("a".repeat(1025))).toThrow(/1024/);
  });
});

describe("sanitizeFilename", () => {
  it("keeps safe filenames unchanged", () => {
    expect(sanitizeFilename("my-video.mp4")).toBe("my-video.mp4");
  });

  it("strips directory components down to the basename", () => {
    expect(sanitizeFilename("C:\\Users\\LJ\\videos\\clip.mp4")).toBe("clip.mp4");
    expect(sanitizeFilename("/home/user/clip.mp4")).toBe("clip.mp4");
  });

  it("rejects dot-relative basenames", () => {
    expect(() => sanitizeFilename("..")).toThrow(/dot-relative/);
    expect(() => sanitizeFilename(".")).toThrow(/dot-relative/);
  });

  it("rejects control characters", () => {
    expect(() => sanitizeFilename("a\u0000b.mp4")).toThrow(/control characters/);
  });

  it("replaces unsafe characters", () => {
    expect(sanitizeFilename("clip 01!")).toBe("clip-01");
  });

  it("rejects filenames with no safe characters", () => {
    expect(() => sanitizeFilename("!!!")).toThrow(/no safe characters/);
  });

  it("rejects overlong filenames", () => {
    expect(() => sanitizeFilename("a".repeat(256))).toThrow(/255/);
  });

  it("rejects empty filenames", () => {
    expect(() => sanitizeFilename("")).toThrow(/must not be empty/);
  });
});

describe("sourceAssetObjectKey", () => {
  it("builds a namespaced key from project, asset and filename", () => {
    expect(sourceAssetObjectKey("p-1", "sa-2", "clip.mp4")).toBe(
      "projects/p-1/source-assets/sa-2/clip.mp4",
    );
  });

  it("neutralises traversal attempts in the filename", () => {
    const key = sourceAssetObjectKey("p-1", "sa-2", "../../../etc/passwd");
    expect(key).toBe("projects/p-1/source-assets/sa-2/passwd");
    expect(key.includes("..")).toBe(false);
  });

  it("rejects traversal through project or asset ids", () => {
    expect(() => sourceAssetObjectKey("a/../b", "sa-2", "clip.mp4")).toThrow(/plain identifier/);
    expect(() => sourceAssetObjectKey("p-1", "..", "clip.mp4")).toThrow(/plain identifier/);
  });
});