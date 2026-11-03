/**
 * Demo-workspace placeholder audio. Seed/simulated tracks have no real bytes
 * (no authorized sample received yet — TBD-03), so playback renders a short
 * deterministic arrangement locally, for the full track length, as a WAV blob.
 * Fully offline; clearly labelled "synthesized preview" in the UI.
 */
import { seeded } from "./util";

const RATE = 16000;
const TABLE = 2048;
const SINE = new Float32Array(TABLE);
for (let i = 0; i < TABLE; i++) SINE[i] = Math.sin((i / TABLE) * Math.PI * 2);
const sin = (phase: number) => SINE[((phase * TABLE) | 0) & (TABLE - 1)];

const PROGRESSIONS = [
  [0, 7, 9, 5],
  [0, 5, 9, 7],
  [9, 5, 0, 7],
  [0, 9, 5, 7],
  [2, 7, 0, 0],
];

export function synthWav(seed: string, durationSec: number): Blob {
  const r = seeded(`synth:${seed}`);
  const bpm = 78 + Math.floor(r() * 46);
  const root = 45 + Math.floor(r() * 10); // MIDI
  const prog = PROGRESSIONS[Math.floor(r() * PROGRESSIONS.length)];
  const minor = r() > 0.5;
  const n = Math.floor(RATE * Math.max(1, durationSec));
  const beat = (60 / bpm) * RATE;
  const bar = beat * 4;
  const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

  const pcm = new Int16Array(n);
  let pad1 = 0, pad2 = 0, pad3 = 0, bassP = 0, kickP = 0, lead = 0;
  let noise = 1;
  const leadNotes = [0, 3, 7, 10, 12, 7, 5, 3].map((x) => x + (minor ? 0 : 1));
  for (let i = 0; i < n; i++) {
    const barIdx = Math.floor(i / bar) % 4;
    const chord = root + prog[barIdx];
    const third = minor && barIdx === 0 ? 3 : 4;
    pad1 += hz(chord + 12) / RATE;
    pad2 += hz(chord + 12 + third) / RATE;
    pad3 += hz(chord + 19) / RATE;
    const inBeat = (i % beat) / beat;
    const beatIdx = Math.floor(i / beat) % 4;
    bassP += hz(chord - 12) / RATE;
    const bassEnv = Math.exp(-inBeat * 3.2);
    // kick on 1 and 3
    const kickEnv = beatIdx % 2 === 0 ? Math.exp(-inBeat * 18) : 0;
    kickP += (55 + 110 * kickEnv) / RATE;
    // hat on off-beats
    noise = (noise * 16807) % 2147483647;
    const hat = inBeat > 0.5 ? ((noise / 2147483647) * 2 - 1) * Math.exp(-(inBeat - 0.5) * 40) : 0;
    // lead arpeggio every 8th
    const eighth = Math.floor(i / (beat / 2));
    const ln = leadNotes[(eighth + barIdx * 2) % leadNotes.length];
    lead += hz(chord + 24 + ln) / RATE;
    const inEighth = (i % (beat / 2)) / (beat / 2);
    const leadEnv = Math.exp(-inEighth * 6) * (Math.floor(i / bar) % 8 >= 4 ? 1 : 0.35);

    const t = i / RATE;
    const fade = Math.min(1, t / 2.5, (durationSec - t) / 3);
    const s =
      0.11 * (sin(pad1) + sin(pad2) + 0.8 * sin(pad3)) +
      0.32 * bassEnv * sin(bassP) +
      0.42 * kickEnv * sin(kickP) +
      0.05 * hat +
      0.07 * leadEnv * sin(lead);
    pcm[i] = Math.max(-1, Math.min(1, s * fade)) * 30000;
  }

  const header = new ArrayBuffer(44);
  const v = new DataView(header);
  const w = (o: number, s: string) => [...s].forEach((c, k) => v.setUint8(o + k, c.charCodeAt(0)));
  w(0, "RIFF");
  v.setUint32(4, 36 + n * 2, true);
  w(8, "WAVE");
  w(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, RATE, true);
  v.setUint32(28, RATE * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, "data");
  v.setUint32(40, n * 2, true);
  return new Blob([header, pcm.buffer], { type: "audio/wav" });
}
