export interface VideoOptions {
  codec?: "avc1" | "hvc1";
  width?: number;
  height?: number;
}

export interface AudioOptions {
  codec?: "mp4a" | "opus";
}

export interface BuildMp4Options {
  durationSeconds?: number;
  video?: VideoOptions | null;
  audio?: AudioOptions | null;
  majorBrand?: string;
}

const AVC_SPS = new Uint8Array([
  0x67,
  0x64,
  0x00,
  0x1f,
  0xac,
  0xd9,
  0x40,
  0xa0,
  0x2f,
  0xf9,
  0x70,
  0x11,
  0x00,
  0x00,
  0x03,
  0x00,
  0x01,
  0x00,
  0x00,
  0x03,
  0x00,
  0x32,
  0x0f,
  0x18,
  0x30,
  0x64,
]);

const AVC_PPS = new Uint8Array([0x68, 0xeb, 0xe3, 0xcb, 0x22, 0xc0]);

function writeU16BE(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 8) & 0xff;
  bytes[offset + 1] = value & 0xff;
}

function writeU32BE(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

function readU32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset]! << 24) | (bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!) >>> 0
  );
}

function ascii(str: string): Uint8Array {
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    out[i] = str.charCodeAt(i) & 0xff;
  }
  return out;
}

function u16(value: number): Uint8Array {
  const out = new Uint8Array(2);
  writeU16BE(out, 0, value);
  return out;
}

function u32(value: number): Uint8Array {
  const out = new Uint8Array(4);
  writeU32BE(out, 0, value);
  return out;
}

function fullbox(version: number, flags = 0): Uint8Array {
  return new Uint8Array([version, (flags >>> 16) & 0xff, (flags >>> 8) & 0xff, flags & 0xff]);
}

function concat(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const part of parts) {
    total += part.length;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function box(type: string, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + payload.length);
  writeU32BE(out, 0, 8 + payload.length);
  out.set(ascii(type), 4);
  out.set(payload, 8);
  return out;
}

function buildMvhd(timescale: number, duration: number): Uint8Array {
  const payload = new Uint8Array(96);
  payload.set(fullbox(0), 0);
  writeU32BE(payload, 4, 0);
  writeU32BE(payload, 8, 0);
  writeU32BE(payload, 12, timescale);
  writeU32BE(payload, 16, duration);
  writeU32BE(payload, 20, 0x00010000);
  writeU16BE(payload, 24, 0x0100);
  writeU32BE(payload, 32, 0x00010000);
  writeU32BE(payload, 36, 0);
  writeU32BE(payload, 40, 0);
  writeU32BE(payload, 44, 0);
  writeU32BE(payload, 48, 0x00010000);
  writeU32BE(payload, 52, 0);
  writeU32BE(payload, 56, 0);
  writeU32BE(payload, 60, 0);
  writeU32BE(payload, 64, 0x40000000);
  writeU32BE(payload, 92, 1);
  return box("mvhd", payload);
}

function buildTkhd(trackId: number, duration: number, width: number, height: number): Uint8Array {
  const payload = new Uint8Array(84);
  payload.set(fullbox(0, 0x000003), 0);
  writeU32BE(payload, 12, trackId);
  writeU32BE(payload, 20, duration);
  writeU16BE(payload, 36, 0x0100);
  writeU32BE(payload, 40, 0x00010000);
  writeU32BE(payload, 44, 0);
  writeU32BE(payload, 48, 0);
  writeU32BE(payload, 52, 0);
  writeU32BE(payload, 56, 0x00010000);
  writeU32BE(payload, 60, 0);
  writeU32BE(payload, 64, 0);
  writeU32BE(payload, 68, 0);
  writeU32BE(payload, 72, 0x40000000);
  writeU32BE(payload, 76, width << 16);
  writeU32BE(payload, 80, height << 16);
  return box("tkhd", payload);
}

function buildMdhd(timescale: number, duration: number): Uint8Array {
  const payload = new Uint8Array(24);
  payload.set(fullbox(0), 0);
  writeU32BE(payload, 4, 0);
  writeU32BE(payload, 8, 0);
  writeU32BE(payload, 12, timescale);
  writeU32BE(payload, 16, duration);
  return box("mdhd", payload);
}

function buildHdlr(handlerType: string): Uint8Array {
  const payload = new Uint8Array(25);
  payload.set(fullbox(0), 0);
  payload.set(ascii(handlerType), 8);
  payload[24] = 0;
  return box("hdlr", payload);
}

function buildVmhd(): Uint8Array {
  const payload = new Uint8Array(12);
  payload.set(fullbox(0, 1), 0);
  return box("vmhd", payload);
}

function buildSmhd(): Uint8Array {
  const payload = new Uint8Array(8);
  payload.set(fullbox(0), 0);
  return box("smhd", payload);
}

function buildDinf(): Uint8Array {
  const dref = box("dref", concat([fullbox(0), u32(1), box("url ", fullbox(0, 1))]));
  return box("dinf", dref);
}

function buildAvcC(): Uint8Array {
  const payload = new Uint8Array(6 + 1 + 2 + AVC_SPS.length + 1 + 1 + AVC_PPS.length);
  payload[0] = 1;
  payload[1] = 0x64;
  payload[2] = 0;
  payload[3] = 0x1f;
  payload[4] = 0xff;
  payload[5] = 0xe1;
  writeU16BE(payload, 6, AVC_SPS.length);
  payload.set(AVC_SPS, 9);
  payload[9 + AVC_SPS.length] = 1;
  payload[10 + AVC_SPS.length] = AVC_PPS.length;
  payload.set(AVC_PPS, 11 + AVC_SPS.length);
  return box("avcC", payload);
}

