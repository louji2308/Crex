import { describe, expect, it } from "vitest";
import { buildMp4, truncate, withoutFtyp } from "../src/fixtures";
import { validateMediaFile, MEDIA_VALIDATION_REASONS } from "../src/validate";

function readU32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset]! << 24) | (bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!) >>> 0
  );
}

describe("validateMediaFile", () => {
  it("rejects empty input with empty_file", () => {
    const result = validateMediaFile(new Uint8Array(0));
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("empty_file");
  });

  it("rejects oversized input with too_large", () => {
    const fixture = buildMp4();
    const result = validateMediaFile(fixture, { maxSizeBytes: fixture.length - 1 });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("too_large");
  });

  it("accepts input exactly at the size limit", () => {
    const fixture = buildMp4();
    const result = validateMediaFile(fixture, { maxSizeBytes: fixture.length });
    expect(result.valid).toBe(true);
  });

  it("rejects input without an ftyp box with unsupported_container", () => {
    const result = validateMediaFile(withoutFtyp(buildMp4()));
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("unsupported_container");
  });

  it("rejects a truncated container with no usable streams as missing_streams", () => {
    const fixture = buildMp4();
    const ftypSize = readU32BE(fixture, 0);
    const result = validateMediaFile(truncate(fixture, ftypSize + 24));
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("missing_streams");
  });

  it("rejects a moov with only a movie header as missing_streams", () => {
    const fixture = buildMp4();
    const ftypSize = readU32BE(fixture, 0);
    const moovSize = readU32BE(fixture, ftypSize);
    const moovPayload = ftypSize + 8;
    const mvhdSize = readU32BE(fixture, moovPayload);
    const result = validateMediaFile(truncate(fixture, moovPayload + mvhdSize));
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("missing_streams");
  });

  it("accepts the default fixture with a populated media probe", () => {
    const result = validateMediaFile(buildMp4());
    expect(result.valid).toBe(true);
    expect(result.reason).toBeUndefined();
    expect(result.media).toBeDefined();
    expect(result.media!.container).toBe("isom");
    expect(result.media!.video).toEqual({ codec: "avc1", width: 1280, height: 720 });
    expect(result.media!.audio).toEqual({ codec: "mp4a" });
    expect(result.media!.durationSeconds).not.toBeNull();
  });

  it("accepts audio-only files", () => {
    const result = validateMediaFile(buildMp4({ video: null }));
    expect(result.valid).toBe(true);
    expect(result.reason).toBeUndefined();
    expect(result.media!.video).toBeNull();
    expect(result.media!.audio).toEqual({ codec: "mp4a" });
  });

  it("accepts video-only files", () => {
    const result = validateMediaFile(buildMp4({ audio: null }));
    expect(result.valid).toBe(true);
    expect(result.reason).toBeUndefined();
    expect(result.media!.audio).toBeNull();
    expect(result.media!.video).toEqual({ codec: "avc1", width: 1280, height: 720 });
  });

  it("exposes the exact reason strings", () => {
    expect(MEDIA_VALIDATION_REASONS).toEqual([
      "empty_file",
      "too_large",
      "unsupported_container",
      "missing_streams",
    ]);
  });
});