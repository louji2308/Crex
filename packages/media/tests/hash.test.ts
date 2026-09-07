import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { IncrementalSha256, sha256Bytes } from "../src/hash";

function nodeSha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

const CHUNK_SIZES = [1, 3, 5, 7, 16, 64, 100, 1000];

function seededBytes(n: number, seed: number): Uint8Array {
  let s = seed >>> 0;
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    out[i] = (t ^ (t >>> 14)) & 0xff;
  }
  return out;
}

describe("sha256Bytes", () => {
  it("matches the empty-string vector", () => {
    expect(sha256Bytes("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("matches the 'abc' vector", () => {
    expect(sha256Bytes("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("matches the FIPS two-block vector", () => {
    expect(sha256Bytes("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
  });

  it("matches the one-million-'a' vector", () => {
    expect(sha256Bytes("a".repeat(1_000_000))).toBe(
      "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0",
    );
  });
});

describe("IncrementalSha256", () => {
  it("is chainable via update()", () => {
    const hasher = new IncrementalSha256();
    expect(hasher.update(new Uint8Array([1, 2, 3]))).toBe(hasher);
  });

  it("is chunk-size independent", () => {
    for (const seed of [1, 42, 1337]) {
      const data = seededBytes(3000, seed);
      const whole = sha256Bytes(data);
      for (const chunkSize of CHUNK_SIZES) {
        const hasher = new IncrementalSha256();
        for (let i = 0; i < data.length; i += chunkSize) {
          hasher.update(data.subarray(i, i + chunkSize));
        }
        expect(hasher.digestHex(), `seed ${seed}, chunk ${chunkSize}`).toBe(whole);
      }
    }
  });

  it("handles empty updates", () => {
    expect(new IncrementalSha256().update(new Uint8Array(0)).digestHex()).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
});

describe("cross-check against node:crypto", () => {
  const inputs: (Uint8Array | string)[] = [
    "",
    "abc",
    "The quick brown fox jumps over the lazy dog",
    "p\u00e4ssw\u00f6rd \u2603 with unicode",
    new Uint8Array([0, 1, 2, 3, 4, 5, 250, 251, 252, 253, 254, 255]),
    seededBytes(777, 7),
    seededBytes(100_000, 99),
    seededBytes(1, 5),
  ];

  it("agrees with node:crypto for every input", () => {
    for (const input of inputs) {
      const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
      expect(sha256Bytes(bytes), `input length ${bytes.length}`).toBe(nodeSha256(bytes));
    }
  });

  it("agrees for incremental chunking of random bytes", () => {
    const data = seededBytes(4096, 12345);
    const expected = nodeSha256(data);
    for (const chunkSize of CHUNK_SIZES) {
      const hasher = new IncrementalSha256();
      for (let i = 0; i < data.length; i += chunkSize) {
        hasher.update(data.subarray(i, i + chunkSize));
      }
      expect(hasher.digestHex(), `chunk ${chunkSize}`).toBe(expected);
    }
  });
});