function buildHvcC(): Uint8Array {
  const payload = new Uint8Array(26);
  payload[0] = 1;
  payload[24] = 0xff;
  payload[25] = 0;
  return box("hvcC", payload);
}

function buildVisualSampleEntry(codec: string, width: number, height: number): Uint8Array {
  const body = new Uint8Array(78);
  writeU16BE(body, 6, 1);
  writeU16BE(body, 24, width);
  writeU16BE(body, 26, height);
  writeU32BE(body, 28, 0x00480000);
  writeU32BE(body, 32, 0x00480000);
  writeU16BE(body, 40, 1);
  writeU16BE(body, 74, 0x0018);
  writeU16BE(body, 76, 0xffff);
  const codecConfig = codec === "hvc1" ? buildHvcC() : buildAvcC();
  return box(codec, concat([body, codecConfig]));
}

function buildEsds(): Uint8Array {
  const descriptor = new Uint8Array([
    0x03,
    0x19,
    0x00,
    0x01,
    0x00,
    0x04,
    0x11,
    0x40,
    0x15,
    0x00,
    0x00,
    0x00,
    0x00,
    0x01,
    0xf4,
    0x00,
    0x00,
    0x01,
    0xf4,
    0x00,
    0x05,
    0x02,
    0x12,
    0x10,
    0x06,
    0x01,
    0x02,
  ]);
  return box("esds", concat([fullbox(0), descriptor]));
}

function buildDOps(): Uint8Array {
  const payload = new Uint8Array(11);
  payload[1] = 2;
  writeU16BE(payload, 2, 312);
  writeU32BE(payload, 4, 48000);
  return box("dOps", payload);
}

function buildAudioSampleEntry(codec: string): Uint8Array {
  const body = new Uint8Array(28);
  writeU16BE(body, 6, 1);
  writeU16BE(body, 16, 2);
  writeU16BE(body, 18, 16);
  writeU32BE(body, 24, 44100 * 65536);
  const codecConfig = codec === "opus" ? buildDOps() : buildEsds();
  return box(codec, concat([body, codecConfig]));
}

function buildStsd(sampleEntry: Uint8Array): Uint8Array {
  return box("stsd", concat([fullbox(0), u32(1), sampleEntry]));
}

function buildStbl(sampleEntry: Uint8Array): Uint8Array {
  const stsd = buildStsd(sampleEntry);
  const stts = box("stts", concat([fullbox(0), u32(0)]));
  const stsc = box("stsc", concat([fullbox(0), u32(0)]));
  const stsz = box("stsz", concat([fullbox(0), u32(0), u32(0)]));
  const stco = box("stco", concat([fullbox(0), u32(0)]));
  return box("stbl", concat([stsd, stts, stsc, stsz, stco]));
}

function buildMdia(
  timescale: number,
  duration: number,
  handlerType: string,
  mediaHeader: Uint8Array,
  sampleEntry: Uint8Array,
): Uint8Array {
  const mdhd = buildMdhd(timescale, duration);
  const hdlr = buildHdlr(handlerType);
  const minf = box("minf", concat([mediaHeader, buildDinf(), buildStbl(sampleEntry)]));
  return box("mdia", concat([mdhd, hdlr, minf]));
}

function buildVideoTrack(
  timescale: number,
  duration: number,
  codec: "avc1" | "hvc1",
  width: number,
  height: number,
): Uint8Array {
  const tkhd = buildTkhd(1, duration, width, height);
  const mdia = buildMdia(timescale, duration, "vide", buildVmhd(), buildVisualSampleEntry(codec, width, height));
  return box("trak", concat([tkhd, mdia]));
}

function buildAudioTrack(
  timescale: number,
  duration: number,
  codec: "mp4a" | "opus",
): Uint8Array {
  const tkhd = buildTkhd(2, duration, 0, 0);
  const mdia = buildMdia(timescale, duration, "soun", buildSmhd(), buildAudioSampleEntry(codec));
  return box("trak", concat([tkhd, mdia]));
}

export function buildMp4(opts?: BuildMp4Options): Uint8Array {
  const options = opts ?? {};
  const durationSeconds = options.durationSeconds ?? 12.5;
  const majorBrand = options.majorBrand ?? "isom";
  const video: VideoOptions | null =
    options.video === undefined ? { codec: "avc1", width: 1280, height: 720 } : options.video;
  const audio: AudioOptions | null = options.audio === undefined ? { codec: "mp4a" } : options.audio;

  const timescale = 600;
  const duration = Math.round(durationSeconds * timescale);

  const ftypPayload = concat([ascii(majorBrand), u32(0x00000200), ascii(majorBrand)]);
  const ftyp = box("ftyp", ftypPayload);

  const moovChildren: Uint8Array[] = [buildMvhd(timescale, duration)];
  if (video !== null) {
    moovChildren.push(
      buildVideoTrack(timescale, duration, video.codec ?? "avc1", video.width ?? 1280, video.height ?? 720),
    );
  }
  if (audio !== null) {
    moovChildren.push(buildAudioTrack(timescale, duration, audio.codec ?? "mp4a"));
  }
  const moov = box("moov", concat(moovChildren));

  return concat([ftyp, moov]);
}

export function truncate(bytes: Uint8Array, n: number): Uint8Array {
  return bytes.slice(0, n);
}

export function withoutFtyp(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 8) {
    return bytes.slice(0);
  }
  const size = readU32(bytes, 0);
  const type = String.fromCharCode(bytes[4]!, bytes[5]!, bytes[6]!, bytes[7]!);
  if (type === "ftyp" && size >= 8 && size <= bytes.length) {
    return bytes.slice(size);
  }
  return bytes.slice(0);
}