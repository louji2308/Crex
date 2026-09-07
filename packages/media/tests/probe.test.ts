import { describe, expect, it } from "vitest";
import { buildMp4, truncate, withoutFtyp } from "../src/fixtures";
import { probeMediaFile } from "../src/probe";

function readU32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset]! << 24) | (bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!) >>> 0
  );
}

describe("probeMediaFile", () => {
  it("probes the default fixture", () => {
    const probe = probeMediaFile(buildMp4());
    expect(probe.container).toBe("isom");
    expect(probe.video).toEqual({ codec: "avc1", width: 1280, height: 720 });
    expect(probe.audio).toEqual({ codec: "mp4a" });
    expect(probe.durationSeconds).not.toBeNull();
    expect(Math.abs(probe.durationSeconds! - 12.5)).toBeLessThan(0.005);
  });

  it("probes a custom duration", () => {
    const probe = probeMediaFile(buildMp4({ durationSeconds: 3 }));
    expect(probe.durationSeconds).not.toBeNull();
    expect(Math.abs(probe.durationSeconds! - 3)).toBeLessThan(0.005);
  });

  it("reports video-only files with audio null", () => {
    const probe = probeMediaFile(buildMp4({ audio: null }));
    expect(probe.audio).toBeNull();
    expect(probe.video).toEqual({ codec: "avc1", width: 1280, height: 720 });
  });

  it("reports audio-only files with video null", () => {
    const probe = probeMediaFile(buildMp4({ video: null }));
    expect(probe.video).toBeNull();
    expect(probe.audio).toEqual({ codec: "mp4a" });
  });

  it("honours a custom major brand", () => {
    const probe = probeMediaFile(buildMp4({ majorBrand: "qt  " }));
    expect(probe.container).toBe("qt  ");
  });

  it("parses custom codecs and dimensions", () => {
    const videoProbe = probeMediaFile(
      buildMp4({ video: { codec: "hvc1", width: 1920, height: 1080 } }),
    );
    expect(videoProbe.video).toEqual({ codec: "hvc1", width: 1920, height: 1080 });
    const audioProbe = probeMediaFile(buildMp4({ audio: { codec: "opus" } }));
    expect(audioProbe.audio).toEqual({ codec: "opus" });
  });

  it("never throws on truncated input", () => {
    const bytes = buildMp4();
    expect(() => probeMediaFile(truncate(bytes, Math.floor(bytes.length / 2)))).not.toThrow();
    expect(() => probeMediaFile(truncate(bytes, 12))).not.toThrow();
    expect(probeMediaFile(truncate(bytes, 12)).container).toBe("isom");
  });

  it("never throws on empty input", () => {
    const probe = probeMediaFile(new Uint8Array(0));
    expect(probe.container).toBe("");
    expect(probe.video).toBeNull();
    expect(probe.audio).toBeNull();
  });

  it("never throws on garbage input", () => {
    const junk = new Uint8Array(512);
    for (let i = 0; i < junk.length; i++) {
      junk[i] = (i * 131) & 0xff;
    }
    expect(() => probeMediaFile(junk)).not.toThrow();
    const probe = probeMediaFile(junk);
    expect(probe.container).toBe("");
    expect(probe.video).toBeNull();
    expect(probe.audio).toBeNull();
  });

  it("round-trips the withoutFtyp helper", () => {
    const bytes = buildMp4();
    const ftypSize = readU32BE(bytes, 0);
    const stripped = withoutFtyp(bytes);
    expect(stripped.length).toBe(bytes.length - ftypSize);
  });
});