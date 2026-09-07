const K = new Uint32Array([
  0x428a2f98,
  0x71374491,
  0xb5c0fbcf,
  0xe9b5dba5,
  0x3956c25b,
  0x59f111f1,
  0x923f82a4,
  0xab1c5ed5,
  0xd807aa98,
  0x12835b01,
  0x243185be,
  0x550c7dc3,
  0x72be5d74,
  0x80deb1fe,
  0x9bdc06a7,
  0xc19bf174,
  0xe49b69c1,
  0xefbe4786,
  0x0fc19dc6,
  0x240ca1cc,
  0x2de92c6f,
  0x4a7484aa,
  0x5cb0a9dc,
  0x76f988da,
  0x983e5152,
  0xa831c66d,
  0xb00327c8,
  0xbf597fc7,
  0xc6e00bf3,
  0xd5a79147,
  0x06ca6351,
  0x14292967,
  0x27b70a85,
  0x2e1b2138,
  0x4d2c6dfc,
  0x53380d13,
  0x650a7354,
  0x766a0abb,
  0x81c2c92e,
  0x92722c85,
  0xa2bfe8a1,
  0xa81a664b,
  0xc24b8b70,
  0xc76c51a3,
  0xd192e819,
  0xd6990624,
  0xf40e3585,
  0x106aa070,
  0x19a4c116,
  0x1e376c08,
  0x2748774c,
  0x34b0bcb5,
  0x391c0cb3,
  0x4ed8aa4a,
  0x5b9cca4f,
  0x682e6ff3,
  0x748f82ee,
  0x78a5636f,
  0x84c87814,
  0x8cc70208,
  0x90befffa,
  0xa4506ceb,
  0xbef9a3f7,
  0xc67178f2,
]);

function ror(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

const INITIAL_H: readonly number[] = [
  0x6a09e667,
  0xbb67ae85,
  0x3c6ef372,
  0xa54ff53a,
  0x510e527f,
  0x9b05688c,
  0x1f83d9ab,
  0x5be0cd19,
];

const textEncoder = new TextEncoder();

export class IncrementalSha256 {
  private h = new Uint32Array(INITIAL_H);
  private block = new Uint8Array(64);
  private blockLen = 0;
  private bitLenHi = 0;
  private bitLenLo = 0;
  private readonly w = new Uint32Array(64);

  update(bytes: Uint8Array): this {
    let offset = 0;
    let remaining = bytes.length;
    while (remaining > 0) {
      const space = 64 - this.blockLen;
      const take = space < remaining ? space : remaining;
      this.block.set(bytes.subarray(offset, offset + take), this.blockLen);
      this.blockLen += take;
      offset += take;
      remaining -= take;
      if (this.blockLen === 64) {
        this.processBlock(this.block, this.h);
        this.blockLen = 0;
        const prev = this.bitLenLo;
        this.bitLenLo = (prev + 512) >>> 0;
        if (this.bitLenLo < prev) {
          this.bitLenHi = (this.bitLenHi + 1) >>> 0;
        }
      }
    }
    return this;
  }

  digestHex(): string {
    const h = new Uint32Array(this.h);
    const finalBlock = new Uint8Array(64);
    finalBlock.set(this.block.subarray(0, this.blockLen));
    finalBlock[this.blockLen] = 0x80;
    if (this.blockLen >= 56) {
      this.processBlock(finalBlock, h);
      finalBlock.fill(0);
    }
    let lo = this.bitLenLo + this.blockLen * 8;
    let hi = this.bitLenHi;
    if (lo >= 0x100000000) {
      lo -= 0x100000000;
      hi = (hi + 1) >>> 0;
    }
    finalBlock[56] = (hi >>> 24) & 0xff;
    finalBlock[57] = (hi >>> 16) & 0xff;
    finalBlock[58] = (hi >>> 8) & 0xff;
    finalBlock[59] = hi & 0xff;
    finalBlock[60] = (lo >>> 24) & 0xff;
    finalBlock[61] = (lo >>> 16) & 0xff;
    finalBlock[62] = (lo >>> 8) & 0xff;
    finalBlock[63] = lo & 0xff;
    this.processBlock(finalBlock, h);
    let hex = "";
    for (let i = 0; i < 8; i++) {
      hex += (h[i]! >>> 0).toString(16).padStart(8, "0");
    }
    return hex;
  }

  private processBlock(block: Uint8Array, h: Uint32Array): void {
    const w = this.w;
    for (let i = 0; i < 16; i++) {
      const o = i * 4;
      w[i] =
        ((block[o]! << 24) | (block[o + 1]! << 16) | (block[o + 2]! << 8) | block[o + 3]!) >>> 0;
    }
    for (let i = 16; i < 64; i++) {
      const w15 = w[i - 15]!;
      const w2 = w[i - 2]!;
      const s0 =
        ((w15 >>> 7) | (w15 << 25)) ^ ((w15 >>> 18) | (w15 << 14)) ^ (w15 >>> 3);
      const s1 =
        ((w2 >>> 17) | (w2 << 15)) ^ ((w2 >>> 19) | (w2 << 13)) ^ (w2 >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }
    let a = h[0]!;
    let b = h[1]!;
    let c = h[2]!;
    let d = h[3]!;
    let e = h[4]!;
    let f = h[5]!;
    let g = h[6]!;
    let hh = h[7]!;
    for (let i = 0; i < 64; i++) {
      const S1 = ror(e, 6) ^ ror(e, 11) ^ ror(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (hh + S1 + ch + K[i]! + w[i]!) >>> 0;
      const S0 = ror(a, 2) ^ ror(a, 13) ^ ror(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    h[0] = (h[0]! + a) >>> 0;
    h[1] = (h[1]! + b) >>> 0;
    h[2] = (h[2]! + c) >>> 0;
    h[3] = (h[3]! + d) >>> 0;
    h[4] = (h[4]! + e) >>> 0;
    h[5] = (h[5]! + f) >>> 0;
    h[6] = (h[6]! + g) >>> 0;
    h[7] = (h[7]! + hh) >>> 0;
  }
}

export function sha256Bytes(bytes: Uint8Array | string): string {
  const input = typeof bytes === "string" ? textEncoder.encode(bytes) : bytes;
  return new IncrementalSha256().update(input).digestHex();
}