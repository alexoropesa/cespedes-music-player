/**
 * Real, in-browser validation for files imported from disk (RF-04 / RF-PRO-01..02):
 *  - codec/container from magic bytes (never from the extension)
 *  - native sample rate / channels from stream headers
 *  - end-to-end decode (stand-in for `ffmpeg -f null` in the future local worker)
 *  - SHA-256 over the original bytes (Web Crypto)
 */

export interface Sniff {
  codec: string;
  container: string;
  sampleRateHz: number | null;
  channels: number | null;
  ext: string;
}

const ascii = (b: Uint8Array, o: number, n: number) => String.fromCharCode(...b.subarray(o, o + n));

function findAscii(b: Uint8Array, needle: string, limit = 2_000_000) {
  const n = needle.split("").map((c) => c.charCodeAt(0));
  const end = Math.min(b.length - n.length, limit);
  outer: for (let i = 0; i < end; i++) {
    for (let k = 0; k < n.length; k++) if (b[i + k] !== n[k]) continue outer;
    return i;
  }
  return -1;
}

const MP3_RATES: Record<number, number[]> = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

export function sniffAudio(buf: ArrayBuffer): Sniff | null {
  const b = new Uint8Array(buf);
  const dv = new DataView(buf);
  if (b.length < 12) return null;

  // WAV
  if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WAVE") {
    const fmt = findAscii(b, "fmt ", 4096);
    if (fmt > 0) {
      const audioFormat = dv.getUint16(fmt + 8, true);
      const channels = dv.getUint16(fmt + 10, true);
      const rate = dv.getUint32(fmt + 12, true);
      const bits = dv.getUint16(fmt + 22, true);
      const codec = audioFormat === 3 ? "pcm_f32le" : `pcm_s${bits}le`;
      return { codec, container: "wav", sampleRateHz: rate, channels, ext: "wav" };
    }
    return { codec: "pcm", container: "wav", sampleRateHz: null, channels: null, ext: "wav" };
  }
  // FLAC (STREAMINFO right after the marker)
  if (ascii(b, 0, 4) === "fLaC") {
    const rate = (b[18] << 12) | (b[19] << 4) | (b[20] >> 4);
    const channels = ((b[20] >> 1) & 0x07) + 1;
    return { codec: "flac", container: "flac", sampleRateHz: rate, channels, ext: "flac" };
  }
  // Ogg (Opus / Vorbis / FLAC-in-Ogg)
  if (ascii(b, 0, 4) === "OggS") {
    const head = 28;
    if (ascii(b, head, 8) === "OpusHead") {
      return { codec: "opus", container: "ogg", sampleRateHz: dv.getUint32(head + 12, true), channels: b[head + 9], ext: "opus" };
    }
    if (ascii(b, head + 1, 6) === "vorbis") {
      return { codec: "vorbis", container: "ogg", sampleRateHz: dv.getUint32(head + 12, true), channels: b[head + 11], ext: "ogg" };
    }
    return { codec: "unknown", container: "ogg", sampleRateHz: null, channels: null, ext: "ogg" };
  }
  // WebM / Matroska (EBML)
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) {
    const codec = findAscii(b, "A_OPUS", 200_000) >= 0 ? "opus" : findAscii(b, "A_VORBIS", 200_000) >= 0 ? "vorbis" : findAscii(b, "A_AAC", 200_000) >= 0 ? "aac" : "unknown";
    return { codec, container: findAscii(b, "webm", 200) >= 0 ? "webm" : "matroska", sampleRateHz: codec === "opus" ? 48000 : null, channels: null, ext: "webm" };
  }
  // MP4 / M4A
  if (ascii(b, 4, 4) === "ftyp") {
    for (const [tag, codec] of [["mp4a", "aac"], ["alac", "alac"], ["Opus", "opus"], ["fLaC", "flac"]] as const) {
      const i = findAscii(b, tag);
      if (i > 0 && i + 28 < b.length) {
        const channels = dv.getUint16(i + 20);
        const rate = dv.getUint32(i + 28) >>> 16;
        return { codec, container: "mp4", sampleRateHz: rate || null, channels: channels || null, ext: "m4a" };
      }
    }
    return { codec: "unknown", container: "mp4", sampleRateHz: null, channels: null, ext: "m4a" };
  }
  // AIFF
  if (ascii(b, 0, 4) === "FORM" && (ascii(b, 8, 4) === "AIFF" || ascii(b, 8, 4) === "AIFC")) {
    return { codec: "pcm_s16be", container: "aiff", sampleRateHz: null, channels: null, ext: "aiff" };
  }
  // MP3 (optional ID3v2 tag, then frame sync)
  let off = 0;
  if (ascii(b, 0, 3) === "ID3") {
    const size = ((b[6] & 0x7f) << 21) | ((b[7] & 0x7f) << 14) | ((b[8] & 0x7f) << 7) | (b[9] & 0x7f);
    off = 10 + size;
  }
  for (let i = off; i < Math.min(b.length - 4, off + 4096); i++) {
    if (b[i] === 0xff && (b[i + 1] & 0xe0) === 0xe0) {
      const version = (b[i + 1] >> 3) & 0x03;
      const layer = (b[i + 1] >> 1) & 0x03;
      const rateIdx = (b[i + 2] >> 2) & 0x03;
      if (layer === 0x01 && rateIdx !== 3 && version !== 1) {
        const mode = (b[i + 3] >> 6) & 0x03;
        return { codec: "mp3", container: "mp3", sampleRateHz: MP3_RATES[version]?.[rateIdx] ?? null, channels: mode === 3 ? 1 : 2, ext: "mp3" };
      }
      if ((b[i + 1] & 0xf6) === 0xf0) {
        // ADTS AAC
        const rates = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000];
        return { codec: "aac", container: "adts", sampleRateHz: rates[(b[i + 2] >> 2) & 0x0f] ?? null, channels: ((b[i + 2] & 1) << 2) | (b[i + 3] >> 6), ext: "aac" };
      }
    }
  }
  return null;
}

export async function sha256Hex(buf: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/** Decodes the whole stream. Throws if the file is truncated / undecodable. */
export async function decodeFully(buf: ArrayBuffer): Promise<{ durationSec: number; channels: number }> {
  const Ctx: typeof OfflineAudioContext | undefined =
    typeof OfflineAudioContext !== "undefined" ? OfflineAudioContext : undefined;
  if (!Ctx) throw new Error("Audio decoder unavailable in this browser");
  const ctx = new Ctx(1, 1, 44100);
  const audio = await ctx.decodeAudioData(buf.slice(0));
  return { durationSec: audio.duration, channels: audio.numberOfChannels };
}

export const extOf = (name: string) => (name.match(/\.([a-z0-9]{2,5})$/i)?.[1] ?? "").toLowerCase();

export const EXT_COMPATIBLE: Record<string, string[]> = {
  mp3: ["mp3"],
  flac: ["flac"],
  wav: ["wav", "wave"],
  ogg: ["ogg", "oga", "opus"],
  opus: ["opus", "ogg"],
  m4a: ["m4a", "mp4", "aac", "alac"],
  webm: ["webm", "weba", "mka"],
  aac: ["aac"],
  aiff: ["aif", "aiff"],
};
