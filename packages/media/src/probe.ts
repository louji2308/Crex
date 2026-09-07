export interface MediaProbe {
  container: string;
  durationSeconds: number | null;
  video: { codec: string; width: number; height: number } | null;
  audio: { codec: string } | null;
}

interface BoxTimes {
  timescale: number;
  duration: number;
}

interface TrakInfo {
  handler: string | null;
  codec: string | null;
  width: number | null;
  height: number | null;
  mdhd: BoxTimes | null;
}

interface ProbeState {
  result: MediaProbe;
  mvhd: BoxTimes | null;
  videoMdhd: BoxTimes | null;
}

const VIDEO_CODECS = new Set(["avc1", "hvc1", "hev1", "av01", "avc3"]);
const AUDIO_CODECS = new Set(["mp4a", "opus", "ac-3", "eac-3", "flac"]);

function readU32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset]! << 24) | (bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!) >>> 0
  );
}

function readU64(bytes: Uint8Array, offset: number): number {
  const hi = readU32(bytes, offset);
  const lo = readU32(bytes, offset + 4);
  return hi * 0x100000000 + lo;
}

function read4cc(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(bytes[offset]!, bytes[offset + 1]!, bytes[offset + 2]!, bytes[offset + 3]!);
}

function forEachBox(
  data: Uint8Array,
  start: number,
  end: number,
  visit: (type: string, payloadStart: number, boxEnd: number) => void,
): void {
  let pos = start;
  const limit = Math.min(end, data.length);
  while (pos + 8 <= limit) {
    const size32 = readU32(data, pos);
    const type = read4cc(data, pos + 4);
    let headerSize = 8;
    let boxSize: number;
    if (size32 === 1) {
      if (pos + 16 > limit) {
        return;
      }
      boxSize = readU64(data, pos + 8);
      headerSize = 16;
    } else if (size32 === 0) {
      boxSize = limit - pos;
    } else if (size32 < 8) {
      return;
    } else {
      boxSize = size32;
    }
    if (boxSize < headerSize) {
      return;
    }
    const payloadStart = pos + headerSize;
    const boxEnd = Math.min(pos + boxSize, limit);
    visit(type, payloadStart, boxEnd);
    if (boxEnd <= pos) {
      return;
    }
    pos = boxEnd;
  }
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function parseTimescaleDuration(bytes: Uint8Array, payloadStart: number, end: number): BoxTimes | null {
  if (payloadStart + 1 > end) {
    return null;
  }
  const version = bytes[payloadStart]!;
  if (version === 0) {
    if (payloadStart + 20 > end) {
      return null;
    }
    return {
      timescale: readU32(bytes, payloadStart + 12),
      duration: readU32(bytes, payloadStart + 16),
    };
  }
  if (version === 1) {
    if (payloadStart + 32 > end) {
      return null;
    }
    return {
      timescale: readU32(bytes, payloadStart + 20),
      duration: readU64(bytes, payloadStart + 24),
    };
  }
  return null;
}

function parseTkhd(
  bytes: Uint8Array,
  payloadStart: number,
  end: number,
): { width: number; height: number } | null {
  if (payloadStart + 1 > end) {
    return null;
  }
  const version = bytes[payloadStart]!;
  let widthOffset: number;
  let heightOffset: number;
  if (version === 0) {
    widthOffset = 76;
    heightOffset = 80;
  } else if (version === 1) {
    widthOffset = 84;
    heightOffset = 88;
  } else {
    return null;
  }
  if (payloadStart + heightOffset + 4 > end) {
    return null;
  }
  return {
    width: Math.round(readU32(bytes, payloadStart + widthOffset) / 65536),
    height: Math.round(readU32(bytes, payloadStart + heightOffset) / 65536),
  };
}

function parseHdlr(bytes: Uint8Array, payloadStart: number, end: number): string | null {
  if (payloadStart + 12 > end) {
    return null;
  }
  return read4cc(bytes, payloadStart + 8);
}

function parseStsdCodec(bytes: Uint8Array, payloadStart: number, end: number): string | null {
  if (payloadStart + 12 > end) {
    return null;
  }
  const entryCount = readU32(bytes, payloadStart + 4);
  if (entryCount < 1) {
    return null;
  }
  if (payloadStart + 16 > end) {
    return null;
  }
  const entrySize = readU32(bytes, payloadStart + 8);
  if (entrySize < 8) {
    return null;
  }
  return read4cc(bytes, payloadStart + 12);
}

function parseTrak(bytes: Uint8Array, payloadStart: number, end: number): TrakInfo {
  const trak: TrakInfo = { handler: null, codec: null, width: null, height: null, mdhd: null };
  forEachBox(bytes, payloadStart, end, (type, pStart, pEnd) => {
    if (type === "tkhd") {
      const dims = parseTkhd(bytes, pStart, pEnd);
      if (dims !== null) {
        trak.width = dims.width;
        trak.height = dims.height;
      }
    } else if (type === "mdia") {
      forEachBox(bytes, pStart, pEnd, (mdiaType, mStart, mEnd) => {
        if (mdiaType === "mdhd") {
          const times = parseTimescaleDuration(bytes, mStart, mEnd);
          if (times !== null) {
            trak.mdhd = times;
          }
        } else if (mdiaType === "hdlr") {
          const handler = parseHdlr(bytes, mStart, mEnd);
          if (handler !== null) {
            trak.handler = handler;
          }
        } else if (mdiaType === "minf") {
          forEachBox(bytes, mStart, mEnd, (minfType, minfStart, minfEnd) => {
            if (minfType === "stbl") {
              forEachBox(bytes, minfStart, minfEnd, (stblType, stblStart, stblEnd) => {
                if (stblType === "stsd" && trak.codec === null) {
                  const codec = parseStsdCodec(bytes, stblStart, stblEnd);
                  if (codec !== null) {
                    trak.codec = codec;
                  }
                }
              });
            }
          });
        }
      });
    }
  });
  return trak;
}

function applyTrak(state: ProbeState, trak: TrakInfo): void {
  const codec = trak.codec;
  const isVideo = trak.handler === "vide" || (codec !== null && VIDEO_CODECS.has(codec));
  const isAudio = trak.handler === "soun" || (codec !== null && AUDIO_CODECS.has(codec));
  if (isVideo && codec !== null && state.result.video === null) {
    state.result.video = { codec, width: trak.width ?? 0, height: trak.height ?? 0 };
    if (trak.mdhd !== null && state.videoMdhd === null) {
      state.videoMdhd = trak.mdhd;
    }
  }
  if (isAudio && codec !== null && state.result.audio === null) {
    state.result.audio = { codec };
  }
}

export function probeMediaFile(bytes: Uint8Array): MediaProbe {
  const result: MediaProbe = {
    container: "",
    durationSeconds: null,
    video: null,
    audio: null,
  };
  const state: ProbeState = { result, mvhd: null, videoMdhd: null };

  forEachBox(bytes, 0, bytes.length, (type, payloadStart, boxEnd) => {
    if (type === "ftyp") {
      if (payloadStart + 4 <= boxEnd) {
        result.container = read4cc(bytes, payloadStart);
      }
    } else if (type === "moov") {
      forEachBox(bytes, payloadStart, boxEnd, (childType, childPayload, childEnd) => {
        if (childType === "mvhd") {
          const times = parseTimescaleDuration(bytes, childPayload, childEnd);
          if (times !== null && state.mvhd === null) {
            state.mvhd = times;
          }
        } else if (childType === "trak") {
          applyTrak(state, parseTrak(bytes, childPayload, childEnd));
        }
      });
    }
  });

  if (state.videoMdhd !== null && state.videoMdhd.timescale > 0) {
    result.durationSeconds = round3(state.videoMdhd.duration / state.videoMdhd.timescale);
  } else if (state.mvhd !== null && state.mvhd.timescale > 0) {
    result.durationSeconds = round3(state.mvhd.duration / state.mvhd.timescale);
  }

  return result;
}