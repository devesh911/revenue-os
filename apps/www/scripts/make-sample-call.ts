// Assembles the DRAMATISED sample call (public/sample-call.m4a) from ElevenLabs takes
// and prints its length for sampleCall.seconds in src/content/hero.ts.
//
// The takes are generated in ElevenLabs, one line per take, with the voices, model and
// exact text below (Hindi in Devanagari so it is pronounced natively; English terms as
// they are said). Download them in call order as 01.mp3 … 15.mp3 into one folder, then:
//   bun apps/www/scripts/make-sample-call.ts <folder>
// Each take is trimmed, long pauses inside it are cut to 0.3 s, both voices are levelled
// to one loudness, the turns are joined with natural gaps, and the call gets a light
// phone-line band (110 Hz – 7.4 kHz) and a -16 LUFS master. Needs ffmpeg on PATH.
// The transcript on the page (sampleCall.transcript) is the same call, romanised.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const MODEL = "eleven_v3";
const VOICES = {
  agent: {
    name: "Koyal – Clear & Natural Sales Agent",
    id: "WCm1zbL9QZhPl3W662WR",
  },
  buyer: {
    name: "Amit – Social Media & Conversational",
    id: "GMZSbUPPZmaF5CfxdwVt",
  },
} as const;

// [speaker, text sent to ElevenLabs, pause before the line in seconds]
const LINES: Array<[keyof typeof VOICES, string, number]> = [
  [
    "agent",
    "[warmly] नमस्ते रोहन जी! मैं Asha बोल रही हूँ, Meridian Greens की AI assistant. आपने अभी Whitefield में 2 BHK के लिए enquiry की थी — दो मिनट बात हो सकती है?",
    0.3,
  ],
  ["buyer", "[casually] हाँ, हाँ, बोलिए।", 0.35],
  [
    "agent",
    "आपने budget नब्बे लाख तक बताया था। Tower B में तीन 2 BHK units हैं जो उसमें आ जाते हैं।",
    0.4,
  ],
  ["buyer", "अच्छा। Carpet area कितना है? और parking included है?", 0.45],
  [
    "agent",
    "2 BHK का carpet area 1,050 square feet है, और एक covered parking included है।",
    0.5,
  ],
  ["buyer", "Possession कब तक मिलेगा?", 0.35],
  ["agent", "December 2027 में। आप कब तक shift करना चाहते हैं?", 0.45],
  ["buyer", "Next year तक plan है। Home loan भी लेना पड़ेगा।", 0.45],
  [
    "agent",
    "कोई बात नहीं, हमारे loan partner से भी बात करवा देते हैं। एक बार project देखना चाहेंगे?",
    0.5,
  ],
  ["buyer", "Okay. Weekend पे देख सकते हैं?", 0.4],
  ["agent", "बिल्कुल। Saturday सुबह ग्यारह बजे ठीक रहेगा?", 0.45],
  ["buyer", "हाँ, ग्यारह बजे चलेगा।", 0.35],
  [
    "agent",
    "Perfect. Saturday, eleven AM, Tower B — आपका visit book हो गया। Location pin और details मैं अभी WhatsApp पे भेज रही हूँ।",
    0.45,
  ],
  ["buyer", "Great, thank you.", 0.35],
  [
    "agent",
    "Thank you, रोहन जी। Saturday को हमारी sales team आपका इंतज़ार करेगी।",
    0.35,
  ],
];
const TAIL = 0.45;
const RATE = 48000;

const dir = process.argv[2];
if (!dir) {
  console.log(
    `model ${MODEL}; agent ${VOICES.agent.name} (${VOICES.agent.id}); buyer ${VOICES.buyer.name} (${VOICES.buyer.id})`,
  );
  for (const [i, [who, text]] of LINES.entries())
    console.log(`${String(i + 1).padStart(2, "0")} ${who}: ${text}`);
  console.error(
    "usage: bun apps/www/scripts/make-sample-call.ts <folder with 01.mp3 … 15.mp3>",
  );
  process.exit(1);
}

const ff = (args: string[]) =>
  execFileSync("ffmpeg", ["-v", "error", "-y", ...args], {
    maxBuffer: 1 << 30,
  });
const work = mkdtempSync(join(tmpdir(), "sample-call-"));
const parts: Float32Array[] = [];
for (const [i, [, , pause]] of LINES.entries()) {
  const take = resolve(dir, `${String(i + 1).padStart(2, "0")}.mp3`);
  if (!existsSync(take)) throw new Error(`missing take ${take}`);
  const raw = ff([
    "-i",
    take,
    "-af",
    // trim both ends, then cut any pause inside the line down to 0.3 s
    "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.03,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.06,areverse,silenceremove=stop_periods=-1:stop_duration=0.32:stop_threshold=-40dB:stop_silence=0.3",
    "-ac",
    "1",
    "-ar",
    String(RATE),
    "-f",
    "f32le",
    "-",
  ]);
  const x = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
  const rms = Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length);
  parts.push(
    new Float32Array(Math.round(pause * RATE)),
    x.map((v) => (v * 0.1) / rms),
  );
}
parts.push(new Float32Array(Math.round(TAIL * RATE)));
const call = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
let at = 0;
for (const p of parts) {
  call.set(p, at);
  at += p.length;
}
const pcm = join(work, "call.f32");
writeFileSync(pcm, Buffer.from(call.buffer));
const out = resolve(import.meta.dir, "../public/sample-call.m4a");
ff([
  "-f",
  "f32le",
  "-ar",
  String(RATE),
  "-ac",
  "1",
  "-i",
  pcm,
  "-af",
  "highpass=f=110,lowpass=f=7400,acompressor=threshold=-20dB:ratio=2.5:attack=5:release=120:makeup=2,loudnorm=I=-16:TP=-1.5:LRA=7",
  "-ar",
  String(RATE),
  "-c:a",
  "aac",
  "-b:a",
  "96k",
  "-movflags",
  "+faststart", // the index up front, so playback starts before the whole file arrives
  out,
]);
rmSync(work, { recursive: true, force: true });
console.log(
  `wrote ${out}: ${(call.length / RATE).toFixed(1)} s → set sampleCall.seconds to ${Math.round(call.length / RATE)}`,
);
