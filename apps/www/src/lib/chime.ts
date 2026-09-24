import { useSyncExternalStore } from "react";

// A soft two-note message chime, synthesised with Web Audio (no file to load).
// Browsers allow sound only after a real gesture (a tap, click or key press; a touch
// that turns into a scroll doesn't count), so armChime() (main.tsx) keeps trying to
// start the audio context on every such event until it runs, and a sound switch can
// call unlockSound() from its own press. Until then, and while the visitor has sound
// switched off, chime() stays silent. useSoundReady() says whether sound can play;
// the switch (useSound / setSound) is remembered in this browser.
const KEY = "ro-sound";
const subs = new Set<() => void>();
let ctx: AudioContext | null = null;
let soundOn = readSound();

function readSound(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSound(on: boolean): void {
  soundOn = on;
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {}
  for (const fn of subs) fn();
}

const subscribe = (fn: () => void) => {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
};

export function useSound(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => soundOn,
    () => true,
  );
}

export function useSoundReady(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => ctx?.state === "running",
    () => false,
  );
}

const GESTURES = ["pointerdown", "pointerup", "click", "touchend", "keydown"];
const canPlay = () => typeof window !== "undefined" && "AudioContext" in window;

export function unlockSound(): void {
  if (!canPlay()) return;
  ctx ??= new AudioContext();
  if (ctx.state === "running") return;
  void ctx.resume().then(() => {
    if (ctx?.state !== "running") return;
    for (const t of GESTURES) window.removeEventListener(t, unlockSound, true);
    for (const fn of subs) fn();
  });
}

export function armChime(): void {
  if (!canPlay()) return;
  for (const t of GESTURES) window.addEventListener(t, unlockSound, true);
}

// Two short sine notes (A5 then E6), each a quick swell and a soft fade.
export function chime(): void {
  if (!soundOn || !ctx || ctx.state !== "running") return;
  const t0 = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.value = 0.14;
  out.connect(ctx.destination);
  for (const [at, freq] of [
    [0, 880],
    [0.13, 1318.5],
  ] as const) {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    env.gain.setValueAtTime(0.0001, t0 + at);
    env.gain.exponentialRampToValueAtTime(1, t0 + at + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.55);
    osc.connect(env).connect(out);
    osc.start(t0 + at);
    osc.stop(t0 + at + 0.6);
  }
}
