// Regenerates the SYNTHETIC sample call (public/sample-call.m4a) and prints the
// transcript cue times for src/content/hero.ts. macOS only: it uses the system
// text-to-speech voices (`say`) and `afconvert`. The agent speaks Hindi-script
// text (Lekha, hi_IN) so Hindi words are pronounced natively; the buyer speaks
// romanised Hinglish (Aman, en_IN). Replace the output with a real recording
// (and its cue times) as soon as one exists.
//   bun apps/www/scripts/make-sample-call.ts
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const RATE = 22050;
const GAP = 0.45; // seconds of silence between turns
const LEAD_IN = 0.3;

const LINES: Array<{ voice: "Lekha" | "Aman"; tts: string }> = [
  {
    voice: "Lekha",
    tts: "नमस्ते रोहन जी, मैं आशा बोल रही हूँ, Meridian Homes से। आपने अभी Whitefield के 2 BHK के बारे में enquiry की थी?",
  },
  {
    voice: "Aman",
    tts: "Haan ji. Budget around ninety lakh hai. Possession kab tak milega?",
  },
  {
    voice: "Lekha",
    tts: "Tower B में December 2027 में possession है, और 2 BHK नब्बे लाख के अंदर available है। आप कब तक shift करना चाहते हैं?",
  },
  { voice: "Aman", tts: "Next year tak. Home loan bhi lena hai." },
  {
    voice: "Lekha",
    tts: "बिल्कुल, हम loan partner से भी connect करा देंगे। क्या आप Saturday को site visit के लिए आ सकते हैं?",
  },
  { voice: "Aman", tts: "Saturday, eleven baje theek rahega." },
  {
    voice: "Lekha",
    tts: "Done. Saturday ग्यारह बजे का visit book हो गया। Location और details मैं WhatsApp पर भेज रही हूँ।",
  },
];

const dir = mkdtempSync(join(tmpdir(), "sample-call-"));
const silence = (s: number) => Buffer.alloc(Math.round(s * RATE) * 2);
const chunks: Buffer[] = [silence(LEAD_IN)];
const cues: number[] = [];
let t = LEAD_IN;
for (const [i, line] of LINES.entries()) {
  const wav = join(dir, `${i}.wav`);
  execFileSync("say", [
    "-v",
    line.voice,
    "-o",
    wav,
    `--data-format=LEI16@${RATE}`,
    line.tts,
  ]);
  const buf = readFileSync(wav);
  const pcm = buf.subarray(buf.indexOf("data") + 8); // WAVE: "data" + u32 size
  cues.push(Math.round(t * 10) / 10);
  chunks.push(pcm, silence(GAP));
  t += pcm.length / 2 / RATE + GAP;
}

const data = Buffer.concat(chunks);
const header = Buffer.alloc(44);
header.write("RIFF", 0);
header.writeUInt32LE(36 + data.length, 4);
header.write("WAVEfmt ", 8);
header.writeUInt32LE(16, 16); // PCM chunk size
header.writeUInt16LE(1, 20); // PCM
header.writeUInt16LE(1, 22); // mono
header.writeUInt32LE(RATE, 24);
header.writeUInt32LE(RATE * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write("data", 36);
header.writeUInt32LE(data.length, 40);
const full = join(dir, "full.wav");
writeFileSync(full, Buffer.concat([header, data]));

const out = resolve(import.meta.dir, "../public/sample-call.m4a");
execFileSync("afconvert", [
  "-f",
  "m4af",
  "-d",
  "aac",
  "-b",
  "48000",
  full,
  out,
]);
rmSync(dir, { recursive: true });

console.log(`wrote ${out}`);
console.log(`duration: ${t.toFixed(1)}s`);
console.log(`cues (seconds, one per line): ${JSON.stringify(cues)}`);
